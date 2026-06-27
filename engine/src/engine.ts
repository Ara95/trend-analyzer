import type {
  ClassificationResult,
  ContentIndustryWrite,
  ContentSnapshot,
  IndustryLabel,
  NormalizedTrend,
  PanelAccount,
  Period,
  Platform,
  SourceAdapter,
} from './adapters/contract.js';
import { isClassA } from './adapters/contract.js';
import type { ClassificationConfig } from './config/env.js';
import type { Industry } from './config/industries.js';
import { derive, periodWindowDays } from './engine/derive.js';
import { selectEscalationCandidates, selectOffTopicCandidates } from './classify/escalation.js';

// Classification subsystem hooks. Optional on EngineDeps — when absent, the engine runs
// exactly as before. Panel + cache layers need no model provider, so this is wired even
// without an OpenAI key (only layers 3-4 inside classify*() go quiet).
export interface EscalationInputs {
  snapshots: ContentSnapshot[];
  confidence: Map<string, number>; // max confidence per external_id (low-confidence gate)
  accountIndustry: Map<string, Industry>; // account-only-labeled content → its account industry
  escalated: Set<string>; // content already carrying a 'content'-method label (skip)
}

export interface ClassificationDeps {
  // Account-first classification at ingest (layers 1-3, no content escalation).
  classifyAtIngest: (content: ContentSnapshot, account: PanelAccount | null) => Promise<ClassificationResult>;
  // Content-level escalation (layer 4) for a low-confidence candidate.
  classifyForEscalation: (content: ContentSnapshot) => Promise<ClassificationResult>;
  // Off-topic spot-check for a high-velocity video from a known (panel/cached) account.
  spotCheckOffTopic: (content: ContentSnapshot, accountIndustry: Industry) => Promise<IndustryLabel[]>;
  // Inputs for the escalation gates (see EscalationInputs).
  loadEscalationInputs: (
    platform: Platform,
    country: string,
    windowDays: number,
  ) => Promise<EscalationInputs>;
  upsertContentIndustries: (rows: ContentIndustryWrite[]) => Promise<void>;
  cfg: ClassificationConfig;
}

export interface EngineDeps {
  adapters: Record<string, SourceAdapter>;
  listAccounts: (platform: Platform, country: string) => Promise<PanelAccount[]>;
  insertSnapshots: (snapshots: ContentSnapshot[]) => Promise<void>;
  loadRecentSnapshots: (accountIds: string[], windowDays: number) => Promise<ContentSnapshot[]>;
  upsertTrends: (source: Platform, trends: NormalizedTrend[]) => Promise<void>;
  classification?: ClassificationDeps;
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

  // Account-first classification (layers 1-3), synchronous and cheap. Classify each distinct
  // ACCOUNT once and let all its content inherit the labels — the core cost control.
  if (deps.classification) {
    const accounts = await deps.listAccounts(adapter.platform, country);
    const accountsById = new Map(accounts.map((a) => [a.id, a]));
    await classifyIngested(deps.classification, snapshots, accountsById);
  }
}

async function classifyIngested(
  c: ClassificationDeps,
  snapshots: ContentSnapshot[],
  accountsById: Map<string, PanelAccount>,
): Promise<void> {
  const perAccount = new Map<string, ClassificationResult>(); // classify once per account
  const rows: ContentIndustryWrite[] = [];
  for (const s of snapshots) {
    let result = perAccount.get(s.accountId);
    if (!result) {
      result = await c.classifyAtIngest(s, accountsById.get(s.accountId) ?? null);
      perAccount.set(s.accountId, result);
    }
    for (const label of result.labels) {
      rows.push({
        platform: s.platform,
        externalId: s.externalId,
        industry: label.industry,
        confidence: label.confidence,
        method: result.method,
      });
    }
  }
  await c.upsertContentIndustries(rows);
}

export interface EscalateRequest {
  source: string;
  country: string;
}

// A unit of escalation work, tagged by which gate selected it.
type EscalationWork =
  | { kind: 'low-confidence'; content: ContentSnapshot; velocity: number }
  | { kind: 'off-topic'; content: ContentSnapshot; velocity: number; accountIndustry: Industry };

// Selective content-level analysis (layer 4). Runs AFTER derive. Two gates, both velocity-bounded:
//   - low-confidence: ambiguous account → full caption→transcript→vision escalation.
//   - off-topic: confident account, but a high-velocity video may be off-topic → caption spot-check.
// Content already carrying a 'content'-method label is skipped, so escalation does not loop run to
// run. No-op for Class A or when classification is disabled.
export async function escalate(deps: EngineDeps, req: EscalateRequest): Promise<void> {
  const adapter = requireAdapter(deps, req.source);
  if (isClassA(adapter)) return;
  const c = deps.classification;
  if (!c) return;

  const { snapshots, confidence, accountIndustry, escalated } = await c.loadEscalationInputs(
    adapter.platform,
    req.country,
    c.cfg.escalationWindowDays,
  );

  const lowConf = selectEscalationCandidates(snapshots, confidence, {
    velocityThreshold: c.cfg.velocityThreshold,
    confidenceThreshold: c.cfg.confidenceThreshold,
  });
  const offTopic = selectOffTopicCandidates(snapshots, accountIndustry, {
    velocityThreshold: c.cfg.velocityThreshold,
  });

  const work: EscalationWork[] = [
    ...lowConf.map((x) => ({ kind: 'low-confidence' as const, content: x.content, velocity: x.velocity })),
    ...offTopic.map((x) => ({
      kind: 'off-topic' as const,
      content: x.content,
      velocity: x.velocity,
      accountIndustry: x.accountIndustry,
    })),
  ]
    .filter((w) => !escalated.has(w.content.externalId)) // don't re-escalate already-analyzed content
    .sort((a, b) => b.velocity - a.velocity);

  const limited = work.slice(0, c.cfg.escalationLimit);
  if (work.length > limited.length) {
    console.log(
      `[escalate] dropping ${work.length - limited.length} candidate(s) over limit ${c.cfg.escalationLimit}`,
    );
  }

  const rows: ContentIndustryWrite[] = [];
  for (const w of limited) {
    if (w.kind === 'low-confidence') {
      const result = await c.classifyForEscalation(w.content);
      for (const label of result.labels) {
        rows.push({
          platform: w.content.platform,
          externalId: w.content.externalId,
          industry: label.industry,
          confidence: label.confidence,
          method: result.method,
        });
      }
    } else {
      // Off-topic: add a content-derived label only when the video diverges from its account.
      const labels = await c.spotCheckOffTopic(w.content, w.accountIndustry);
      for (const label of labels) {
        rows.push({
          platform: w.content.platform,
          externalId: w.content.externalId,
          industry: label.industry,
          confidence: label.confidence,
          method: 'content',
        });
      }
    }
  }
  await c.upsertContentIndustries(rows);
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
