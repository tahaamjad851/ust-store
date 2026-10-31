import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ProductListing, ProductListingSkeleton } from "@/components/products/product-listing";
import { getCategoryTree } from "@/services/catalog";

export const metadata: Metadata = { title: "Shop all products" };

/** All products. Target of the header search (?q=) and the tractor selector (?model=). */
export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const tree = await getCategoryTree();

  return (
    <div className="mx-auto max-w-page space-y-6 px-margin py-6 lg:px-margin-desktop">
      <Breadcrumbs items={[{ label: "Shop" }]} />
      <h1 className="text-headline-xl-mobile lg:text-headline-xl">All products</h1>
      <Suspense fallback={<ProductListingSkeleton />}>
        <ProductListing
          basePath="/shop"
          searchParams={searchParams}
          groups={{
            title: "Categories",
            items: tree.map((c) => ({ id: c.id, name: c.name, href: `/categories/${c.slug}`, current: false })),
          }}
        />
      </Suspense>
    </div>
  );
}
