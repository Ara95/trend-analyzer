import type {
  ActorRunner,
  ContentSnapshot,
  PanelAccount,
  RunContext,
  SourceAdapter,
} from './contract.js';

export interface TikTokDeps {
  runActor: ActorRunner;
  listAccounts: () => Promise<PanelAccount[]>;
  actorId: string;
  // Videos to pull per profile. Caps cost on the pay-per-result content scraper.
  resultsPerPage?: number;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

// Class B (raw-content). TikTok has no usable per-industry trend feed for a small market like
// Sweden: TikTok Creative Center's industry-segmented hashtag trends cover only ~27 countries and
// SE is not among them (verified — the same 27-country list appears across independent Creative
// Center actors, so it is TikTok's limit, not the scraper's). So, exactly like Instagram, we scrape
// a curated panel of SE accounts' recent videos and let the engine derive velocity and the
// classifier attribute industry. Sweden = the curated panel (accounts.country = 'SE').
export function createTikTokAdapter(deps: TikTokDeps): SourceAdapter {
  return {
    id: 'tiktok',
    platform: 'tiktok',
    sourceClass: 'raw-content',

    async fetchTrends(): Promise<[]> {
      return []; // Class B derives trends from snapshots, not here.
    },

    async fetchSnapshots(_ctx: RunContext): Promise<ContentSnapshot[]> {
      const accounts = await deps.listAccounts();
      const byHandle = new Map(accounts.map((a) => [a.handle.toLowerCase(), a]));
      const items = await deps.runActor(deps.actorId, {
        profiles: accounts.map((a) => a.handle),
        resultsPerPage: deps.resultsPerPage ?? 10,
        profileScrapeSections: ['videos'],
        profileSorting: 'latest',
        excludePinnedPosts: true,
        // No media downloads — we only need engagement metrics + caption (cheaper run).
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      });
      const capturedAt = new Date().toISOString();
      const snapshots: ContentSnapshot[] = [];
      for (const raw of items as Record<string, any>[]) {
        const account = byHandle.get(String(raw.authorMeta?.name ?? '').toLowerCase());
        if (!account) continue; // not part of the curated panel
        snapshots.push({
          platform: 'tiktok',
          accountId: account.id,
          externalId: String(raw.id),
          format: 'video',
          views: num(raw.playCount),
          likes: num(raw.diggCount),
          comments: num(raw.commentCount),
          shares: num(raw.shareCount),
          audioId: raw.musicMeta?.musicId ? String(raw.musicMeta.musicId) : undefined,
          capturedAt,
          // Classification signals (defensive — actor schema varies):
          caption: str(raw.text),
          videoUrl: str(raw.webVideoUrl),
          handle: account.handle,
        });
      }
      return snapshots;
    },
  };
}
