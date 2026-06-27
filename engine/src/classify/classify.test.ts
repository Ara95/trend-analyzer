import { describe, it, expect } from 'vitest';
import { classify, spotCheckOffTopic, type ClassifyDeps } from './classify.js';
import type {
  AccountClassificationWrite,
  CachedClassification,
  ContentClassifier,
  ContentSnapshot,
  Embedder,
  IndustryVector,
  PanelAccount,
  Tagger,
  VisionTagger,
} from '../adapters/contract.js';
import { REAL_INDUSTRIES } from '../config/industries.js';

const NOW = Date.parse('2026-06-22T00:00:00.000Z');
const DIM = REAL_INDUSTRIES.length;
function oneHot(i: number): number[] {
  const v = new Array(DIM).fill(0);
  v[i] = 1;
  return v;
}
const industryVectors: IndustryVector[] = REAL_INDUSTRIES.map((industry, i) => ({
  industry,
  embedding: oneHot(i),
}));
const FOOD_VEC = oneHot(REAL_INDUSTRIES.indexOf('food'));
const UNIFORM = new Array(DIM).fill(1);

// Embeds text containing 'FOOD' to a food-aligned vector (confident), everything else uniform.
function decideVec(text: string): number[] {
  return text.includes('FOOD') ? FOOD_VEC : UNIFORM;
}

const panelAccount: PanelAccount = {
  id: 'a1',
  handle: 'BeautySwe',
  platform: 'instagram',
  industry: 'beauty',
  country: 'SE',
  active: true,
};

function snap(over: Partial<ContentSnapshot> = {}): ContentSnapshot {
  return {
    platform: 'instagram',
    accountId: 'a1',
    externalId: 'r1',
    format: 'reel',
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    capturedAt: '2026-06-20T00:00:00.000Z',
    ...over,
  };
}

interface Counters {
  embed: number;
  tag: number;
  vision: number;
  frames: number;
}

interface Fakes {
  deps: ClassifyDeps;
  counters: Counters;
  cache: Map<string, CachedClassification>;
  writes: AccountClassificationWrite[];
}

function makeDeps(over: Partial<ClassifyDeps> = {}): Fakes {
  const counters: Counters = { embed: 0, tag: 0, vision: 0, frames: 0 };
  const cache = new Map<string, CachedClassification>();
  const writes: AccountClassificationWrite[] = [];

  const embed: Embedder = async (texts) => {
    counters.embed += 1;
    return texts.map(decideVec);
  };
  const tag: Tagger = async ({ text }) => {
    counters.tag += 1;
    return text.includes('FOOD') ? [{ industry: 'food', confidence: 0.85 }] : [];
  };
  const vision: VisionTagger = async () => {
    counters.vision += 1;
    return [{ industry: 'food', confidence: 0.95 }];
  };

  const deps: ClassifyDeps = {
    getCachedClassification: async (platform, key) => cache.get(`${platform}:${key}`) ?? null,
    putCachedClassification: async (row) => {
      writes.push(row);
      cache.set(`${row.platform}:${row.accountKey}`, {
        labels: row.labels,
        method: row.method,
        classifiedAt: new Date(NOW).toISOString(),
      });
    },
    loadIndustryVectors: async () => industryVectors,
    embed,
    tag,
    vision,
    downloadKeyframes: async () => {
      counters.frames += 1;
      return ['frame1.jpg'];
    },
    now: () => NOW,
    cfg: { confidenceThreshold: 0.7, similarityFloor: 0.15, cacheMaxAgeDays: 30 },
    ...over,
  };
  return { deps, counters, cache, writes };
}

