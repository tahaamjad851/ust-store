import Link from "next/link";
import { ChevronRight, House } from "lucide-react";

export type Crumb = { label: string; href?: string };

const crumbLink = "inline-flex min-h-11 items-center gap-1 whitespace-nowrap hover:text-foreground hover:underline";

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-body-sm">
      <ol className="flex min-w-0 items-center gap-1 text-muted-foreground">
        <li className="shrink-0">
          <Link href="/" className={crumbLink}>
            <House className="size-3.5" aria-hidden="true" />
            Home
          </Link>
        </li>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className={last ? "flex min-w-0 items-center gap-1" : "flex shrink-0 items-center gap-1"}>
              <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
              {item.href && !last ? (
                <Link href={item.href} className={crumbLink}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate font-semibold text-foreground">
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
