import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CircleCheck, MessageCircle, RotateCcw, Truck } from "lucide-react";
import { ProductPurchase } from "@/components/cart/product-purchase";
import { Breadcrumbs, type Crumb } from "@/components/layout/breadcrumbs";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { Price } from "@/components/products/price";
import { ProductCard } from "@/components/products/product-card";
import { StockIndicator } from "@/components/products/stock-indicator";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/lib/contact";
import { discount, formatPKR } from "@/lib/pricing";
import {
  getCategoryById,
  getFitmentLabels,
  getModelsForProduct,
  getProductBySlug,
  getProducts,
  getRelatedProducts,
  getStoreSettings,
} from "@/services/catalog";

type Props = PageProps<"/products/[slug]">;

export async function generateStaticParams() {
  return (await getProducts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  return product ? { title: product.name, description: product.short_description } : {};
}

export default function ProductPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: Pick<Props, "params">) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();

  const [settings, category, models, related, fitmentLabels] = await Promise.all([
    getStoreSettings(),
    getCategoryById(product.category_id),
    getModelsForProduct(product.id),
    getRelatedProducts(product),
    getFitmentLabels(),
  ]);
  const parent = category?.parent_id ? await getCategoryById(category.parent_id) : null;

  const crumbs: Crumb[] = [];
  if (parent) crumbs.push({ label: parent.name, href: `/categories/${parent.slug}` });
  if (category) {
    crumbs.push({
      label: category.name,
      href: parent ? `/categories/${parent.slug}/${category.slug}` : `/categories/${category.slug}`,
    });
  }
  crumbs.push({ label: product.name });

  const saving = discount(product);
  const waMessage = `Hello, I'd like to order: ${product.name} (SKU ${product.sku}).`;

  return (
    <div className="mx-auto max-w-page space-y-10 px-margin py-6 lg:px-margin-desktop">
      <Breadcrumbs items={crumbs} />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="relative">
            <Image
              src={product.image_paths[0]}
              alt={`${product.name} (placeholder image)`}
              width={600}
              height={600}
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[4/3] w-full rounded-lg border border-border bg-surface-low object-contain lg:aspect-square"
            />
            {saving && (
              <span className="absolute top-3 left-3 rounded-sm bg-warning-container px-2 py-0.5 text-label-md text-warning-foreground">
                −{saving.percent}%
              </span>
            )}
          </div>
          {product.image_paths.length > 1 && (
            <ul className="grid grid-cols-5 gap-2" aria-label="More images">
              {product.image_paths.slice(1).map((src, i) => (
                <li key={`${src}-${i}`}>
                  <Image
                    src={src}
                    alt={`${product.name}, view ${i + 2} (placeholder image)`}
                    width={120}
                    height={120}
                    className="aspect-square w-full rounded-lg border border-border bg-surface-low"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <h1 className="text-headline-lg-mobile lg:text-headline-lg">{product.name}</h1>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
              <div className="flex gap-1">
                <dt>SKU:</dt>
                <dd className="font-mono text-foreground">{product.sku}</dd>
              </div>
              {product.oem_ref && (
                <div className="flex gap-1">
                  <dt>OEM ref:</dt>
                  <dd className="font-mono text-foreground">{product.oem_ref}</dd>
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

          <div className="space-y-1 rounded-lg border border-border bg-card p-4">
            <Price product={product} size="lg" />
            {saving && (
              <p className="text-label-md text-warning">You save {formatPKR(saving.amount_paisa)}</p>
            )}
            <StockIndicator product={product} className="pt-2" />
          </div>

          <p className="text-body-lg">{product.short_description}</p>

          <ProductPurchase productId={product.id} productName={product.name} stockQty={product.stock_qty} />

          <Button asChild className="h-12 w-full bg-whatsapp hover:bg-whatsapp-hover">
            <a href={whatsappHref(settings.whatsapp_number, waMessage)} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              Order or ask on WhatsApp
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>

          <section aria-labelledby="fitment-title" className="rounded-lg border border-border bg-surface-low p-4">
            <h2 id="fitment-title" className="flex items-center gap-2 text-headline-sm">
              <CircleCheck className="size-5 text-primary" aria-hidden="true" />
              Listed tractor models
            </h2>
            {models.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {models.map((m) => (
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="desc-title" className="space-y-6 rounded-lg border border-border bg-card p-4 lg:p-6">
          <div>
            <h2 id="desc-title" className="text-headline-md">
              Description
            </h2>
            <p className="mt-2 text-body-lg">{product.description}</p>
          </div>
          {product.specs.length > 0 && (
            <div>
              <h2 className="text-headline-md">Specifications</h2>
              <table className="mt-2 w-full border border-border text-body-md">
                <tbody>
                  {product.specs.map((s) => (
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
            Delivery &amp; returns
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
            {settings.return_period_days !== null && (
              <li className="flex gap-3">
                <RotateCcw className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-semibold">{settings.return_period_days}-day returns</span>
                  <span className="text-muted-foreground">Contact us first so we can confirm the return.</span>
                </span>
              </li>
            )}
          </ul>
        </section>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="related-title" className="text-headline-lg-mobile lg:text-headline-lg">
              Related parts
            </h2>
            {category && (
              <Link
                href={parent ? `/categories/${parent.slug}/${category.slug}` : `/categories/${category.slug}`}
                className="inline-flex min-h-11 items-center text-label-lg text-primary hover:underline"
              >
                View all {category.name.toLowerCase()}
              </Link>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {related.map((p) => (
              <li key={p.id} className="flex">
                <ProductCard product={p} fitmentLabel={fitmentLabels[p.id]} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
