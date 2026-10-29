/** Fallback shell while a route's URL data (params / searchParams) resolves. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-page space-y-6 px-margin py-6 lg:px-margin-desktop" aria-busy="true">
      <div className="h-4 w-48 rounded-sm bg-surface-low" />
      <div className="h-10 w-2/3 rounded-lg bg-surface-low" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="aspect-[3/4] rounded-lg bg-surface-low" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
