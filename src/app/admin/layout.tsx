import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, Store, Tractor } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/customers/auth-actions";
import { requireStaff } from "@/lib/auth/session";
import { getStoreSettings } from "@/services/catalog";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false },
};

// Never prerendered: staff access is decided per request, before anything is sent. Customers get a
// real 403, visitors a redirect to /login. Every admin page and action checks again on its own.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [user, settings] = await Promise.all([requireStaff({ next: "/admin" }), getStoreSettings()]);
  const roleLabel = user.role === "admin" ? "Admin" : "Staff";
  return (
    <div className="flex min-h-dvh flex-col bg-surface-low print:bg-white">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 print:hidden"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card print:hidden">
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-3 px-margin py-3 lg:px-margin-desktop">
          <Link href="/admin" className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Tractor className="size-6" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-label-lg text-brand-deep">{settings.business_name}</span>
              <span className="block text-label-sm uppercase text-muted-foreground">Admin panel</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex min-w-0 items-center gap-2 text-body-md">
              <span className="min-w-0 break-all font-medium" data-testid="admin-user-name">
                {user.fullName ?? user.email ?? "Signed in"}
              </span>
              <Badge variant="outline" data-testid="admin-user-role">
                {roleLabel}
              </Badge>
            </p>
            <Button asChild variant="ghost" className="h-11">
              <Link href="/">
                <Store className="size-4" aria-hidden="true" />
                View shop
              </Link>
            </Button>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" className="h-11">
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <AdminNav isAdmin={user.role === "admin"} />
      <main id="main" className="mx-auto w-full max-w-page flex-1 space-y-6 px-margin py-6 lg:px-margin-desktop lg:py-8 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
