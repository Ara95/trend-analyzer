import type {
  ActorRunner,
  ContentSnapshot,
  PanelAccount,
  RunContext,
  SourceAdapter,
} from './contract.js';

export interface InstagramDeps {
  runActor: ActorRunner;
  listAccounts: () => Promise<PanelAccount[]>;
  actorId: string;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function createInstagramAdapter(deps: InstagramDeps): SourceAdapter {
  return {
    id: 'instagram',
    platform: 'instagram',
    sourceClass: 'raw-content',

    async fetchTrends(): Promise<[]> {
      return []; // Class B derives trends from snapshots, not here.
    },

    async fetchSnapshots(_ctx: RunContext): Promise<ContentSnapshot[]> {
      const accounts = await deps.listAccounts();
      const byHandle = new Map(accounts.map((a) => [a.handle.toLowerCase(), a]));
      const items = await deps.runActor(deps.actorId, {
        username: accounts.map((a) => a.handle),
      });
      const capturedAt = new Date().toISOString();
      const snapshots: ContentSnapshot[] = [];
      for (const raw of items as Record<string, any>[]) {
        const account = byHandle.get(String(raw.ownerUsername ?? '').toLowerCase());
        if (!account) continue; // not part of the curated panel
        snapshots.push({
          platform: 'instagram',
          accountId: account.id,
          externalId: String(raw.id ?? raw.shortCode),
          format: 'reel',
          views: num(raw.videoPlayCount ?? raw.videoViewCount),
          likes: num(raw.likesCount),
          comments: num(raw.commentsCount),
          shares: num(raw.sharesCount),
          audioId: raw.musicInfo?.audio_id ? String(raw.musicInfo.audio_id) : undefined,
          capturedAt,
          // Classification signals (defensive — actor schema varies):
          caption: str(raw.caption),
          videoUrl: str(raw.videoUrl),
          handle: account.handle,
        });
      }
      return snapshots;
    },
  };
}
