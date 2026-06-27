import { describe, it, expect } from 'vitest';
import {
  ingest,
  escalate,
  type EngineDeps,
  type ClassificationDeps,
  type EscalationInputs,
} from './engine.js';
import type {
  ClassificationResult,
  ContentIndustryWrite,
  ContentSnapshot,
  IndustryLabel,
  PanelAccount,
  SourceAdapter,
} from './adapters/contract.js';
import type { ClassificationConfig } from './config/env.js';
import type { Industry } from './config/industries.js';

const accountA: PanelAccount = { id: 'a1', handle: 'h1', platform: 'instagram', industry: 'beauty', country: 'SE', active: true };
const accountB: PanelAccount = { id: 'a2', handle: 'h2', platform: 'instagram', industry: 'food', country: 'SE', active: true };

function snap(over: Partial<ContentSnapshot>): ContentSnapshot {
  return {
    platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
    views: 0, likes: 0, comments: 0, shares: 0, capturedAt: '2026-06-20T00:00:00.000Z',
    ...over,
  };
}

const CFG: ClassificationConfig = {
  confidenceThreshold: 0.7,
  velocityThreshold: 500,
  cacheMaxAgeDays: 30,
  accountRecentPostsCount: 12,
  escalationLimit: 50,
  escalationWindowDays: 7,
  similarityFloor: 0.15,
};

const EMPTY_INPUTS: EscalationInputs = {
  snapshots: [],
  confidence: new Map(),
  accountIndustry: new Map(),
  escalated: new Set(),
};

function makeDeps(opts: {
  igFetch: () => Promise<ContentSnapshot[]>;
  escalationInputs?: EscalationInputs;
}) {
  const ingestCalls: { accountId: string | null; externalId: string }[] = [];
  const escalationCalls: string[] = [];
  const offTopicCalls: { externalId: string; accountIndustry: Industry }[] = [];
  const contentRows: ContentIndustryWrite[] = [];

  const instagram: SourceAdapter = {
    id: 'instagram', platform: 'instagram', sourceClass: 'raw-content',
    fetchTrends: async () => [], fetchSnapshots: opts.igFetch,
  };

  const classification: ClassificationDeps = {
    classifyAtIngest: async (content, account): Promise<ClassificationResult> => {
      ingestCalls.push({ accountId: account?.id ?? null, externalId: content.externalId });
      const industry = account?.industry ?? 'all';
      return { labels: [{ industry, confidence: account ? 1 : 0 }], primaryIndustry: industry, method: 'panel' };
    },
    classifyForEscalation: async (content): Promise<ClassificationResult> => {
      escalationCalls.push(content.externalId);
      return { labels: [{ industry: 'food', confidence: 0.95 }], primaryIndustry: 'food', method: 'content' };
    },
    spotCheckOffTopic: async (content, accountIndustry): Promise<IndustryLabel[]> => {
      offTopicCalls.push({ externalId: content.externalId, accountIndustry });
      // Diverges when the caption signals 'food'; otherwise on-topic (no override).
      return content.caption === 'FOOD' ? [{ industry: 'food', confidence: 0.9 }] : [];
    },
    loadEscalationInputs: async () => opts.escalationInputs ?? EMPTY_INPUTS,
    upsertContentIndustries: async (rows) => { contentRows.push(...rows); },
    cfg: CFG,
  };

  const deps: EngineDeps = {
    adapters: { instagram },
    listAccounts: async () => [accountA, accountB],
    insertSnapshots: async () => {},
    loadRecentSnapshots: async () => [],
    upsertTrends: async () => {},
    classification,
  };
  return { deps, ingestCalls, escalationCalls, offTopicCalls, contentRows };
}

