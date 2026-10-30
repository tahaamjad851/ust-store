import type { Metadata } from "next";
import { ProfileForm } from "@/components/account/profile-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your details" };

// Blocking, like the layout: the page reads the signed-in user's data for every request. (A loading.tsx
// would stream the page instead, which sends status 200 before notFound() is decided.)
export const instant = false;

export default async function AccountPage() {
  // Checked here as well as in the layout: layouts do not re-render on client navigation.
  const user = await requireUser({ next: "/account" });
  return (
    <section aria-labelledby="profile-heading" className="rounded-lg border border-border bg-card p-4 lg:p-6">
      <h2 id="profile-heading" className="text-headline-sm">
        Your details
      </h2>
      <p className="mb-4 text-body-md text-muted-foreground">We use these to fill in your orders faster.</p>
      <ProfileForm
        email={user.email}
        defaults={{ full_name: user.fullName ?? "", phone: user.phone ?? "", company_name: user.companyName ?? "" }}
      />
    </section>
  );
}
