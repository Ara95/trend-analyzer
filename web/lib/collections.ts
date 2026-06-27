import { createClient } from "@/lib/supabase/server";
import type { Platform, VideoResult } from "@/lib/types";

/**
 * Per-user saved inspirations (engine migration 0010). Reads go through the SSR server client, so
 * RLS scopes every query to the signed-in user via auth.uid() — there is no service-role path here.
 * Saved rows are DENORMALIZED (caption/thumbnail/metrics copied at save time), so these reads never
 * touch the `videos` index and survive the 30-day prune. Mutations live in app/actions/collections.ts.
 */

export interface Collection {
  id: string;
  name: string;
  itemCount: number;
}

/** A saved video, shaped like VideoResult so it reuses the same card grid. */
export interface SavedItem extends VideoResult {
  collectionId: string;
  savedAt: string;
}

/** The snapshot the client sends when saving — the card's display fields. */
export interface SaveItemInput {
  platform: Platform;
  platformVideoId: string;
  caption?: string;
  thumbnailUrl?: string;
  url?: string;
  creatorHandle?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate?: number;
  trendScore?: number;
  isBreakout: boolean;
  postedAt?: string;
}

function mapItem(row: Record<string, unknown>): SavedItem {
  const n = (v: unknown) => Number(v ?? 0);
  return {
    id: String(row.id),
    collectionId: String(row.collection_id),
    savedAt: String(row.saved_at),
    platform: row.platform as Platform,
    platformVideoId: String(row.platform_video_id),
    creatorHandle: (row.creator_handle as string) ?? undefined,
    caption: (row.caption as string) ?? undefined,
    hashtags: [],
    url: (row.url as string) ?? undefined,
    thumbnail: (row.thumbnail_url as string) ?? undefined,
    postedAt: (row.posted_at as string) ?? undefined,
    views: n(row.views),
    likes: n(row.likes),
    comments: n(row.comments),
    shares: n(row.shares),
    engagementRate: row.engagement_rate == null ? undefined : Number(row.engagement_rate),
    trendScore: row.trend_score == null ? undefined : Number(row.trend_score),
    isBreakout: Boolean(row.is_breakout),
  };
}

/** All of the user's collections with item counts, newest first. Empty array if signed out. */
export async function listCollections(): Promise<Collection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id, name, collection_items(count)")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name),
    // PostgREST returns the aggregate as [{ count }].
    itemCount: Number(
      (Array.isArray(row.collection_items) ? row.collection_items[0]?.count : 0) ?? 0,
    ),
  }));
}

/** Saved items in one collection (newest first), shaped for the card grid. */
export async function listItems(collectionId: string): Promise<SavedItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_items")
    .select("*")
    .eq("collection_id", collectionId)
    .order("saved_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapItem);
}

/**
 * Set of "platform:platform_video_id" keys the user has saved into ANY collection — drives the
 * filled/empty heart on the search grid. One query for the whole result page.
 */
export async function getSavedKeys(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_items")
    .select("platform, platform_video_id");
  if (error || !data) return new Set();
  return new Set(data.map((r) => `${r.platform}:${r.platform_video_id}`));
}
