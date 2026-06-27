import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_CLASSIFICATION_CONFLICT,
  CONTENT_INDUSTRIES_CONFLICT,
  getAccountClassification,
  getPanelAccountByHandle,
  loadContentConfidence,
  loadContentLabels,
  loadIndustryVectors,
  upsertAccountClassification,
  upsertContentIndustries,
  upsertIndustryVector,
} from './classification.js';

function upsertClient() {
  const calls: any[] = [];
  return {
    calls,
    from(table: string) {
      return {
        upsert: async (rows: any[], opts: any) => {
          calls.push({ table, rows, opts });
          return { error: null };
        },
      };
    },
  };
}

function selectClient(rows: any[]) {
  const calls: any[] = [];
  const builder: any = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      calls.push(['eq', col, val]);
      return builder;
    },
    ilike(col: string, val: unknown) {
      calls.push(['ilike', col, val]);
      return builder;
    },
    in(col: string, vals: unknown) {
      calls.push(['in', col, vals]);
      return builder;
    },
    then(resolve: (v: any) => void) {
      resolve({ data: rows, error: null });
    },
  };
  return { calls, from: () => builder };
}

describe('getAccountClassification', () => {
  it('maps a cache row to CachedClassification', async () => {
    const c = selectClient([
      { labels: [{ industry: 'food', confidence: 0.9 }], method: 'account_infer', classified_at: '2026-06-20T00:00:00.000Z' },
    ]);
    const res = await getAccountClassification(c as any, 'instagram', 'foodie');
    expect(res).toEqual({
      labels: [{ industry: 'food', confidence: 0.9 }],
      method: 'account_infer',
      classifiedAt: '2026-06-20T00:00:00.000Z',
    });
    expect(c.calls).toContainEqual(['eq', 'account_key', 'foodie']);
  });

  it('returns null on a miss', async () => {
    const c = selectClient([]);
    expect(await getAccountClassification(c as any, 'instagram', 'nope')).toBeNull();
  });
});

describe('getPanelAccountByHandle', () => {
  it('looks up case-insensitively and returns the account', async () => {
    const row = { id: 'a1', handle: 'BeautySwe', platform: 'instagram', industry: 'beauty', country: 'SE', active: true };
    const c = selectClient([row]);
    const res = await getPanelAccountByHandle(c as any, 'instagram', 'beautyswe');
    expect(res).toEqual(row);
    expect(c.calls).toContainEqual(['ilike', 'handle', 'beautyswe']);
  });
});

describe('upsertAccountClassification', () => {
  it('maps to snake_case and upserts on the (platform, account_key) key', async () => {
    const c = upsertClient();
    await upsertAccountClassification(c as any, {
      platform: 'instagram',
      accountKey: 'foodie',
      labels: [{ industry: 'food', confidence: 0.8 }],
      primaryIndustry: 'food',
      method: 'account_infer',
    });
    expect(c.calls[0].table).toBe('account_classification');
    expect(c.calls[0].opts).toEqual({ onConflict: ACCOUNT_CLASSIFICATION_CONFLICT });
    expect(c.calls[0].rows[0]).toMatchObject({
      platform: 'instagram',
      account_key: 'foodie',
      primary_industry: 'food',
      labels: [{ industry: 'food', confidence: 0.8 }],
      method: 'account_infer',
    });
    expect(typeof c.calls[0].rows[0].classified_at).toBe('string');
  });
});

describe('upsertContentIndustries', () => {
  it('no-ops on empty input', async () => {
    const c = upsertClient();
    await upsertContentIndustries(c as any, []);
    expect(c.calls).toHaveLength(0);
  });

  it('maps rows and upserts on the (platform, external_id, industry) key', async () => {
    const c = upsertClient();
    await upsertContentIndustries(c as any, [
      { platform: 'instagram', externalId: 'r1', industry: 'food', confidence: 0.7, method: 'panel' },
    ]);
    expect(c.calls[0].table).toBe('content_industries');
    expect(c.calls[0].opts).toEqual({ onConflict: CONTENT_INDUSTRIES_CONFLICT });
    expect(c.calls[0].rows[0]).toMatchObject({
      platform: 'instagram',
      external_id: 'r1',
      industry: 'food',
      confidence: 0.7,
      method: 'panel',
    });
  });
});

describe('loadIndustryVectors', () => {
  it('parses string + array vectors and excludes "all" and null embeddings', async () => {
    const c = selectClient([
      { slug: 'all', embedding: null },
      { slug: 'food', embedding: '[0.1,0.2,0.3]' },
      { slug: 'beauty', embedding: [0.4, 0.5] },
      { slug: 'tech', embedding: null },
    ]);
    const out = await loadIndustryVectors(c as any);
    expect(out).toEqual([
      { industry: 'food', embedding: [0.1, 0.2, 0.3] },
      { industry: 'beauty', embedding: [0.4, 0.5] },
    ]);
  });
});

describe('upsertIndustryVector', () => {
  it('writes a pgvector literal on the slug key', async () => {
    const c = upsertClient();
    await upsertIndustryVector(c as any, 'food', [0.1, 0.2]);
    expect(c.calls[0].table).toBe('industries');
    expect(c.calls[0].opts).toEqual({ onConflict: 'slug' });
    expect(c.calls[0].rows[0]).toEqual({ slug: 'food', embedding: '[0.1,0.2]' });
  });
});

describe('loadContentConfidence', () => {
  it('returns the max confidence per external_id', async () => {
    const c = selectClient([
      { external_id: 'r1', confidence: 0.3 },
      { external_id: 'r1', confidence: 0.6 },
      { external_id: 'r2', confidence: 0.4 },
    ]);
    const out = await loadContentConfidence(c as any, ['r1', 'r2']);
    expect(out.get('r1')).toBe(0.6);
    expect(out.get('r2')).toBe(0.4);
  });

  it('returns an empty map without querying for empty ids', async () => {
    const c = selectClient([]);
    expect((await loadContentConfidence(c as any, [])).size).toBe(0);
    expect(c.calls).toHaveLength(0);
  });
});

describe('loadContentLabels', () => {
  it('maps content_industries rows for the escalation gates', async () => {
    const c = selectClient([
      { external_id: 'r1', industry: 'beauty', confidence: 1, method: 'panel' },
      { external_id: 'r2', industry: 'food', confidence: 0.3, method: 'account_infer' },
    ]);
    const out = await loadContentLabels(c as any, ['r1', 'r2']);
    expect(out).toEqual([
      { externalId: 'r1', industry: 'beauty', confidence: 1, method: 'panel' },
      { externalId: 'r2', industry: 'food', confidence: 0.3, method: 'account_infer' },
    ]);
    expect(c.calls).toContainEqual(['in', 'external_id', ['r1', 'r2']]);
  });

  it('returns [] without querying for empty ids', async () => {
    const c = selectClient([]);
    expect(await loadContentLabels(c as any, [])).toEqual([]);
    expect(c.calls).toHaveLength(0);
  });
});
