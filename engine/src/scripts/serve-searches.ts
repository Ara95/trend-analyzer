import 'dotenv/config'; // load .env before loadEnv() reads it
import { loadEnv } from '../config/env.js';
import { createSupabase } from '../store/supabase.js';
import { createApify } from '../store/apify.js';
import { createOpenAIEmbedder } from '../providers/openai.js';
import { collectForQuery } from '../content/collectForQuery.js';
import { runScorePass } from '../content/scorePass.js';
import { runEmbedPass } from '../content/embedPass.js';
import { pruneVideos } from '../store/videos.js';
import type { ClassifyDeps } from '../classify/classify.js';
import type { Embedder } from '../adapters/contract.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EngineConfig } from '../config/env.js';
import type { ActorRunner } from '../adapters/contract.js';

// On-demand search worker (engine step 4). Drains the `searches` queue: for each user search the web
// marked `pending`, scrape that term once, fold it into the video index, score + embed, mark `ready`.
// Results are then cached for 30 days (the web only re-queues a term once last_scraped_at ages out), so
// this is reactive — it idles when nobody is searching something new. Single-worker (the claim is not
// atomic). Run as a persistent process or a frequent cron: `npm run serve:searches`.

const POLL_MS = Number(process.env.SERVE_POLL_MS ?? 3000);

function nowISO(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Provider-less classification: the video index carries no industry, so spending LLM calls per
// on-demand scrape is pure waste. With no providers, classify() labels everything 'all' for free.
function minimalClassifyDeps(cfg: EngineConfig): ClassifyDeps {
  return {
    cfg: {
      confidenceThreshold: cfg.classification.confidenceThreshold,
      similarityFloor: cfg.classification.similarityFloor,
      cacheMaxAgeDays: cfg.classification.cacheMaxAgeDays,
    },
  };
}

// Claim and process the oldest pending search. Returns false when the queue is empty (→ idle).
async function processOne(
  supabase: SupabaseClient,
  cfg: EngineConfig,
  runActor: ActorRunner,
  embed: Embedder | undefined,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('searches')
    .select('id,query')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(`claim failed: ${error.message}`);

  const row = (data ?? [])[0] as { id: string; query: string } | undefined;
  if (!row) return false;

  await supabase.from('searches').update({ status: 'running', updated_at: nowISO() }).eq('id', row.id);
  console.log(`[serve:searches] scraping "${row.query}"…`);

  try {
    const count = await collectForQuery(row.query, {
      runActor,
      cfg,
      supabase,
      classifyDeps: minimalClassifyDeps(cfg),
    });
    const score = await runScorePass(supabase, cfg);
    if (embed) await runEmbedPass(supabase, embed);

    await supabase
      .from('searches')
      .update({
        status: 'ready',
        result_count: count,
        last_scraped_at: nowISO(),
        error: null,
        updated_at: nowISO(),
      })
      .eq('id', row.id);
    console.log(
      `[serve:searches] "${row.query}" ready — ${count} scraped, ${score.breakouts} breakout, ${score.velocities} with velocity, top z=${score.topTrendScore.toFixed(2)}`,
    );
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await supabase
      .from('searches')
      .update({ status: 'error', error: message.slice(0, 500), updated_at: nowISO() })
      .eq('id', row.id);
    console.error(`[serve:searches] "${row.query}" failed:`, message);
  }

  // Enforce the freshness ceiling out of band: a prune failure must never flip a successful search to
  // 'error', so it lives outside the try above. Runs once per served search — frequent enough to keep
  // the index bounded without a separate cron.
  try {
    const pruned = await pruneVideos(supabase as never, cfg.indexMaxAgeDays);
    if (pruned > 0) console.log(`[serve:searches] pruned ${pruned} stale video(s) (>${cfg.indexMaxAgeDays}d)`);
  } catch (err) {
    console.error('[serve:searches] prune failed:', (err as Error).message ?? err);
  }
  return true;
}

async function main(): Promise<void> {
  const cfg = loadEnv();
  const supabase = createSupabase(cfg);
  const runActor = createApify(cfg.apifyToken);
  const embed = cfg.openaiApiKey
    ? createOpenAIEmbedder(cfg.openaiApiKey, cfg.openaiEmbedModel)
    : undefined;
  if (!embed) {
    console.log('[serve:searches] OPENAI_API_KEY not set — scraped videos will not be embedded (lexical search only)');
  }
  console.log(`[serve:searches] worker up — polling every ${POLL_MS}ms`);

  for (;;) {
    let worked = false;
    try {
      worked = await processOne(supabase, cfg, runActor, embed);
    } catch (err) {
      console.error('[serve:searches] loop error:', (err as Error).message ?? err);
    }
    if (!worked) await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error('[serve:searches] fatal:', err);
  process.exitCode = 1;
});
