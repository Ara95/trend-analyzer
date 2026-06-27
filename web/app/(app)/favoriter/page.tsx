import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { listCollections, listItems } from "@/lib/collections";
import { VideoCard } from "@/components/video-card";

export const dynamic = "force-dynamic";

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
            className={
              active
                ? "inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground"
                : "inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
            }
          >
            {c.name}
            <span className={active ? "font-mono text-xs text-primary-foreground/70" : "font-mono text-xs text-ink-faint"}>
              {c.itemCount}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-muted-surface/40 px-6 py-16 text-center">
      <Heart size={28} className="mx-auto text-ink-faint" />
      <p className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">Inga sparade videor</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{message}</p>
      <Link
        href="/search"
        className="mt-6 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        Sök inspiration
      </Link>
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
        <h1 className="mb-6 font-display text-4xl font-bold tracking-tight text-ink">Favoriter</h1>
        <EmptyState message="Du har inga samlingar ännu. Sök ett ämne och spara videor med hjärtat för att skapa din första samling." />
      </main>
    );
  }

  // Default to the first collection when none is selected (or the param points at a deleted one).
  const active = collections.find((col) => col.id === c) ?? collections[0];
  const items = await listItems(active.id);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <h1 className="mb-6 font-display text-4xl font-bold tracking-tight text-ink">Favoriter</h1>

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
