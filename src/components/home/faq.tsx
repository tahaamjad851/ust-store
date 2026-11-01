import { ChevronDown } from "lucide-react";
import type { FaqItem } from "./faq-items";

/** Questions built from the store settings (faq-items.ts). Renders nothing when there are none. */
export function Faq({ items }: { items: FaqItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mx-auto max-w-3xl divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-label-lg [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="px-4 pb-4 text-body-md text-muted-foreground">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
