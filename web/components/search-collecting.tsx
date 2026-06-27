"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shown while the engine worker is scraping a freshly-searched term. Polls the route (router.refresh
 * re-runs the Server Component, which re-checks status and re-queries the index) until results arrive
 * and the parent stops rendering this component. Two presentations: a full panel when there are no
 * results yet (cold term), a slim inline pill when stale results are already showing (revalidating).
 */
export function SearchCollecting({ hasResults }: { hasResults: boolean }) {
  const router = useRouter();
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => {
      setSecs(Math.floor((Date.now() - started) / 1000));
      router.refresh();
    }, 4000);
    // Give up polling after 3 minutes (the worker may be down). The page still shows whatever's indexed.
    const stop = setTimeout(() => clearInterval(tick), 180_000);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [router]);

  if (hasResults) {
    return (
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-signal-soft px-3 py-1.5 text-xs text-ink-dim">
        <Spinner />
        Uppdaterar med färska trender…
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-line px-6 py-16 text-center"
      style={{
        background: "radial-gradient(120% 100% at 50% 0%, #fbf2eb, #fcfaf7 70%)",
      }}
    >
      <div className="mx-auto flex size-10 items-center justify-center">
        <Spinner large />
      </div>
      <p className="mt-4 font-display text-[22px] font-bold tracking-tight text-ink">
        Samlar in färska trender…
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Första gången någon söker på det här hämtar vi de mest framgångsrika videorna live. Det tar
        oftast 30 sekunder till någon minut{secs > 5 ? ` · ${secs}s` : ""}.
      </p>
    </div>
  );
}

function Spinner({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-signal/30 border-t-signal ${
        large ? "size-7 border-[3px]" : "size-3.5 border-2"
      }`}
      aria-hidden
    />
  );
}
