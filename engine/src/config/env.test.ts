import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
  APIFY_TOKEN: 'tok',
};

describe('loadEnv', () => {
  it('returns config with actor defaults when optional vars absent', () => {
    const cfg = loadEnv(base);
    expect(cfg.supabaseUrl).toBe('https://x.supabase.co');
    expect(cfg.tiktokActorId).toBe('clockworks/free-tiktok-scraper');
    expect(cfg.tiktokResultsPerPage).toBe(10);
    expect(cfg.instagramActorId).toBe('apify/instagram-reel-scraper');
  });

  it('lets env override actor ids', () => {
    const cfg = loadEnv({ ...base, TIKTOK_ACTOR_ID: 'other/actor' });
    expect(cfg.tiktokActorId).toBe('other/actor');
  });

  it('defaults collect to search-only at 20 results/query', () => {
    const cfg = loadEnv(base);
    expect(cfg.collectResultsPerPage).toBe(20);
    expect(cfg.searchResultsPerBucket).toBe(15);
    expect(cfg.collectIncludeHashtags).toBe(false);
    expect(cfg.contentTrendLimit).toBe(150);
    expect(cfg.indexMaxAgeDays).toBe(30);
  });

  it('parses COLLECT_INCLUDE_HASHTAGS truthy values', () => {
    expect(loadEnv({ ...base, COLLECT_INCLUDE_HASHTAGS: 'true' }).collectIncludeHashtags).toBe(true);
    expect(loadEnv({ ...base, COLLECT_INCLUDE_HASHTAGS: '1' }).collectIncludeHashtags).toBe(true);
    expect(loadEnv({ ...base, COLLECT_INCLUDE_HASHTAGS: 'false' }).collectIncludeHashtags).toBe(false);
  });

  it('throws listing every missing required var', () => {
    expect(() => loadEnv({})).toThrow(/SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*APIFY_TOKEN/s);
  });
});
