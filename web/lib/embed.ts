/**
 * Query-time embedding for semantic search (engine step 2b). Server Components only — reads
 * OPENAI_API_KEY from the server env. Returns null when the key is missing or the call fails or times
 * out, so the caller degrades to lexical FTS and search keeps working without OpenAI.
 */

import { cacheLife } from "next/cache";

const EMBED_TIMEOUT_MS = 2500;

export async function embedQuery(text: string): Promise<number[] | null> {
  "use cache";
  cacheLife("max"); // embedding is deterministic per model — cache indefinitely
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
  if (!key || !text.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, input: text }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const vec = json.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
