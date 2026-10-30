import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { AddressCard, type AddressView } from "@/components/account/address-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Addresses" };

// Blocking, like the layout: the page reads the signed-in user's data for every request. (A loading.tsx
// would stream the page instead, which sends status 200 before notFound() is decided.)
export const instant = false;

const MAX_ADDRESSES = 10;

export default async function AddressesPage() {
  const user = await requireUser({ next: "/account/addresses" });
  const supabase = await createClient();
  // Staff can read every customer's addresses through RLS (for support), so this page must
  // filter by the signed-in user itself.
  const { data, error } = await supabase
    .from("addresses")
    .select("id, label, full_name, phone, line1, street, area, city, province, postal_code, instructions, is_default")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your addresses.");
  const addresses = (data ?? []) as AddressView[];

  return (
    <section aria-labelledby="addresses-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="addresses-heading" className="text-headline-sm">
            Delivery addresses
          </h2>
          <p className="text-body-md text-muted-foreground">Save the places you get parts delivered to.</p>
        </div>
        {addresses.length < MAX_ADDRESSES && (
          <Button asChild className="h-11">
            <Link href="/account/addresses/new">
              <Plus className="size-4" aria-hidden="true" />
              Add address
            </Link>
          </Button>
        )}
      </div>

      {addresses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <MapPin className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-headline-sm">No saved addresses yet</h3>
          <p className="mt-1 text-body-md text-muted-foreground">Add one now and use it at checkout.</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard key={address.id} address={address} />
          ))}
        </ul>
      )}
      {addresses.length >= MAX_ADDRESSES && (
        <p className="text-body-sm text-muted-foreground">You have saved the most addresses we allow ({MAX_ADDRESSES}). Delete one to add another.</p>
      )}
    </section>
  );
}
