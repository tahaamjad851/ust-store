"use client";

// Desktop navigation row. Items with a `menu` get a mega-menu (desktop homepage design):
// it opens on hover, or from the keyboard via the adjacent disclosure button; Escape closes it.
// On mobile the category drawer and tab bar take over.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryIcon as IconName } from "@/types/catalog";
import { CategoryIcon } from "./category-icon";

export type MegaMenu = {
  title: string;
  groups: { href: string; label: string; description: string | null; icon: IconName }[];
  quickLinks: { title: string; links: { href: string; label: string }[] };
  allLink: { href: string; label: string };
};

export type NavItem = { href: string; label: string; menu?: MegaMenu };

const itemClass = "inline-flex h-11 items-center rounded-lg px-3 text-label-md whitespace-nowrap";

export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="relative hidden border-b border-border bg-surface-low lg:block">
      <ul className="mx-auto flex max-w-page items-center gap-1 px-margin-desktop py-1.5">
        {items.map((item) => {
          const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return item.menu ? (
            <MegaMenuItem key={item.href} item={item} menu={item.menu} current={current} pathname={pathname} />
          ) : (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(itemClass, current ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-surface-high")}
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

function MegaMenuItem({ item, menu, current, pathname }: { item: NavItem; menu: MegaMenu; current: boolean; pathname: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  // Short grace period so moving the pointer from the nav row into the panel doesn't close it.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  // Close on navigation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => cancelClose, []);

  return (
    <li
      className="group/mega flex items-center"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
      onBlur={(e) => {
        // Close when keyboard focus leaves the item and its panel.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Link
        href={item.href}
        aria-current={current ? "page" : undefined}
        className={cn(
          itemClass,
          "rounded-r-none pr-1",
          current ? "bg-primary text-primary-foreground" : "text-foreground group-hover/mega:bg-surface-high",
        )}
      >
        {item.label}
      </Link>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${item.label} menu`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-11 w-8 items-center justify-center rounded-r-lg",
          current ? "bg-primary text-primary-foreground" : "text-foreground group-hover/mega:bg-surface-high",
        )}
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full z-30 border-b border-border bg-card shadow-float"
      >
        <div className="mx-auto max-w-page px-margin-desktop py-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-sans text-label-md uppercase tracking-wide text-muted-foreground">{menu.title}</p>
            <Link href={menu.allLink.href} className="inline-flex min-h-11 items-center gap-1 text-label-lg text-primary hover:underline">
              {menu.allLink.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="grid grid-cols-3 gap-2 xl:grid-cols-4">
            {menu.groups.map((g) => (
              <li key={g.href}>
                <Link href={g.href} className="flex h-full gap-3 rounded-lg bg-surface-low p-3 hover:bg-surface-high">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-primary">
                    <CategoryIcon name={g.icon} className="size-5" />
                  </span>
                  <span>
                    <span className="block text-label-lg">{g.label}</span>
                    {g.description && <span className="mt-0.5 line-clamp-2 block text-body-sm text-muted-foreground">{g.description}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="mr-1 text-label-md text-muted-foreground">{menu.quickLinks.title}</span>
            {menu.quickLinks.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-label-md hover:border-primary"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
