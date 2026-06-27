import type { IndustryLabel, IndustryVector } from '../adapters/contract.js';

// Sharpens the softmax over cosine similarities. Embedding cosines sit in a narrow band,
// so a small temperature is needed to turn them into decisive confidences.
const SOFTMAX_TEMPERATURE = 0.1;

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Zero-shot multi-label: compare a query vector against the industry definition vectors,
// softmax the similarities into confidences (summing to ~1), and keep those above the floor.
export function zeroShotLabels(
  vector: number[],
  industryVectors: IndustryVector[],
  opts: { floor: number },
): IndustryLabel[] {
  if (vector.length === 0 || industryVectors.length === 0) return [];
  const sims = industryVectors.map((iv) => ({
    industry: iv.industry,
    sim: cosineSimilarity(vector, iv.embedding),
  }));
  const max = Math.max(...sims.map((s) => s.sim));
  const exps = sims.map((s) => ({
    industry: s.industry,
    e: Math.exp((s.sim - max) / SOFTMAX_TEMPERATURE),
  }));
  const sum = exps.reduce((acc, x) => acc + x.e, 0);
  if (sum === 0) return [];
  return exps
    .map((x) => ({ industry: x.industry, confidence: x.e / sum }))
    .filter((l) => l.confidence >= opts.floor)
    .sort((a, b) => b.confidence - a.confidence);
}
