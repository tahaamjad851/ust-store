import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { TrustStrip } from "@/components/layout/trust-strip";
import { ProductListing, ProductListingSkeleton } from "@/components/products/product-listing";
import { SubcategoryCard } from "@/components/products/subcategory-card";
import { TractorSelector } from "@/components/products/tractor-selector";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/lib/contact";
import {
  getCategoryBySlug,
  getCategoryTree,
  getChildCategories,
  getFitments,
  getFitmentLabels,
  getProductsInCategory,
  getStoreSettings,
  getTractorModels,
} from "@/services/catalog";

const container = "mx-auto max-w-page px-margin lg:px-margin-desktop";

export async function generateStaticParams() {
  const tree = await getCategoryTree();
  return tree.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/categories/[category]">): Promise<Metadata> {
  const category = await getCategoryBySlug((await params).category);
  return category ? { title: category.name, description: category.description ?? undefined } : {};
}

export default function CategoryPage({ params, searchParams }: PageProps<"/categories/[category]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CategoryContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CategoryContent({ params, searchParams }: PageProps<"/categories/[category]">) {
  const category = await getCategoryBySlug((await params).category);
  if (!category) notFound();

  const [settings, children, models] = await Promise.all([
    getStoreSettings(),
    getChildCategories(category.id),
    getTractorModels(),
  ]);
  const basePath = `/categories/${category.slug}`;

  return (
    <div className={`${container} space-y-8 py-6`}>
      <Breadcrumbs items={[{ label: category.name }]} />

      <header className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-3">
          <h1 className="text-headline-xl-mobile lg:text-headline-xl">{category.name}</h1>
          {category.description && <p className="max-w-2xl text-body-lg text-muted-foreground">{category.description}</p>}
        </div>
        <aside aria-labelledby="advice-title" className="rounded-lg border border-border bg-surface-container p-4">
          <h2 id="advice-title" className="text-headline-sm">
            Not sure which part you need?
          </h2>
          <p className="mt-1 text-body-md text-muted-foreground">
            Send your tractor model and a photo of the old part. {settings.business_hours}.
          </p>
          <Button asChild className="mt-3 h-11 w-full bg-whatsapp hover:bg-whatsapp-hover">
            <a href={whatsappHref(settings.whatsapp_number, `Hello, I need help finding a part in ${category.name}.`)} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              Send a photo on WhatsApp
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        </aside>
      </header>

      {children.length > 0 ? (
        <>
          <section aria-labelledby="models-title" className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-low p-3">
            <h2 id="models-title" className="mr-2 font-sans text-label-md uppercase">
              Shop by model:
            </h2>
            <ul className="flex flex-wrap gap-2">
              {models.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/shop?model=${m.id}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3 text-label-md hover:border-primary"
                  >
                    {m.model}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="subcats-title">
            <h2 id="subcats-title" className="mb-4 text-headline-lg-mobile lg:text-headline-lg">
              Browse {category.name.toLowerCase()} by group
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {children.map((c) => (
                <li key={c.id}>
                  <SubcategoryCard category={c} href={`${basePath}/${c.slug}`} />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="find-title" className="rounded-lg border border-border bg-card p-4 shadow-card lg:p-6">
            <h2 id="find-title" className="text-headline-md">
              Find parts for your tractor
            </h2>
            <p className="mt-1 mb-4 text-body-md text-muted-foreground">Choose your make and model to see matching parts.</p>
            <TractorSelector models={models} action="/shop" />
          </section>

          <TrustStrip settings={settings} />
        </>
      ) : (
        <Suspense fallback={<ProductListingSkeleton />}>
          <CategoryProducts categoryId={category.id} basePath={basePath} searchParams={searchParams} />
        </Suspense>
      )}
    </div>
  );
}

async function CategoryProducts({
  categoryId,
  basePath,
  searchParams,
}: {
  categoryId: string;
  basePath: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [products, models, fitments, fitmentLabels] = await Promise.all([
    getProductsInCategory(categoryId),
    getTractorModels(),
    getFitments(),
    getFitmentLabels(),
  ]);
  return (
    <ProductListing
      basePath={basePath}
      products={products}
      models={models}
      fitments={fitments}
      fitmentLabels={fitmentLabels}
      searchParams={searchParams}
    />
  );
}
