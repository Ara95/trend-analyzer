import { createClient } from "@supabase/supabase-js";

/**
 * On-demand search registry (engine step 4). When a user searches a term, we record it in `searches`
 * and — if it's never been scraped or the cached results are older than 30 days — mark it `pending` so
 * the engine worker scrapes it. Server Components only (service-role). Results themselves come from the
 * video index (lib/videos.ts); this only tracks freshness/status so the UI knows when to poll.
 */

// Re-scrape cadence. MUST stay well under the 30-day read/ingest age-cap: the cap is a MOVING window,
// so a term scraped once and served unchanged would decay toward zero results by the back of its cache
// window. At 7 days the served set stays mostly full and refreshes long before it empties. Lower this
// to trade Apify cost for fresher results.
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 86_400_000;

export function normalizeQuery(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

export interface SearchState {
  /** A scrape is queued or running for this term — the UI should show "collecting" and poll. */
  collecting: boolean;
}

export async function ensureSearch(term: string): Promise<SearchState> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const query = normalizeQuery(term);
  if (!url || !key || !query) return { collecting: false };

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data } = await supabase
      .from("searches")
      .select("status,last_scraped_at")
      .eq("query", query)
      .maybeSingle();

    if (!data) {
      // First time anyone searched this — queue a scrape. A concurrent insert (23505) just means
      // someone beat us to it, which is still "collecting".
      const { error } = await supabase.from("searches").insert({ query, status: "pending" });
      return { collecting: !error || error.code === "23505" };
    }

    const fresh =
      data.status === "ready" &&
      data.last_scraped_at != null &&
      Date.now() - new Date(data.last_scraped_at).getTime() < TTL_MS;
    if (fresh) return { collecting: false };

    if (data.status === "pending" || data.status === "running") return { collecting: true };

    // ready-but-stale (>30d) or a prior error → re-queue. The cached results keep showing meanwhile
    // (stale-while-revalidate) until the worker refreshes them.
    await supabase
      .from("searches")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("query", query);
    return { collecting: true };
  } catch {
    // searches table missing (migration 0009 not applied) or unreachable → degrade to index-only.
    return { collecting: false };
  }
}
