import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { getCreatorProfile } from "@/lib/creators";
import { getSavedKeys } from "@/lib/collections";
import { PLATFORM_BADGE, PLATFORM_LABELS } from "@/lib/constants";
import { formatCompact, formatPercent } from "@/lib/format";
import type { Platform } from "@/lib/types";
import { VideoCard } from "@/components/video-card";

function isPlatform(v: string): v is Platform {
  return v === "tiktok" || v === "instagram";
}

type Params = Promise<{ platform: string; handle: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle } = await params;
  const name = decodeURIComponent(handle);
  return {
    title: `@${name} — Orbit`,
    description: `Videor och trendsignaler för @${name} i Orbit.`,
  };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      <span
        className={`text-xl font-bold leading-none tracking-tight tabular-nums ${
          accent ? "text-signal" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default async function CreatorPage({ params }: { params: Params }) {
  const { platform: platformRaw, handle: handleRaw } = await params;
  if (!isPlatform(platformRaw)) notFound();
  const platform = platformRaw;
  const handle = decodeURIComponent(handleRaw);

  // Per-user saved keys make this dynamic; opt out of prerender like the search page does.
  await connection();

  const [profile, savedKeys] = await Promise.all([
    getCreatorProfile(platform, handle),
    getSavedKeys(),
  ]);

  if (!profile) notFound();

  const { stats } = profile;
  const monogram = handle.replace(/^@/, "").charAt(0).toUpperCase() || "?";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
      <Link
        href="/search"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} /> Tillbaka till sök
      </Link>

      {/* Profile header */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-card">
        <div className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
          <div
            className={`grid size-16 shrink-0 place-items-center rounded-full font-display text-2xl font-bold ${PLATFORM_BADGE[platform]}`}
            aria-hidden
          >
            {monogram}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
                @{handle.replace(/^@/, "")}
              </h1>
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] ${PLATFORM_BADGE[platform]}`}
              >
                {PLATFORM_LABELS[platform]}
              </span>
            </div>
            {profile.displayName && (
              <p className="mt-0.5 truncate text-sm text-ink-dim">{profile.displayName}</p>
            )}
            <p className="mt-1 text-xs text-ink-faint">
              {profile.followerCount != null
                ? `${formatCompact(profile.followerCount)} följare · `
                : ""}
              baserat på {stats.videoCount} {stats.videoCount === 1 ? "video" : "videor"} vi sett
            </p>
          </div>
        </div>

        {/* Stat strip — only figures the data supports (rate/time stats need ≥4 videos). */}
        <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-line px-5 py-4 sm:px-6">
          <Stat label="Videor i index" value={String(stats.videoCount)} />
          <Stat label="Totala visningar" value={formatCompact(stats.totalViews)} />
          {stats.medianViews != null && (
            <Stat label="Median visningar" value={formatCompact(stats.medianViews)} />
          )}
          {stats.avgEngagement != null && (
            <Stat label="Snitt engagemang" value={formatPercent(stats.avgEngagement)} />
          )}
          {stats.breakouts > 0 && (
            <Stat label="Breakouts" value={`${stats.breakouts} st`} accent />
          )}
          {stats.maxOutlier != null && stats.maxOutlier > 1 && (
            <Stat label="Största avvikelse" value={`${Math.round(stats.maxOutlier)}× snittet`} accent />
          )}
          {stats.bestWindow && <Stat label="Bästa tid" value={stats.bestWindow} />}
        </div>
      </section>

      <h2 className="mb-4 font-display text-lg font-bold tracking-tight text-ink">
        Videor från @{handle.replace(/^@/, "")}
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {profile.videos.map((v, i) => (
          <VideoCard
            key={v.id}
            v={v}
            rank={i + 1}
            delay={Math.min(i * 30, 300)}
            saved={savedKeys.has(`${v.platform}:${v.platformVideoId}`)}
          />
        ))}
      </div>
    </main>
  );
}
