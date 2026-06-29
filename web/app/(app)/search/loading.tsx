export default function SearchLoading() {
  return (
    <>
      {/* Control bar skeleton */}
      <div className="sticky top-[57px] z-30 border-b border-line bg-background/90 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl space-y-3 px-5 py-4 sm:px-8">
          <div className="h-9 w-full animate-pulse rounded-xl bg-muted-surface" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-56 animate-pulse rounded-xl bg-muted-surface" />
            <div className="ml-auto h-8 w-24 animate-pulse rounded-lg bg-muted-surface" />
          </div>
          <div className="flex gap-2">
            {[80, 100, 72, 88, 96, 76].map((w, i) => (
              <div
                key={i}
                className="h-7 animate-pulse rounded-full bg-muted-surface"
                style={{ width: `${w}px` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Results grid skeleton */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
        <div className="mb-6 h-9 w-48 animate-pulse rounded-lg bg-muted-surface" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="aspect-[9/16] animate-pulse rounded-2xl bg-muted-surface" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted-surface" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted-surface" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
