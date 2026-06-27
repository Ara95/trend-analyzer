// Instagram content-first normalizer. The keyword-search actor (patient_discovery/instagram-search-
// reels) returns RAW Instagram GraphQL reels (snake_case) and — unlike TikTok — has NO geo control
// and NO language field. So we (1) map each reel onto the SAME flat shape rankContent already reads
// (clockworks/TikTok keys), and (2) detect the language from the caption ourselves, encoding it as a
// synthetic `textLanguage` so the existing language gate in rankContent does the geo filtering with
// no new code path. Three values: 'sv' (reads as Swedish), 'xx' (reads as another language → dropped),
// 'un' (no usable text signal — emoji/hashtag-only → KEPT, like TikTok's undetermined). See memory:
// apify-instagram-analysis.

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

// Strong Swedish marker words that discriminate against Danish/Norwegian (og/er/jeg/ikke) and German.
// Padded with spaces so we match whole words, not substrings. Each added word is Swedish-distinct
// (e.g. utan≠uden/uten, hon≠hun, något≠noget/noe, många≠mange) — NOT shared function words like
// en/de/av/om that also appear in Danish/Norwegian/German, which would cost precision.
const SV_MARKERS = [
  ' och ', ' är ', ' jag ', ' inte ', ' från ', ' för ', ' med ', ' att ', ' den ', ' det ',
  ' som ', ' på ', ' vi ', ' du ', ' mycket ', ' även ', ' här ', ' så ', ' men ', ' kan ',
  ' har ', ' till ', ' när ', ' eller ', ' vill ', ' bara ', ' mig ', ' dig ', ' vår ', ' era ',
  ' ett ', ' ska ', ' vad ', ' hur ', ' utan ', ' detta ', ' dessa ', ' sina ', ' hon ',
  ' många ', ' något ', ' några ', ' hela ', ' eftersom ', ' väldigt ', ' gör ', ' göra ',
];

// Count distinct Swedish-marker words in a caption, and whether it carries an å/ä/ö. Optionally
// credits the reel's source search QUERY as one extra marker — but only if that exact word appears
// in the caption — which recovers a single-content-word caption like "Träning 💪" (query=träning, 0
// function-word markers but an ä → 1 hit + åäö = Swedish) that a bare marker count drops as 'xx'.
//
// SAFETY LIVES IN CONFIG, NOT IN THE z-RULE BELOW. Crediting trusts the query's Swedish-distinctness
// entirely. For the ~half of IG_SEARCH_QUERIES that themselves contain å/ä/ö (träning, hälsa,
// trädgård, kläder, fotboll, föräldraledig, skönhet), the credited word SUPPLIES the åäö, so any
// caption containing that exact word clears the rule unconditionally — including a code-switched
// "full body workout träning". That is the accepted tradeoff (the caption demonstrably contains a
// Swedish word) and is REQUIRED: you cannot recover "Träning 💪" while also demanding an independent
// åäö. The real invariant is therefore that every IG query is genuinely Swedish-distinct (enforced by
// discipline in env.ts) — a German-overlapping åäö query (German shares ä/ö) would silently pass
// every caption containing it. The ≥1-marker-plus-åäö rule only protects åäö-FREE queries (e.g. a
// misconfigured false friend like "recept"): there 1 credited hit alone never clears the rule.
// Caption is split on non-letters into words, so query crediting handles single-token queries.
const NON_LETTERS = /[^a-zåäöéèüáàíóúñ]+/;
function swedishHits(caption: string, query?: string): { hits: number; hasAao: boolean } {
  const t = ` ${caption.toLowerCase().replace(/[\n\r]+/g, ' ')} `;
  const markers = new Set(SV_MARKERS.filter((m) => t.includes(m)));
  if (query) {
    const q = query.trim().toLowerCase();
    const words = new Set(t.split(NON_LETTERS).filter(Boolean));
    if (q && words.has(q) && !markers.has(` ${q} `)) markers.add(q); // query word present, not double-counted
  }
  return { hits: markers.size, hasAao: /[åäö]/.test(t) };
}

// Detect Swedish from a caption with no language field available. Precision over recall: a
// false-positive non-Swedish reel pollutes the cohort, whereas a missed emoji/hashtag-only Swedish
// caption is cheap. Rule: ≥2 distinct Swedish marker words, OR ≥1 marker plus an å/ä/ö.
export function isSwedish(caption: string | undefined): boolean {
  if (!caption) return false;
  const { hits, hasAao } = swedishHits(caption);
  return hits >= 2 || (hits >= 1 && hasAao);
}

// Letters that count as a real language signal (Latin + Swedish/common diacritics). Emoji, digits,
// punctuation and symbols are NOT letters, so an emoji-only caption has zero.
const LETTERS = /[a-zåäöéèüáàíóúñ]/gi;

