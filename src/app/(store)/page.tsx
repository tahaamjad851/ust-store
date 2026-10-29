import { Building2, MessageCircle, Truck, Wrench } from "lucide-react";
import { Faq } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { SectionHeading } from "@/components/home/section-heading";
import { TrustStrip } from "@/components/layout/trust-strip";
import { CategoryTile } from "@/components/products/category-tile";
import { ProductCard } from "@/components/products/product-card";
import { TractorSelector } from "@/components/products/tractor-selector";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/lib/contact";
import {
  getCategoryTree,
  getFitmentLabels,
  getProducts,
  getStoreSettings,
  getTractorModels,
} from "@/services/catalog";

const container = "mx-auto max-w-page px-margin lg:px-margin-desktop";

export default async function HomePage() {
  const [settings, tree, products, models, fitment] = await Promise.all([
    getStoreSettings(),
    getCategoryTree(),
    getProducts(),
    getTractorModels(),
    getFitmentLabels(),
  ]);

  const tractorParts = tree.find((c) => c.slug === "tractor-parts");
  const partIds = new Set([tractorParts?.id, ...(tractorParts?.children.map((c) => c.id) ?? [])]);
  const featured = products.filter((p) => partIds.has(p.category_id)).slice(0, 5);
  const fluidCategoryIds = new Set(
    tree.filter((c) => ["engine-oils", "lubricants", "hydraulic-oils"].includes(c.slug)).map((c) => c.id),
  );
  const fluids = products.filter((p) => fluidCategoryIds.has(p.category_id)).slice(0, 4);
  const wa = whatsappHref(settings.whatsapp_number);

  return (
    <>
      <Hero settings={settings} />

      <div className={`${container} relative -mt-6 space-y-4 lg:-mt-10`}>
        <section
          aria-labelledby="selector-title"
          className="rounded-lg border border-border bg-card p-4 shadow-float lg:p-6"
        >
          <h2 id="selector-title" className="mb-1 text-headline-sm">
            Select your tractor
          </h2>
          <p className="mb-4 text-body-md text-muted-foreground">Show parts listed for your make and model.</p>
          <TractorSelector models={models} action="/shop" />
        </section>
        <TrustStrip settings={settings} />
      </div>

      <section aria-labelledby="categories-title" className={`${container} py-10`}>
        <SectionHeading id="categories-title" title="Shop by category" link={{ href: "/shop", label: "All products" }} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tree.map((c) => (
            <li key={c.id}>
              <CategoryTile category={c} href={`/categories/${c.slug}`} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="featured-title" className={`${container} pb-10`}>
        <SectionHeading
          id="featured-title"
          title="Popular tractor parts"
          link={{ href: "/categories/tractor-parts", label: "View tractor parts" }}
        />
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {featured.map((p) => (
            <li key={p.id} className="flex">
              <ProductCard product={p} fitmentLabel={fitment[p.id]} />
            </li>
          ))}
        </ul>
      </section>

      {fluids.length > 0 && (
        <section aria-labelledby="fluids-title" className="bg-primary py-10 text-primary-foreground">
          <div className={container}>
            <SectionHeading
              id="fluids-title"
              inverted
              title="Engine oils & lubricants"
              description="Engine oils, gear oils and hydraulic fluids for tractors."
              link={{ href: "/categories/engine-oils", label: "View oils" }}
            />
            <ul className="grid grid-cols-2 gap-3 text-foreground lg:grid-cols-4">
              {fluids.map((p) => (
                <li key={p.id} className="flex">
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="brands-title" className={`${container} py-10`}>
        <SectionHeading id="brands-title" title="Brands we stock" description="Brand list to be confirmed." />
        {/* DEMO: placeholder tiles until the client confirms which brands are stocked. */}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <li
              key={i}
              className="flex h-20 items-center justify-center rounded-lg border border-dashed border-input bg-card text-label-md text-muted-foreground"
            >
              Brand {i + 1}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="why-title" className="bg-surface-low py-10">
        <div className={container}>
          <SectionHeading id="why-title" title={`Why order from ${settings.business_name}`} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Wrench, title: "Parts by tractor model", text: "Browse by make and model to narrow down the right part." },
              { icon: MessageCircle, title: "Talk to a person", text: "Send a photo of the old part on WhatsApp and we'll help you find it." },
              { icon: Truck, title: "Delivery across Pakistan", text: settings.delivery_methods.map((m) => m.name).join(" or ") + "." },
              { icon: Building2, title: "Retail and wholesale", text: "Single parts for farmers, bulk orders for workshops and dealers." },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-lg border border-border bg-card p-4">
                <Icon className="mb-3 size-6 text-primary" aria-hidden="true" />
                <h3 className="text-headline-sm">{title}</h3>
                <p className="mt-1 text-body-md text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="wholesale-title" className={`${container} py-10`}>
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 id="wholesale-title" className="text-headline-md">
              Wholesale for workshops and dealers
            </h2>
            <p className="mt-1 text-body-md text-muted-foreground">
              Ordering for a workshop, fleet or dealership? Ask us for wholesale pricing on bulk orders.
            </p>
          </div>
          <Button asChild className="h-11 bg-whatsapp hover:bg-whatsapp-hover">
            <a href={whatsappHref(settings.whatsapp_number, "Hello, I'd like wholesale pricing.")} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              Ask for wholesale pricing
              <span className="sr-only">(opens WhatsApp in a new tab)</span>
            </a>
          </Button>
        </div>
      </section>

      <section aria-labelledby="faq-title" className={`${container} pb-12`}>
        <h2 id="faq-title" className="mb-4 text-center text-headline-lg-mobile lg:text-headline-lg">
          Frequently asked questions
        </h2>
        <Faq settings={settings} />
        <p className="mt-4 text-center text-body-md text-muted-foreground">
          More questions?{" "}
          <a href={wa} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            Message us on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </section>
    </>
  );
}
