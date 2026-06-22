import type { Period, Platform } from './adapters/contract.js';
import { loadEnv } from './config/env.js';
import { createSupabase } from './store/supabase.js';
import { createApify } from './store/apify.js';
import { listActiveAccounts } from './store/accounts.js';
import { insertSnapshots } from './store/snapshots.js';
import { upsertTrends, type SupabaseLike } from './store/trends.js';
import { createTikTokAdapter } from './adapters/tiktok.js';
import { createInstagramAdapter } from './adapters/instagram.js';
import { runEngine, type EngineDeps } from './engine.js';

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

// Which period windows to run for a source when no explicit --period is given.
export function plannedRuns(source: string, period: Period | undefined): Period[] {
  if (period) return [period];
  return source === 'tiktok' ? ['week', 'month'] : ['day', 'week', 'month'];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadEnv();
  const supabase = createSupabase(cfg) as unknown as SupabaseLike;
  const runActor = createApify(cfg.apifyToken);

  const adapters = {
    tiktok: createTikTokAdapter({ runActor, actorId: cfg.tiktokActorId }),
    instagram: createInstagramAdapter({
      runActor,
      actorId: cfg.instagramActorId,
      listAccounts: () => listActiveAccounts(supabase as any, 'instagram', args.country),
    }),
  };

  const deps: EngineDeps = {
    adapters,
    listAccounts: (platform: Platform, country: string) =>
      listActiveAccounts(supabase as any, platform, country),
    insertSnapshots: (s) => insertSnapshots(supabase as any, s),
    upsertTrends: (source, t) => upsertTrends(supabase, source, t),
  };

  for (const period of plannedRuns(args.source, args.period)) {
    console.log(`[worker] running ${args.source} country=${args.country} period=${period}`);
    await runEngine(deps, { source: args.source, country: args.country, period });
  }
  console.log('[worker] done');
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err) => {
    console.error('[worker] failed:', err);
    process.exitCode = 1;
  });
}
