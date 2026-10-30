import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddressForm } from "@/components/account/address-form";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addressIdSchema } from "@/lib/validation/auth";
import { PROVINCES } from "@/lib/validation/checkout";

export const metadata: Metadata = { title: "Edit address" };

// Blocking, like the layout: the page reads the signed-in user's data for every request. (A loading.tsx
// would stream the page instead, which sends status 200 before notFound() is decided.)
export const instant = false;

export default async function EditAddressPage({ params }: PageProps<"/account/addresses/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser({ next: `/account/addresses/${encodeURIComponent(id)}/edit` });
  const parsedId = addressIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  // Filtered by owner as well as by RLS: staff can read all addresses for support, but this page
  // only ever edits the signed-in user's own.
  const { data, error } = await supabase
    .from("addresses")
    .select("id, label, full_name, phone, line1, street, area, city, province, postal_code, instructions, is_default")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load the address.");
  if (!data) notFound();

  const province = (PROVINCES as readonly string[]).includes(data.province) ? data.province : "Punjab";
  return (
    <section aria-labelledby="edit-address-heading" className="rounded-lg border border-border bg-card p-4 lg:p-6">
      <h2 id="edit-address-heading" className="mb-4 text-headline-sm">
        Edit address
      </h2>
      <AddressForm
        addressId={data.id}
        defaults={{
          label: data.label ?? "",
          full_name: data.full_name,
          phone: data.phone,
          line1: data.line1,
          street: data.street ?? "",
          area: data.area ?? "",
          city: data.city,
          province: province as (typeof PROVINCES)[number],
          postal_code: data.postal_code ?? "",
          instructions: data.instructions ?? "",
          is_default: data.is_default,
        }}
      />
    </section>
  );
}
