"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Previous / next for a list that is paged in the browser. */
export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  noun = "items",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-body-md text-muted-foreground">
      <p aria-live="polite">
        {total === 0 ? `No ${noun}` : `Showing ${first}–${last} of ${total} ${noun}`}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Button>
          <span className="tabular">
            Page {page} of {pageCount}
          </span>
          <Button type="button" variant="outline" className="h-11" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
