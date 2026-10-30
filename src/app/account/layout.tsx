import type { Metadata } from "next";
import { AccountNav } from "@/components/account/account-nav";
import { StoreShell } from "@/components/layout/store-shell";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The account area depends on the signed-in user for every request, so it is not prerendered:
// the guard below runs before anything is sent, which also gives visitors a real redirect.
export const instant = false;

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await requireUser();
  return (
    <StoreShell>
      <div className="mx-auto w-full max-w-page px-margin py-8 lg:px-margin-desktop">
        <div className="mb-6">
          <h1 className="text-headline-lg-mobile text-brand-deep lg:text-headline-lg">My account</h1>
          <p className="text-body-md text-muted-foreground">Signed in as {user.email ?? user.fullName ?? "your account"}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <AccountNav isStaff={user.role !== null} />
          <div className="min-w-0 pb-16 lg:pb-0">{children}</div>
        </div>
      </div>
    </StoreShell>
  );
}
