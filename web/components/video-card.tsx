import Link from "next/link";
import { Play } from "lucide-react";
import { PLATFORM_BADGE, PLATFORM_LABELS } from "@/lib/constants";
import { formatCompact, relativeTime, truncate } from "@/lib/format";
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


function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="truncate font-mono text-xs font-medium leading-none tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-[3px] truncate font-mono text-[8px] uppercase tracking-[0.08em] text-[#b3ac9e]">
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
  // True view velocity (engine migration 0011) — only present once a video has ≥2 snapshots. Show it
  // when it's a positive, real climb.
  const velocity = v.viewsPerDay != null && v.viewsPerDay > 0 ? v.viewsPerDay : null;
  // The signal row only earns its space when there's something to say (outlier or velocity). There's
  // no per-video view *series* in the index, so the design's "tempo" sparkline can't be drawn from
  // real data — we surface the velocity chip instead and omit the line rather than fabricate one.
  const showSignalRow = (outlier != null && outlier > 1) || velocity != null;

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
    isBreakout: v.isBreakout,
    postedAt: v.postedAt,
  };

  const linkProps = v.url
    ? { href: v.url, target: "_blank", rel: "noopener noreferrer" as const }
    : undefined;

  return (
    <article
      className="fade-up group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-card [backface-visibility:hidden] [-webkit-backface-visibility:hidden] shadow-[0_1px_2px_rgba(40,33,24,0.04)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[#dcd5c8] hover:shadow-[0_22px_46px_-24px_rgba(46,37,26,0.42)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* 9:16 poster — the source frame. object-cover keeps the cover undistorted. The link covers only
          the poster image so the save button (overlaid above it) stays clickable. */}
      <div className="relative aspect-[2/3] overflow-hidden bg-muted-surface">
        {/* Link layer */}
        {linkProps ? (
          <a {...linkProps} aria-label={`Öppna på ${PLATFORM_LABELS[v.platform]}`} className="absolute inset-0 block">
            <PosterInner v={v} thumb={thumb} />
          </a>
        ) : (
          <PosterInner v={v} thumb={thumb} />
        )}

        {/* Overlays above the link */}
        <span className={`pointer-events-none absolute left-3 top-3 z-10 rounded-[7px] px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] shadow-sm ${PLATFORM_BADGE[v.platform]}`}>
          {PLATFORM_LABELS[v.platform]}
        </span>

        <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
          <SaveButton item={saveInput} initialSaved={saved} />
        </div>

      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
          <span className="font-semibold tabular-nums text-signal">{String(rank).padStart(2, "0")}</span>
          <span aria-hidden>·</span>
          {v.creatorHandle ? (
            <Link
              href={`/creator/${v.platform}/${encodeURIComponent(v.creatorHandle)}`}
              className="truncate text-ink-dim transition-colors hover:text-ink hover:underline"
            >
              @{v.creatorHandle}
            </Link>
          ) : (
            <span className="truncate text-ink-dim">{v.platformVideoId}</span>
          )}
          {v.postedAt && (
            <span className="ml-auto shrink-0 tabular-nums">{relativeTime(v.postedAt)}</span>
          )}
        </div>

        {linkProps ? (
          <a {...linkProps} className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug tracking-[-0.005em] text-ink transition-colors hover:text-ink/70">
            {headline}
          </a>
        ) : (
          <p className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug tracking-[-0.005em] text-ink">
            {headline}
          </p>
        )}

        {showSignalRow && (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {velocity != null && (
              <span
                className="inline-flex items-center gap-1 rounded-lg bg-rise-soft px-2 py-0.5 text-[11px] font-semibold text-rise"
                title="Visningar per dag (mätt mellan de två senaste mätpunkterna)"
              >
                <span aria-hidden>↗</span> +{formatCompact(velocity)}/dag
              </span>
            )}
            {outlier != null && outlier > 1 && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-signal-soft px-2 py-0.5 text-[11px] font-semibold text-signal-deep">
                <span aria-hidden>▲</span> {outlier}× snittet
              </span>
            )}
          </div>
        )}

        <div className="mt-auto grid grid-cols-3 gap-x-1.5 border-t border-[#f0ece4] pt-2.5">
          <Metric value={formatCompact(v.likes)} label="Likes" />
          <Metric value={formatCompact(v.comments)} label="Kommentarer" />
          <Metric value={formatCompact(v.shares)} label="Delningar" />
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[rgba(26,23,19,0.58)] via-[rgba(26,23,19,0.04)] to-transparent" />

      <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center rounded-[6px] bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-white/95 backdrop-blur-sm">
        {formatCompact(v.views)} visningar
      </span>
    </>
  );
}
