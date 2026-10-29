import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ProductListing, ProductListingSkeleton } from "@/components/products/product-listing";
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

type Props = PageProps<"/categories/[category]/[subcategory]">;

export async function generateStaticParams() {
  const tree = await getCategoryTree();
  return tree.flatMap((c) => c.children.map((s) => ({ category: c.slug, subcategory: s.slug })));
}

async function resolve(params: Props["params"]) {
  const { category: catSlug, subcategory: subSlug } = await params;
  const parent = await getCategoryBySlug(catSlug);
  const category = parent ? await getCategoryBySlug(subSlug, parent.id) : null;
  return parent && category ? { parent, category } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params);
  return found ? { title: `${found.category.name} | ${found.parent.name}`, description: found.category.description ?? undefined } : {};
}

export default function SubcategoryPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SubcategoryContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SubcategoryContent({ params, searchParams }: Props) {
  const found = await resolve(params);
  if (!found) notFound();
  const { parent, category } = found;

  const [settings, siblings, products, models, fitments, fitmentLabels] = await Promise.all([
    getStoreSettings(),
    getChildCategories(parent.id),
    getProductsInCategory(category.id),
    getTractorModels(),
    getFitments(),
    getFitmentLabels(),
  ]);
  const parentPath = `/categories/${parent.slug}`;
  const basePath = `${parentPath}/${category.slug}`;

  return (
    <>
      <div className="mx-auto max-w-page space-y-6 px-margin py-6 lg:px-margin-desktop">
        <Breadcrumbs items={[{ label: parent.name, href: parentPath }, { label: category.name }]} />
        <header className="space-y-2">
          <p className="text-label-md uppercase text-muted-foreground">{parent.name}</p>
          <h1 className="text-headline-xl-mobile lg:text-headline-xl">{category.name}</h1>
          {category.description && <p className="max-w-3xl text-body-lg text-muted-foreground">{category.description}</p>}
        </header>
        <Suspense fallback={<ProductListingSkeleton />}>
          <ProductListing
            basePath={basePath}
            products={products}
            models={models}
            fitments={fitments}
            fitmentLabels={fitmentLabels}
            searchParams={searchParams}
            groups={{
              title: parent.name,
              items: siblings.map((s) => ({
                id: s.id,
                name: s.name,
                href: `${parentPath}/${s.slug}`,
                current: s.id === category.id,
              })),
            }}
          />
        </Suspense>
      </div>

      <section aria-labelledby="bulk-title" className="on-dark mt-6 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-page flex-col gap-4 px-margin py-8 lg:flex-row lg:items-center lg:justify-between lg:px-margin-desktop">
          <div>
            <h2 id="bulk-title" className="text-headline-md">
              Ordering {category.name.toLowerCase()} for a workshop or dealership?
            </h2>
            <p className="mt-1 text-body-md text-primary-foreground/85">
              Ask us for wholesale pricing on bulk orders. Call{" "}
              <span className="tabular">{settings.phone_primary}</span> or message us on WhatsApp.
            </p>
          </div>
          <Button asChild className="h-11 bg-card text-foreground hover:bg-surface-low">
            <a
              href={whatsappHref(settings.whatsapp_number, `Hello, I'd like wholesale pricing for ${category.name}.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle />
              Ask for wholesale pricing
              <span className="sr-only">(opens WhatsApp in a new tab)</span>
            </a>
          </Button>
        </div>
      </section>
    </>
  );
}
