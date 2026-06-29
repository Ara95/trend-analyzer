import type {
  Direction,
  Format,
  Industry,
  Period,
  Platform,
  SearchLang,
  SearchSort,
} from "./types";

/** Swedish UI copy for every enum the dashboard renders. Data values stay raw. */

export const PERIODS: { value: Period; label: string; sub: string }[] = [
  { value: "day", label: "Idag", sub: "24h" },
  { value: "week", label: "Vecka", sub: "7d" },
  { value: "month", label: "Månad", sub: "30d" },
];

export const DIRECTIONS: {
  value: Direction | "all";
  label: string;
}[] = [
  { value: "all", label: "Alla" },
  { value: "rising", label: "Stigande" },
  { value: "falling", label: "Fallande" },
];

export const PLATFORMS: { value: Platform | "all"; label: string }[] = [
  { value: "all", label: "Alla plattformar" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

export interface IndustryMeta {
  value: Industry;
  label: string;
  glyph: string;
  blurb: string;
}

export const INDUSTRIES: IndustryMeta[] = [
  { value: "all", label: "Allt", glyph: "✺", blurb: "Hela landet" },
  { value: "beauty", label: "Skönhet", glyph: "✿", blurb: "Smink, hud & hår" },
  { value: "fashion", label: "Mode", glyph: "✦", blurb: "Kläder & styling" },
  { value: "food", label: "Mat", glyph: "✸", blurb: "Recept & restaurang" },
  { value: "fitness", label: "Träning", glyph: "✷", blurb: "Gym & välmående" },
  { value: "tech", label: "Teknik", glyph: "✜", blurb: "Prylar & AI" },
  { value: "sports", label: "Sport", glyph: "✪", blurb: "Fotboll, hockey, e-sport" },
  { value: "entertainment", label: "Underhållning", glyph: "❋", blurb: "Komik & memes" },
  { value: "music", label: "Musik & dans", glyph: "❂", blurb: "Låtar & koreografi" },
  { value: "gaming", label: "Gaming", glyph: "✧", blurb: "Spel & streamers" },
  { value: "travel", label: "Resor", glyph: "✈", blurb: "Resmål & äventyr" },
  { value: "home", label: "Hem & inredning", glyph: "⌂", blurb: "Inredning & DIY" },
  { value: "family", label: "Familj", glyph: "❀", blurb: "Föräldraskap & barn" },
  { value: "pets", label: "Djur", glyph: "✾", blurb: "Husdjur & djur" },
  { value: "news", label: "Nyheter & samhälle", glyph: "❇", blurb: "Politik & samhälle" },
  { value: "finance", label: "Ekonomi", glyph: "✥", blurb: "Sparande & business" },
  { value: "automotive", label: "Motor", glyph: "✛", blurb: "Bil & fordon" },
  { value: "lifestyle", label: "Livsstil", glyph: "❈", blurb: "Vlogg & vardag" },
];

export const INDUSTRY_LABELS: Record<Industry, string> = Object.fromEntries(
  INDUSTRIES.map((i) => [i.value, i.label]),
) as Record<Industry, string>;

export const FORMAT_LABELS: Record<Format, string> = {
  hashtag: "Hashtag",
  audio: "Ljud",
  video: "Video",
  creator: "Kreatör",
  reel: "Reel",
};

export const FORMAT_GLYPHS: Record<Format, string> = {
  hashtag: "#",
  audio: "♪",
  video: "▶",
  creator: "@",
  reel: "▣",
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** Brand-coded styling for the poster's platform chip, so the source reads at a glance while scrolling:
 * Instagram's signature warm gradient (dark purple under the label → magenta → orange) vs. TikTok's
 * flat black. The black gets a faint inset ring so its edge stays defined over dark thumbnails. */
export const PLATFORM_BADGE: Record<Platform, string> = {
  instagram: "bg-gradient-to-br from-[#8134af] via-[#dd2a7b] to-[#f58529] text-white",
  tiktok: "bg-[#010101] text-white ring-1 ring-inset ring-white/20",
};

export const DEFAULT_COUNTRY = "SE";

// --- Orbit search surface -------------------------------------------------

export const SEARCH_SORTS: { value: SearchSort; label: string }[] = [
  { value: "trend", label: "Relevans" },
  { value: "outlier", label: "Mest avvikande" },
  { value: "views", label: "Visningar" },
  { value: "likes", label: "Gillningar" },
  { value: "comments", label: "Kommentarer" },
  { value: "shares", label: "Delningar" },
  { value: "engagement", label: "Engagemang" },
  { value: "recent", label: "Senaste" },
];

/** Period switcher segments (day/week/month). Rendered as a segmented control, not in the dropdown.
 * No "all" option — under the 30-day index cap `month` already is "everything", so it's the default. */
export const SEARCH_PERIOD_TABS: { value: Period; label: string }[] = [
  { value: "day", label: "Senaste dygnet" },
  { value: "week", label: "7 dagar" },
  { value: "month", label: "30 dagar" },
];

/** Outlier-threshold pills (× the creator's own average views). 0 = show everything; higher tiers narrow
 * to videos that broke out hardest relative to their creator — the "viral outlier" view. Mirrors
 * OUTLIER_VALUES in lib/search-query.ts. */
export const SEARCH_OUTLIER_TIERS: { value: number; label: string }[] = [
  { value: 0, label: "Alla" },
  { value: 2, label: "2× snittet" },
  { value: 5, label: "5× snittet" },
  { value: 10, label: "10× snittet" },
  { value: 20, label: "20× snittet" },
];

export const SEARCH_PLATFORMS: { value: Platform | "all"; label: string }[] = [
  { value: "all", label: "Alla" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
];

export const SEARCH_LANGS: { value: SearchLang; label: string }[] = [
  { value: "all", label: "Alla språk" },
  { value: "sv", label: "Svenska" },
  { value: "en", label: "Engelska" },
];

/** Seed prompts shown on the empty hero — the kinds of things you'd actually search for. */
export const EXAMPLE_QUERIES: string[] = [
  "gaming setup",
  "AI-verktyg",
  "träning hemma",
  "produktivitet",
  "iPhone-tips",
  "restaurangmarknadsföring",
  "morgonrutin",
  "budget recept",
];
