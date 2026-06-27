import { describe, it, expect } from 'vitest';
import {
  createOpenAIContentClassifier,
  createOpenAIEmbedder,
  createOpenAITagger,
  parseLabels,
} from './openai.js';
import { REAL_INDUSTRIES } from '../config/industries.js';

function jsonResponse(body: unknown): any {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('parseLabels', () => {
  it('parses {labels:[...]} and keeps only known industries', () => {
    const content = JSON.stringify({
      labels: [
        { industry: 'food', confidence: 0.8 },
        { industry: 'not-real', confidence: 0.9 },
      ],
    });
    expect(parseLabels(content, REAL_INDUSTRIES)).toEqual([{ industry: 'food', confidence: 0.8 }]);
  });

  it('accepts a bare array and clamps confidence to 0..1', () => {
    const content = JSON.stringify([
      { industry: 'beauty', confidence: 1.7 },
      { industry: 'tech', confidence: -2 },
    ]);
    expect(parseLabels(content, REAL_INDUSTRIES)).toEqual([
      { industry: 'beauty', confidence: 1 },
      { industry: 'tech', confidence: 0 },
    ]);
  });

  it('returns [] on invalid JSON', () => {
    expect(parseLabels('not json', REAL_INDUSTRIES)).toEqual([]);
  });
});

describe('createOpenAIEmbedder', () => {
  it('posts texts and returns embedding arrays', async () => {
    const fake = async () => jsonResponse({ data: [{ embedding: [1, 2, 3] }] });
    const embed = createOpenAIEmbedder('k', 'text-embedding-3-small', fake as any);
    expect(await embed(['hello'])).toEqual([[1, 2, 3]]);
  });

  it('returns [] without calling the API for empty input', async () => {
    let called = false;
    const fake = async () => {
      called = true;
      return jsonResponse({});
    };
    const embed = createOpenAIEmbedder('k', 'm', fake as any);
    expect(await embed([])).toEqual([]);
    expect(called).toBe(false);
  });

  it('throws on a non-ok response', async () => {
    const fake = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    const embed = createOpenAIEmbedder('k', 'm', fake as any);
    await expect(embed(['x'])).rejects.toThrow(/OpenAI embeddings failed: 500/);
  });
});

describe('createOpenAITagger', () => {
  it('parses the chat completion content into labels', async () => {
    const body = {
      choices: [{ message: { content: JSON.stringify({ labels: [{ industry: 'food', confidence: 0.9 }] }) } }],
    };
    const fake = async () => jsonResponse(body);
    const tag = createOpenAITagger('k', 'gpt-4o-mini', fake as any);
    expect(await tag({ text: 'a chef', industries: REAL_INDUSTRIES })).toEqual([
      { industry: 'food', confidence: 0.9 },
    ]);
  });
});

describe('createOpenAIContentClassifier', () => {
  function capture() {
    const calls: any[] = [];
    const fake = async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ labels: [{ industry: 'sports', confidence: 0.92 }] }) } }],
      });
    };
    return { calls, fake };
  }

  it('sends caption + hashtags as text and the cover image as a low-detail image part', async () => {
    const { calls, fake } = capture();
    const cc = createOpenAIContentClassifier('k', 'gpt-4o-mini', fake as any);
    const labels = await cc({
      caption: 'Mål i sista minuten!',
      hashtags: ['fotboll', 'allsvenskan'],
      imageUrl: 'https://cdn/cover.jpg',
      industries: REAL_INDUSTRIES,
    });
    expect(labels).toEqual([{ industry: 'sports', confidence: 0.92 }]);

    const userMsg = calls[0].messages[1].content;
    const text = userMsg.find((p: any) => p.type === 'text').text;
    expect(text).toContain('Mål i sista minuten!');
    expect(text).toContain('#fotboll');
    const image = userMsg.find((p: any) => p.type === 'image_url');
    expect(image.image_url).toEqual({ url: 'https://cdn/cover.jpg', detail: 'low' });
  });

  it('returns [] without calling the API when there is no caption/hashtags/image', async () => {
    const { calls, fake } = capture();
    const cc = createOpenAIContentClassifier('k', 'gpt-4o-mini', fake as any);
    expect(await cc({ industries: REAL_INDUSTRIES })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('classifies from the cover image alone when there is no text', async () => {
    const { calls, fake } = capture();
    const cc = createOpenAIContentClassifier('k', 'gpt-4o-mini', fake as any);
    await cc({ imageUrl: 'https://cdn/cover.jpg', industries: REAL_INDUSTRIES });
    expect(calls).toHaveLength(1);
    const userMsg = calls[0].messages[1].content;
    expect(userMsg.some((p: any) => p.type === 'image_url')).toBe(true);
  });

  it('retries text-only when the image is unfetchable (invalid_image_url), keeping the caption signal', async () => {
    const calls: any[] = [];
    let n = 0;
    const fake = async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      n += 1;
      if (n === 1) {
        // First call (with image) → OpenAI can't download the signed CDN cover URL.
        const body = JSON.stringify({ error: { code: 'invalid_image_url', message: 'could not download' } });
        return { ok: false, status: 400, text: async () => body };
      }
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ labels: [{ industry: 'news', confidence: 0.88 }] }) } }],
      });
    };
    const cc = createOpenAIContentClassifier('k', 'gpt-4o-mini', fake as any);
    const labels = await cc({
      caption: 'Polisen larmar om inbrott',
      hashtags: ['nyheter'],
      imageUrl: 'https://cdn/expired.jpg',
      industries: REAL_INDUSTRIES,
    });
    expect(labels).toEqual([{ industry: 'news', confidence: 0.88 }]); // text-only retry succeeded
    expect(calls).toHaveLength(2);
    expect(calls[0].messages[1].content.some((p: any) => p.type === 'image_url')).toBe(true); // attempt 1: with image
    expect(calls[1].messages[1].content.some((p: any) => p.type === 'image_url')).toBe(false); // attempt 2: text only
  });

  it('does NOT retry on a non-image error (e.g. auth) — it propagates', async () => {
    let n = 0;
    const fake = async () => {
      n += 1;
      return { ok: false, status: 401, text: async () => '{"error":{"message":"bad key"}}' };
    };
    const cc = createOpenAIContentClassifier('k', 'gpt-4o-mini', fake as any);
    await expect(
      cc({ caption: 'x', imageUrl: 'https://cdn/c.jpg', industries: REAL_INDUSTRIES }),
    ).rejects.toThrow(/401/);
    expect(n).toBe(1); // no retry
  });
});
