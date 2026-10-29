"use client";

import { useId, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapsible on phones, always open from lg up. The filters form is rendered once. */
export function FiltersPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-2 px-4 text-label-lg lg:hidden"
      >
        <SlidersHorizontal className="size-5" aria-hidden="true" />
        <span className="flex-1 text-left">Filters{activeCount > 0 && ` (${activeCount})`}</span>
        <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id={id} className={cn("border-t border-border p-4 lg:block lg:border-t-0", !open && "hidden")}>
        {children}
      </div>
    </div>
  );
}
