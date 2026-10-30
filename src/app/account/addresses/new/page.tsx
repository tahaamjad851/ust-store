import type { Metadata } from "next";
import { AddressForm } from "@/components/account/address-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Add an address" };

// Blocking, like the layout: the page reads the signed-in user's data for every request. (A loading.tsx
// would stream the page instead, which sends status 200 before notFound() is decided.)
export const instant = false;

export default async function NewAddressPage() {
  const user = await requireUser({ next: "/account/addresses/new" });
  return (
    <section aria-labelledby="new-address-heading" className="rounded-lg border border-border bg-card p-4 lg:p-6">
      <h2 id="new-address-heading" className="mb-4 text-headline-sm">
        Add an address
      </h2>
      <AddressForm
        defaults={{
          label: "",
          full_name: user.fullName ?? "",
          phone: user.phone ?? "",
          line1: "",
          street: "",
          area: "",
          city: "",
          province: "Punjab",
          postal_code: "",
          instructions: "",
          is_default: false,
        }}
      />
    </section>
  );
}
