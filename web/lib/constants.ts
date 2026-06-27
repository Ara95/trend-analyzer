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

export const DEFAULT_COUNTRY = "SE";

// --- Orbit search surface -------------------------------------------------

export const SEARCH_SORTS: { value: SearchSort; label: string }[] = [
  { value: "trend", label: "Trend Score" },
  { value: "views", label: "Visningar" },
  { value: "likes", label: "Gillningar" },
  { value: "comments", label: "Kommentarer" },
  { value: "shares", label: "Delningar" },
  { value: "engagement", label: "Engagemang" },
  { value: "recent", label: "Senaste" },
];

export const SEARCH_PERIODS: { value: Period | "all"; label: string }[] = [
  { value: "all", label: "Alltid" },
  { value: "day", label: "24h" },
  { value: "week", label: "7 dygn" },
  { value: "month", label: "30 dygn" },
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
