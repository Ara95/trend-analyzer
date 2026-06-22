import type {
  ContentSnapshot,
  NormalizedTrend,
  PanelAccount,
  Period,
  Platform,
  SourceAdapter,
} from './adapters/contract.js';
import { isClassA } from './adapters/contract.js';
import { derive, periodWindowDays } from './engine/derive.js';

export interface EngineDeps {
  adapters: Record<string, SourceAdapter>;
  listAccounts: (platform: Platform, country: string) => Promise<PanelAccount[]>;
  insertSnapshots: (snapshots: ContentSnapshot[]) => Promise<void>;
  loadRecentSnapshots: (accountIds: string[], windowDays: number) => Promise<ContentSnapshot[]>;
  upsertTrends: (source: Platform, trends: NormalizedTrend[]) => Promise<void>;
}

export interface RunRequest {
  source: string;
  country: string;
  period: Period;
}

function requireAdapter(deps: EngineDeps, source: string): SourceAdapter {
  const adapter = deps.adapters[source];
  if (!adapter) throw new Error(`Unknown source: ${source}`);
  return adapter;
}

// Class B ingestion: scrape raw content once and persist it. No-op for Class A.
// Call once per worker invocation (period-independent) BEFORE deriving per period.
export async function ingest(deps: EngineDeps, source: string, country: string): Promise<void> {
  const adapter = requireAdapter(deps, source);
  if (isClassA(adapter)) return;
  const snapshots = await adapter.fetchSnapshots({ country, period: 'day' });
  await deps.insertSnapshots(snapshots);
}

export async function runEngine(deps: EngineDeps, req: RunRequest): Promise<void> {
  const adapter = requireAdapter(deps, req.source);
  const ctx = { country: req.country, period: req.period };

  if (isClassA(adapter)) {
    const trends = await adapter.fetchTrends(ctx);
    await deps.upsertTrends(adapter.platform, trends);
    return;
  }

  // Class B: derive from ACCUMULATED snapshot history (ingestion happened separately,
  // so >=2 snapshots of a reel build up across runs). Cold start until the 2nd snapshot.
  const accounts = await deps.listAccounts(adapter.platform, req.country);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const snapshots = await deps.loadRecentSnapshots(
    accounts.map((a) => a.id),
    periodWindowDays(req.period),
  );
  const trends = derive(snapshots, accountsById, ctx);
  await deps.upsertTrends(adapter.platform, trends);
}
