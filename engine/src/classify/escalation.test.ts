import { describe, it, expect } from 'vitest';
import { selectEscalationCandidates, selectOffTopicCandidates } from './escalation.js';
import type { ContentSnapshot } from '../adapters/contract.js';
import type { Industry } from '../config/industries.js';

function snap(over: Partial<ContentSnapshot>): ContentSnapshot {
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

// Two snapshots of one reel one day apart → velocity = engagement delta / 1 day.
function reel(externalId: string, likesDelta: number): ContentSnapshot[] {
  return [
    snap({ externalId, likes: 0, capturedAt: '2026-06-20T00:00:00.000Z' }),
    snap({ externalId, likes: likesDelta, capturedAt: '2026-06-21T00:00:00.000Z' }),
  ];
}

describe('selectEscalationCandidates', () => {
  it('selects only content that is BOTH high-velocity AND low-confidence', () => {
    const snapshots = [
      ...reel('hi-vel-lo-conf', 1000), // velocity 1000 > 500, conf low → candidate
      ...reel('hi-vel-hi-conf', 1000), // velocity high but confident → excluded
      ...reel('lo-vel-lo-conf', 10), // low velocity → excluded
    ];
    const confidence = new Map([
      ['hi-vel-lo-conf', 0.3],
      ['hi-vel-hi-conf', 0.95],
      ['lo-vel-lo-conf', 0.3],
    ]);
    const out = selectEscalationCandidates(snapshots, confidence, {
      velocityThreshold: 500,
      confidenceThreshold: 0.7,
    });
    expect(out.map((c) => c.content.externalId)).toEqual(['hi-vel-lo-conf']);
    expect(out[0].velocity).toBe(1000);
  });

  it('treats missing confidence as 0 (eligible) and sorts by velocity desc', () => {
    const snapshots = [...reel('fast', 2000), ...reel('slow', 800)];
    const out = selectEscalationCandidates(snapshots, new Map(), {
      velocityThreshold: 500,
      confidenceThreshold: 0.7,
    });
    expect(out.map((c) => c.content.externalId)).toEqual(['fast', 'slow']);
  });

  it('skips cold-start reels with a single snapshot', () => {
    const out = selectEscalationCandidates([snap({ externalId: 'x', likes: 9999 })], new Map(), {
      velocityThreshold: 0,
      confidenceThreshold: 0.7,
    });
    expect(out).toEqual([]);
  });
});

describe('selectOffTopicCandidates', () => {
  it('selects high-velocity account-labeled content regardless of confidence', () => {
    const snapshots = [...reel('fast', 2000), ...reel('slow', 10)];
    const accountIndustry = new Map<string, Industry>([
      ['fast', 'beauty'],
      ['slow', 'beauty'],
    ]);
    const out = selectOffTopicCandidates(snapshots, accountIndustry, { velocityThreshold: 500 });
    expect(out.map((c) => c.content.externalId)).toEqual(['fast']);
    expect(out[0].accountIndustry).toBe('beauty');
  });

  it('ignores content not in the account-labeled set', () => {
    const out = selectOffTopicCandidates(reel('fast', 2000), new Map(), { velocityThreshold: 500 });
    expect(out).toEqual([]);
  });
});
