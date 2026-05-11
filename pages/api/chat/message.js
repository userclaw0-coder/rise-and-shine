// POST /api/chat/message
// SSE streaming chat endpoint for Jarvis
//
// Request: { message: string }
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
} from "../../../lib/jarvis-context";

const MAX_TOOL_ROUNDS = 5;
const REQUEST_TIMEOUT_MS = 90000;

export const config = {
  api: {
    responseLimit: false,
  },
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

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Request-level timeout
  const requestTimer = setTimeout(() => {
    sendEvent(res, { type: "error", message: "Request timed out. Please try again." });
    sendEvent(res, { type: "done", message_id: null });
    if (!res.writableEnded) res.end();
  }, REQUEST_TIMEOUT_MS);

  try {
    // 1. Load conversation history (BEFORE persisting user message)
    const history = await getConversationWindow(userId);
    const messages = formatForProvider(history);

    // Add the current user message to the conversation (not yet persisted)
    messages.push({ role: "user", content: userMessage });

    // 2. Build system prompt with live context + memory retrieval
    //    (timeout-protected; memory retrieval is best-effort).
    let system;
    try {
      system = await buildSystemPrompt(userId, { query: userMessage });
    } catch (promptErr) {
      console.warn("[jarvis] System prompt build failed, using fallback:", promptErr.message);
      system = "You are Jarvis, the Rise & Shine execution coach. Help the user with their tasks and projects. Use your tools to look up data before answering.";
    }

    // 3. Get tool definitions
    const tools = getToolDefinitions();

    // 4. Run the agentic loop (streaming with tool calls)
    let currentMessages = [...messages];
    let finalContent = "";
    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const result = await chatCompletion({
        system,
        messages: currentMessages,
        tools,
        onChunk: (chunk) => {
          if (chunk.type === "text") {
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

      // If no tool calls, we're done
      if (!roundToolCalls || roundToolCalls.length === 0) {
        finalContent = roundContent;
        break;
      }

      // Process tool calls
      const assistantMsg = {
        role: "assistant",
        content: roundContent,
        tool_calls: roundToolCalls,
      };
      currentMessages.push(assistantMsg);

      // Execute each tool — wrapped in try-catch so a tool failure doesn't crash the request
      const toolMessages = [];
      for (const tc of roundToolCalls) {
        let toolResult;
        try {
          toolResult = await executeTool(tc.name, tc.args, userId);
        } catch (toolErr) {
          toolResult = { error: `Tool execution failed: ${toolErr.message || toolErr}` };
        }

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

      // Persist tool call + result messages (non-critical — don't crash on failure)
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

      // If the model says end_turn with tool calls, continue to get the text response
      if (result.stopReason === "end_turn") {
        finalContent = roundContent;
        break;
      }
    }

    // 5. Persist user message + final assistant message TOGETHER (atomic — both or neither)
    let messageId = null;
    try {
      const persisted = await persistMessages(userId, [
        { role: "user", content: userMessage },
        { role: "assistant", content: finalContent || "" },
      ]);
      messageId = persisted?.[1]?.id || null;
    } catch (persistErr) {
      console.warn("[jarvis] Failed to persist messages:", persistErr.message);
    }

    // 6. Send done event
    sendEvent(res, { type: "done", message_id: messageId });
  } catch (err) {
    console.error("[jarvis chat error]", err);
    sendEvent(res, { type: "error", message: err.message || "An unexpected error occurred." });
    sendEvent(res, { type: "done", message_id: null });
  } finally {
    clearTimeout(requestTimer);
    if (!res.writableEnded) res.end();
  }
}
