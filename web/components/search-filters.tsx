"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, SlidersHorizontal, X } from "lucide-react";
import {
  SEARCH_LANGS,
  SEARCH_PERIODS,
  SEARCH_PLATFORMS,
  SEARCH_SORTS,
} from "@/lib/constants";
import { buildSearchHref } from "@/lib/search-query";
import type { VideoSearchQuery } from "@/lib/types";

type Field = "sort" | "platform" | "period" | "language";

interface Group {
  field: Field;
  label: string;
  options: { value: string; label: string }[];
  /** The query value treated as "no filter" — omitted from the active-chip row. */
  default: string;
}

const GROUPS: Group[] = [
  { field: "sort", label: "Sortering", options: SEARCH_SORTS, default: "trend" },
  { field: "platform", label: "Plattform", options: SEARCH_PLATFORMS, default: "all" },
  { field: "period", label: "Period", options: SEARCH_PERIODS, default: "all" },
  { field: "language", label: "Språk", options: SEARCH_LANGS, default: "all" },
];

function labelFor(group: Group, value: string): string {
  return group.options.find((o) => o.value === value)?.label ?? value;
}

/**
 * Command-style filter for the results view: a single "Filter" button opens a searchable dropdown
 * with grouped options (sort / platform / period / language); the active non-default filters show as
 * removable chips beside the button. Selecting an option navigates via `buildSearchHref` (the
 * established query-param pattern), so links stay shareable.
 */
export function SearchFilters({ query }: { query: VideoSearchQuery }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const active = useMemo(
    () => GROUPS.filter((g) => String(query[g.field]) !== g.default),
    [query],
  );

  function go(field: Field, value: string) {
    router.push(buildSearchHref(query, { [field]: value } as Partial<VideoSearchQuery>), {
      scroll: false,
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
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
        >
          <SlidersHorizontal size={14} />
          Filter
          {active.length > 0 && (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-signal px-1 font-mono text-[10px] font-semibold text-white">
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
                        const selected = String(query[g.field]) === o.value;
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
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-signal-soft px-3 py-1 text-xs text-signal transition-colors hover:border-signal/30"
        >
          {labelFor(g, String(query[g.field]))}
          <X size={12} />
        </button>
      ))}
    </div>
  );
}
