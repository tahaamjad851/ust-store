"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileSpreadsheet,
  Layers,
  LayoutDashboard,
  Package,
  Settings,
  Tags,
  Tractor,
  Warehouse,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };

const ITEMS: Item[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/prices", label: "Daily prices", icon: Wallet },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/stock", label: "Stock", icon: Warehouse },
  { href: "/admin/categories", label: "Categories", icon: Layers },
  { href: "/admin/brands", label: "Brands", icon: Tags },
  { href: "/admin/tractors", label: "Tractors", icon: Tractor },
  { href: "/admin/import-export", label: "Import / export", icon: FileSpreadsheet },
  { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
];

/**
 * The admin sections. A row that scrolls sideways on a phone and wraps on a desktop. Hiding "Settings"
 * from staff is a convenience only: the page and its actions check the role on the server.
 */
export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="border-b border-border bg-card">
      <ul className="mx-auto flex max-w-page gap-1 overflow-x-auto px-margin py-2 lg:px-margin-desktop">
        {ITEMS.filter((i) => isAdmin || !i.adminOnly).map(({ href, label, icon: Icon }) => {
          const current = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-label-lg whitespace-nowrap transition-colors",
                  current ? "bg-brand-tint text-brand-tint-foreground" : "text-muted-foreground hover:bg-surface-low hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
