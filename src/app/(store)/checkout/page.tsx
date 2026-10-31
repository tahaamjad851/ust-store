import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { getStoreSettings } from "@/services/catalog";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const settings = await getStoreSettings();
  return (
    <div className="mx-auto max-w-page space-y-6 px-margin py-6 lg:px-margin-desktop">
      <Breadcrumbs items={[{ label: "Cart", href: "/cart" }, { label: "Checkout" }]} />
      <h1 className="text-headline-xl-mobile lg:text-headline-xl">Checkout</h1>
      <CheckoutForm
        settings={{
          delivery_methods: settings.delivery_methods,
          payment_methods: settings.payment_methods,
          delivery_charge_note: settings.delivery_charge_note,
          whatsapp_number: settings.whatsapp_number,
          phone_primary: settings.phone_primary,
        }}
      />
    </div>
  );
}
