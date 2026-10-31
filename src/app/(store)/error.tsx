"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown when the catalog cannot be read (for example the database is unreachable). The cause is in the server log. */
export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-page px-margin py-16 text-center lg:px-margin-desktop">
      <TriangleAlert className="mx-auto size-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 text-headline-lg-mobile lg:text-headline-lg">We couldn&apos;t load this page</h1>
      <p className="mx-auto mt-2 max-w-md text-body-lg text-muted-foreground">
        Something went wrong on our side. Please try again in a moment.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button type="button" className="h-11" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline" className="h-11 border-input">
          <Link href="/">Go to home page</Link>
        </Button>
      </div>
    </div>
  );
}
