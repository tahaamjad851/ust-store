import Link from "next/link";
import Form from "next/form";
import { Menu, Phone, Search, Tractor, User } from "lucide-react";
import { CartLink } from "@/components/cart/cart-link";
import { telHref } from "@/lib/contact";
import type { StoreSettings } from "@/types/store";
import { CategoryDrawerTrigger } from "./category-drawer";

const iconLink = "size-11 items-center justify-center gap-2 rounded-lg hover:bg-surface-low lg:w-auto lg:px-3";

export function SiteHeader({ settings }: { settings: StoreSettings }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-page grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-3 px-margin py-3 lg:grid-cols-[auto_auto_1fr_auto] lg:gap-x-6 lg:px-margin-desktop">
        <CategoryDrawerTrigger
          className="inline-flex size-11 items-center justify-center gap-2 rounded-lg border border-border hover:bg-surface-low lg:w-auto lg:px-3"
        >
          <Menu className="size-5" aria-hidden="true" />
          <span className="sr-only lg:not-sr-only lg:text-label-lg">Categories</span>
        </CategoryDrawerTrigger>

        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-lg">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Tractor className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-label-lg leading-tight text-brand-deep sm:text-headline-sm">
              {settings.business_name}
            </span>
            <span className="hidden truncate text-label-sm uppercase text-muted-foreground sm:block">
              {settings.tagline}
            </span>
          </span>
        </Link>

        <Form
          action="/shop"
          role="search"
          className="col-span-3 row-start-2 lg:col-span-1 lg:col-start-3 lg:row-start-1"
        >
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="site-search"
              name="q"
              type="search"
              maxLength={100}
              placeholder="Search by part name, SKU or tractor model"
              className="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-10 text-body-lg md:text-body-md placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
        </Form>

        <nav aria-label="Shortcuts" className="flex items-center gap-1 lg:col-start-4">
          <Link href="/account" prefetch={false} className={`${iconLink} hidden sm:inline-flex`} aria-label="Account">
            <User className="size-5" aria-hidden="true" />
            <span className="hidden text-label-lg lg:inline" aria-hidden="true">
              Account
            </span>
          </Link>
          <a href={telHref(settings.phone_primary)} className={`${iconLink} inline-flex`} aria-label={`Call ${settings.phone_primary}`}>
            <Phone className="size-5" aria-hidden="true" />
            <span className="hidden text-label-lg tabular lg:inline" aria-hidden="true">
              Call us
            </span>
          </a>
          <CartLink />
        </nav>
      </div>
    </header>
  );
}
