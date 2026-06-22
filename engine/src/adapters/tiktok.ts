import type {
  ActorRunner,
  Direction,
  NormalizedTrend,
  Period,
  RunContext,
  SourceAdapter,
} from './contract.js';
import { ALL_INDUSTRIES, type Industry } from '../config/industries.js';

export interface TikTokDeps {
  runActor: ActorRunner;
  actorId: string;
}

export function periodToDays(period: Period): number {
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  throw new Error(`TikTok Creative Center has no 'day' window; got period='${period}'`);
}

function direction(v: unknown): Direction | undefined {
  return v === 'rising' || v === 'falling' || v === 'stable' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function createTikTokAdapter(deps: TikTokDeps): SourceAdapter {
  return {
    id: 'tiktok',
    platform: 'tiktok',
    sourceClass: 'trend-feed',

    async fetchTrends(ctx: RunContext): Promise<NormalizedTrend[]> {
      const days = periodToDays(ctx.period);
      const items = (await deps.runActor(deps.actorId, {
        countryCode: ctx.country,
        period: days,
      })) as Record<string, any>[];

      const trends: NormalizedTrend[] = [];
      for (const raw of items) {
        if (raw.type === 'hashtag') {
          trends.push({
            platform: 'tiktok',
            format: 'hashtag',
            label: String(raw.hashtagName ?? raw.name),
            country: ctx.country,
            industry: (raw.industry as Industry) ?? ALL_INDUSTRIES,
            period: ctx.period,
            rank: num(raw.rank),
            rankMovement: num(raw.rankDiff),
            direction: direction(raw.trend),
            views: num(raw.views),
          });
        } else if (raw.type === 'sound' || raw.type === 'song') {
          trends.push({
            platform: 'tiktok',
            format: 'audio',
            label: String(raw.title ?? raw.name),
            country: ctx.country,
            industry: ALL_INDUSTRIES, // sounds are country-level only
            period: ctx.period,
            rank: num(raw.rank),
            rankMovement: num(raw.rankDiff),
            metrics: { audioLink: raw.audioLink, usageCount: raw.usageCount },
          });
        }
      }
      return trends;
    },

    async fetchSnapshots(): Promise<[]> {
      return []; // Class A — pre-computed, no raw content.
    },
  };
}
