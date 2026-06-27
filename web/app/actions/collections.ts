"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SaveItemInput } from "@/lib/collections";

/**
 * Mutations + the picker lookup for saved inspirations. Every action resolves the user with
 * getUser() (revalidated) and writes user_id explicitly — the collection_items/collections RLS
 * `with check (auth.uid() = user_id)` rejects rows attributed to anyone else. Reads for pages live
 * in lib/collections.ts. Returns plain { ok, error } so the client can show inline feedback.
 */

const DEFAULT_COLLECTION = "Favoriter";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user } as const;
}

/** Collections for the picker, each flagged whether it already contains this video. Seeds a default
 *  "Favoriter" collection on first use so the very first save is never a dead end. */
export async function getCollectionsForVideo(
  platform: string,
  platformVideoId: string,
): Promise<{ id: string; name: string; contains: boolean }[]> {
  const { supabase, user } = await requireUser();
  if (!user) return [];

  let { data: collections } = await supabase
    .from("collections")
    .select("id, name")
    .order("created_at", { ascending: false });

  if (!collections || collections.length === 0) {
    const { data: created } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name: DEFAULT_COLLECTION })
      .select("id, name")
      .single();
    collections = created ? [created] : [];
  }

  const { data: hits } = await supabase
    .from("collection_items")
    .select("collection_id")
    .eq("platform", platform)
    .eq("platform_video_id", platformVideoId);
  const inCollections = new Set((hits ?? []).map((h) => String(h.collection_id)));

  return (collections ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    contains: inCollections.has(String(c.id)),
  }));
}

export async function createCollection(name: string): Promise<Result<{ id: string; name: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Inte inloggad." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Ange ett namn." };
  if (trimmed.length > 80) return { ok: false, error: "Namnet är för långt." };

  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: user.id, name: trimmed })
    .select("id, name")
    .single();
  if (error) {
    // 23505 = unique (user_id, lower(name)) violation.
    return { ok: false, error: error.code === "23505" ? "Du har redan en samling med det namnet." : "Kunde inte skapa samlingen." };
  }
  revalidatePath("/favoriter");
  return { ok: true, data: { id: String(data.id), name: String(data.name) } };
}

export async function saveItem(collectionId: string, item: SaveItemInput): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Inte inloggad." };

  const { error } = await supabase.from("collection_items").upsert(
    {
      collection_id: collectionId,
      user_id: user.id,
      platform: item.platform,
      platform_video_id: item.platformVideoId,
      caption: item.caption ?? null,
      thumbnail_url: item.thumbnailUrl ?? null,
      url: item.url ?? null,
      creator_handle: item.creatorHandle ?? null,
      views: item.views,
      likes: item.likes,
      comments: item.comments,
      shares: item.shares,
      engagement_rate: item.engagementRate ?? null,
      trend_score: item.trendScore ?? null,
      is_breakout: item.isBreakout,
      posted_at: item.postedAt ?? null,
    },
    { onConflict: "collection_id,platform,platform_video_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: "Kunde inte spara." };
  revalidatePath("/favoriter");
  return { ok: true };
}

export async function removeItem(
  collectionId: string,
  platform: string,
  platformVideoId: string,
): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Inte inloggad." };

  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("platform", platform)
    .eq("platform_video_id", platformVideoId);
  if (error) return { ok: false, error: "Kunde inte ta bort." };
  revalidatePath("/favoriter");
  return { ok: true };
}
