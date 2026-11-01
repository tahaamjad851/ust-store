// Renders the real home page and product listing with fake catalog data: an empty store, a store whose settings are
// still blank (a new project), and a store with products. What matters is what a visitor sees: no empty headings, no
// dead links, no placeholder brands, no leftovers like "undefined".
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, Product } from "@/types/catalog";
import type { StoreSettings } from "@/types/store";

const catalog = vi.hoisted(() => ({
  getStoreSettings: vi.fn(),
  getCategoryTree: vi.fn(),
  getTractorModels: vi.fn(),
  getStockedBrands: vi.fn(),
  getFeaturedProducts: vi.fn(),
  getProductPage: vi.fn(),
}));
vi.mock("@/services/catalog", () => catalog);
vi.mock("@/components/cart/cart-provider", () => ({ useCart: () => ({ add: () => {} }) }));

import HomePage from "@/app/(store)/page";
import { ProductListing } from "@/components/products/product-listing";

const blank: StoreSettings = {
  business_name: "Umar Siddique Traders", tagline: "", value_statement: "", phone_primary: "", phone_secondary: null,
  whatsapp_number: "", email: "", address_line: "", city: "", province: "", business_hours: "", announcement_text: "",
  delivery_charge_note: "", return_policy_note: "", delivery_methods: [],
  payment_methods: [
    { id: "cod", name: "Cash on delivery", description: "Pay when you receive your order.", enabled: false },
    { id: "bank_transfer", name: "Bank transfer", description: "", enabled: false },
    { id: "online", name: "Online", description: "", enabled: false },
  ],
};
const configured: StoreSettings = {
  ...blank, tagline: "Tractor parts", value_statement: "Quality parts", phone_primary: "0300 6701477",
  whatsapp_number: "923218219594", business_hours: "Mon-Sat, 8-8",
  delivery_methods: [{ id: "courier", name: "Doorstep courier", description: "" }],
  payment_methods: [{ id: "cod", name: "Cash on delivery", description: "Pay when you receive your order.", enabled: true }, ...blank.payment_methods.slice(1)],
};

const category = (id: string, name: string, parent_id: string | null = null): Category => ({
  id, parent_id, slug: id, name, description: null, icon: "tools", image_path: null, sort_order: 0,
});
const product = (id: string, name: string): Product => ({
  id, slug: id, name, short_description: "", variant_id: `v-${id}`, sku: `SKU-${id}`, part_number: null,
  retail_price_paisa: 150_000, compare_at_price_paisa: null, stock_status: "in_stock",
  image: { src: "/images/placeholders/part.svg", alt: `${name} (placeholder image)`, placeholder: true }, specs: [],
});

const setup = (over: { settings?: StoreSettings; tree?: unknown[]; models?: unknown[]; brands?: string[]; cards?: Product[] } = {}) => {
  catalog.getStoreSettings.mockResolvedValue(over.settings ?? configured);
  catalog.getCategoryTree.mockResolvedValue(over.tree ?? []);
  catalog.getTractorModels.mockResolvedValue(over.models ?? []);
  catalog.getStockedBrands.mockResolvedValue(over.brands ?? []);
  catalog.getFeaturedProducts.mockResolvedValue({ items: over.cards ?? [], fitmentLabels: {} });
};
const renderHome = async () => renderToStaticMarkup(await HomePage());

