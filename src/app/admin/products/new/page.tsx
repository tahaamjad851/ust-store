import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { CreateProductForm } from "@/components/admin/product-forms";
import { categoryOptions } from "@/features/admin/catalog-rows";
import { loadTaxonomy } from "@/features/admin/queries";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add product" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function NewProductPage() {
  const user = await requireStaff({ next: "/admin/products/new" });
  const { categories, brands } = await loadTaxonomy(await createClient());
  return (
    <>
      <PageHeader
        title="Add product"
        description={
          <>
            Fill in what you know; you can add photos and the tractors it fits after saving. New products start as drafts, so nothing is shown in the shop until you publish.{" "}
            <Link href="/admin/products" className="underline">
              Back to products
            </Link>
          </>
        }
      />
      <CreateProductForm
        categories={categoryOptions(categories)}
        brands={brands.map((b) => ({ id: b.id, label: b.name }))}
        isAdmin={user.role === "admin"}
      />
    </>
  );
}
