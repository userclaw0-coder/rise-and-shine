// Embedding generation for the memory layer.
// Cloud-only: OpenAI text-embedding-3-small, 1024 dims (matches the
// memories.embedding pgvector(1024) column).
//
// Env vars:
//   OPENAI_API_KEY     required
//   EMBED_MODEL        override model (default text-embedding-3-small)
//   EMBED_DIM          override dimension (default 1024 — matches schema)

const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const EMBED_DIM = Number(process.env.EMBED_DIM || 1024);

async function embedOpenAI(input) {
  const body = {
    model: EMBED_MODEL,
    input: Array.isArray(input) ? input : [input],
    dimensions: EMBED_DIM,
  };
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

/**
 * Generate an embedding for one piece of text or many.
 * @param {string|string[]} input
 * @returns {Promise<number[]|number[][]>} single vector when input is a string,
 *   array of vectors when input is an array.
 */
export async function embed(input) {
  const arr = Array.isArray(input) ? input : [input];
  const vectors = await embedOpenAI(arr);
  if (vectors[0] && vectors[0].length !== EMBED_DIM) {
    throw new Error(
      `embeddings: model returned ${vectors[0].length} dims, expected ${EMBED_DIM} (model=${EMBED_MODEL})`
    );
  }
  return Array.isArray(input) ? vectors : vectors[0];
}

export function getEmbeddingInfo() {
  return { provider: "openai", model: EMBED_MODEL, dim: EMBED_DIM };
}
