import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { ProductStatusBadge } from "@/components/admin/badges";
import { CompatibilityEditor } from "@/components/admin/compatibility-editor";
import { ImageManager } from "@/components/admin/image-manager";
import { PageHeader, Panel } from "@/components/admin/page-header";
import { ProductDangerZone } from "@/components/admin/product-danger-zone";
import { EditProductForm } from "@/components/admin/product-forms";
import { VariantsManager } from "@/components/admin/variants-manager";
import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { categoryOptions } from "@/features/admin/catalog-rows";
import { loadModelOptions, loadProduct, loadTaxonomy } from "@/features/admin/queries";
import { publicImageUrl } from "@/features/catalog/mappers";
import { requireStaff } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Edit product" };

// Who is signed in is only known for a real request, so the page is never prerendered (see the layout).
export const instant = false;

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const user = await requireStaff({ next: `/admin/products/${id}` });
  if (!idSchema.safeParse(id).success) notFound();
  const { created } = await searchParams;

  const db = await createClient();
  const [loaded, taxonomy, models] = await Promise.all([loadProduct(db, id), loadTaxonomy(db), loadModelOptions(db)]);
  if (!loaded) notFound();
  const { product, variants, images, compatibility } = loaded;
  const isAdmin = user.role === "admin";
  const { url } = getSupabasePublicEnv();
  const categories = categoryOptions(taxonomy.categories);
  const category = taxonomy.categories.find((c) => c.id === product.category_id);
  const parent = category?.parent_id ? taxonomy.categories.find((c) => c.id === category.parent_id) : undefined;
  const categoryHidden = !category?.is_active || (parent ? !parent.is_active : false);
  const anyActive = variants.some((v) => v.is_active);

  const warnings: string[] = [];
  if (product.status === "published" && !anyActive) warnings.push("This product is published, but it has no available variant, so the shop does not show it.");
  if (product.status === "published" && categoryHidden) warnings.push("This product's category is hidden, so the shop does not show the product.");

  return (
    <>
      <PageHeader
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ProductStatusBadge status={product.status} />
            <Link href="/admin/products" className="underline">
              All products
            </Link>
          </span>
        }
        actions={
          product.status === "published" ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={`/products/${product.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                View in shop
                <span className="sr-only">(opens in a new tab)</span>
              </Link>
            </Button>
          ) : undefined
        }
      />

      {created && <FormAlert tone="success">Product added. Now add photos and the tractors it fits, then publish it when it is ready.</FormAlert>}
      {warnings.map((w) => (
        <p key={w} role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-container p-3 text-body-md text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {w}
        </p>
      ))}

      <nav aria-label="On this page" className="flex flex-wrap gap-x-4 gap-y-1 text-label-lg">
        {[
          ["#details", "Details"],
          ["#variants", "Variants and prices"],
          ["#photos", "Photos"],
          ["#fits", "Tractors it fits"],
          ["#danger", "Archive or delete"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="inline-flex min-h-11 items-center text-primary hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <Panel title="Details" id="details">
        <EditProductForm product={product} categories={categories} brands={taxonomy.brands.map((b) => ({ id: b.id, label: b.name }))} />
      </Panel>

      <Panel title="Variants and prices" id="variants" description="A variant is a size, pack or grade with its own SKU, price and stock. Stock is changed on the Stock page.">
        <VariantsManager productId={product.id} variants={variants} isAdmin={isAdmin} />
      </Panel>

      <Panel title="Photos" id="photos">
        <ImageManager
          productId={product.id}
          productName={product.name}
          images={images.map((i) => ({ ...i, src: publicImageUrl(url, i.storage_path) }))}
        />
      </Panel>

      <Panel title="Tractors it fits" id="fits" description="List only the models you know this part fits. Customers see these on the product page and can filter by them.">
        <CompatibilityEditor productId={product.id} entries={compatibility} models={models} />
      </Panel>

      <Panel title="Archive or delete" id="danger">
        <ProductDangerZone product={{ id: product.id, name: product.name, status: product.status }} isAdmin={isAdmin} />
      </Panel>
    </>
  );
}
