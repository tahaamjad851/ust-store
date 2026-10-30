// Shown while an account page checks the session and loads the customer's data. The layout around it
// (heading, navigation) is already on screen.
export default function AccountLoading() {
  return (
    <div role="status" className="rounded-lg border border-border bg-card p-4 lg:p-6">
      <span className="sr-only">Loading your account…</span>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-6 w-40 rounded bg-surface-low" />
        <div className="h-4 w-64 max-w-full rounded bg-surface-low" />
        <div className="h-11 rounded-lg bg-surface-low" />
        <div className="h-11 rounded-lg bg-surface-low" />
        <div className="h-11 w-36 rounded-lg bg-surface-low" />
      </div>
    </div>
  );
}
