// POST /api/chat/message
// SSE streaming chat endpoint for Jarvis
//
// Request: { message: string, client_request_id?: string }
// Response: text/event-stream with events:
//   { type: "text", content: "..." }
//   { type: "tool_call", name: "...", args: {...} }
//   { type: "tool_result", name: "...", result: {...} }
//   { type: "done", message_id: "..." }
//   { type: "error", message: "..." }

import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";
import { getToolDefinitions, executeTool } from "../../../lib/jarvis-tools";
import { buildSystemPrompt } from "../../../lib/jarvis-system-prompt";
import {
  getConversationWindow,
  formatForProvider,
  persistMessage,
  persistMessages,
  findRecentRequest,
} from "../../../lib/jarvis-context";

const MAX_TOOL_ROUNDS = 5;
const REQUEST_TIMEOUT_MS = 280_000;

export const config = {
  api: {
    responseLimit: false,
  },
  // Vercel Pro caps function duration at 300s. Long agentic flows that call
  // get_backlog (which can return 600+ tasks) need the headroom — the previous
  // 60s budget got killed mid-stream and the user never saw a reply.
  maxDuration: 300,
};

function sendEvent(res, data) {
  try {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  } catch {
    // Connection already closed
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const userMessage = String(req.body?.message || "").trim();
  if (!userMessage) {
    return res.status(400).json({ error: "message is required" });
  }
  const clientRequestId = req.body?.client_request_id
    ? String(req.body.client_request_id).slice(0, 80)
    : null;

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Track client disconnect — stop the agentic loop instead of running more tools
  // after the browser has given up (e.g. user navigated away or tab closed).
  let clientAborted = false;
  req.on("close", () => {
    clientAborted = true;
  });

  // Request-level timeout
  const requestTimer = setTimeout(() => {
    sendEvent(res, { type: "error", message: "Request timed out. Please try again." });
    sendEvent(res, { type: "done", message_id: null });
    if (!res.writableEnded) res.end();
  }, REQUEST_TIMEOUT_MS);

  // --- State the finally block reads to persist a final assistant row --------
  // streamedText accumulates everything we've sent via SSE 'text' events; this
  // is the source of truth on interruption (function killed, error thrown,
  // model timed out). toolsRun is a summary fallback when no text exists at all.
  let streamedText = "";
  let finalContent = "";
  const toolsRun = []; // [{name, ok, error?}]
  let assistantPersisted = false;
  let messageId = null;

  async function persistAssistantOnce(reason) {
    if (assistantPersisted) return;
    assistantPersisted = true;
    let body = (finalContent && finalContent.trim()) || streamedText.trim();
    if (!body) {
      // Last-resort fallback so the user ALWAYS sees something in their chat
      // history. Without this, an interrupted flow leaves only orphan tool
      // rows in the DB and the user reasonably thinks "did anything happen?"
      // and resubmits — which is exactly the bug we're fixing.
      if (toolsRun.length > 0) {
        const summary = toolsRun
          .map((t) => (t.ok ? `✓ ${t.name}` : `✗ ${t.name}${t.error ? ` (${t.error})` : ""}`))
          .join(", ");
        body = `(I ran these tools but didn't finish writing a reply — ${reason}: ${summary}. Ask me to continue or check the result.)`;
      } else {
        body = `(I didn't finish — ${reason}. Please try again.)`;
      }
    }
    try {
      const persisted = await persistMessage(userId, {
        role: "assistant",
        content: body,
        client_request_id: clientRequestId,
      });
      messageId = persisted?.id || null;
    } catch (persistErr) {
      console.warn("[jarvis] Failed to persist assistant message:", persistErr.message);
    }
  }
  // --------------------------------------------------------------------------

  try {
    // Idempotency: if the client retries with the same client_request_id and
    // we've already processed (or are processing) it, replay the previously
    // persisted assistant text rather than re-running the tool loop. This is
    // the fix for "I resubmit and the task gets created again."
    if (clientRequestId) {
      const prior = await findRecentRequest(userId, clientRequestId, 5);
      if (prior) {
        const replay = prior.assistantRow?.content || "";
        if (replay) {
          sendEvent(res, { type: "text", content: replay });
        }
        sendEvent(res, {
          type: "done",
          message_id: prior.assistantRow?.id || null,
          replayed: true,
        });
        assistantPersisted = true; // don't double-persist in finally{}
        return;
      }
    }

    // Persist the user message FIRST so the conversation history stays
    // coherent even if the stream drops or the function gets killed mid-loop.
    try {
      await persistMessage(userId, {
        role: "user",
        content: userMessage,
        client_request_id: clientRequestId,
      });
    } catch (persistErr) {
      console.warn("[jarvis] Failed to persist user message:", persistErr.message);
    }

    // 1. Load conversation history (now includes the user message we just wrote)
    const history = await getConversationWindow(userId);
    const messages = formatForProvider(history);

    // 2. Build system prompt with live context + memory retrieval
    let system;
    try {
      system = await buildSystemPrompt(userId, { query: userMessage });
    } catch (promptErr) {
      console.warn("[jarvis] System prompt build failed, using fallback:", promptErr.message);
      system = "You are Jarvis, the Rise & Shine execution coach. Help the user with their tasks and projects. Use your tools to look up data before answering.";
    }

    const tools = getToolDefinitions();

    // 3. Agentic loop with streaming
    const currentMessages = [...messages];
    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      if (clientAborted) break;
      rounds++;

      const result = await chatCompletion({
        system,
        messages: currentMessages,
        tools,
        onChunk: (chunk) => {
          if (chunk.type === "text") {
            // Capture every streamed delta — the finally block uses this to
            // persist whatever the user already saw, even if the function is
            // killed before result.content lands.
            streamedText += chunk.content;
            sendEvent(res, { type: "text", content: chunk.content });
          }
          if (chunk.type === "tool_call_start") {
            sendEvent(res, { type: "tool_call_start", name: chunk.name });
          }
          if (chunk.type === "tool_call") {
            sendEvent(res, { type: "tool_call", name: chunk.name, args: chunk.args });
          }
        },
      });

      const roundContent = result.content;
      const roundToolCalls = result.toolCalls;

      if (!roundToolCalls || roundToolCalls.length === 0) {
        finalContent = roundContent;
        break;
      }

      if (clientAborted) break;

      currentMessages.push({
        role: "assistant",
        content: roundContent,
        tool_calls: roundToolCalls,
      });

      const toolMessages = [];
      for (const tc of roundToolCalls) {
        let toolResult;
        let ok = true;
        let errMsg = null;
        try {
          toolResult = await executeTool(tc.name, tc.args, userId);
          if (toolResult && toolResult.error) {
            ok = false;
            errMsg = String(toolResult.error).slice(0, 80);
          }
        } catch (toolErr) {
          ok = false;
          errMsg = (toolErr.message || String(toolErr)).slice(0, 80);
          toolResult = { error: `Tool execution failed: ${errMsg}` };
        }
        toolsRun.push({ name: tc.name, ok, error: errMsg });

        sendEvent(res, {
          type: "tool_result",
          name: tc.name,
          result: toolResult,
        });

        const toolResultMsg = {
          role: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify(toolResult),
        };
        currentMessages.push(toolResultMsg);
        toolMessages.push(toolResultMsg);
      }

      try {
        await persistMessages(userId, [
          { role: "tool_call", tool_calls: roundToolCalls },
          ...toolMessages.map((tm) => ({
            role: "tool_result",
            content: tm.content,
            tool_call_id: tm.tool_use_id,
          })),
        ]);
      } catch (persistErr) {
        console.warn("[jarvis] Failed to persist tool messages:", persistErr.message);
      }

      if (result.stopReason === "end_turn") {
        finalContent = roundContent;
        break;
      }
    }

    // Loop ended cleanly — persist the assistant row and signal done.
    await persistAssistantOnce(
      clientAborted ? "client disconnected" : "completed normally"
    );
    sendEvent(res, { type: "done", message_id: messageId });
  } catch (err) {
    console.error("[jarvis chat error]", err);
    // Surface the error inline AND save whatever the user already saw streamed.
    // (Previously: error was sent but assistant text was never persisted, so
    // refreshing the page erased the partial reply and the user thought
    // nothing had happened.)
    sendEvent(res, { type: "error", message: err.message || "An unexpected error occurred." });
    await persistAssistantOnce(`error: ${err.message || "unknown"}`);
    sendEvent(res, { type: "done", message_id: messageId });
  } finally {
    // Belt-and-braces: if a control path forgot to call persistAssistantOnce
    // (e.g. an unexpected throw inside the catch), still save what we have.
    if (!assistantPersisted) {
      await persistAssistantOnce("stream ended unexpectedly");
    }
    clearTimeout(requestTimer);
    if (!res.writableEnded) res.end();
  }
}
