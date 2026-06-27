import type { Embedder } from '../adapters/contract.js';
import { INDUSTRY_DEFINITIONS, REAL_INDUSTRIES, type RealIndustry } from '../config/industries.js';

export interface BuildIndustryVectorsDeps {
  embed: Embedder;
  upsertIndustryVector: (slug: RealIndustry, embedding: number[]) => Promise<void>;
}

// Embed each industry's definition text and persist it as that industry's definition vector.
// Run once (and after editing INDUSTRY_DEFINITIONS) via scripts/build-industry-vectors.ts.
// Returns the number of industries whose vectors were written.
export async function buildIndustryVectors(deps: BuildIndustryVectorsDeps): Promise<number> {
  const slugs = REAL_INDUSTRIES;
  const texts = slugs.map((s) => INDUSTRY_DEFINITIONS[s]);
  const embeddings = await deps.embed(texts);
  if (embeddings.length !== slugs.length) {
    throw new Error(
      `buildIndustryVectors: expected ${slugs.length} embeddings, got ${embeddings.length}`,
    );
  }
  for (let i = 0; i < slugs.length; i++) {
    await deps.upsertIndustryVector(slugs[i], embeddings[i]);
  }
  return slugs.length;
}
