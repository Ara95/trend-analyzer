import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { listCollections, listItems } from "@/lib/collections";
import { VideoCard } from "@/components/video-card";
import { NewCollectionPill } from "@/components/new-collection-pill";

export const metadata: Metadata = {
  title: "Favoriter — Orbit",
};

function CollectionTabs({
  collections,
  activeId,
}: {
  collections: { id: string; name: string; itemCount: number }[];
  activeId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {collections.map((c) => {
        const active = c.id === activeId;
        return (
          <Link
            key={c.id}
            href={`/favoriter?c=${c.id}`}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                : "inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
            }
          >
            {c.name}
            <span
              className={
                active
                  ? "font-mono text-[11px] text-primary-foreground/60"
                  : "font-mono text-[11px] text-ink-faint"
              }
            >
              {c.itemCount}
            </span>
          </Link>
        );
      })}
      <NewCollectionPill />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d5cfc2] bg-[#fbfaf6] px-6 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-[14px] bg-muted">
        <Heart size={22} className="text-ink-faint" />
      </div>
      <p className="mt-4 font-display text-2xl font-bold tracking-[-0.02em] text-ink">
        Inga sparade videor
      </p>
      <p className="mx-auto mt-2.5 max-w-md text-sm text-muted-foreground">{message}</p>
      <Link
        href="/search"
        className="mt-6 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        Sök inspiration
      </Link>
    </div>
  );
}

function PageHeader({ savedTotal }: { savedTotal?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[32px] font-bold tracking-[-0.03em] text-ink">Favoriter</h1>
        <p className="mt-1.5 text-sm text-ink-faint">
          Sparade videor, ordnade i samlingar — din egen inspirationsbank.
        </p>
      </div>
      {savedTotal != null && (
        <span className="font-mono text-xs text-ink-faint">{savedTotal} sparade</span>
      )}
    </div>
  );
}

export default async function FavoriterPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const collections = await listCollections();

  if (collections.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
        <PageHeader />
        <EmptyState message="Du har inga samlingar ännu. Sök ett ämne och spara videor med hjärtat för att skapa din första samling." />
      </main>
    );
  }

  // Default to the first collection when none is selected (or the param points at a deleted one).
  const active = collections.find((col) => col.id === c) ?? collections[0];
  const items = await listItems(active.id);
  const savedTotal = collections.reduce((sum, col) => sum + col.itemCount, 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <PageHeader savedTotal={savedTotal} />

      <div className="mb-8">
        <CollectionTabs collections={collections} activeId={active.id} />
      </div>

      {items.length === 0 ? (
        <EmptyState message={`Samlingen "${active.name}" är tom. Spara videor från sökresultaten för att fylla den.`} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((v, i) => (
            <VideoCard key={v.id} v={v} rank={i + 1} delay={Math.min(i * 30, 300)} saved />
          ))}
        </div>
      )}
    </main>
  );
}
