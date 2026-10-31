import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { TrustStrip } from "@/components/layout/trust-strip";
import { getStoreSettings } from "@/services/catalog";

export const metadata: Metadata = { title: "Shopping cart" };

export default async function CartPage() {
  const settings = await getStoreSettings();
  return (
    <div className="mx-auto max-w-page space-y-6 px-margin py-6 lg:px-margin-desktop">
      <Breadcrumbs items={[{ label: "Shopping cart" }]} />
      <h1 className="text-headline-xl-mobile lg:text-headline-xl">Shopping cart</h1>
      <CartView
        deliveryNote={settings.delivery_charge_note}
        whatsappNumber={settings.whatsapp_number}
        aside={<TrustStrip settings={settings} className="grid-cols-1 lg:grid-cols-1" />}
      />
    </div>
  );
}
