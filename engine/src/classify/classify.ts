import type {
  AccountClassificationWrite,
  AccountSignals,
  CachedClassification,
  ClassificationMethod,
  ClassificationResult,
  ContentClassifier,
  ContentSnapshot,
  Embedder,
  IndustryLabel,
  IndustryVector,
  PanelAccount,
  Tagger,
  VisionTagger,
} from '../adapters/contract.js';
import { ALL_INDUSTRIES, REAL_INDUSTRIES, type Industry } from '../config/industries.js';
import { zeroShotLabels } from './zeroShot.js';

export interface ClassifyConfig {
  confidenceThreshold: number;
  similarityFloor: number;
  cacheMaxAgeDays: number;
}

export interface ClassifyDeps {
  // Layer 1: panel lookup (deterministic, free). Optional — may be pre-resolved on the input.
  getPanelAccount?: (platform: string, handle: string) => Promise<PanelAccount | null>;
  // Layer 2: cache read/write.
  getCachedClassification?: (platform: string, accountKey: string) => Promise<CachedClassification | null>;
  putCachedClassification?: (row: AccountClassificationWrite) => Promise<void>;
  // Layer 0: content-first multimodal classifier (caption + hashtags + cover image). When present
  // it is the primary path and supersedes the legacy zero-shot escalation below.
  classifyContent?: ContentClassifier;
  // Layer 3/4: zero-shot vectors + model providers (any may be absent → that step is skipped).
  loadIndustryVectors?: () => Promise<IndustryVector[]>;
  embed?: Embedder;
  tag?: Tagger;
  vision?: VisionTagger;
  downloadKeyframes?: (videoUrl: string) => Promise<string[]>;
  // Injectable clock for cache-freshness (defaults to Date.now).
  now?: () => number;
  cfg: ClassifyConfig;
}

export interface ClassifyInput {
  content: ContentSnapshot;
  account?: PanelAccount | null;
  accountSignals?: AccountSignals | null;
  // Layer 4 (caption→transcript→vision) only runs when true — the escalation step sets it.
  allowContentEscalation?: boolean;
}

function lower(s: string | undefined): string {
  return (s ?? '').toLowerCase();
}

function maxConf(labels: IndustryLabel[]): number {
  return labels.length === 0 ? 0 : Math.max(...labels.map((l) => l.confidence));
}

// Merge duplicate industries (keep the max confidence) and sort by confidence desc.
function dedupeSort(labels: IndustryLabel[]): IndustryLabel[] {
  const best = new Map<Industry, number>();
  for (const l of labels) {
    const prev = best.get(l.industry);
    if (prev === undefined || l.confidence > prev) best.set(l.industry, l.confidence);
  }
  return [...best.entries()]
    .map(([industry, confidence]) => ({ industry, confidence }))
    .sort((a, b) => b.confidence - a.confidence);
}

function finalize(labels: IndustryLabel[], method: ClassificationMethod): ClassificationResult {
  const sorted = dedupeSort(labels);
  return {
    labels: sorted,
    primaryIndustry: sorted[0]?.industry ?? ALL_INDUSTRIES,
    method,
  };
}

// Average confidences per industry across two label sets (zero-shot + LLM tagger).
function mergeLabels(a: IndustryLabel[], b: IndustryLabel[]): IndustryLabel[] {
  const acc = new Map<Industry, number[]>();
  for (const l of [...a, ...b]) {
    const arr = acc.get(l.industry) ?? [];
    arr.push(l.confidence);
    acc.set(l.industry, arr);
  }
  return [...acc.entries()].map(([industry, cs]) => ({
    industry,
    confidence: cs.reduce((s, c) => s + c, 0) / cs.length,
  }));
}

function isFresh(classifiedAt: string, deps: ClassifyDeps): boolean {
  const now = deps.now ? deps.now() : Date.now();
  const age = now - Date.parse(classifiedAt);
  return Number.isFinite(age) && age <= deps.cfg.cacheMaxAgeDays * 86_400_000;
}

