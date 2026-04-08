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
import { chatCompletion, getProviderInfo } from "../../../lib/ai-provider";
import { getToolDefinitions, executeTool } from "../../../lib/jarvis-tools";
import { buildSystemPrompt } from "../../../lib/jarvis-system-prompt";
import {
  getConversationWindow,
  formatForProvider,
  persistMessage,
  persistMessages,
} from "../../../lib/jarvis-context";

const MAX_TOOL_ROUNDS = 5;

export const config = {
  api: {
    responseLimit: false,
  },
};

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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

  try {
    // 1. Persist user message
    await persistMessage(userId, { role: "user", content: userMessage });

    // 2. Load conversation history
    const history = await getConversationWindow(userId);
    const messages = formatForProvider(history);

    // 3. Build system prompt with live context
    const system = await buildSystemPrompt(userId);

    // 4. Get tool definitions
    const tools = getToolDefinitions();

    // 5. Run the agentic loop (streaming with tool calls)
    let currentMessages = [...messages];
    let finalContent = "";
    let finalToolCalls = null;
    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      let roundContent = "";
      let roundToolCalls = null;

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

      roundContent = result.content;
      roundToolCalls = result.toolCalls;

      // If no tool calls, we're done
      if (!roundToolCalls || roundToolCalls.length === 0) {
        finalContent = roundContent;
        break;
      }

      // Process tool calls
      // Add assistant message with tool calls to conversation
      const assistantMsg = {
        role: "assistant",
        content: roundContent,
        tool_calls: roundToolCalls,
      };
      currentMessages.push(assistantMsg);

      // Execute each tool and add results
      const toolMessages = [];
      for (const tc of roundToolCalls) {
        const toolResult = await executeTool(tc.name, tc.args, userId);
        const resultStr = JSON.stringify(toolResult);

        sendEvent(res, {
          type: "tool_result",
          name: tc.name,
          result: toolResult,
        });

        const toolResultMsg = {
          role: "tool_result",
          tool_use_id: tc.id,
          content: resultStr,
        };
        currentMessages.push(toolResultMsg);
        toolMessages.push(toolResultMsg);
      }

      // Persist the tool call + result messages
      await persistMessages(userId, [
        {
          role: "tool_call",
          tool_calls: roundToolCalls,
        },
        ...toolMessages.map((tm) => ({
          role: "tool_result",
          content: tm.content,
          tool_call_id: tm.tool_use_id,
        })),
      ]);

      // If the model says end_turn with tool calls, continue to get the text response
      if (result.stopReason === "end_turn") {
        finalContent = roundContent;
        break;
      }

      // Otherwise loop — the model wants to make more tool calls or generate a response
    }

    // 6. Persist final assistant message
    const { id: messageId } = await persistMessage(userId, {
      role: "assistant",
      content: finalContent || "",
    });

    // 7. Send done event
    sendEvent(res, { type: "done", message_id: messageId });
  } catch (err) {
    console.error("[jarvis chat error]", err);
    sendEvent(res, { type: "error", message: err.message || "An unexpected error occurred." });
  } finally {
    res.end();
  }
}
