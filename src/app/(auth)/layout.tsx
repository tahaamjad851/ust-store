import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Tractor } from "lucide-react";
import { getStoreSettings } from "@/services/catalog";

// Sign-in pages are never worth indexing.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const settings = await getStoreSettings();
  return (
    <div className="flex min-h-dvh flex-col bg-surface-low">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-margin py-3 lg:px-margin-desktop">
          <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Tractor className="size-6" aria-hidden="true" />
            </span>
            <span className="truncate font-display text-label-lg text-brand-deep sm:text-headline-sm">
              {settings.business_name}
            </span>
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-label-lg hover:bg-surface-container">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to shop
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1 px-margin py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
