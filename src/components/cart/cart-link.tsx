"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-provider";

/** Cart link with item count. "tab" matches the labelled items in the mobile tab bar. */
export function CartLink({ variant = "header", className }: { variant?: "header" | "tab"; className?: string }) {
  const { count, hydrated } = useCart();
  const label = hydrated ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart";
  const badge = hydrated && count > 0 && (
    <span
      aria-hidden="true"
      className="absolute -top-1 -right-2 flex min-w-5 items-center justify-center rounded-full bg-warning px-1 text-label-sm text-primary-foreground tabular"
    >
      {count > 99 ? "99+" : count}
    </span>
  );

  if (variant === "tab") {
    return (
      <Link href="/cart" aria-label={label} className={className}>
        <span className="relative">
          <ShoppingCart className="size-5" aria-hidden="true" />
          {badge}
        </span>
        <span aria-hidden="true">Cart</span>
      </Link>
    );
  }

  return (
    <Link
      href="/cart"
      aria-label={label}
      className={cn(
        "relative inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-low md:w-auto md:gap-2 md:border md:border-border md:px-3",
        className,
      )}
    >
      <ShoppingCart className="size-5" aria-hidden="true" />
      <span className="hidden text-label-lg md:inline">Cart</span>
      {badge}
    </Link>
  );
}