describe('classify — layer 0 (content-first)', () => {
  // Confident 'food' when the video's own signals (caption or hashtags) mention FOOD; else unknown.
  const classifyContent: ContentClassifier = async ({ caption, hashtags }) => {
    const text = `${caption ?? ''} ${(hashtags ?? []).join(' ')}`;
    return text.includes('FOOD') ? [{ industry: 'food', confidence: 0.9 }] : [];
  };

  it('a confident content label OVERRIDES a panel account (known account posts off-topic)', async () => {
    const { deps } = makeDeps({ classifyContent });
    // Panel says beauty, but THIS video is about food → the video wins.
    const res = await classify(
      { content: snap({ caption: 'FOOD recipe', handle: 'beautyswe' }), account: panelAccount },
      deps,
    );
    expect(res.method).toBe('content');
    expect(res.primaryIndustry).toBe('food');
  });

  it('an unknown (empty) content result falls back to the panel account', async () => {
    const { deps } = makeDeps({ classifyContent });
    const res = await classify(
      { content: snap({ caption: 'just vibes', handle: 'beautyswe' }), account: panelAccount },
      deps,
    );
    expect(res.method).toBe('panel');
    expect(res.primaryIndustry).toBe('beauty');
  });

  it('uses hashtags as a content signal when there is no caption', async () => {
    const { deps } = makeDeps({ classifyContent });
    const res = await classify({ content: snap({ hashtags: ['FOOD', 'recipe'] }) }, deps);
    expect(res.method).toBe('content');
    expect(res.primaryIndustry).toBe('food');
  });

  it('does NOT run the legacy zero-shot escalation when a content classifier is present', async () => {
    const { deps, counters } = makeDeps({ classifyContent });
    const res = await classify(
      {
        content: snap({ caption: 'ambiguous', transcript: 'FOOD t', videoUrl: 'v' }),
        allowContentEscalation: true,
      },
      deps,
    );
    expect(counters.vision).toBe(0);
    expect(counters.frames).toBe(0);
    expect(res.primaryIndustry).toBe('all'); // no caption FOOD, no account → uncertain
  });

  it('degrades to the account ladder when the content classifier THROWS (bad cover URL)', async () => {
    const throwing: ContentClassifier = async () => {
      throw new Error('OpenAI content classify failed: 400 could not fetch image');
    };
    const { deps } = makeDeps({ classifyContent: throwing });
    // A throw must not propagate — it falls back to the panel account instead of aborting the run.
    const res = await classify(
      { content: snap({ caption: 'FOOD recipe', handle: 'beautyswe' }), account: panelAccount },
      deps,
    );
    expect(res.method).toBe('panel');
    expect(res.primaryIndustry).toBe('beauty');
  });

  it('skips the content call when the video has no caption/hashtags/image', async () => {
    let called = 0;
    const cc: ContentClassifier = async () => {
      called += 1;
      return [];
    };
    const { deps } = makeDeps({ classifyContent: cc });
    await classify({ content: snap({}), account: panelAccount }, deps);
    expect(called).toBe(0);
  });
});

describe('classify — layer 1 (panel)', () => {
  it('labels a panel account from its industry with ZERO model calls', async () => {
    const { deps, counters } = makeDeps();
    const res = await classify({ content: snap(), account: panelAccount }, deps);
    expect(res.method).toBe('panel');
    expect(res.primaryIndustry).toBe('beauty');
    expect(res.labels).toEqual([{ industry: 'beauty', confidence: 1 }]);
    expect(counters).toEqual({ embed: 0, tag: 0, vision: 0, frames: 0 });
  });
});

describe('classify — layer 2 (cache)', () => {
  it('returns a fresh cache hit with ZERO model calls', async () => {
    const { deps, counters, cache } = makeDeps();
    cache.set('instagram:foodie', {
      labels: [{ industry: 'food', confidence: 0.9 }],
      method: 'account_infer',
      classifiedAt: new Date(NOW).toISOString(),
    });
    const res = await classify(
      { content: snap({ handle: 'Foodie' }), accountSignals: { handle: 'Foodie', platform: 'instagram', bio: 'x' } },
      deps,
    );
    expect(res.method).toBe('cached');
    expect(res.primaryIndustry).toBe('food');
    expect(counters.embed).toBe(0);
    expect(counters.tag).toBe(0);
  });

  it('ignores a stale cache entry and re-infers', async () => {
    const { deps, cache } = makeDeps();
    cache.set('instagram:foodie', {
      labels: [{ industry: 'food', confidence: 0.9 }],
      method: 'account_infer',
      classifiedAt: '2026-01-01T00:00:00.000Z', // > 30 days old
    });
    const res = await classify(
      {
        content: snap({ handle: 'Foodie' }),
        accountSignals: { handle: 'Foodie', platform: 'instagram', bio: 'FOOD blogger' },
      },
      deps,
    );
    expect(res.method).toBe('account_infer');
  });
});