const SMELLS = [/>\s*undefined\s*</, /\bNaN\b/, /\[object /, /href="https:\/\/wa\.me\/"/, /href="tel:\+?"/, /<h[1-6][^>]*>\s*<\/h[1-6]>/, /Brand \d/, /lorem ipsum/i, /wholesale pric/i];
const expectClean = (html: string) => { for (const smell of SMELLS) expect(html, String(smell)).not.toMatch(smell); };

beforeEach(() => vi.clearAllMocks());

describe("home page", () => {
  it("an empty store renders cleanly: a message, no empty sections, no placeholder brands", async () => {
    setup();
    const html = await renderHome();
    expect(html).toContain('data-testid="empty-shop"');
    expect(html).toContain("Our products are coming soon");
    expect(html).toContain("Tractor parts &amp; lubricants");
    for (const gone of ["Brands we stock", "Shop by category", "Select your tractor", "Popular", "Engine oils"]) expect(html).not.toContain(gone);
    expectClean(html);
  });

  it("a brand-new project (every contact setting still empty) has no dead links and no empty strip", async () => {
    setup({ settings: blank });
    const html = await renderHome();
    expectClean(html);
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("tel:");
    expect(html).toContain("Please check back shortly.");
    expect(html).not.toContain("Frequently asked questions");
    expect(html).not.toContain("Why order from");
  });

  it("with products: a row per category that has them, real brands only, no unbacked wording", async () => {
    setup({
      tree: [{ ...category("parts", "Tractor Parts"), children: [category("clutch", "Clutch", "parts")] }, { ...category("oils", "Engine Oils"), children: [] }],
      brands: ["Massey Ferguson", "Fiat"],
      cards: [product("p1", "Clutch Plate")],
    });
    const html = await renderHome();
    expect(html).not.toContain("coming soon");
    expect(html).toContain("Shop by category");
    expect(html).toContain("Tractor Parts");
    expect(html).toContain("Engine Oils");
    expect(html).toContain("Clutch Plate");
    expect(html).toContain("Brands we stock");
    expect(html).toContain("Massey Ferguson");
    expect(html).toContain("Fiat");
    expect(html).toContain("Ask for a bulk quote");
    for (const claim of [/best.?seller/i, /\bpopular\b/i, /\breviews?\b/i, /\brating/i, /\bsold\b/i, /testimonial/i]) expect(html).not.toMatch(claim);
    expectClean(html);
  });

  it("a category tree whose products all vanished meanwhile shows the empty-shop message, not blank rows", async () => {
    setup({ tree: [{ ...category("parts", "Tractor Parts"), children: [] }], cards: [] });
    const html = await renderHome();
    expect(html).toContain('data-testid="empty-shop"');
    expect(html).not.toMatch(/row-title-/);
  });
});

describe("product listing", () => {
  const empty = { items: [], total: 0, page: 1, pageCount: 1, fitmentLabels: {} };

  it("the whole shop with no products says so plainly (no 'no match', no 0 count, no filters)", async () => {
    setup();
    catalog.getProductPage.mockResolvedValue(empty);
    const html = renderToStaticMarkup(await ProductListing({ basePath: "/shop", searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-testid="empty-listing"');
    expect(html).toContain("There are no products in the shop yet.");
    expect(html).not.toContain("No products match");
    expect(html).not.toContain("0 products");
    expect(html).not.toContain("Apply filters");
    expectClean(html);
  });

  it("an empty category says so and offers the whole shop", async () => {
    setup();
    catalog.getProductPage.mockResolvedValue(empty);
    const html = renderToStaticMarkup(await ProductListing({ basePath: "/categories/x", categoryId: "x", searchParams: Promise.resolve({}) }));
    expect(html).toContain("There are no products in this category yet.");
    expect(html).toContain('href="/shop"');
    expectClean(html);
  });

  it("a search with no hits still says no products match, and offers to clear it", async () => {
    setup();
    catalog.getProductPage.mockResolvedValue(empty);
    const html = renderToStaticMarkup(await ProductListing({ basePath: "/shop", searchParams: Promise.resolve({ q: "zzz" }) }));
    expect(html).toContain("No products match these filters.");
    expect(html).toContain("Clear filters");
    expect(html).not.toContain('data-testid="empty-listing"');
  });

  it("a store with a blank WhatsApp setting shows no WhatsApp button in the empty state", async () => {
    setup({ settings: blank });
    catalog.getProductPage.mockResolvedValue(empty);
    const html = renderToStaticMarkup(await ProductListing({ basePath: "/shop", searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("wa.me");
    expect(html).toContain("Please check back soon.");
  });
});