describe('ingest classification (layers 1-3)', () => {
  it('classifies once per ACCOUNT and writes inherited labels for every content', async () => {
    const snaps = [
      snap({ accountId: 'a1', externalId: 'r1' }),
      snap({ accountId: 'a1', externalId: 'r2' }),
      snap({ accountId: 'a2', externalId: 'r3' }),
    ];
    const { deps, ingestCalls, contentRows } = makeDeps({ igFetch: async () => snaps });

    await ingest(deps, 'instagram', 'SE');

    // 3 snapshots but only 2 distinct accounts → classify called twice (cost control).
    expect(ingestCalls).toHaveLength(2);
    // Every snapshot gets a content_industries row inheriting its account's industry.
    expect(contentRows).toHaveLength(3);
    expect(contentRows.find((r) => r.externalId === 'r1')?.industry).toBe('beauty');
    expect(contentRows.find((r) => r.externalId === 'r3')?.industry).toBe('food');
  });
});

const reel = (id: string, likes: number, over: Partial<ContentSnapshot> = {}): ContentSnapshot[] => [
  snap({ externalId: id, likes: 0, capturedAt: '2026-06-20T00:00:00.000Z', ...over }),
  snap({ externalId: id, likes, capturedAt: '2026-06-21T00:00:00.000Z', ...over }),
];

describe('escalate (layer 4)', () => {
  it('escalates only high-velocity low-confidence content and persists its labels', async () => {
    const escalationInputs: EscalationInputs = {
      snapshots: [...reel('fast', 2000), ...reel('slow', 10)],
      confidence: new Map([
        ['fast', 0.3],
        ['slow', 0.3],
      ]),
      accountIndustry: new Map(),
      escalated: new Set(),
    };
    const { deps, escalationCalls, contentRows } = makeDeps({
      igFetch: async () => [],
      escalationInputs,
    });

    await escalate(deps, { source: 'instagram', country: 'SE' });

    expect(escalationCalls).toEqual(['fast']); // 'slow' is below the velocity gate
    expect(contentRows).toEqual([
      { platform: 'instagram', externalId: 'fast', industry: 'food', confidence: 0.95, method: 'content' },
    ]);
  });

  it('spot-checks high-velocity panel content and overrides only when off-topic', async () => {
    // Both are high-velocity panel content (confidence 1.0 → never low-confidence eligible).
    // 'offtopic' has a FOOD caption (diverges from its beauty account); 'ontopic' does not.
    const escalationInputs: EscalationInputs = {
      snapshots: [...reel('offtopic', 3000, { caption: 'FOOD' }), ...reel('ontopic', 3000, { caption: 'beauty haul' })],
      confidence: new Map([
        ['offtopic', 1],
        ['ontopic', 1],
      ]),
      accountIndustry: new Map<string, Industry>([
        ['offtopic', 'beauty'],
        ['ontopic', 'beauty'],
      ]),
      escalated: new Set(),
    };
    const { deps, escalationCalls, offTopicCalls, contentRows } = makeDeps({
      igFetch: async () => [],
      escalationInputs,
    });

    await escalate(deps, { source: 'instagram', country: 'SE' });

    expect(escalationCalls).toEqual([]); // neither is low-confidence
    expect(offTopicCalls.map((c) => c.externalId).sort()).toEqual(['offtopic', 'ontopic']);
    // Only the off-topic video gets a content-derived label; on-topic adds nothing.
    expect(contentRows).toEqual([
      { platform: 'instagram', externalId: 'offtopic', industry: 'food', confidence: 0.9, method: 'content' },
    ]);
  });

  it('skips content already carrying a content-method label (no re-escalation loop)', async () => {
    const escalationInputs: EscalationInputs = {
      snapshots: [...reel('fast', 2000)],
      confidence: new Map([['fast', 0.3]]),
      accountIndustry: new Map(),
      escalated: new Set(['fast']),
    };
    const { deps, escalationCalls, contentRows } = makeDeps({ igFetch: async () => [], escalationInputs });

    await escalate(deps, { source: 'instagram', country: 'SE' });

    expect(escalationCalls).toEqual([]);
    expect(contentRows).toEqual([]);
  });

  it('is a no-op when classification is not configured', async () => {
    const { deps } = makeDeps({ igFetch: async () => [] });
    const bare: EngineDeps = { ...deps, classification: undefined };
    await expect(escalate(bare, { source: 'instagram', country: 'SE' })).resolves.toBeUndefined();
  });
});
