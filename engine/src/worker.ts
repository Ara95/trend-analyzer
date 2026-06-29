import './config/load-dotenv.js';
import type { Period, Platform } from './adapters/contract.js';
import { loadEnv } from './config/env.js';
import { createSupabase } from './store/supabase.js';
import { createApify } from './store/apify.js';
import { listActiveAccounts } from './store/accounts.js';
import { insertSnapshots, loadRecentSnapshots } from './store/snapshots.js';
import { upsertTrends, type SupabaseLike } from './store/trends.js';
import {
  getAccountClassification,
  getPanelAccountByHandle,
  loadContentLabels,
  loadIndustryVectors,
  upsertAccountClassification,
  upsertContentIndustries,
} from './store/classification.js';
import type { Industry } from './config/industries.js';
import { classify, spotCheckOffTopic, type ClassifyDeps } from './classify/classify.js';
import {
  createOpenAIEmbedder,
  createOpenAITagger,
  createOpenAIVision,
  downloadKeyframes,
} from './providers/openai.js';
import { createTikTokAdapter } from './adapters/tiktok.js';
import { createInstagramAdapter } from './adapters/instagram.js';
import { runEngine, ingest, escalate, type EngineDeps } from './engine.js';

export interface ParsedArgs {
  source: string;
  country: string;
  period?: Period;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) flags[m[1]] = m[2];
  }
  if (!flags.source) throw new Error('Missing required flag --source=<tiktok|instagram>');
  return {
    source: flags.source,
    country: flags.country ?? 'SE',
    period: flags.period as Period | undefined,
  };
}

// Which period windows to run when no explicit --period is given. Both sources are now Class B
// (raw-content), so both derive over day/week/month from accumulated snapshot history.
export function plannedRuns(_source: string, period: Period | undefined): Period[] {
  if (period) return [period];
  return ['day', 'week', 'month'];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadEnv();
  const supabase = createSupabase(cfg) as unknown as SupabaseLike;
  const runActor = createApify(cfg.apifyToken);

  const adapters = {
    tiktok: createTikTokAdapter({
      runActor,
      actorId: cfg.tiktokActorId,
      resultsPerPage: cfg.tiktokResultsPerPage,
      listAccounts: () => listActiveAccounts(supabase as any, 'tiktok', args.country),
    }),
    instagram: createInstagramAdapter({
      runActor,
      actorId: cfg.instagramActorId,
      listAccounts: () => listActiveAccounts(supabase as any, 'instagram', args.country),
    }),
  };

  // Classification providers. OPENAI_API_KEY is optional — without it, embed/tag/vision are
  // undefined and only the deterministic panel + cache layers run (layers 3-4 go quiet).
  const embed = cfg.openaiApiKey
    ? createOpenAIEmbedder(cfg.openaiApiKey, cfg.openaiEmbedModel)
    : undefined;
  const tag = cfg.openaiApiKey ? createOpenAITagger(cfg.openaiApiKey, cfg.openaiTagModel) : undefined;
  const vision = cfg.openaiApiKey
    ? createOpenAIVision(cfg.openaiApiKey, cfg.openaiVisionModel)
    : undefined;
  if (!cfg.openaiApiKey) {
    console.log('[worker] OPENAI_API_KEY not set — running panel/cache classification only');
  }

  const classifyDeps: ClassifyDeps = {
    getPanelAccount: (p, h) => getPanelAccountByHandle(supabase as any, p, h),
    getCachedClassification: (p, k) => getAccountClassification(supabase as any, p, k),
    putCachedClassification: (row) => upsertAccountClassification(supabase as any, row),
    loadIndustryVectors: () => loadIndustryVectors(supabase as any),
    embed,
    tag,
    vision,
    downloadKeyframes: vision ? downloadKeyframes : undefined,
    cfg: cfg.classification,
  };

  const deps: EngineDeps = {
    adapters,
    listAccounts: (platform: Platform, country: string) =>
      listActiveAccounts(supabase as any, platform, country),
    insertSnapshots: (s) => insertSnapshots(supabase as any, s),
    loadRecentSnapshots: (ids, days) => loadRecentSnapshots(supabase as any, ids, days),
    upsertTrends: (source, t) => upsertTrends(supabase, source, t),
    classification: {
      classifyAtIngest: (content, account) =>
        classify({ content, account, allowContentEscalation: false }, classifyDeps),
      classifyForEscalation: (content) =>
        classify({ content, allowContentEscalation: true }, classifyDeps),
      spotCheckOffTopic: (content, accountIndustry) =>
        spotCheckOffTopic(content, accountIndustry, classifyDeps),
      loadEscalationInputs: async (platform, country, windowDays) => {
        const accounts = await listActiveAccounts(supabase as any, platform, country);
        const snapshots = await loadRecentSnapshots(
          supabase as any,
          accounts.map((a) => a.id),
          windowDays,
        );
        const labels = await loadContentLabels(
          supabase as any,
          snapshots.map((s) => s.externalId),
        );
        // Build the three escalation gates from the current content labels.
        const confidence = new Map<string, number>();
        const accountIndustry = new Map<string, Industry>();
        const escalated = new Set<string>();
        for (const row of labels) {
          const prev = confidence.get(row.externalId);
          if (prev === undefined || row.confidence > prev) confidence.set(row.externalId, row.confidence);
          // Off-topic premise is a CONFIDENT account label that a video may diverge from. Gating on
          // confidence keeps low-confidence cached items out of the off-topic gate, so they don't
          // land in both buckets (double model spend).
          if (
            (row.method === 'panel' || row.method === 'cached') &&
            row.confidence >= cfg.classification.confidenceThreshold
          ) {
            accountIndustry.set(row.externalId, row.industry as Industry);
          }
          if (row.method === 'content') escalated.add(row.externalId);
        }
        // Once content-verified, drop it from the account-only set so it isn't re-spot-checked.
        for (const id of escalated) accountIndustry.delete(id);
        return { snapshots, confidence, accountIndustry, escalated };
      },
      upsertContentIndustries: (rows) => upsertContentIndustries(supabase as any, rows),
      cfg: cfg.classification,
    },
  };

  // Ingest raw content once per invocation (Class B only; no-op for Class A) — this also runs
  // account-first classification (layers 1-3) — then derive per period window from accumulated
  // history, then selectively escalate high-velocity low-confidence content (layer 4).
  await ingest(deps, args.source, args.country);

  for (const period of plannedRuns(args.source, args.period)) {
    console.log(`[worker] running ${args.source} country=${args.country} period=${period}`);
    await runEngine(deps, { source: args.source, country: args.country, period });
  }

  await escalate(deps, { source: args.source, country: args.country });
  console.log('[worker] done');
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err) => {
    console.error('[worker] failed:', err);
    process.exitCode = 1;
  });
}
