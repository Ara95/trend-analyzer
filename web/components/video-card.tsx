import { Play } from "lucide-react";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatCompact, formatPercent, relativeTime, truncate } from "@/lib/format";
import type { VideoResult } from "@/lib/types";
import type { SaveItemInput } from "@/lib/collections";
import { SaveButton } from "@/components/save-button";

// Reuse the existing server-side cover proxies (TikTok oEmbed / IG CDN un-hotlink). Stored TikTok
// covers expire, so resolve a fresh one from the post url; IG covers come from the captured thumbnail.
function thumbnailFor(v: VideoResult): string | undefined {
  if (v.platform === "tiktok" && v.url) {
    return `/api/thumbnail?u=${encodeURIComponent(v.url)}`;
  }
  if (v.platform === "instagram" && v.thumbnail) {
    return `/api/ig-thumbnail?u=${encodeURIComponent(v.thumbnail)}`;
  }
  return undefined;
}

// A datadriven metric cell: value over a small uppercase mono label. Iconless, per the Nordic redesign.
function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-xs tabular-nums text-ink">{value}</div>
      <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">
        {label}
      </div>
    </div>
  );
}

export function VideoCard({
  v,
  rank,
  delay = 0,
  saved = false,
}: {
  v: VideoResult;
  rank: number;
  delay?: number;
  /** Whether the signed-in user has this video saved in any collection (filled heart). */
  saved?: boolean;
}) {
  const thumb = thumbnailFor(v);
  const headline = v.caption
    ? truncate(v.caption, 90)
    : v.creatorHandle
      ? `@${v.creatorHandle}`
      : v.platformVideoId;

  // Creator-relative outlier: how many times the creator's own average this video beats. Null until
  // engine step 2 fills outlier_ratio, so the chip hides gracefully when we can't show a real number.
  const outlier = v.outlierRatio != null ? Math.round(v.outlierRatio) : null;
  // The signal row only earns its space when there's something to say (outlier or breakout).
  const showSignalRow = outlier != null && outlier > 1;

  // The denormalized snapshot stored when this video is saved (lib/collections SaveItemInput).
  const saveInput: SaveItemInput = {
    platform: v.platform,
    platformVideoId: v.platformVideoId,
    caption: v.caption,
    thumbnailUrl: v.thumbnail,
    url: v.url,
    creatorHandle: v.creatorHandle,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    engagementRate: v.engagementRate,
    trendScore: v.trendScore,
    isBreakout: v.isBreakout,
    postedAt: v.postedAt,
  };

  const linkProps = v.url
    ? { href: v.url, target: "_blank", rel: "noopener noreferrer" as const }
    : undefined;

  return (
    <article className="fade-up group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-[#dcd8d1] hover:shadow-[0_16px_38px_-20px_rgba(40,35,28,0.4)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Vertical 9:16 poster — the short-form signature. The link covers only the poster image so the
          save button (overlaid above it) stays clickable and never triggers navigation. */}
      <div className="relative aspect-[9/16] overflow-hidden bg-muted-surface">
        {/* Link layer */}
        {linkProps ? (
          <a {...linkProps} aria-label={`Öppna på ${PLATFORM_LABELS[v.platform]}`} className="absolute inset-0 block">
            <PosterInner v={v} thumb={thumb} />
          </a>
        ) : (
          <PosterInner v={v} thumb={thumb} />
        )}

        {/* Overlays above the link */}
        <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-white/95 px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-ink shadow-sm">
          {PLATFORM_LABELS[v.platform]}
        </span>

        <div className="absolute right-3 top-3 z-10">
          <SaveButton item={saveInput} initialSaved={saved} />
        </div>

        {/* Trend Score chip — clean light chip, bottom-left of the poster. Engagement rate stands in
            with a neutral label until trend_score is populated. */}
        {v.trendScore != null ? (
          <span className="pointer-events-none absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-[9px] bg-white/95 px-2.5 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.14)]">
            <span className="size-[7px] rounded-full bg-signal" aria-hidden />
            <span className="font-mono text-xs font-semibold tabular-nums text-ink">
              {v.trendScore.toFixed(1)}
            </span>
            <span className="font-mono text-[8px] tracking-[0.06em] text-ink-faint">TS</span>
          </span>
        ) : v.engagementRate != null ? (
          <span className="pointer-events-none absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-[9px] bg-white/95 px-2.5 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.14)]">
            <span className="size-[7px] rounded-full bg-signal" aria-hidden />
            <span className="font-mono text-xs font-semibold tabular-nums text-ink">
              {formatPercent(v.engagementRate)}
            </span>
            <span className="font-mono text-[8px] tracking-[0.06em] text-ink-faint">ENG</span>
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center gap-1.5 overflow-hidden font-mono text-[10px] text-ink-faint">
          <span className="tabular-nums">{String(rank).padStart(2, "0")}</span>
          {v.creatorHandle && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate text-ink-dim">@{v.creatorHandle}</span>
            </>
          )}
          {v.postedAt && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">{relativeTime(v.postedAt)}</span>
            </>
          )}
        </div>

        {linkProps ? (
          <a {...linkProps} className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug text-ink transition-colors hover:text-ink/70">
            {headline}
          </a>
        ) : (
          <p className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug text-ink">{headline}</p>
        )}

        {showSignalRow && (
          <div className="flex items-center justify-end gap-2">
            <span className="inline-flex items-center gap-1 rounded-[7px] bg-signal-soft px-2 py-0.5 text-[11px] font-semibold text-signal">
              <span aria-hidden>▲</span> {outlier}× snittet
            </span>
          </div>
        )}

        <div className="mt-auto grid grid-cols-4 gap-2 border-t border-line pt-3">
          <Metric value={formatCompact(v.views)} label="Visn." />
          <Metric value={formatCompact(v.likes)} label="Likes" />
          <Metric value={formatCompact(v.comments)} label="Komm." />
          <Metric value={formatCompact(v.shares)} label="Del." />
        </div>
      </div>
    </article>
  );
}

// The poster image + a soft bottom wash so the white views label stays legible. Shared by the linked
// and unlinked cases.
function PosterInner({ v, thumb }: { v: VideoResult; thumb?: string }) {
  return (
    <>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Play size={24} className="fill-ink-faint/40 text-ink-faint/40" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[rgba(28,24,18,0.5)] to-transparent" />

      <span className="pointer-events-none absolute bottom-[15px] right-3 font-mono text-[10px] tabular-nums text-white/90">
        {formatCompact(v.views)} visn.
      </span>
    </>
  );
}
