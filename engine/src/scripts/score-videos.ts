import 'dotenv/config'; // load .env before loadEnv() reads it
import { loadEnv } from '../config/env.js';
import { createSupabase } from '../store/supabase.js';
import { runScorePass } from '../content/scorePass.js';

// Score the video index (engine step 2a) — no scraping, no Apify cost. Recomputes each creator's
// baseline median views, then writes trend_score / outlier_ratio / is_breakout onto every video in a
// recent window. This is what fills the UI's Trend Score chip. Run after `npm run collect`, or on a
// schedule. Window is configurable via SCORE_WINDOW_DAYS (default 60). Run: `npm run score:videos`.

const DEFAULT_WINDOW_DAYS = 60;

async function main(): Promise<void> {
  const cfg = loadEnv();
  const supabase = createSupabase(cfg);
  const windowDays = Number(process.env.SCORE_WINDOW_DAYS ?? DEFAULT_WINDOW_DAYS);

  const r = await runScorePass(supabase, cfg, windowDays);
  if (r.scored === 0) {
    console.log(`[score:videos] no videos in the last ${windowDays}d — nothing to do`);
    return;
  }
  console.log(
    `[score:videos] scored ${r.scored} video(s) over ${windowDays}d, ${r.baselines} creator baseline(s), ` +
      `${r.breakouts} breakout (z>=${cfg.trendBreakoutZ} or >=12x), ${r.velocities} with velocity | top trendScore=${r.topTrendScore.toFixed(2)}`,
  );
}

main().catch((err) => {
  console.error('[score:videos] failed:', err);
  process.exitCode = 1;
});
