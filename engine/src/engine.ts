import type {
  ContentSnapshot,
  NormalizedTrend,
  PanelAccount,
  Period,
  Platform,
  SourceAdapter,
} from './adapters/contract.js';
import { isClassA } from './adapters/contract.js';
import { derive } from './engine/derive.js';

export interface EngineDeps {
  adapters: Record<string, SourceAdapter>;
  listAccounts: (platform: Platform, country: string) => Promise<PanelAccount[]>;
  insertSnapshots: (snapshots: ContentSnapshot[]) => Promise<void>;
  upsertTrends: (source: Platform, trends: NormalizedTrend[]) => Promise<void>;
}

export interface RunRequest {
  source: string;
  country: string;
  period: Period;
}

export async function runEngine(deps: EngineDeps, req: RunRequest): Promise<void> {
  const adapter = deps.adapters[req.source];
  if (!adapter) throw new Error(`Unknown source: ${req.source}`);
  const ctx = { country: req.country, period: req.period };

  if (isClassA(adapter)) {
    const trends = await adapter.fetchTrends(ctx);
    await deps.upsertTrends(adapter.platform, trends);
    return;
  }

  // Class B: snapshot -> store -> derive -> upsert.
  const snapshots = await adapter.fetchSnapshots(ctx);
  await deps.insertSnapshots(snapshots);
  const accounts = await deps.listAccounts(adapter.platform, req.country);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const trends = derive(snapshots, accountsById, ctx);
  await deps.upsertTrends(adapter.platform, trends);
}
