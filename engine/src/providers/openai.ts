import type {
  ContentClassifier,
  Embedder,
  IndustryLabel,
  Tagger,
  VisionTagger,
} from '../adapters/contract.js';
import { INDUSTRY_DEFINITIONS, type Industry, type RealIndustry } from '../config/industries.js';

// OpenAI providers implemented over the REST API with the global `fetch` (Node >=20) —
// no SDK dependency, so typecheck/tests need no install or network. `fetchImpl` is injectable
// for tests. All response parsing is defensive: model output is untrusted.
const OPENAI_BASE = 'https://api.openai.com/v1';

type FetchLike = typeof fetch;

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Parse model JSON into validated IndustryLabel[] — only known industries, confidences clamped.
export function parseLabels(content: string, industries: Industry[]): IndustryLabel[] {
  const allowed = new Set<string>(industries);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const raw =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as { labels?: unknown }).labels)
      ? (parsed as { labels: unknown[] }).labels
      : Array.isArray(parsed)
        ? (parsed as unknown[])
        : [];
  const out: IndustryLabel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const industry = (item as { industry?: unknown }).industry;
    if (typeof industry !== 'string' || !allowed.has(industry)) continue;
    out.push({ industry: industry as Industry, confidence: clamp01((item as { confidence?: unknown }).confidence) });
  }
  return out;
}

function tagInstruction(industries: Industry[]): string {
  return [
    'You are an industry classifier for social-media content.',
    `Choose from EXACTLY these industries: ${industries.join(', ')}.`,
    'Return JSON: {"labels":[{"industry":"<one of the list>","confidence":<0..1>}]}.',
    'Multi-label is allowed; include every industry that genuinely applies with its confidence.',
    'Do not invent industries outside the list.',
  ].join(' ');
}

export function createOpenAIEmbedder(
  apiKey: string,
  model: string,
  fetchImpl: FetchLike = fetch,
): Embedder {
  return async (texts) => {
    if (texts.length === 0) return [];
    const res = await fetchImpl(`${OPENAI_BASE}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await safeText(res)}`);
    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    return (json.data ?? []).map((d) => d.embedding ?? []);
  };
}

export function createOpenAITagger(
  apiKey: string,
  model: string,
  fetchImpl: FetchLike = fetch,
): Tagger {
  return async ({ text, industries }) => {
    const res = await fetchImpl(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: tagInstruction(industries) },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI tagging failed: ${res.status} ${await safeText(res)}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseLabels(json.choices?.[0]?.message?.content ?? '', industries);
  };
}

export function createOpenAIVision(
  apiKey: string,
  model: string,
  fetchImpl: FetchLike = fetch,
): VisionTagger {
  return async ({ imageUrls, industries }) => {
    if (imageUrls.length === 0) return [];
    const res = await fetchImpl(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: tagInstruction(industries) },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Classify the industry of this video from its keyframes.' },
              ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI vision failed: ${res.status} ${await safeText(res)}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseLabels(json.choices?.[0]?.message?.content ?? '', industries);
  };
}

// Content-first instruction: classify the VIDEO from its own signals, with the industry
// definitions inline for disambiguation and an explicit "unknown" escape so the model stops
// guessing into catch-all buckets. The two confusion pairs called out (sports/fitness, news/tech)
// are the ones that dominated real mislabels in the data.
function contentInstruction(industries: Industry[]): string {
  const defs = industries
    .filter((i): i is RealIndustry => i in INDUSTRY_DEFINITIONS)
    .map((i) => `- ${i}: ${INDUSTRY_DEFINITIONS[i]}`)
    .join('\n');
  return [
    'You classify a single short-form social video (TikTok / Instagram Reel) by its INDUSTRY,',
    'judging the video itself — caption, hashtags and cover image — NOT the account that posted it.',
    'A news outlet posting a football clip is sports; a beauty creator posting a travel vlog is travel.',
    '',
    `Choose ONLY from these industries:\n${defs}`,
    '',
    'Rules:',
    '- sports = athletes, teams, matches, leagues and SPORTS NEWS. fitness = personal gym/workout/wellness. Sports-news accounts are sports, never fitness.',
    '- news = current events, politics, society. tech = gadgets, software, AI. A news clip is news, not tech.',
    '- If the industry is genuinely unclear from the given signals, return an EMPTY list. Do not guess.',
    '- Multi-label is allowed: include every industry that genuinely applies, each with its own confidence.',
    'Return JSON: {"labels":[{"industry":"<one of the list>","confidence":<0..1>}]}.',
  ].join(' ');
}

export function createOpenAIContentClassifier(
  apiKey: string,
  model: string,
  fetchImpl: FetchLike = fetch,
): ContentClassifier {
  return async ({ caption, hashtags, imageUrl, industries }) => {
    const tags = (hashtags ?? []).filter((t) => typeof t === 'string' && t.length > 0);
    const textParts: string[] = [];
    if (caption && caption.trim()) textParts.push(`Caption: ${caption.trim()}`);
    if (tags.length > 0) textParts.push(`Hashtags: ${tags.map((t) => `#${t}`).join(' ')}`);
    // No usable signal at all → don't spend a call; let the account ladder handle it.
    if (textParts.length === 0 && !imageUrl) return [];

    // One classification call, optionally with the cover image. Factored so we can retry text-only
    // when the image is the (only) thing that failed.
    const call = async (withImage: boolean): Promise<IndustryLabel[]> => {
      const userContent: Record<string, unknown>[] = [
        { type: 'text', text: textParts.join('\n') || 'Classify this video from its cover image.' },
      ];
      // detail:'low' keeps the cover-image cost minimal — a thumbnail needs no high-res tiling.
      if (withImage && imageUrl) {
        userContent.push({ type: 'image_url', image_url: { url: imageUrl, detail: 'low' } });
      }
      const res = await fetchImpl(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: contentInstruction(industries) },
            { role: 'user', content: userContent },
          ],
        }),
      });
      if (!res.ok) {
        const body = await safeText(res);
        // Signed IG/TikTok CDN cover URLs frequently refuse OpenAI's server-side fetch
        // (HTTP 400 invalid_image_url). Flag it so we can fall back to the text we DO have
        // rather than discarding the whole (good) caption+hashtags signal.
        const err = new Error(`OpenAI content classify failed: ${res.status} ${body}`);
        if (/invalid_image_url/.test(body)) (err as { imageFailed?: boolean }).imageFailed = true;
        throw err;
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return parseLabels(json.choices?.[0]?.message?.content ?? '', industries);
    };

    if (!imageUrl) return call(false);
    try {
      return await call(true);
    } catch (err) {
      // Retry on caption+hashtags alone ONLY when the image was the problem and we have text.
      if ((err as { imageFailed?: boolean }).imageFailed && textParts.length > 0) {
        return call(false);
      }
      throw err;
    }
  };
}

// Keyframe extraction from a video download URL. Real frame sampling (ffmpeg) is a deferred
// production step (scope B); until then this returns [] so the vision tier is a safe no-op.
// Tests inject their own implementation to exercise the vision path.
export async function downloadKeyframes(_videoUrl: string): Promise<string[]> {
  return [];
}
