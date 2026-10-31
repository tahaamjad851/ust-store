import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { StockTable } from "@/components/admin/stock-table";
import { buildVariantRows, categoryOptions } from "@/features/admin/catalog-rows";
import { loadCatalogIndex } from "@/features/admin/queries";
import type { StockLevel } from "@/features/admin/types";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stock" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function StockPage({ searchParams }: PageProps<"/admin/stock">) {
  await requireStaff({ next: "/admin/stock" });
  const { level } = await searchParams;
  const initial = (level === "low" || level === "out" || level === "ok" ? level : "") as StockLevel | "";
  const index = await loadCatalogIndex(await createClient());
  return (
    <>
      <PageHeader title="Stock" description="What you have on the shelf. Every change needs a reason and is kept in the history with who made it. Stock that customers have already ordered is shown as reserved." />
      <StockTable rows={buildVariantRows(index)} categories={categoryOptions(index.categories).map(({ id, label }) => ({ id, label }))} initialLevel={initial} />
    </>
  );
}