async function zeroShotText(text: string, deps: ClassifyDeps): Promise<IndustryLabel[]> {
  if (!deps.embed || !deps.loadIndustryVectors) return [];
  const [vec] = await deps.embed([text]);
  if (!vec) return [];
  const vectors = await deps.loadIndustryVectors();
  return zeroShotLabels(vec, vectors, { floor: deps.cfg.similarityFloor });
}

// Layer 3: classify the ACCOUNT once from bio + name + recent captions.
async function inferFromAccount(signals: AccountSignals, deps: ClassifyDeps): Promise<IndustryLabel[]> {
  const text = [signals.displayName, signals.bio, ...(signals.recentCaptions ?? [])]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join('\n');
  if (!text) return [];
  const zsl = await zeroShotText(text, deps);
  if (deps.tag) {
    const tagged = await deps.tag({ text, industries: REAL_INDUSTRIES });
    return mergeLabels(zsl, tagged);
  }
  return zsl;
}

// Layer 4: content-level fallback, tiered by cost. Stops at the first confident step;
// returns the best below-threshold result if none reach confidence.
async function escalateContent(content: ContentSnapshot, deps: ClassifyDeps): Promise<IndustryLabel[]> {
  const threshold = deps.cfg.confidenceThreshold;
  let best: IndustryLabel[] = [];
  const consider = (labels: IndustryLabel[]): boolean => {
    if (maxConf(labels) > maxConf(best)) best = labels;
    return maxConf(labels) >= threshold;
  };

  // a. Caption (cheapest)
  if (content.caption) {
    if (consider(await zeroShotText(content.caption, deps))) return best;
  }
  // b. Transcript
  if (content.transcript) {
    if (consider(await zeroShotText(content.transcript, deps))) return best;
  }
  // c. Vision on keyframes (most expensive)
  if (content.videoUrl && deps.vision && deps.downloadKeyframes) {
    const frames = await deps.downloadKeyframes(content.videoUrl);
    if (frames.length > 0) {
      consider(await deps.vision({ imageUrls: frames, industries: REAL_INDUSTRIES }));
    }
  }
  return best;
}

// Off-topic check for a KNOWN (panel/cached) account's video: a high-velocity item may be
// off-topic for its account. Run the cheapest tier only (caption zero-shot) and return a
// content-derived label ONLY if it diverges from the account industry with high confidence.
// Returns [] when the video is on-topic (or there's no caption / no embedder) — no override.
export async function spotCheckOffTopic(
  content: ContentSnapshot,
  accountIndustry: Industry,
  deps: ClassifyDeps,
): Promise<IndustryLabel[]> {
  if (!content.caption) return [];
  const labels = await zeroShotText(content.caption, deps);
  const top = labels[0];
  if (!top || top.industry === accountIndustry || top.confidence < deps.cfg.confidenceThreshold) {
    return [];
  }
  // Confident divergence → emit the divergent confident labels (method 'content').
  return labels.filter(
    (l) => l.industry !== accountIndustry && l.confidence >= deps.cfg.confidenceThreshold,
  );
}

function hasContentSignal(content: ContentSnapshot): boolean {
  return Boolean(content.caption || (content.hashtags && content.hashtags.length > 0) || content.thumbnail);
}

