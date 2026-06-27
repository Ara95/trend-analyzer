import 'dotenv/config'; // load .env before loadEnv() reads it
import { loadEnv } from '../config/env.js';
import { createSupabase } from '../store/supabase.js';
import { upsertIndustryVector } from '../store/classification.js';
import { buildIndustryVectors } from '../classify/industryVectors.js';
import { INDUSTRY_DEFINITIONS } from '../config/industries.js';
import { createOpenAIEmbedder } from '../providers/openai.js';

// One-time (and after editing INDUSTRY_DEFINITIONS): embed each industry's definition and
// persist it as that industry's definition vector. Run: `npm run build:industry-vectors`.
async function main(): Promise<void> {
  const cfg = loadEnv();
  if (!cfg.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required to build industry vectors');
  }
  const supabase = createSupabase(cfg);
  const embed = createOpenAIEmbedder(cfg.openaiApiKey, cfg.openaiEmbedModel);
  const count = await buildIndustryVectors({
    embed,
    upsertIndustryVector: (slug, embedding) =>
      upsertIndustryVector(supabase as any, slug, embedding, INDUSTRY_DEFINITIONS[slug]),
  });
  console.log(`[build-industry-vectors] wrote ${count} industry definition vectors`);
}

main().catch((err) => {
  console.error('[build-industry-vectors] failed:', err);
  process.exitCode = 1;
});
