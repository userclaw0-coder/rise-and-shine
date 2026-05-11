// AI provider abstraction layer
// Supports: anthropic, openai, ollama
// Selects provider per call via (policy, tier); falls back to env defaults.
//
// Env vars:
//   AI_PROVIDER             default cloud provider when policy doesn't force local
//   INFERENCE_POLICY        default | cloud-only | local-preferred | local-only
//   JARVIS_MODEL            cloud model name for the chosen provider (main tier)
//   EXTRACTOR_PROVIDER      cloud provider used when tier=extractor (defaults to AI_PROVIDER)
//   EXTRACTOR_MODEL         cloud model used when tier=extractor (provider-specific)
//   OLLAMA_URL              base URL for Ollama (alias: LOCAL_INFERENCE_URL)
//   LOCAL_MAIN_MODEL        Ollama model name for tier=main (e.g. hermes3:70b)
//   LOCAL_EXTRACTOR_MODEL   Ollama model name for tier=extractor (e.g. gemma3:27b)
//   OLLAMA_KEEP_ALIVE       how long Ollama keeps the model loaded (e.g. "1h")

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const PROVIDER = process.env.AI_PROVIDER || "anthropic";
const INFERENCE_POLICY = process.env.INFERENCE_POLICY || "default";

const ANTHROPIC_MODEL = process.env.JARVIS_MODEL || "claude-sonnet-4-20250514";
const OPENAI_MODEL = process.env.JARVIS_MODEL || "gpt-4.1";

const OLLAMA_URL =
  process.env.LOCAL_INFERENCE_URL || process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MAIN_MODEL = process.env.LOCAL_MAIN_MODEL || "hermes3:70b";
const OLLAMA_EXTRACTOR_MODEL = process.env.LOCAL_EXTRACTOR_MODEL || "gemma3:27b";
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "1h";

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

// --- Policy resolution + Ollama health check ---

const HEALTH_CACHE_MS = 30_000;
const HEALTH_PROBE_TIMEOUT_MS = 2000;
let _ollamaHealth = { ok: false, checkedAt: 0 };

async function isOllamaReachable() {
  const now = Date.now();
  if (now - _ollamaHealth.checkedAt < HEALTH_CACHE_MS) return _ollamaHealth.ok;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
    _ollamaHealth = { ok: res.ok, checkedAt: now };
  } catch {
    _ollamaHealth = { ok: false, checkedAt: now };
  }
  return _ollamaHealth.ok;
}

/**
 * Resolve the effective provider for a given call.
 * @param {"default"|"cloud-only"|"local-preferred"|"local-only"} policy
 * @param {"main"|"extractor"} tier
 * @returns {Promise<{provider: string, model: string, fallbackReason?: string}>}
 */
async function resolveProvider(policy, tier) {
  const effectivePolicy = policy === "default" ? INFERENCE_POLICY : policy;
  const baseCloud = tier === "extractor" ? EXTRACTOR_PROVIDER : PROVIDER;

  let provider;
  let fallbackReason;

  if (effectivePolicy === "cloud-only") {
    provider = baseCloud === "ollama" ? "anthropic" : baseCloud;
  } else if (effectivePolicy === "local-only") {
    provider = "ollama";
  } else if (effectivePolicy === "local-preferred") {
    if (await isOllamaReachable()) {
      provider = "ollama";
    } else {
      provider = baseCloud === "ollama" ? "anthropic" : baseCloud;
      fallbackReason = "ollama-unreachable";
    }
  } else {
    // "default" — honor AI_PROVIDER as-is
    provider = baseCloud;
  }

  return { provider, model: modelFor(provider, tier), fallbackReason };
}