describe('classify — layer 3 (account inference)', () => {
  it('an unseen account triggers exactly ONE account classification (embed+tag once) and is cached', async () => {
    const { deps, counters, writes } = makeDeps();
    const signals = { handle: 'FoodieGram', platform: 'instagram' as const, bio: 'FOOD lover and chef' };

    const first = await classify({ content: snap({ handle: 'FoodieGram' }), accountSignals: signals }, deps);
    expect(first.method).toBe('account_infer');
    expect(first.primaryIndustry).toBe('food');
    expect(counters.embed).toBe(1);
    expect(counters.tag).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0].accountKey).toBe('foodiegram');

    // Later content from the same account hits the cache → no new model calls.
    const second = await classify(
      { content: snap({ externalId: 'r2', handle: 'FoodieGram' }), accountSignals: signals },
      deps,
    );
    expect(second.method).toBe('cached');
    expect(counters.embed).toBe(1);
    expect(counters.tag).toBe(1);
  });

  it('produces multi-label output with confidences', async () => {
    // Uniform embedding (no 'FOOD' in bio) spreads zero-shot mass; the tagger adds two more.
    const { deps } = makeDeps({
      tag: async () => [
        { industry: 'food', confidence: 0.6 },
        { industry: 'beauty', confidence: 0.5 },
      ],
    });
    const res = await classify(
      {
        content: snap({ handle: 'mixed' }),
        accountSignals: { handle: 'mixed', platform: 'instagram', bio: 'lifestyle creator' },
      },
      deps,
    );
    expect(res.labels.length).toBeGreaterThan(1);
    for (const l of res.labels) {
      expect(typeof l.industry).toBe('string');
      expect(l.confidence).toBeGreaterThanOrEqual(0);
      expect(l.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('does NOT escalate at ingest even when account confidence is low', async () => {
    const { deps, counters } = makeDeps();
    const res = await classify(
      {
        content: snap({ handle: 'amb', caption: 'FOOD caption', videoUrl: 'v', transcript: 'FOOD t' }),
        accountSignals: { handle: 'amb', platform: 'instagram', bio: 'ambiguous' }, // uniform → low conf
        allowContentEscalation: false,
      },
      deps,
    );
    expect(res.method).toBe('account_infer');
    expect(counters.vision).toBe(0);
    expect(counters.frames).toBe(0);
  });
});

describe('classify — layer 4 (content escalation, caption→transcript→vision)', () => {
  it('stops at caption when the caption is confident (transcript/vision untouched)', async () => {
    const { deps, counters } = makeDeps();
    const res = await classify(
      {
        content: snap({ caption: 'FOOD caption', transcript: 'FOOD t', videoUrl: 'v' }),
        allowContentEscalation: true,
      },
      deps,
    );
    expect(res.method).toBe('content');
    expect(res.primaryIndustry).toBe('food');
    expect(counters.embed).toBe(1); // caption only
    expect(counters.vision).toBe(0);
  });

  it('falls through to transcript when the caption is ambiguous, before vision', async () => {
    const { deps, counters } = makeDeps();
    const res = await classify(
      {
        content: snap({ caption: 'ambiguous', transcript: 'FOOD transcript', videoUrl: 'v' }),
        allowContentEscalation: true,
      },
      deps,
    );
    expect(res.method).toBe('content');
    expect(res.primaryIndustry).toBe('food');
    expect(counters.embed).toBe(2); // caption + transcript
    expect(counters.vision).toBe(0);
  });

  it('reaches vision only when caption and transcript are both ambiguous', async () => {
    const { deps, counters } = makeDeps();
    const res = await classify(
      {
        content: snap({ caption: 'ambiguous', transcript: 'also ambiguous', videoUrl: 'v' }),
        allowContentEscalation: true,
      },
      deps,
    );
    expect(res.method).toBe('content');
    expect(counters.embed).toBe(2);
    expect(counters.frames).toBe(1);
    expect(counters.vision).toBe(1);
  });
});

describe('spotCheckOffTopic (off-topic known-creator)', () => {
  it('returns a divergent label when a known account posts confidently off-topic content', async () => {
    const { deps } = makeDeps();
    const labels = await spotCheckOffTopic(snap({ caption: 'FOOD recipe' }), 'beauty', deps);
    expect(labels).toEqual([{ industry: 'food', confidence: expect.any(Number) }]);
    expect(labels[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('returns [] when the video is on-topic for its account', async () => {
    const { deps } = makeDeps();
    // Caption maps to the account's own industry (confident, not divergent).
    const labels = await spotCheckOffTopic(snap({ caption: 'FOOD recipe' }), 'food', deps);
    expect(labels).toEqual([]);
  });

  it('returns [] when the caption is ambiguous (no confident divergence)', async () => {
    const { deps } = makeDeps();
    const labels = await spotCheckOffTopic(snap({ caption: 'just vibes' }), 'beauty', deps);
    expect(labels).toEqual([]);
  });

  it('returns [] (and embeds nothing) when there is no caption', async () => {
    const { deps, counters } = makeDeps();
    const labels = await spotCheckOffTopic(snap({}), 'beauty', deps);
    expect(labels).toEqual([]);
    expect(counters.embed).toBe(0);
  });
});
