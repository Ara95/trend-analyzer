"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createCollection } from "@/app/actions/collections";

/**
 * Dashed "+ Ny samling" pill in the favoriter tab row. Click expands an inline input; submitting
 * creates the collection (server action, RLS-scoped) and navigates to it. Keeps the favorites page a
 * server component — only this small affordance is client-side.
 */
export function NewCollectionPill() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await createCollection(trimmed);
      if (!res.ok || !res.data) {
        setError(res.ok ? "Kunde inte skapa samlingen." : res.error);
        return;
      }
      setOpen(false);
      setName("");
      router.push(`/favoriter?c=${res.data.id}`);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-dashed border-[#d5cfc2] px-4 py-2 text-sm text-ink-faint transition-colors hover:border-ink/25 hover:text-ink"
      >
        <Plus size={15} /> Ny samling
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-input bg-card py-1 pl-3.5 pr-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
            setError(null);
          }
        }}
        placeholder="Namn på samling…"
        maxLength={80}
        aria-label="Namn på ny samling"
        aria-invalid={error ? true : undefined}
        className="w-36 min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim()}
        aria-label="Skapa samling"
        className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-40"
      >
        <Plus size={15} />
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
          setError(null);
        }}
        aria-label="Avbryt"
        className="inline-flex size-7 items-center justify-center rounded-full text-ink-faint transition-colors hover:text-ink"
      >
        <X size={15} />
      </button>
      {error && <span className="px-1 text-xs text-fall">{error}</span>}
    </span>
  );
}