function modelFor(provider, tier) {
  if (provider === "ollama") {
    return tier === "extractor" ? OLLAMA_EXTRACTOR_MODEL : OLLAMA_MAIN_MODEL;
  }
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
  // openai + ollama both use OpenAI-compatible function format
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
  // openai / ollama
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
const LOCAL_STREAM_TIMEOUT_MS = 180_000; // cold-loading a 70B model can take 30-60s
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

async function streamOllama({ system, messages, tools, onChunk, model }) {
  const msgs = [
    { role: "system", content: system },
    ...messagesForProvider(messages, "ollama"),
  ];
  const body = {
    model,
    messages: msgs,
    stream: true,
    keep_alive: OLLAMA_KEEP_ALIVE,
  };
  const providerTools = toolsForProvider(tools, "ollama");
  if (providerTools) body.tools = providerTools;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama returned ${res.status}: ${text || res.statusText}`);
  }

  let fullContent = "";
  const collectedToolCalls = [];
  let stopReason = "end_turn";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.message?.content) {
          fullContent += obj.message.content;
          onChunk({ type: "text", content: obj.message.content });
        }
        if (obj.message?.tool_calls?.length) {
          for (const tc of obj.message.tool_calls) {
            const id = tc.id || `tc_${Date.now()}_${collectedToolCalls.length}`;
            const name = tc.function?.name;
            const rawArgs = tc.function?.arguments;
            let args;
            if (typeof rawArgs === "string") {
              try {
                args = JSON.parse(rawArgs || "{}");
              } catch {
                args = {};
              }
            } else {
              args = rawArgs || {};
            }
            collectedToolCalls.push({ id, name, args });
            onChunk({ type: "tool_call_start", name, id });
            onChunk({ type: "tool_call", name, id, args });
          }
        }
        if (obj.done) {
          // Ollama signals done with done:true; tool_calls presence implies a tool turn
          stopReason = collectedToolCalls.length > 0 ? "tool_use" : "end_turn";
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  return {
    content: fullContent || null,
    toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
    stopReason,
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

async function completeOllama({ system, messages, tools, model }) {
  const msgs = [
    { role: "system", content: system },
    ...messagesForProvider(messages, "ollama"),
  ];
  const body = {
    model,
    messages: msgs,
    stream: false,
    keep_alive: OLLAMA_KEEP_ALIVE,
  };
  const providerTools = toolsForProvider(tools, "ollama");
  if (providerTools) body.tools = providerTools;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama returned ${res.status}: ${text || res.statusText}`);
  }

  const data = await res.json();
  const toolCalls = (data.message?.tool_calls || []).map((tc, i) => {
    const rawArgs = tc.function?.arguments;
    let args;
    if (typeof rawArgs === "string") {
      try {
        args = JSON.parse(rawArgs || "{}");
      } catch {
        args = {};
      }
    } else {
      args = rawArgs || {};
    }
    return { id: tc.id || `tc_${Date.now()}_${i}`, name: tc.function?.name, args };
  });

  return {
    content: data.message?.content || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
  };
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
 * @param {"default"|"cloud-only"|"local-preferred"|"local-only"} [opts.policy="default"]
 * @param {"main"|"extractor"} [opts.tier="main"]
 * @returns {Promise<{content: string|null, toolCalls: Array|null, stopReason: string, providerUsed: string, modelUsed: string, fallbackReason?: string}>}
 */
export async function chatCompletion({
  system,
  messages,
  tools,
  onChunk,
  policy = "default",
  tier = "main",
}) {
  const { provider, model, fallbackReason } = await resolveProvider(policy, tier);

  let result;
  try {
    if (onChunk) {
      if (provider === "anthropic")
        result = await streamAnthropic({ system, messages, tools, onChunk, model });
      else if (provider === "openai")
        result = await withStreamTimeout(
          streamOpenAI({ system, messages, tools, onChunk, model }),
          CLOUD_STREAM_TIMEOUT_MS
        );
      else if (provider === "ollama")
        result = await withStreamTimeout(
          streamOllama({ system, messages, tools, onChunk, model }),
          LOCAL_STREAM_TIMEOUT_MS
        );
      else throw new Error(`Unknown provider: ${provider}`);
    } else {
      if (provider === "anthropic")
        result = await completeAnthropic({ system, messages, tools, model });
      else if (provider === "openai")
        result = await completeOpenAI({ system, messages, tools, model });
      else if (provider === "ollama")
        result = await completeOllama({ system, messages, tools, model });
      else throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (err) {
    // Local-preferred fallback: if Ollama failed mid-call, retry once on cloud.
    const effective = policy === "default" ? INFERENCE_POLICY : policy;
    if (provider === "ollama" && effective === "local-preferred") {
      const cloudProvider =
        (tier === "extractor" ? EXTRACTOR_PROVIDER : PROVIDER) === "ollama"
          ? "anthropic"
          : tier === "extractor"
            ? EXTRACTOR_PROVIDER
            : PROVIDER;
      const cloudModel = modelFor(cloudProvider, tier);
      console.warn(
        `[ai-provider] Ollama call failed (${err.message}); falling back to ${cloudProvider}/${cloudModel}`
      );
      // Mark health stale so we re-probe next call
      _ollamaHealth = { ok: false, checkedAt: Date.now() };
      const retryOpts = { system, messages, tools, onChunk, model: cloudModel };
      if (onChunk) {
        result =
          cloudProvider === "anthropic"
            ? await streamAnthropic(retryOpts)
            : await withStreamTimeout(streamOpenAI(retryOpts), CLOUD_STREAM_TIMEOUT_MS);
      } else {
        result =
          cloudProvider === "anthropic"
            ? await completeAnthropic(retryOpts)
            : await completeOpenAI(retryOpts);
      }
      return {
        ...result,
        providerUsed: cloudProvider,
        modelUsed: cloudModel,
        fallbackReason: fallbackReason || "ollama-runtime-error",
      };
    }
    throw err;
  }

  return {
    ...result,
    providerUsed: provider,
    modelUsed: model,
    fallbackReason,
  };
}

export function getProviderInfo() {
  return {
    policy: INFERENCE_POLICY,
    cloudProvider: PROVIDER,
    cloudModelMain: ANTHROPIC_MODEL,
    cloudModelExtractor: EXTRACTOR_ANTHROPIC_MODEL,
    ollamaUrl: OLLAMA_URL,
    localModelMain: OLLAMA_MAIN_MODEL,
    localModelExtractor: OLLAMA_EXTRACTOR_MODEL,
  };
}

export async function getProviderStatus() {
  const ollamaOk = await isOllamaReachable();
  return {
    ...getProviderInfo(),
    ollamaReachable: ollamaOk,
  };
}
