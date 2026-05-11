// Embedding generation for the memory layer (and any future vector retrieval).
// Defaults to local Ollama (mxbai-embed-large, 1024 dims). Supports OpenAI
// and Voyage as alternates via EMBED_PROVIDER.
//
// Env vars:
//   EMBED_PROVIDER     ollama (default) | openai | voyage
//   EMBED_MODEL        ollama: mxbai-embed-large (default)
//                      openai: text-embedding-3-small (default) | text-embedding-3-large
//                      voyage: voyage-3-large (default) | voyage-3
//   EMBED_DIM          declared dimension (default 1024 — matches mxbai-embed-large)
//   OLLAMA_URL / LOCAL_INFERENCE_URL
//   OPENAI_API_KEY
//   VOYAGE_API_KEY

const EMBED_PROVIDER = process.env.EMBED_PROVIDER || "ollama";
const EMBED_MODEL =
  process.env.EMBED_MODEL ||
  (EMBED_PROVIDER === "openai"
    ? "text-embedding-3-small"
    : EMBED_PROVIDER === "voyage"
      ? "voyage-3-large"
      : "mxbai-embed-large");
const EMBED_DIM = Number(process.env.EMBED_DIM || 1024);
const OLLAMA_URL =
  process.env.LOCAL_INFERENCE_URL || process.env.OLLAMA_URL || "http://localhost:11434";

async function embedOllama(input) {
  // Ollama embeddings API accepts a single string or array of strings.
  const body = { model: EMBED_MODEL, input };
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama embed returned ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  // Response shape: { embeddings: number[][] }
  return data.embeddings || [];
}

async function embedOpenAI(input) {
  const body = { model: EMBED_MODEL, input: Array.isArray(input) ? input : [input] };
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI embed returned ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  return (data.data || []).map((d) => d.embedding);
}

async function embedVoyage(input) {
  const body = {
    model: EMBED_MODEL,
    input: Array.isArray(input) ? input : [input],
  };
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Voyage embed returned ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  return (data.data || []).map((d) => d.embedding);
}

/**
 * Generate an embedding for one piece of text or many.
 * @param {string|string[]} input
 * @returns {Promise<number[]|number[][]>} single vector when input is a string,
 *   array of vectors when input is an array.
 */
export async function embed(input) {
  const arr = Array.isArray(input) ? input : [input];
  let vectors;
  if (EMBED_PROVIDER === "ollama") vectors = await embedOllama(arr);
  else if (EMBED_PROVIDER === "openai") vectors = await embedOpenAI(arr);
  else if (EMBED_PROVIDER === "voyage") vectors = await embedVoyage(arr);
  else throw new Error(`Unknown EMBED_PROVIDER: ${EMBED_PROVIDER}`);

  // Sanity-check dimensions
  if (vectors[0] && vectors[0].length !== EMBED_DIM) {
    console.warn(
      `[embeddings] WARNING: model returned ${vectors[0].length} dims, expected ${EMBED_DIM}. ` +
        `Check EMBED_DIM env var or schema. Provider=${EMBED_PROVIDER} model=${EMBED_MODEL}`
    );
  }

  return Array.isArray(input) ? vectors : vectors[0];
}

export function getEmbeddingInfo() {
  return {
    provider: EMBED_PROVIDER,
    model: EMBED_MODEL,
    dim: EMBED_DIM,
    ollamaUrl: EMBED_PROVIDER === "ollama" ? OLLAMA_URL : null,
  };
}
