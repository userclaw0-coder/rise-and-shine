// AI provider abstraction layer
// Cloud-only: Anthropic (default) or OpenAI. Per-call `tier` selects between
// the main model and a cheaper extractor model.
//
// Env vars:
//   AI_PROVIDER             anthropic (default) | openai
//   JARVIS_MODEL            cloud model name for the chosen provider (main tier)
//   EXTRACTOR_PROVIDER      cloud provider used when tier=extractor (defaults to AI_PROVIDER)
//   EXTRACTOR_MODEL         cloud model used when tier=extractor (provider-specific)

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const PROVIDER = process.env.AI_PROVIDER || "anthropic";

const ANTHROPIC_MODEL = process.env.JARVIS_MODEL || "claude-sonnet-4-20250514";
const OPENAI_MODEL = process.env.JARVIS_MODEL || "gpt-4.1";

const EXTRACTOR_PROVIDER = process.env.EXTRACTOR_PROVIDER || PROVIDER;
const EXTRACTOR_ANTHROPIC_MODEL =
  process.env.EXTRACTOR_MODEL || "claude-haiku-4-5-20251001";
const EXTRACTOR_OPENAI_MODEL = process.env.EXTRACTOR_MODEL || "gpt-4o-mini";

// Lazy-init clients to avoid startup errors when keys aren't set
let _anthropic = null;
let _openai = null;

function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function resolveProvider(tier) {
  const provider = tier === "extractor" ? EXTRACTOR_PROVIDER : PROVIDER;
  return { provider, model: modelFor(provider, tier) };
}

function modelFor(provider, tier) {
  if (provider === "anthropic") {
    return tier === "extractor" ? EXTRACTOR_ANTHROPIC_MODEL : ANTHROPIC_MODEL;
  }
  if (provider === "openai") {
    return tier === "extractor" ? EXTRACTOR_OPENAI_MODEL : OPENAI_MODEL;
  }
  return ANTHROPIC_MODEL;
}

// Convert our tool definitions to provider-specific format
function toolsForProvider(tools, provider) {
  if (!tools || tools.length === 0) return undefined;
  if (provider === "anthropic") {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }
  // openai
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// Normalize messages for each provider
function messagesForProvider(messages, provider) {
  if (provider === "anthropic") {
    return messages.map((m) => {
      if (m.role === "tool_result") {
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_use_id,
              content:
                typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            },
          ],
        };
      }
      if (m.role === "assistant" && m.tool_calls) {
        return {
          role: "assistant",
          content: m.tool_calls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.args,
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }
  // openai
  return messages.map((m) => {
    if (m.role === "tool_result") {
      return {
        role: "tool",
        tool_call_id: m.tool_use_id,
        content:
          typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

// Normalize response from each provider into standard format
function normalizeAnthropicResponse(response) {
  const textParts = [];
  const toolCalls = [];
  for (const block of response.content || []) {
    if (block.type === "text") textParts.push(block.text);
    if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, args: block.input });
    }
  }
  return {
    content: textParts.join("") || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    stopReason: response.stop_reason,
  };
}

function normalizeOpenAIResponse(response) {
  const choice = response.choices?.[0];
  const message = choice?.message;
  const toolCalls = (message?.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || "{}"),
  }));
  return {
    content: message?.content || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    stopReason: choice?.finish_reason === "tool_calls" ? "tool_use" : choice?.finish_reason,
  };
}

// --- Streaming helpers ---

const RETRYABLE_ERRORS = ["overloaded_error", "rate_limit_error", "529", "529 Overloaded"];
const CLOUD_STREAM_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

function isRetryableError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    RETRYABLE_ERRORS.some((re) => msg.includes(re.toLowerCase())) ||
    msg.includes("overloaded") ||
    msg.includes("rate limit") ||
    msg.includes("529")
  );
}

function withStreamTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Stream timeout — AI did not respond within ${timeoutMs / 1000}s.`)
          ),
        timeoutMs
      )
    ),
  ]);
}

async function streamAnthropicOnce({ system, messages, tools, onChunk, model }) {
  const client = getAnthropic();
  const params = {
    model,
    max_tokens: 4096,
    system,
    messages: messagesForProvider(messages, "anthropic"),
  };
  const providerTools = toolsForProvider(tools, "anthropic");
  if (providerTools) params.tools = providerTools;

  const stream = await client.messages.stream(params);

  let fullContent = "";
  const toolCalls = [];
  let currentToolUse = null;
  let stopReason = null;

  try {
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block?.type === "tool_use") {
          currentToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
            args: "",
          };
          onChunk({
            type: "tool_call_start",
            name: event.content_block.name,
            id: event.content_block.id,
          });
        }
      }
      if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta") {
          fullContent += event.delta.text;
          onChunk({ type: "text", content: event.delta.text });
        }
        if (event.delta?.type === "input_json_delta" && currentToolUse) {
          currentToolUse.args += event.delta.partial_json;
        }
      }
      if (event.type === "content_block_stop" && currentToolUse) {
        try {
          currentToolUse.args = JSON.parse(currentToolUse.args || "{}");
        } catch {
          currentToolUse.args = {};
        }
        toolCalls.push(currentToolUse);
        onChunk({
          type: "tool_call",
          name: currentToolUse.name,
          id: currentToolUse.id,
          args: currentToolUse.args,
        });
        currentToolUse = null;
      }
      if (event.type === "message_delta") {
        stopReason = event.delta?.stop_reason || stopReason;
      }
    }
  } catch (streamErr) {
    if (fullContent) {
      return {
        content: fullContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        stopReason: "error",
        error: streamErr,
      };
    }
    throw streamErr;
  }

  return {
    content: fullContent || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    stopReason: stopReason || "end_turn",
  };
}

async function streamAnthropic(opts) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await withStreamTimeout(streamAnthropicOnce(opts), CLOUD_STREAM_TIMEOUT_MS);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[ai-provider] Retryable error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), waiting ${delay}ms:`,
          err.message
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }
  if (isRetryableError(lastErr)) {
    throw new Error(
      `AI is temporarily unavailable after ${MAX_RETRIES + 1} attempts. Please try again in a moment.`
    );
  }
  throw lastErr;
}

