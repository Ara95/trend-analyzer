import 'dotenv/config'; // load .env before loadEnv() reads it
import { loadEnv } from '../config/env.js';
import { createSupabase } from '../store/supabase.js';
import { createOpenAIEmbedder } from '../providers/openai.js';
import { runEmbedPass } from '../content/embedPass.js';

// Backfill caption embeddings for semantic search (engine step 2b) — idempotent: only embeds videos
// that have a caption but no embedding yet, so re-running is cheap and resumable. Run after `collect`.
// Run: `npm run embed:videos`.

async function main(): Promise<void> {
  const cfg = loadEnv();
  if (!cfg.openaiApiKey) {
    console.log('[embed:videos] OPENAI_API_KEY not set — semantic search disabled, skipping');
    return;
  }
  const supabase = createSupabase(cfg);
  const embed = createOpenAIEmbedder(cfg.openaiApiKey, cfg.openaiEmbedModel);

  const total = await runEmbedPass(supabase, embed);
  console.log(`[embed:videos] done — embedded ${total} video(s)`);
}

main().catch((err) => {
  console.error('[embed:videos] failed:', err);
  process.exitCode = 1;
});
