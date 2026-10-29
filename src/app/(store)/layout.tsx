import { CartProvider } from "@/components/cart/cart-provider";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { CategoryDrawerProvider } from "@/components/layout/category-drawer";
import { MainNav, type NavItem } from "@/components/layout/main-nav";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { whatsappHref } from "@/lib/contact";
import { USING_DEMO_DATA } from "@/lib/mock";
import { getCategoryTree, getProducts, getStoreSettings } from "@/services/catalog";

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const [settings, tree, products] = await Promise.all([getStoreSettings(), getCategoryTree(), getProducts()]);
  const productIds = products.map((p) => p.id);

  const navItems: NavItem[] = [
    { href: "/", label: "Home" },
    { href: "/shop", label: "Shop" },
    ...tree.slice(0, 6).map((c) => ({ href: `/categories/${c.slug}`, label: c.name })),
  ];

  const drawerCategories = tree.map(({ id, slug, name, icon, children }) => ({
    id,
    slug,
    name,
    icon,
    children: children.map(({ id, slug, name, icon }) => ({ id, slug, name, icon })),
  }));

  return (
    <CartProvider knownProductIds={productIds}>
      <CategoryDrawerProvider
        categories={drawerCategories}
        whatsappHref={whatsappHref(settings.whatsapp_number)}
        phone={settings.phone_primary}
      >
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        {USING_DEMO_DATA && (
          <p className="bg-warning-container px-margin py-1 text-center text-label-sm text-warning-foreground">
            Demo catalogue: products, prices and stock shown are examples only.
          </p>
        )}
        <AnnouncementBar settings={settings} />
        <SiteHeader settings={settings} />
        <MainNav items={navItems} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter settings={settings} categories={tree} />
        <WhatsAppButton number={settings.whatsapp_number} />
        <MobileTabBar />
      </CategoryDrawerProvider>
    </CartProvider>
  );
}
