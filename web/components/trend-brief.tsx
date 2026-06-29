import { summarizeSearch } from "@/lib/trend-brief";
import type { VideoResult } from "@/lib/types";
import { TrendingUp, TrendingDown, Info } from "lucide-react";

function DirectionIcon({ direction }: { direction?: "up" | "down" }) {
  if (direction === "up") return <TrendingUp className="inline-block shrink-0" size={20} strokeWidth={2.5} />;
  if (direction === "down") return <TrendingDown className="inline-block shrink-0" size={20} strokeWidth={2.5} />;
  return null;
}

const TOOLTIPS: Record<string, string> = {
  "Momentum": "Jämför engagemang på nya videor (≤7 d) mot äldre. Uppåt betyder att trenden accelererar.",
  "Median tillväxt": "Median för uppmätt ökning i visningar sedan senaste mätningen.",
  "Breakouts": "Videor med minst 5× snittet i visningar — tydliga virala utbrytare.",
  "Topplattform": "Plattformen med flest videor i resultatet just nu.",
  "Bästa publiceringstid": "Timfönstret då publiceringar i resultatet fick flest visningar totalt.",
};

function StatLabel({ label }: { label: string }) {
  const tip = TOOLTIPS[label];
  return (
    <span className="group/tip relative inline-flex items-center gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      {tip && <Info size={10} className="shrink-0 text-ink-faint opacity-70" />}
      {tip && (
        <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-48 rounded-lg bg-[#1e1a14] px-3 py-2 text-[11px] leading-snug text-[#f5f0e8] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
          {tip}
        </span>
      )}
    </span>
  );
}

/**
 * Virlo-inspired "intelligence report" shown above the results grid. A calm, datadriven read on what
 * drives the current search — averaged Trend Score, breakouts, platform mix, best posting window,
 * a 14-day posting-cadence graph — plus caption-derived hooks. Everything comes from
 * `summarizeSearch`, which only surfaces figures the data actually supports; tiles with no data
 * simply don't render, and the momentum graph is omitted unless a real series exists.
 */
export function TrendBrief({ q, items }: { q: string; items: VideoResult[] }) {
  const brief = summarizeSearch(q, items);
  if (brief.stats.length === 0) return null;

  // The first stat is always Momentum — render it as a featured tile (with the area graph when we
  // have a real series); the rest follow as plain tiles.
  const [momentum, ...rest] = brief.stats;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(40,33,24,0.04)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-4 pt-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            Trendöversikt
          </p>
          <h2 className="mt-1.5 font-display text-xl font-bold tracking-[-0.02em] text-ink">
            Vad som driver <span className="text-signal">{q}</span> just nu
          </h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rise-soft px-3 py-1.5 font-mono text-[11px] text-[#3f6037]">
          <span className="size-[7px] rounded-full bg-rise" aria-hidden />
          Uppdaterad nyss
        </span>
      </div>

      {/* Stat strip — hairline dividers between tiles. */}
      <div className="flex flex-wrap border-t border-[#f0ece4]">
        {/* Featured momentum tile */}
        <div className="min-w-[15rem] flex-[1.3] border-[#f0ece4] px-5 py-4 sm:border-r">
          <StatLabel label={momentum.label} />
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div
                className={`flex items-center gap-1.5 text-2xl font-bold leading-none tracking-[-0.02em] tabular-nums ${
                  momentum.direction === "up"
                    ? "text-rise"
                    : momentum.direction === "down"
                      ? "text-fall"
                      : momentum.accent
                        ? "text-signal"
                        : "text-ink"
                }`}
              >
                <DirectionIcon direction={momentum.direction} />
                <span className="whitespace-nowrap">{momentum.value}</span>
              </div>
              {momentum.hint && (
                <div className="mt-1.5 text-[11px] leading-tight text-ink-faint">
                  {momentum.hint}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Remaining tiles */}
        {rest.map((s) => (
          <div
            key={s.label}
            className="min-w-[8.5rem] flex-1 border-[#f0ece4] px-5 py-4 [&:not(:first-child)]:border-l"
          >
            <StatLabel label={s.label} />
            <div
              className={`mt-2 flex items-center gap-1.5 text-2xl font-bold leading-none tracking-[-0.02em] tabular-nums ${
                s.direction === "up"
                  ? "text-rise"
                  : s.direction === "down"
                    ? "text-fall"
                    : s.accent
                      ? "text-signal"
                      : "text-ink"
              }`}
            >
              <DirectionIcon direction={s.direction} />
              <span className="whitespace-nowrap">{s.value}</span>
            </div>
            {s.hint && (
              <div className="mt-1.5 text-[11px] leading-tight text-ink-faint">{s.hint}</div>
            )}
          </div>
        ))}
      </div>

      {/* Hooks */}
      {brief.hooks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#f0ece4] bg-[#fbfaf6] px-6 py-3.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
            Hooks som funkar
          </span>
          {brief.hooks.map((h) => (
            <span
              key={h.text}
              className="inline-flex items-center gap-2 rounded-[9px] border border-line bg-card px-3 py-1.5 text-[13px] text-ink"
            >
              {h.text}
              <span className="font-mono text-[11px] font-semibold text-signal">{h.count}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
