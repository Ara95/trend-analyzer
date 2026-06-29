"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { SEARCH_LANGS, SEARCH_PLATFORMS } from "@/lib/constants";
import { buildSearchHref } from "@/lib/search-query";
import type { VideoSearchQuery } from "@/lib/types";

type Field = "platform" | "language";

interface Group {
  field: Field;
  label: string;
  options: { value: string; label: string }[];
  /** The query value treated as "no filter" — omitted from the active-chip row. */
  default: string;
}

// Sort and period are first-class controls (segmented switcher + sort pills) in SearchControls.
// This dropdown holds only the secondary filters: platform and language.
const GROUPS: Group[] = [
  { field: "platform", label: "Plattform", options: SEARCH_PLATFORMS, default: "all" },
  { field: "language", label: "Språk", options: SEARCH_LANGS, default: "all" },
];

function labelFor(group: Group, value: string): string {
  return group.options.find((o) => o.value === value)?.label ?? value;
}

/**
 * Command-style filter for the results view: a single "Filter" button opens a searchable dropdown
 * with grouped options (platform / language); the active non-default filters show as removable chips
 * beside the button. Selecting an option navigates via `buildSearchHref` (the established query-param
 * pattern), so links stay shareable. Sort and period live outside this dropdown — see SearchControls.
 */
export function SearchFilters({ query }: { query: VideoSearchQuery }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const [activePlatform, setActivePlatform] = useOptimistic<string, string>(
    query.platform,
    (_, next) => next,
  );
  const [activeLanguage, setActiveLanguage] = useOptimistic<string, string>(
    query.language,
    (_, next) => next,
  );

  const optimisticQuery = { ...query, platform: activePlatform, language: activeLanguage };

  const active = useMemo(
    () => GROUPS.filter((g) => String(optimisticQuery[g.field]) !== g.default),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlatform, activeLanguage],
  );

  function go(field: Field, value: string) {
    startTransition(() => {
      if (field === "platform") setActivePlatform(value);
      if (field === "language") setActiveLanguage(value);
      router.push(buildSearchHref(query, { [field]: value } as Partial<VideoSearchQuery>), {
        scroll: false,
      });
    });
    setOpen(false);
    setText("");
  }

  const needle = text.trim().toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-[10px] border border-input bg-card px-3 py-1.5 text-sm text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
        >
          <SlidersHorizontal size={14} />
          Filter
          {active.length > 0 && (
            <span className="inline-flex min-w-[1.125rem] items-center justify-center rounded-md bg-primary px-1 font-mono text-[10px] font-semibold text-primary-foreground">
              {active.length}
            </span>
          )}
        </button>

        {open && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-popover shadow-[0_24px_54px_-22px_rgba(60,45,30,0.35)]">
              <div className="border-b border-line p-2">
                <input
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Sök filter…"
                  className="w-full rounded-lg bg-muted-surface px-3 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
              <div className="max-h-80 overflow-y-auto py-1">
                {GROUPS.map((g) => {
                  const opts = g.options.filter(
                    (o) => !needle || o.label.toLowerCase().includes(needle),
                  );
                  if (opts.length === 0) return null;
                  return (
                    <div key={g.field} className="px-1 py-1">
                      <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                        {g.label}
                      </p>
                      {opts.map((o) => {
                        const selected = String(optimisticQuery[g.field]) === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => go(g.field, o.value)}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm text-ink-dim transition-colors hover:bg-muted hover:text-ink"
                          >
                            {o.label}
                            {selected && <Check size={15} className="text-signal" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {active.map((g) => (
        <button
          key={g.field}
          type="button"
          onClick={() => go(g.field, g.default)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
        >
          {labelFor(g, String(optimisticQuery[g.field]))}
          <X size={12} />
        </button>
      ))}
    </div>
  );
}
