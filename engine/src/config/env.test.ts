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
    expect(cfg.tiktokActorId).toBe('automation-lab/tiktok-trends-scraper');
    expect(cfg.instagramActorId).toBe('apify/instagram-reel-scraper');
  });

  it('lets env override actor ids', () => {
    const cfg = loadEnv({ ...base, TIKTOK_ACTOR_ID: 'other/actor' });
    expect(cfg.tiktokActorId).toBe('other/actor');
  });

  it('throws listing every missing required var', () => {
    expect(() => loadEnv({})).toThrow(/SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*APIFY_TOKEN/s);
  });
});
