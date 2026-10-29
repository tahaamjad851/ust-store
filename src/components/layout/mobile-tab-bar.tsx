import Link from "next/link";
import { House, LayoutGrid, User } from "lucide-react";
import { CartLink } from "@/components/cart/cart-link";
import { CategoryDrawerTrigger } from "./category-drawer";

const tab = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-label-sm text-foreground";

/** Bottom tab bar on phones (matches the mobile home design). */
export function MobileTabBar() {
  return (
    <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card lg:hidden">
      <ul className="flex">
        <li className="flex flex-1">
          <Link href="/" className={tab}>
            <House className="size-5" aria-hidden="true" />
            Home
          </Link>
        </li>
        <li className="flex flex-1">
          <CategoryDrawerTrigger className={tab}>
            <LayoutGrid className="size-5" aria-hidden="true" />
            Categories
          </CategoryDrawerTrigger>
        </li>
        <li className="flex flex-1">
          <CartLink variant="tab" className={tab} />
        </li>
        <li className="flex flex-1">
          <Link href="/account" prefetch={false} className={tab}>
            <User className="size-5" aria-hidden="true" />
            Account
          </Link>
        </li>
      </ul>
    </nav>
  );
}
