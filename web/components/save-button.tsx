"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Heart, Plus, Check, Loader2 } from "lucide-react";
import type { SaveItemInput } from "@/lib/collections";
import {
  getCollectionsForVideo,
  createCollection,
  saveItem,
  removeItem,
} from "@/app/actions/collections";

interface Row {
  id: string;
  name: string;
  contains: boolean;
}

/**
 * Heart + "spara i ▸" popover on each video card. Lives inside the card but OUTSIDE its link, so a
 * click here never navigates. Collections load lazily the first time the popover opens
 * (getCollectionsForVideo, which also seeds a default "Favoriter"). Toggling a row saves/removes the
 * denormalized snapshot via server actions; the heart fills while the video is in any collection.
 */
export function SaveButton({
  item,
  initialSaved,
}: {
  item: SaveItemInput;
  initialSaved: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState(initialSaved);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const anySaved = rows ? rows.some((r) => r.contains) : saved;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && rows === null) {
      const data = await getCollectionsForVideo(item.platform, item.platformVideoId);
      setRows(data);
      setSaved(data.some((r) => r.contains));
    }
  }

  function toggleCollection(row: Row) {
    setError(null);
    const willContain = !row.contains;
    // Optimistic.
    setRows((prev) =>
      (prev ?? []).map((r) => (r.id === row.id ? { ...r, contains: willContain } : r)),
    );
    startTransition(async () => {
      const res = willContain
        ? await saveItem(row.id, item)
        : await removeItem(row.id, item.platform, item.platformVideoId);
      if (!res.ok) {
        setError(res.error);
        // Revert.
        setRows((prev) =>
          (prev ?? []).map((r) => (r.id === row.id ? { ...r, contains: row.contains } : r)),
        );
      }
      // The heart fill (anySaved) derives directly from `rows`, so it updates with the optimistic set.
    });
  }

  function onCreate() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await createCollection(name);
      if (!res.ok || !res.data) {
        setError(res.ok ? "Kunde inte skapa samlingen." : res.error);
        return;
      }
      // New collection — add it and immediately save this video into it.
      const created = res.data;
      setRows((prev) => [{ id: created.id, name: created.name, contains: true }, ...(prev ?? [])]);
      setNewName("");
      const save = await saveItem(created.id, item);
      if (!save.ok) setError(save.error);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={anySaved ? "Hantera sparning" : "Spara"}
        aria-expanded={open}
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[10px] bg-white/95 text-ink shadow-[0_1px_5px_rgba(0,0,0,0.12)] backdrop-blur-[2px] transition-[colors,transform] duration-150 hover:scale-110 hover:bg-white hover:text-signal active:scale-95"
      >
        <Heart
          size={15}
          className={anySaved ? "fill-signal text-signal" : "text-ink-dim"}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-56 rounded-xl border border-line bg-popover p-1.5 text-popover-foreground shadow-lg">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Spara i</p>

          <div className="max-h-52 overflow-y-auto">
            {rows === null ? (
              <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Laddar…
              </div>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => toggleCollection(row)}
                  disabled={pending}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <span className="truncate">{row.name}</span>
                  {row.contains && <Check size={15} className="shrink-0 text-signal" />}
                </button>
              ))
            )}
          </div>

          <div className="mt-1 border-t border-line pt-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCreate();
                  }
                }}
                placeholder="Ny samling…"
                maxLength={80}
                className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1 text-sm text-ink outline-none focus:border-ink/30"
              />
              <button
                type="button"
                onClick={onCreate}
                disabled={pending || !newName.trim()}
                aria-label="Skapa samling"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-40"
              >
                <Plus size={15} />
              </button>
            </div>
            {error && <p className="px-2 pt-1.5 text-xs text-destructive">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
