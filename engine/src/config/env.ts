export interface EngineConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  apifyToken: string;
  tiktokActorId: string;
  instagramActorId: string;
}

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APIFY_TOKEN'] as const;

export function loadEnv(source: Record<string, string | undefined> = process.env): EngineConfig {
  const missing = REQUIRED.filter((k) => !source[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    supabaseUrl: source.SUPABASE_URL!,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY!,
    apifyToken: source.APIFY_TOKEN!,
    tiktokActorId: source.TIKTOK_ACTOR_ID ?? 'automation-lab/tiktok-trends-scraper',
    instagramActorId: source.INSTAGRAM_ACTOR_ID ?? 'apify/instagram-reel-scraper',
  };
}