async function streamOpenAI({ system, messages, tools, onChunk, model }) {
  const client = getOpenAI();
  const msgs = [
    { role: "system", content: system },
    ...messagesForProvider(messages, "openai"),
  ];
  const params = { model, messages: msgs, stream: true };
  const providerTools = toolsForProvider(tools, "openai");
  if (providerTools) params.tools = providerTools;

  const stream = await client.chat.completions.create(params);

  let fullContent = "";
  const toolCallMap = {};
  let stopReason = null;

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      const finish = chunk.choices?.[0]?.finish_reason;
      if (finish) stopReason = finish;

      if (delta?.content) {
        fullContent += delta.content;
        onChunk({ type: "text", content: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallMap[tc.index]) {
            toolCallMap[tc.index] = { id: tc.id || "", name: "", args: "" };
          }
          const entry = toolCallMap[tc.index];
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) {
            entry.name = tc.function.name;
            onChunk({ type: "tool_call_start", name: entry.name, id: entry.id });
          }
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }
  } catch (streamErr) {
    if (fullContent) {
      return {
        content: fullContent,
        toolCalls: null,
        stopReason: "error",
        error: streamErr,
      };
    }
    throw streamErr;
  }

  const toolCalls = Object.values(toolCallMap).map((tc) => {
    try {
      tc.args = JSON.parse(tc.args || "{}");
    } catch {
      tc.args = {};
    }
    onChunk({ type: "tool_call", name: tc.name, id: tc.id, args: tc.args });
    return tc;
  });

  return {
    content: fullContent || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    stopReason: stopReason === "tool_calls" ? "tool_use" : stopReason || "end_turn",
  };
}

// --- Non-streaming (for tests / extraction batches) ---

async function completeAnthropic({ system, messages, tools, model }) {
  const client = getAnthropic();
  const params = {
    model,
    max_tokens: 4096,
    system,
    messages: messagesForProvider(messages, "anthropic"),
  };
  const providerTools = toolsForProvider(tools, "anthropic");
  if (providerTools) params.tools = providerTools;
  const response = await client.messages.create(params);
  return normalizeAnthropicResponse(response);
}

async function completeOpenAI({ system, messages, tools, model }) {
  const client = getOpenAI();
  const msgs = [
    { role: "system", content: system },
    ...messagesForProvider(messages, "openai"),
  ];
  const params = { model, messages: msgs };
  const providerTools = toolsForProvider(tools, "openai");
  if (providerTools) params.tools = providerTools;
  const response = await client.chat.completions.create(params);
  return normalizeOpenAIResponse(response);
}

// --- Public API ---

/**
 * Send a chat completion with optional tool use and streaming.
 *
 * @param {object} opts
 * @param {string} opts.system - System prompt
 * @param {Array} opts.messages - Conversation messages
 * @param {Array} [opts.tools] - Tool definitions
 * @param {function} [opts.onChunk] - Streaming callback; if provided, streams
 * @param {"main"|"extractor"} [opts.tier="main"]
 * @returns {Promise<{content: string|null, toolCalls: Array|null, stopReason: string, providerUsed: string, modelUsed: string}>}
 */
export async function chatCompletion({
  system,
  messages,
  tools,
  onChunk,
  tier = "main",
}) {
  const { provider, model } = resolveProvider(tier);

  let result;
  if (onChunk) {
    if (provider === "anthropic")
      result = await streamAnthropic({ system, messages, tools, onChunk, model });
    else if (provider === "openai")
      result = await withStreamTimeout(
        streamOpenAI({ system, messages, tools, onChunk, model }),
        CLOUD_STREAM_TIMEOUT_MS
      );
    else throw new Error(`Unknown provider: ${provider}`);
  } else {
    if (provider === "anthropic")
      result = await completeAnthropic({ system, messages, tools, model });
    else if (provider === "openai")
      result = await completeOpenAI({ system, messages, tools, model });
    else throw new Error(`Unknown provider: ${provider}`);
  }

  return { ...result, providerUsed: provider, modelUsed: model };
}

export function getProviderInfo() {
  return {
    cloudProvider: PROVIDER,
    cloudModelMain: ANTHROPIC_MODEL,
    cloudModelExtractor: EXTRACTOR_ANTHROPIC_MODEL,
  };
}
