import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Phone, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { ProductPurchase } from "@/components/cart/product-purchase";
import {
  SelectedPriceBox,
  SelectedSku,
  SelectedWhatsAppButton,
  VariantPicker,
  VariantSelectionProvider,
} from "@/components/cart/variant-selection";
import { Breadcrumbs, type Crumb } from "@/components/layout/breadcrumbs";
import { ProductCard } from "@/components/products/product-card";
import { ProductImageView } from "@/components/products/product-image";
import { discount } from "@/lib/pricing";
import {
  getCategoryById,
  getProductBySlug,
  getProductSlugsForStaticParams,
  getRelatedProducts,
  getStoreSettings,
} from "@/services/catalog";

type Props = PageProps<"/products/[slug]">;

// The product lookup is cached and known products are prerendered. A slug that is not (or no longer)
// for sale must answer a real 404, which needs the lookup to finish before anything streams, so the
// route blocks instead of showing a fallback: no Suspense around it.
export const instant = false;

export async function generateStaticParams() {
  const slugs = await getProductSlugsForStaticParams();
  // The newest products are prerendered, the rest on their first visit. Cache Components needs at
  // least one param; "_" is no product and renders the 404.
  return (slugs.length > 0 ? slugs : ["_"]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  return product
    ? { title: product.seo_title ?? product.name, description: product.seo_description ?? (product.short_description || undefined) }
    : {};
}

export default async function ProductPage({ params }: Props) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();

  const [settings, category, related] = await Promise.all([
    getStoreSettings(),
    getCategoryById(product.category_id),
    getRelatedProducts(product),
  ]);
  const parent = category?.parent_id ? await getCategoryById(category.parent_id) : null;
  const categoryHref = category ? (parent ? `/categories/${parent.slug}/${category.slug}` : `/categories/${category.slug}`) : null;

  const crumbs: Crumb[] = [];
  if (parent) crumbs.push({ label: parent.name, href: `/categories/${parent.slug}` });
  if (category && categoryHref) crumbs.push({ label: category.name, href: categoryHref });
  crumbs.push({ label: product.name });

  const saving = discount(product);
  const [mainImage, ...otherImages] = product.images;
  const specRows = [
    ...product.specs,
    ...(product.viscosity_grade ? [{ label: "Viscosity grade", value: product.viscosity_grade }] : []),
    ...(product.oil_specifications.length > 0 ? [{ label: "Oil specifications", value: product.oil_specifications.join(", ") }] : []),
    ...(product.packaging_info ? [{ label: "Packaging", value: product.packaging_info }] : []),
  ];

  return (
    <div className="mx-auto max-w-page space-y-10 px-margin py-6 lg:px-margin-desktop">
      <Breadcrumbs items={crumbs} />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="relative">
            <ProductImageView
              image={mainImage}
              width={600}
              height={600}
              preload
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[4/3] w-full rounded-lg border border-border bg-surface-low object-contain lg:aspect-square"
            />
            {saving && (
              <span className="absolute top-3 left-3 rounded-sm bg-warning-container px-2 py-0.5 text-label-md text-warning-foreground">
                −{saving.percent}%
              </span>
            )}
          </div>
          {otherImages.length > 0 && (
            <ul className="grid grid-cols-5 gap-2" aria-label="More images">
              {otherImages.map((image, i) => (
                <li key={`${image.src}-${i}`}>
                  <ProductImageView
                    image={image}
                    width={120}
                    height={120}
                    sizes="(min-width: 1024px) 10vw, 20vw"
                    className="aspect-square w-full rounded-lg border border-border bg-surface-low object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <VariantSelectionProvider variants={product.variants} initialVariantId={product.variant_id}>
          <div className="space-y-5">
            <div className="space-y-2">
              <h1 className="text-headline-lg-mobile lg:text-headline-lg">{product.name}</h1>
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
                <div className="flex gap-1">
                  <dt>SKU:</dt>
                  <dd className="font-mono text-foreground">
                    <SelectedSku />
                  </dd>
                </div>
                {product.part_number && (
                  <div className="flex gap-1">
                    <dt>Part number:</dt>
                    <dd className="font-mono text-foreground">{product.part_number}</dd>
                  </div>
                )}
                {product.oem_part_numbers.length > 0 && (
                  <div className="flex gap-1">
                    <dt>OEM ref:</dt>
                    <dd className="font-mono text-foreground">{product.oem_part_numbers.join(", ")}</dd>
                  </div>
                )}
                {product.brand && (
                  <div className="flex gap-1">
                    <dt>Brand:</dt>
                    <dd className="text-foreground">{product.brand}</dd>
                  </div>
                )}
                {product.origin && (
                  <div className="flex gap-1">
                    <dt>Origin:</dt>
                    <dd className="text-foreground">{product.origin}</dd>
                  </div>
                )}
              </dl>
            </div>

            <SelectedPriceBox />

            {product.short_description && <p className="text-body-lg">{product.short_description}</p>}

            <VariantPicker />

            <ProductPurchase productName={product.name} />

            <SelectedWhatsAppButton number={settings.whatsapp_number} productName={product.name} />

            <section aria-labelledby="fitment-title" className="rounded-lg border border-border bg-surface-low p-4">
              <h2 id="fitment-title" className="flex items-center gap-2 text-headline-sm">
                <CircleCheck className="size-5 text-primary" aria-hidden="true" />
                Listed tractor models
              </h2>
              {product.models.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {product.models.map((m) => (
                    <li key={m.id} className="rounded-sm bg-brand-tint px-2 py-0.5 text-label-md text-brand-tint-foreground">
                      {m.make} {m.model}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-body-md text-muted-foreground">Universal or not listed for a specific model.</p>
              )}
              <p className="mt-3 text-body-sm text-muted-foreground">
                Not sure it fits? Send a photo of your old part on WhatsApp before ordering.
              </p>
            </section>
          </div>
        </VariantSelectionProvider>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="desc-title" className="space-y-6 rounded-lg border border-border bg-card p-4 lg:p-6">
          <div>
            <h2 id="desc-title" className="text-headline-md">
              Description
            </h2>
            {/* Plain text from the admin; React escapes it. Line breaks are kept. */}
            <p className="mt-2 text-body-lg whitespace-pre-line">{product.description || product.short_description}</p>
          </div>
          {specRows.length > 0 && (
            <div>
              <h2 className="text-headline-md">Specifications</h2>
              <table className="mt-2 w-full border border-border text-body-md">
                <tbody>
                  {specRows.map((s) => (
                    <tr key={s.label} className="border-b border-border odd:bg-card even:bg-surface-low">
                      <th scope="row" className="w-1/2 px-3 py-2 text-left font-semibold text-muted-foreground">
                        {s.label}
                      </th>
                      <td className="px-3 py-2 tabular">{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="delivery-title" className="space-y-4 rounded-lg border border-border bg-card p-4 lg:p-6">
          <h2 id="delivery-title" className="text-headline-md">
            Delivery &amp; exchanges
          </h2>
          <ul className="space-y-3 text-body-md">
            {settings.delivery_methods.map((m) => (
              <li key={m.id} className="flex gap-3">
                <Truck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-semibold">{m.name}</span>
                  <span className="text-muted-foreground">{m.description}</span>
                </span>
              </li>
            ))}
            {settings.delivery_charge_note && (
              <li className="flex gap-3">
                <Phone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="font-semibold">{settings.delivery_charge_note}</span>
              </li>
            )}
            {settings.return_policy_note && (
              <li className="flex gap-3">
                <RotateCcw className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-semibold">Exchange policy</span>
                  <span className="text-muted-foreground">{settings.return_policy_note}</span>
                </span>
              </li>
            )}
            {product.warranty_info && (
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-semibold">Warranty</span>
                  <span className="text-muted-foreground">{product.warranty_info}</span>
                </span>
              </li>
            )}
          </ul>
        </section>
      </div>

      {related.items.length > 0 && (
        <section aria-labelledby="related-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="related-title" className="text-headline-lg-mobile lg:text-headline-lg">
              Related parts
            </h2>
            {category && categoryHref && (
              <Link href={categoryHref} className="inline-flex min-h-11 items-center text-label-lg text-primary hover:underline">
                View all {category.name.toLowerCase()}
              </Link>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {related.items.map((p) => (
              <li key={p.id} className="flex">
                <ProductCard product={p} fitmentLabel={related.fitmentLabels[p.id]} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
