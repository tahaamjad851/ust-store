import type { Metadata } from "next";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { PageHeader } from "@/components/admin/page-header";
import { loadCatalogIndex } from "@/features/admin/queries";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Categories" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function CategoriesPage() {
  const user = await requireStaff({ next: "/admin/categories" });
  const index = await loadCatalogIndex(await createClient());
  const productCounts: Record<string, number> = {};
  for (const p of index.products) productCounts[p.category_id] = (productCounts[p.category_id] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Categories" description="How products are grouped in the shop menu." />
      <CategoriesManager categories={index.categories} productCounts={productCounts} isAdmin={user.role === "admin"} />
    </>
  );
}
