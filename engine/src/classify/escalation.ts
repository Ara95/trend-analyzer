import type { ContentSnapshot } from '../adapters/contract.js';
import type { Industry } from '../config/industries.js';
import { DEFAULT_WEIGHTS, engagement, type Weights } from '../engine/derive.js';

const MS_PER_DAY = 86_400_000;

export interface EscalationCandidate {
  content: ContentSnapshot; // latest snapshot (carries caption/videoUrl/transcript)
  velocity: number;
  confidence: number;
}

export interface OffTopicCandidate {
  content: ContentSnapshot;
  accountIndustry: Industry; // the panel-inherited industry to check divergence against
  velocity: number;
}

export interface EscalationOptions {
  velocityThreshold: number; // raw weighted-engagement-per-day units (see derive.ts)
  confidenceThreshold: number; // 0..1
  weights?: Weights;
}

interface ReelAgg {
  externalId: string;
  content: ContentSnapshot; // latest snapshot
  velocity: number;
}

// Per-reel velocity, mirroring derive.ts (needs >=2 snapshots in the set).
function reelVelocities(snapshots: ContentSnapshot[], weights: Weights): ReelAgg[] {
  const byReel = new Map<string, ContentSnapshot[]>();
  for (const s of snapshots) {
    const arr = byReel.get(s.externalId) ?? [];
    arr.push(s);
    byReel.set(s.externalId, arr);
  }
  const out: ReelAgg[] = [];
  for (const [externalId, group] of byReel) {
    if (group.length < 2) continue; // cold start — no velocity yet
    const sorted = [...group].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const deltaDays = (Date.parse(last.capturedAt) - Date.parse(first.capturedAt)) / MS_PER_DAY;
    if (deltaDays <= 0) continue;
    const velocity = (engagement(last, weights) - engagement(first, weights)) / deltaDays;
    out.push({ externalId, content: last, velocity });
  }
  return out;
}

// Low-confidence path: content worth content-level analysis is BOTH high-velocity (> threshold)
// AND low-confidence (< threshold). Missing confidence is treated as 0 (eligible). Sorted desc.
export function selectEscalationCandidates(
  snapshots: ContentSnapshot[],
  confidenceByExternalId: Map<string, number>,
  opts: EscalationOptions,
): EscalationCandidate[] {
  const candidates: EscalationCandidate[] = [];
  for (const r of reelVelocities(snapshots, opts.weights ?? DEFAULT_WEIGHTS)) {
    const confidence = confidenceByExternalId.get(r.externalId) ?? 0;
    if (r.velocity > opts.velocityThreshold && confidence < opts.confidenceThreshold) {
      candidates.push({ content: r.content, velocity: r.velocity, confidence });
    }
  }
  return candidates.sort((a, b) => b.velocity - a.velocity);
}

// Off-topic path: high-velocity content from a KNOWN account (currently labeled only by the
// account, i.e. panel/cached) is spot-checked for divergence from its account industry. This is
// the "known creator posting off-topic content" case that the low-confidence gate cannot catch
// (account labels are high-confidence by construction). Confidence is NOT a gate here.
export function selectOffTopicCandidates(
  snapshots: ContentSnapshot[],
  accountIndustryByExternalId: Map<string, Industry>,
  opts: { velocityThreshold: number; weights?: Weights },
): OffTopicCandidate[] {
  const candidates: OffTopicCandidate[] = [];
  for (const r of reelVelocities(snapshots, opts.weights ?? DEFAULT_WEIGHTS)) {
    const accountIndustry = accountIndustryByExternalId.get(r.externalId);
    if (accountIndustry !== undefined && r.velocity > opts.velocityThreshold) {
      candidates.push({ content: r.content, accountIndustry, velocity: r.velocity });
    }
  }
  return candidates.sort((a, b) => b.velocity - a.velocity);
}
