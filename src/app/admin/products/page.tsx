import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ProductsTable } from "@/components/admin/products-table";
import { Button } from "@/components/ui/button";
import { buildProductRows, categoryOptions } from "@/features/admin/catalog-rows";
import { loadCatalogIndex } from "@/features/admin/queries";
import type { ProductStatus } from "@/features/admin/types";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Products" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

const STATUSES: readonly string[] = ["published", "draft", "archived"];

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireStaff({ next: "/admin/products" });
  const { status } = await searchParams;
  const initialStatus = (typeof status === "string" && STATUSES.includes(status) ? status : "") as ProductStatus | "";
  const index = await loadCatalogIndex(await createClient());
  return (
    <>
      <PageHeader
        title="Products"
        description="Every product, including drafts and archived ones. Open a product to edit it, add photos or set the tractors it fits."
        actions={
          <Button asChild className="h-11">
            <Link href="/admin/products/new">
              <Plus className="size-4" aria-hidden="true" />
              Add product
            </Link>
          </Button>
        }
      />
      <ProductsTable rows={buildProductRows(index)} categories={categoryOptions(index.categories).map(({ id, label }) => ({ id, label }))} initialStatus={initialStatus} />
    </>
  );
}