// Walk the ordered layers, stopping at the first that yields max(confidence) >= threshold.
// Layer 0 (content-first) trusts the actual video over its poster; the account ladder (1-3) is the
// fallback for videos the content classifier can't read. Always returns multi-label output.
export async function classify(input: ClassifyInput, deps: ClassifyDeps): Promise<ClassificationResult> {
  const { content } = input;
  const platform = content.platform;
  const handle = lower(input.account?.handle ?? input.accountSignals?.handle ?? content.handle);
  const escalate = input.allowContentEscalation === true;
  const threshold = deps.cfg.confidenceThreshold;

  // Layer 0: Content-first — one multimodal call over THIS video's caption + hashtags + cover image.
  // Trusts the video over who posted it (fixes "known account posts off-topic"). A confident result
  // wins outright; an empty/low-confidence one ("unknown") falls through to the account ladder.
  let contentLabels: IndustryLabel[] = [];
  if (deps.classifyContent && hasContentSignal(content)) {
    // Resilient by design: cover URLs are signed/expiring CDN links and OpenAI fetches them
    // server-side, so a single unfetchable image (HTTP 400) must NOT abort the whole run — it
    // degrades to "unknown" and falls through to the account ladder below.
    try {
      contentLabels = await deps.classifyContent({
        caption: content.caption,
        hashtags: content.hashtags,
        imageUrl: content.thumbnail,
        industries: REAL_INDUSTRIES,
      });
    } catch (err) {
      contentLabels = [];
      console.warn(`[classify] content classifier failed for ${platform}:${content.externalId} — falling back to account: ${(err as Error).message}`);
    }
    if (maxConf(contentLabels) >= threshold) return finalize(contentLabels, 'content');
  }

  // Layer 1: Panel — deterministic, free, zero model calls. Panel accounts are on-topic by curation,
  // so a panel match beats a below-threshold content guess.
  let account = input.account ?? null;
  if (!account && handle && deps.getPanelAccount) {
    account = await deps.getPanelAccount(platform, handle);
  }
  if (account) return finalize([{ industry: account.industry, confidence: 1 }], 'panel');

  let base: IndustryLabel[] | null = null;
  let baseMethod: ClassificationMethod = 'account_infer';

  // Layer 2: Cached — zero model calls. Confident cache hit returns early; otherwise it's a candidate.
  if (handle && deps.getCachedClassification) {
    const cached = await deps.getCachedClassification(platform, handle);
    if (cached && isFresh(cached.classifiedAt, deps)) {
      if (maxConf(cached.labels) >= threshold) return finalize(cached.labels, 'cached');
      base = cached.labels;
      baseMethod = 'cached';
    }
  }

  // Layer 3: Account inference — one model pass per account, then cached for all its content.
  if (!base && input.accountSignals && deps.embed && deps.loadIndustryVectors) {
    const labels = await inferFromAccount(input.accountSignals, deps);
    if (labels.length > 0) {
      if (handle && deps.putCachedClassification) {
        await deps.putCachedClassification({
          platform,
          accountKey: handle,
          labels,
          primaryIndustry: finalize(labels, 'account_infer').primaryIndustry,
          method: 'account_infer',
        });
      }
      if (maxConf(labels) >= threshold) return finalize(labels, 'account_infer');
      base = labels;
      baseMethod = 'account_infer';
    }
  }

  // Layer 4: Legacy zero-shot escalation — only when there is NO content classifier (otherwise Layer 0
  // already did the content-level pass and this would just double-spend).
  if (escalate && !deps.classifyContent) {
    const escalated = await escalateContent(content, deps);
    if (escalated.length > 0 && maxConf(escalated) >= maxConf(base ?? [])) {
      return finalize(escalated, 'content');
    }
  }

  // Reconcile the below-threshold candidates: take the most confident, preferring content on a tie
  // (the video is a better signal than its poster). Array.sort is stable, so content stays first.
  const candidates: { labels: IndustryLabel[]; method: ClassificationMethod }[] = [];
  if (contentLabels.length > 0) candidates.push({ labels: contentLabels, method: 'content' });
  if (base) candidates.push({ labels: base, method: baseMethod });
  if (candidates.length > 0) {
    candidates.sort((a, b) => maxConf(b.labels) - maxConf(a.labels));
    return finalize(candidates[0].labels, candidates[0].method);
  }

  // Nothing produced anything — return an explicit "uncertain" result.
  return finalize([{ industry: ALL_INDUSTRIES, confidence: 0 }], escalate ? 'content' : baseMethod);
}
