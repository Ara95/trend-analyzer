import type { Platform } from '../adapters/contract.js';

// A candidate account surfaced by a hashtag/search scrape, before classification or persistence.
export interface DiscoveredCandidate {
  handle: string; // lowercased
  platform: Platform;
  captions: string[]; // every caption we saw from this author (the classification signal)
  topLanguage?: string; // most frequent textLanguage across their videos (a soft geo signal)
}

// Harvest unique authors from raw scraper items (TikTok hashtag/search mode). The scrape returns
// videos; we group by author and collect their captions + language, which feed account inference.
// Geo is the hashtag anchor (we scrape Swedish tags), so we take ALL authors as SE candidates.
export function harvestAuthors(
  items: Record<string, any>[],
  platform: Platform = 'tiktok',
): DiscoveredCandidate[] {
  const byHandle = new Map<string, { captions: string[]; langs: Map<string, number> }>();
  for (const raw of items) {
    const handle = String(raw.authorMeta?.name ?? '').toLowerCase();
    if (!handle) continue;
    const entry = byHandle.get(handle) ?? { captions: [] as string[], langs: new Map<string, number>() };
    const caption = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (caption) entry.captions.push(caption);
    const lang = typeof raw.textLanguage === 'string' ? raw.textLanguage : undefined;
    if (lang) entry.langs.set(lang, (entry.langs.get(lang) ?? 0) + 1);
    byHandle.set(handle, entry);
  }
  return [...byHandle.entries()].map(([handle, e]) => ({
    handle,
    platform,
    captions: e.captions,
    topLanguage: [...e.langs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
  }));
}
