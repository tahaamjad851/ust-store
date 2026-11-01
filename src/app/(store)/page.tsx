import { Building2, MessageCircle, Truck, Wrench } from "lucide-react";
import { Faq } from "@/components/home/faq";
import { faqItems } from "@/components/home/faq-items";
import { Hero } from "@/components/home/hero";
import { SectionHeading } from "@/components/home/section-heading";
import { TrustStrip } from "@/components/layout/trust-strip";
import { CategoryTile } from "@/components/products/category-tile";
import { ProductCard } from "@/components/products/product-card";
import { TractorSelector } from "@/components/products/tractor-selector";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/contact";
import { orList } from "@/lib/store-text";
import { getCategoryTree, getFeaturedProducts, getStockedBrands, getStoreSettings, getTractorModels } from "@/services/catalog";

const container = "mx-auto max-w-page px-margin lg:px-margin-desktop";

/** How many categories get a product row on the home page. */
const PRODUCT_ROWS = 3;

// Everything here comes from the database. A section whose data is missing is not rendered at all, so an empty or new
// shop shows a short, honest page (hero, a message, contact) and no empty headings, tiles or carousels.
export default async function HomePage() {
  const [settings, tree, models, brands] = await Promise.all([getStoreSettings(), getCategoryTree(), getTractorModels(), getStockedBrands()]);

  // The first few categories (in the owner's order) with their first products: products marked featured come first.
  const rows = (
    await Promise.all(
      tree.slice(0, PRODUCT_ROWS).map(async (category) => ({ category, ...(await getFeaturedProducts(category.id, 4)) })),
    )
  ).filter((row) => row.items.length > 0);
  const hasProducts = rows.length > 0;

  const whatsapp = whatsappLink(settings.whatsapp_number);
  const delivery = orList(settings.delivery_methods.map((m) => m.name));
  const why = [
    models.length > 0 && { icon: Wrench, title: "Parts by tractor model", text: "Browse by make and model to narrow down the right part." },
    whatsapp && { icon: MessageCircle, title: "Talk to a person", text: "Send a photo of the old part on WhatsApp and we'll help you find it." },
    delivery !== "" && { icon: Truck, title: "Delivery", text: `${delivery}.` },
    whatsapp && { icon: Building2, title: "Bulk orders", text: "Buying for a workshop, fleet or dealership? Ask us for a quote." },
  ].flatMap((i) => (i ? [i] : []));
  const faq = faqItems(settings, { hasTractorModels: models.length > 0 });
  const hasTrust = settings.payment_methods.some((m) => m.enabled) || delivery !== "" || whatsapp !== null || settings.return_policy_note.trim() !== "";

  return (
    <>
      <Hero settings={settings} />

      {(models.length > 0 || hasTrust) && (
        <div className={`${container} relative -mt-6 space-y-4 lg:-mt-10`}>
          {models.length > 0 && (
            <section aria-labelledby="selector-title" className="rounded-lg border border-border bg-card p-4 shadow-float lg:p-6">
              <h2 id="selector-title" className="mb-1 text-headline-sm">
                Select your tractor
              </h2>
              <p className="mb-4 text-body-md text-muted-foreground">Show parts listed for your make and model.</p>
              <TractorSelector models={models} action="/shop" />
            </section>
          )}
          <TrustStrip settings={settings} />
        </div>
      )}

      {!hasProducts && (
        <section aria-labelledby="empty-title" className={`${container} py-12`} data-testid="empty-shop">
          <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
            <h2 id="empty-title" className="text-headline-md">
              Our products are coming soon
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-body-md text-muted-foreground">
              We are adding parts and lubricants to the shop.{" "}
              {whatsapp ? "In the meantime, message us and we will help you find what you need." : "Please check back shortly."}
            </p>
            {whatsapp && (
              <Button asChild className="mt-4 h-11 bg-whatsapp hover:bg-whatsapp-hover">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  Message us on WhatsApp
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
          </div>
        </section>
      )}

      {tree.length > 0 && (
        <section aria-labelledby="categories-title" className={`${container} py-10`}>
          <SectionHeading id="categories-title" title="Shop by category" link={{ href: "/shop", label: "All products" }} />
          {/* Phones: compact scrolling chip row (mobile design). sm and up: tile grid. */}
          <ul className="-mx-margin flex gap-2 overflow-x-auto px-margin pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
            {tree.map((c) => (
              <li key={c.id} className="shrink-0 sm:shrink">
                <CategoryTile category={c} href={`/categories/${c.slug}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.map(({ category, items, fitmentLabels }, i) => {
        const dark = i % 2 === 1;
        const titleId = `row-title-${category.id}`;
        return (
          <section
            key={category.id}
            aria-labelledby={titleId}
            className={dark ? "on-dark bg-primary py-10 text-primary-foreground" : undefined}
          >
            <div className={`${container} ${dark ? "" : "pb-10"}`}>
              <SectionHeading
                id={titleId}
                inverted={dark}
                title={category.name}
                description={category.description ?? undefined}
                link={{ href: `/categories/${category.slug}`, label: `View ${category.name.toLowerCase()}` }}
              />
              <ul className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${dark ? "text-foreground" : ""}`}>
                {items.map((p) => (
                  <li key={p.id} className="flex">
                    <ProductCard product={p} fitmentLabel={fitmentLabels[p.id]} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      {brands.length > 0 && (
        <section aria-labelledby="brands-title" className={`${container} py-10`}>
          <SectionHeading id="brands-title" title="Brands we stock" />
          <ul className="flex flex-wrap gap-2">
            {brands.map((name) => (
              <li key={name} className="rounded-lg border border-border bg-card px-4 py-2 text-label-lg">
                {name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {why.length > 0 && (
        <section aria-labelledby="why-title" className="bg-surface-low py-10">
          <div className={container}>
            <SectionHeading id="why-title" title={`Why order from ${settings.business_name}`} />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {why.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-lg border border-border bg-card p-4">
                  <Icon className="mb-3 size-6 text-primary" aria-hidden="true" />
                  <h3 className="text-headline-sm">{title}</h3>
                  <p className="mt-1 text-body-md text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {whatsapp && hasProducts && (
        <section aria-labelledby="bulk-title" className={`${container} py-10`}>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 id="bulk-title" className="text-headline-md">
                Bulk orders for workshops and dealers
              </h2>
              <p className="mt-1 text-body-md text-muted-foreground">
                Ordering for a workshop, fleet or dealership? Message us with what you need and we will send you a quote.
              </p>
            </div>
            <Button asChild className="h-11 bg-whatsapp hover:bg-whatsapp-hover">
              <a href={whatsappLink(settings.whatsapp_number, "Hello, I'd like a quote for a bulk order.") ?? whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Ask for a bulk quote
                <span className="sr-only">(opens WhatsApp in a new tab)</span>
              </a>
            </Button>
          </div>
        </section>
      )}

      {faq.length > 0 && (
        <section aria-labelledby="faq-title" className={`${container} pb-12`}>
          <h2 id="faq-title" className="mb-4 text-center text-headline-lg-mobile lg:text-headline-lg">
            Frequently asked questions
          </h2>
          <Faq items={faq} />
          {whatsapp && (
            <p className="mt-4 text-center text-body-md text-muted-foreground">
              More questions?{" "}
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline">
                Message us on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          )}
        </section>
      )}
    </>
  );
}
