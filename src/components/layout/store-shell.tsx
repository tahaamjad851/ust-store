// The storefront chrome (header, navigation, footer, cart, WhatsApp button). Shared by the public shop
// and the signed-in /account area so both look the same.
import { CartProvider } from "@/components/cart/cart-provider";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { CategoryDrawerProvider } from "@/components/layout/category-drawer";
import { MainNav, type NavItem } from "@/components/layout/main-nav";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { whatsappLink } from "@/lib/contact";
import { getCategoryTree, getStoreSettings, getTractorModels } from "@/services/catalog";

// The dev catalogue is the DEMO seed. The notice stays until DEMO_CATALOG_NOTICE=off is set, which is part
// of removing the demo data before launch (docs/ROADMAP.md, launch checklist).
const showDemoNotice = process.env.DEMO_CATALOG_NOTICE !== "off";

export async function StoreShell({ children }: { children: React.ReactNode }) {
  const [settings, tree, models] = await Promise.all([getStoreSettings(), getCategoryTree(), getTractorModels()]);

  // Categories with several subcategories get a desktop mega-menu (desktop homepage design).
  const navItems: NavItem[] = [
    { href: "/", label: "Home" },
    { href: "/shop", label: "Shop" },
    ...tree.slice(0, 6).map((c) => ({
      href: `/categories/${c.slug}`,
      label: c.name,
      menu:
        c.children.length >= 6
          ? {
              title: `${c.name} catalogue`,
              groups: c.children.map((s) => ({
                href: `/categories/${c.slug}/${s.slug}`,
                label: s.name,
                description: s.description,
                icon: s.icon,
              })),
              quickLinks: {
                title: "Shop by model:",
                links: models.map((m) => ({ href: `/shop?model=${m.id}`, label: m.model })),
              },
              allLink: { href: `/categories/${c.slug}`, label: `Shop all ${c.name.toLowerCase()}` },
            }
          : undefined,
    })),
  ];

  const drawerCategories = tree.map(({ id, slug, name, icon, children }) => ({
    id,
    slug,
    name,
    icon,
    children: children.map(({ id, slug, name, icon }) => ({ id, slug, name, icon })),
  }));

  return (
    <CartProvider>
      <CategoryDrawerProvider
        categories={drawerCategories}
        whatsappHref={whatsappLink(settings.whatsapp_number)}
        phone={settings.phone_primary}
      >
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        {showDemoNotice && (
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
