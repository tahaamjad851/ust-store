// Shown while an admin page checks the session. The header around it is already on screen.
export default function AdminLoading() {
  return (
    <div role="status" className="rounded-lg border border-border bg-card p-6">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
        <div className="h-7 w-56 max-w-full rounded bg-surface-low" />
        <div className="h-4 w-full max-w-xl rounded bg-surface-low" />
        <div className="h-4 w-2/3 max-w-md rounded bg-surface-low" />
      </div>
    </div>
  );
}
