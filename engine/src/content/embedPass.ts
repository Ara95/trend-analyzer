import type { SupabaseClient } from '@supabase/supabase-js';
import type { Embedder } from '../adapters/contract.js';
import { updateVideoEmbeddings, type VideoEmbeddingUpdate } from '../store/videos.js';

// Reusable caption-embedding backfill — shared by `npm run embed:videos` and the on-demand search
// worker. Idempotent: only embeds videos that have a caption but no embedding yet, so re-running drains
// the backlog cheaply. Returns the number embedded.
const BATCH = 200;

type Row = { id: string; caption: string | null };

export async function runEmbedPass(supabase: SupabaseClient, embed: Embedder): Promise<number> {
  let total = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('videos')
      .select('id,caption')
      .is('embedding', null)
      .not('caption', 'is', null)
      .limit(BATCH);
    if (error) throw new Error(`read videos failed: ${error.message}`);

    const rows = (data ?? []) as Row[];
    const withCaption = rows.filter((r) => r.caption && r.caption.trim().length > 0);
    if (withCaption.length === 0) break;

    const vectors = await embed(withCaption.map((r) => r.caption as string));
    const updates: VideoEmbeddingUpdate[] = withCaption.map((r, i) => ({ id: r.id, embedding: vectors[i] }));
    await updateVideoEmbeddings(supabase as never, updates);

    total += updates.length;
    if (rows.length < BATCH) break;
  }
  return total;
}
