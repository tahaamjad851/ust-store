import type { Metadata } from "next";
import { DailyPricesTable } from "@/components/admin/daily-prices-table";
import { PriceHistory } from "@/components/admin/price-history";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { buildVariantRows, categoryOptions } from "@/features/admin/catalog-rows";
import { loadCatalogIndex, loadPriceAlertPercent, loadPriceChanges } from "@/features/admin/queries";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Daily prices" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function DailyPricesPage() {
  await requireStaff({ next: "/admin/prices" });
  const db = await createClient();
  const [index, alertPercent, changes] = await Promise.all([loadCatalogIndex(db), loadPriceAlertPercent(db), loadPriceChanges(db, { limit: 50 })]);
  const rows = buildVariantRows(index);
  const categories = categoryOptions(index.categories).map(({ id, label }) => ({ id, label }));

  return (
    <>
      <PageHeader
        title="Daily prices"
        description={
          <>
            Change prices, sale prices, stock and availability for many items at once, then press <strong>Save changes</strong>. Everything is saved
            together or not at all. Orders already placed keep the price they were placed at. A change of more than {alertPercent}% asks you to
            confirm. Stock changed here is recorded as a correction without a typed reason; use the Stock page to say why.
          </>
        }
      />
      <DailyPricesTable rows={rows} categories={categories} alertPercent={alertPercent} />
      <Panel title="Recent price changes" id="price-history" description="The last 50 changes: who made them, the old price and the new price.">
        <PriceHistory changes={changes} />
      </Panel>
    </>
  );
}
