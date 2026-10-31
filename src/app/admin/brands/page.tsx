import type { Metadata } from "next";
import { BrandsManager } from "@/components/admin/brands-manager";
import { PageHeader } from "@/components/admin/page-header";
import { loadCatalogIndex } from "@/features/admin/queries";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Brands" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function BrandsPage() {
  const user = await requireStaff({ next: "/admin/brands" });
  const index = await loadCatalogIndex(await createClient());
  const productCounts: Record<string, number> = {};
  for (const p of index.products) if (p.brand_id) productCounts[p.brand_id] = (productCounts[p.brand_id] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Brands" description="The makers of the parts and oils you sell." />
      <BrandsManager brands={index.brands} productCounts={productCounts} isAdmin={user.role === "admin"} />
    </>
  );
}
