"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { logoutAction } from "@/features/customers/auth-actions";
import { cn } from "@/lib/utils";

const itemClass =
  "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-label-lg outline-none hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-ring";

export function AccountNav({ isStaff }: { isStaff: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/account", label: "Your details", icon: UserRound, active: pathname === "/account" },
    { href: "/account/addresses", label: "Addresses", icon: MapPin, active: pathname.startsWith("/account/addresses") },
  ];

  return (
    <nav aria-label="Account" className="lg:sticky lg:top-4 lg:self-start">
      <ul className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 lg:flex-col lg:flex-nowrap">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(itemClass, active && "bg-brand-tint text-brand-tint-foreground")}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
        {isStaff && (
          <li>
            <Link href="/admin" prefetch={false} className={itemClass}>
              <ShieldCheck className="size-5" aria-hidden="true" />
              Admin panel
            </Link>
          </li>
        )}
        <li className="lg:mt-1 lg:border-t lg:border-border lg:pt-1">
          <form action={logoutAction}>
            <button type="submit" className={cn(itemClass, "w-full")}>
              <LogOut className="size-5" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
