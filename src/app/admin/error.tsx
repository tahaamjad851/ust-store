"use client";

import { Button } from "@/components/ui/button";

// Shown when an admin page cannot load (for example the database is unreachable). The header and menu stay.
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-border bg-card p-6">
      <h1 className="text-headline-md">This page could not load</h1>
      <p className="mt-1 text-body-md text-muted-foreground">Check your connection and try again. Nothing was changed.</p>
      <Button type="button" className="mt-4 h-11" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
