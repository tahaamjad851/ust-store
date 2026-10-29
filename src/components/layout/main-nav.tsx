"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

/** Desktop navigation row. On mobile the category drawer and tab bar take over. */
export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden border-b border-border bg-surface-low lg:block">
      <ul className="mx-auto flex max-w-page items-center gap-1 overflow-x-auto px-margin-desktop py-1.5">
        {items.map((item) => {
          const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg px-3 text-label-md whitespace-nowrap",
                  current ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-surface-high",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
