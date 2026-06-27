import { describe, it, expect } from 'vitest';
import { harvestAuthors } from './tiktok.js';

const items = [
  { authorMeta: { name: 'FoodieSwe' }, text: 'recept på köttbullar', textLanguage: 'sv' },
  { authorMeta: { name: 'foodieswe' }, text: 'midsommartårta', textLanguage: 'sv' },
  { authorMeta: { name: 'techkalle' }, text: 'ny telefon', textLanguage: 'sv' },
  { authorMeta: { name: 'techkalle' }, text: '', textLanguage: 'en' },
  { authorMeta: {}, text: 'no author' },
];

describe('harvestAuthors', () => {
  it('groups videos by author (case-insensitive) and collects captions', () => {
    const out = harvestAuthors(items);
    const foodie = out.find((c) => c.handle === 'foodieswe');
    expect(foodie?.captions).toEqual(['recept på köttbullar', 'midsommartårta']);
    expect(foodie?.platform).toBe('tiktok');
  });

  it('skips empty captions but still records language, and picks the top language', () => {
    const tech = harvestAuthors(items).find((c) => c.handle === 'techkalle');
    expect(tech?.captions).toEqual(['ny telefon']); // empty caption dropped
    expect(tech?.topLanguage).toBe('sv'); // sv (1) vs en (1) → first-seen sv wins the sort tie
  });

  it('ignores items with no author', () => {
    const out = harvestAuthors(items);
    expect(out.map((c) => c.handle)).toEqual(['foodieswe', 'techkalle']);
  });
});
