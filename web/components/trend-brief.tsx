import { summarizeSearch } from "@/lib/trend-brief";
import type { VideoResult } from "@/lib/types";

/**
 * Virlo-inspired "intelligence report" shown above the results grid. A calm, datadriven read on what
 * drives the current search — averaged Trend Score, breakouts, platform mix, best posting window — plus
 * caption-derived hooks. Everything comes from `summarizeSearch`, which only surfaces figures the data
 * actually supports; tiles with no data simply don't render.
 */
export function TrendBrief({ q, items }: { q: string; items: VideoResult[] }) {
  const brief = summarizeSearch(q, items);
  if (brief.stats.length === 0) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            Trendöversikt
          </p>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-ink">
            Vad som driver «{q}» just nu
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-muted-surface px-2.5 py-1 text-[11px] text-ink-dim">
          <span className="size-1.5 rounded-full bg-rise" aria-hidden />
          Uppdaterad nyss
        </span>
      </div>

      {/* Stat strip — hairline dividers between tiles. */}
      <div className="mt-4 flex flex-wrap gap-y-3 px-5 pb-5">
        {brief.stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col gap-1 pr-6 ${i > 0 ? "border-l border-line pl-6" : ""}`}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              {s.label}
            </span>
            <span
              className={`text-xl font-bold leading-none tracking-tight tabular-nums ${
                s.accent ? "text-signal" : "text-ink"
              }`}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {brief.hooks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#fbfaf8] px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
            Hooks som funkar
          </span>
          {brief.hooks.map((h) => (
            <span
              key={h.text}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-ink-dim"
            >
              {h.text}
              <span className="font-mono font-semibold text-signal">{h.count}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