// Does the caption carry usable text to judge language at all? Strip URLs, #hashtags and @mentions
// (which are not prose) first, then require ≥3 letters. Below that there is no signal — a bare emoji
// or hashtag string says nothing about geo, so we must NOT treat it as foreign.
function hasWordSignal(caption: string | undefined): boolean {
  if (!caption) return false;
  const stripped = caption.replace(/https?:\/\/\S+/g, ' ').replace(/[#@]\S+/g, ' ');
  const letters = stripped.match(LETTERS);
  return letters !== null && letters.length >= 3;
}

// Three-way geo signal for IG. 'un' (undetermined) is the key addition over a bare isSwedish: a
// wordless caption is no evidence the reel is foreign, and it still surfaced under a Swedish-distinct
// query, so we keep it (downstream gate allows 'sv','un' — the same treatment TikTok gives 'un').
// Only captions with real, non-Swedish words become 'xx' and are dropped: we filter where we have
// signal, not where we lack it. `query` is the Swedish-distinct term the reel surfaced under
// (collect-instagram tags each reel); it credits that word as Swedish evidence (see swedishHits).
export function detectLanguage(caption: string | undefined, query?: string): 'sv' | 'xx' | 'un' {
  if (!hasWordSignal(caption)) return 'un';
  const { hits, hasAao } = swedishHits(caption as string, query);
  return hits >= 2 || (hits >= 1 && hasAao) ? 'sv' : 'xx';
}

function caption(raw: Record<string, any>): string | undefined {
  return str(raw.caption?.text) ?? str(typeof raw.caption === 'string' ? raw.caption : undefined) ?? str(raw.text);
}

// IG has no clean hashtag array, so harvest inline #tags from the caption — a content-classification
// signal mirroring TikTok's hashtags[]. Unicode-aware so Swedish #träning/#hälsa survive.
function captionHashtags(cap: string | undefined): string[] {
  if (!cap) return [];
  const matches = cap.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

// IG returns several thumbnail shapes depending on media version. Try the common ones in order.
function thumbnail(raw: Record<string, any>): string | undefined {
  return (
    str(raw.image_versions2?.candidates?.[0]?.url) ??
    str(raw.image_versions?.candidates?.[0]?.url) ??
    str(raw.image_versions?.items?.[0]?.url) ??
    str(raw.thumbnail_url) ??
    str(raw.display_uri) ??
    str(raw.display_url)
  );
}

// Cross-reel audio id (so a sound used by ≥2 reels becomes an audio trend). Original sounds and
// licensed music live under different keys; take whichever is present.
function audioId(raw: Record<string, any>): string | undefined {
  const cm = raw.clips_metadata ?? raw.music_metadata;
  const id =
    cm?.music_info?.music_asset_info?.audio_cluster_id ??
    cm?.original_sound_info?.audio_asset_id ??
    cm?.music_info?.music_asset_info?.id;
  return id != null ? String(id) : undefined;
}

// Map raw IG GraphQL reels onto the flat shape rankContent consumes (TikTok/clockworks keys). The
// caller flattens any actor-specific nesting first and tags each reel with `__searchQuery` (the
// Swedish-distinct term it surfaced under). textLanguage is SYNTHETIC: 'sv' (Swedish), 'xx' (other
// language), or 'un' (no text signal) — so rankContent's allowedLanguages:['sv','un'] gate keeps
// Swedish + wordless reels and drops only captions that read as another language.
export function normalizeInstagramReels(items: Record<string, any>[]): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  for (const raw of items) {
    // Prefer `code` (the shortcode) as the id: the web permalink is https://instagram.com/reel/<code>/,
    // and the numeric `id`/`pk` does NOT resolve as a URL. Fall back to id/pk only if code is absent.
    const externalId = str(raw.code) ?? str(raw.id) ?? (raw.pk != null ? String(raw.pk) : undefined);
    if (!externalId) continue;
    const takenAt = num(raw.taken_at ?? raw.taken_at_timestamp ?? raw.device_timestamp);
    const cap = caption(raw);
    out.push({
      id: externalId,
      text: cap,
      // IG view counts: ig_play_count is the public "plays"; play_count/view_count are fallbacks.
      playCount: num(raw.ig_play_count ?? raw.play_count ?? raw.view_count),
      diggCount: num(raw.like_count),
      commentCount: num(raw.comment_count),
      shareCount: num(raw.share_count ?? raw.reshare_count),
      authorMeta: { name: str(raw.user?.username ?? raw.username)?.toLowerCase() },
      musicMeta: { musicId: audioId(raw) },
      videoMeta: { coverUrl: thumbnail(raw) },
      hashtags: captionHashtags(cap),
      // taken_at is unix SECONDS — convert to ISO or rankContent's Date.parse drops every row.
      createTimeISO: takenAt > 0 ? new Date(takenAt * 1000).toISOString() : undefined,
      textLanguage: detectLanguage(cap, str(raw.__searchQuery)),
    });
  }
  return out;
}

// Flatten the actor's container shape (it has returned both flat reels and {posts:[...]} nesting).
export function flattenReels(raw: Record<string, any>[]): Record<string, any>[] {
  return raw.flatMap((o) =>
    Array.isArray(o.reels) ? o.reels : Array.isArray(o.posts) ? o.posts : [o],
  );
}
