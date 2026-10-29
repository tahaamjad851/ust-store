import Link from "next/link";
import { ChevronRight, House } from "lucide-react";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-body-sm">
      <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <li>
          <Link href="/" className="inline-flex min-h-6 items-center gap-1 hover:text-foreground hover:underline">
            <House className="size-3.5" aria-hidden="true" />
            Home
          </Link>
        </li>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5" aria-hidden="true" />
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="font-semibold text-foreground">
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
