import { describe, expect, it } from "vitest";
import {
  fitmentLabel,
  mapCartItem,
  mapCategory,
  mapImages,
  mapProductCard,
  mapProductDetail,
  mapStoreSettings,
  mapTractorModels,
  mapVariant,
  pageInfo,
  parseOptionValues,
  parseSpecs,
  pickDisplayVariant,
  publicImageUrl,
  safeCategoryImage,
  toCategoryIcon,
  toStockStatus,
  variantPrices,
  type PublicProductRow,
  type PublicVariantRow,
} from "@/features/catalog/mappers";
import type { ProductImageRow } from "@/types/database";
import type { StockStatus } from "@/types/catalog";

const BASE = "https://abcdefghijklmnopqrst.supabase.co";

const product: PublicProductRow = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "mf-385-clutch-plate",
  name: "MF 385 Clutch Plate",
  short_description: "A clutch plate.",
  description: "Long description.",
  category_id: "22222222-2222-4222-8222-222222222222",
  brand_id: null,
  product_type: "part",
  part_number: "1860005M91",
  oem_part_numbers: ["A1", "B2"],
  specs: [{ label: "Diameter", value: "305 mm" }, { label: "Splines", value: "10" }, { label: "Pads", value: "6" }],
  viscosity_grade: null,
  oil_specifications: [],
  origin: "Imported",
  warranty_info: null,
  packaging_info: null,
  is_returnable: true,
  seo_title: null,
  seo_description: null,
  published_at: "2026-10-01T00:00:00Z",
  created_at: "2026-10-01T00:00:00Z",
};

const variant = (over: Partial<PublicVariantRow> = {}): PublicVariantRow => ({
  id: "33333333-3333-4333-8333-333333333333",
  product_id: product.id,
  sku: "MF-385-CP851",
  name: "Default",
  option_values: {},
  regular_price_paisa: 1_850_000,
  sale_price_paisa: 1_650_000,
  is_default: true,
  sort_order: 0,
  ...over,
});

const image = (over: Partial<ProductImageRow> = {}): ProductImageRow => ({
  product_id: product.id,
  storage_path: `${product.id}/front.webp`,
  alt_text: "",
  sort_order: 0,
  is_primary: false,
  ...over,
});

describe("publicImageUrl", () => {
  it("points at the public product-images bucket of the project", () => {
    expect(publicImageUrl(BASE, "abc/front view.webp")).toBe(
      `${BASE}/storage/v1/object/public/product-images/abc/front%20view.webp`,
    );
  });

  it("uses the origin only, even if the configured URL has a path", () => {
    expect(publicImageUrl(`${BASE}/rest/v1/`, "a.png")).toBe(`${BASE}/storage/v1/object/public/product-images/a.png`);
  });

  it.each(["", "/a.png", "../a.png", "a/../b.png", "a//b.png", "./a.png", "a/."])("rejects the path %j", (path) => {
    expect(publicImageUrl(BASE, path)).toBeNull();
  });

  it("encodes characters that could end the path early", () => {
    const url = publicImageUrl(BASE, "a?b#c.png");
    expect(url).toContain("a%3Fb%23c.png");
  });
});

describe("variantPrices", () => {
  it("charges the sale price and shows the regular price crossed out", () => {
    expect(variantPrices({ regular_price_paisa: 1_850_000, sale_price_paisa: 1_650_000 })).toEqual({
      retail_price_paisa: 1_650_000,
      compare_at_price_paisa: 1_850_000,
    });
  });

  it("charges the regular price when there is no sale", () => {
    expect(variantPrices({ regular_price_paisa: 540_000, sale_price_paisa: null })).toEqual({
      retail_price_paisa: 540_000,
      compare_at_price_paisa: null,
    });
  });

  it("ignores a sale price that is not lower (never shows a fake discount)", () => {
    expect(variantPrices({ regular_price_paisa: 100, sale_price_paisa: 100 }).compare_at_price_paisa).toBeNull();
    expect(variantPrices({ regular_price_paisa: 100, sale_price_paisa: 150 }).retail_price_paisa).toBe(100);
  });
});

describe("toStockStatus", () => {
  it("passes the three known statuses", () => {
    for (const s of ["in_stock", "low_stock", "out_of_stock"] as const) expect(toStockStatus(s)).toBe(s);
  });

  it("treats anything it cannot confirm as out of stock", () => {
    expect(toStockStatus(undefined)).toBe("out_of_stock");
    expect(toStockStatus(null)).toBe("out_of_stock");
    expect(toStockStatus("plenty")).toBe("out_of_stock");
  });
});

describe("parseSpecs", () => {
  it("keeps well-formed pairs and drops everything else", () => {
    expect(
      parseSpecs([{ label: " A ", value: "1" }, { label: "", value: "x" }, { label: "B" }, "oops", null, { label: "C", value: "3" }]),
    ).toEqual([{ label: "A", value: "1" }, { label: "C", value: "3" }]);
  });

  it("is empty for non-arrays and honours the limit", () => {
    expect(parseSpecs({ label: "A", value: "1" })).toEqual([]);
    expect(parseSpecs(null)).toEqual([]);
    expect(parseSpecs(product.specs, 2)).toHaveLength(2);
  });
});

describe("parseOptionValues", () => {
  it("keeps strings and numbers, drops the rest", () => {
    expect(parseOptionValues({ size: "5 L", pack: 4, nested: { a: 1 }, flag: true })).toEqual({ size: "5 L", pack: "4" });
    expect(parseOptionValues([1, 2])).toEqual({});
    expect(parseOptionValues(null)).toEqual({});
  });
});

describe("categories", () => {
  it("falls back to a neutral icon for an unknown name", () => {
    expect(toCategoryIcon("tractor")).toBe("tractor");
    expect(toCategoryIcon("rocket")).toBe("tools");
    expect(toCategoryIcon(null)).toBe("tools");
  });

  it("only passes on a shipped same-origin drawing as the image (next/image would throw on anything else)", () => {
    expect(safeCategoryImage("/images/placeholders/category.svg")).toBe("/images/placeholders/category.svg");
    for (const bad of [null, "categories/a.png", "https://evil.test/a.png", "//evil.test/a.png", "/images/../secret", "/other/a.png", "javascript:alert(1)"]) {
      expect(safeCategoryImage(bad)).toBeNull();
    }
  });

  it("maps a row without extra fields", () => {
    const c = mapCategory({ id: "c1", parent_id: null, slug: "filters", name: "Filters", description: null, icon: "filter", image_path: "x.png", sort_order: 2 });
    expect(c).toEqual({ id: "c1", parent_id: null, slug: "filters", name: "Filters", description: null, icon: "filter", image_path: null, sort_order: 2 });
  });
});

describe("mapTractorModels", () => {
  const makes = [
    { id: "m2", name: "Fiat / New Holland", sort_order: 2 },
    { id: "m1", name: "Massey Ferguson", sort_order: 1 },
  ];
  const models = [
    { id: "t3", make_id: "m2", name: "Fiat 640", year_from: 1985, year_to: 2010, sort_order: 2 },
    { id: "t2", make_id: "m1", name: "MF 385", year_from: null, year_to: null, sort_order: 2 },
    { id: "t1", make_id: "m1", name: "MF 240", year_from: 1985, year_to: null, sort_order: 1 },
    { id: "orphan", make_id: "gone", name: "Orphan", year_from: null, year_to: null, sort_order: 0 },
  ];

  it("joins the make's name, orders by make then model, and drops models whose make is not public", () => {
    const result = mapTractorModels(makes, models);
    expect(result.map((m) => m.id)).toEqual(["t1", "t2", "t3"]);
    expect(result[0]).toEqual({ id: "t1", make: "Massey Ferguson", model: "MF 240", year_from: 1985, year_to: null });
  });

  it("builds the 'Fits' badge from the first model that is public", () => {
    const byId = new Map(mapTractorModels(makes, models).map((m) => [m.id, m]));
    expect(fitmentLabel([{ tractor_model_id: "hidden" }, { tractor_model_id: "t2" }], byId)).toBe("Fits MF 385");
    expect(fitmentLabel([], byId)).toBeUndefined();
  });
});

describe("images", () => {
  it("uses a placeholder drawing when no photo is uploaded, chosen by product type", () => {
    const [part] = mapImages(product, [], BASE);
    expect(part).toEqual({ src: "/images/placeholders/part.svg", alt: "MF 385 Clutch Plate (placeholder image)", placeholder: true });
    expect(mapImages({ name: "Oil", product_type: "oil" }, [], BASE)[0].src).toBe("/images/placeholders/oil.svg");
    expect(mapImages({ name: "F", product_type: "filter" }, [], BASE)[0].src).toBe("/images/placeholders/filter.svg");
  });

  it("puts the primary image first, then by sort order, with the product name as alt text", () => {
    const images = mapImages(
      product,
      [image({ storage_path: "b.webp", sort_order: 2 }), image({ storage_path: "a.webp", sort_order: 5, is_primary: true }), image({ storage_path: "c.webp", sort_order: 1, alt_text: "Side view" })],
      BASE,
    );
    expect(images.map((i) => i.src.split("/").pop())).toEqual(["a.webp", "c.webp", "b.webp"]);
    expect(images[0]).toMatchObject({ alt: "MF 385 Clutch Plate", placeholder: false });
    expect(images[1].alt).toBe("Side view");
    expect(images[2].alt).toBe("MF 385 Clutch Plate, view 3");
  });

  it("skips an image whose path is unsafe and falls back to the placeholder", () => {
    expect(mapImages(product, [image({ storage_path: "../../x.png" })], BASE)[0].placeholder).toBe(true);
  });
});

describe("display variant", () => {
  it("is the default variant, else the first by sort order", () => {
    const a = variant({ id: "a", is_default: false, sort_order: 2 });
    const b = variant({ id: "b", is_default: false, sort_order: 1 });
    const c = variant({ id: "c", is_default: true, sort_order: 9 });
    expect(pickDisplayVariant([a, b, c])?.id).toBe("c");
    expect(pickDisplayVariant([a, b])?.id).toBe("b");
    expect(pickDisplayVariant([])).toBeUndefined();
  });
});

describe("mapProductCard", () => {
  const card = mapProductCard({ product, variant: variant(), stock_status: "low_stock", images: [], baseUrl: BASE });

  it("carries what the card shows and the variant id for the cart", () => {
    expect(card).toMatchObject({
      id: product.id,
      slug: product.slug,
      variant_id: "33333333-3333-4333-8333-333333333333",
      sku: "MF-385-CP851",
      part_number: "1860005M91",
      retail_price_paisa: 1_650_000,
      compare_at_price_paisa: 1_850_000,
      stock_status: "low_stock",
    });
    expect(card.specs).toHaveLength(2);
  });

  it("has no cost, wholesale or stock-count field, and none can leak in through the row", () => {
    const polluted = { ...variant(), cost_paisa: 90_000, wholesale_price_paisa: 1, on_hand: 7 } as PublicVariantRow;
    const json = JSON.stringify(mapProductCard({ product, variant: polluted, stock_status: "in_stock", images: [], baseUrl: BASE }));
    expect(json).not.toMatch(/cost|wholesale|on_hand|stock_qty|reserved|available/i);
    expect(Object.keys(card).sort()).toEqual(
      ["compare_at_price_paisa", "id", "image", "name", "part_number", "retail_price_paisa", "short_description", "sku", "slug", "specs", "stock_status", "variant_id"].sort(),
    );
  });
});

describe("mapProductDetail", () => {
  const stock = new Map<string, StockStatus>([["33333333-3333-4333-8333-333333333333", "in_stock"]]);

  it("is null when no variant is for sale", () => {
    expect(mapProductDetail({ product, variants: [], stock, images: [], brand: null, models: [], baseUrl: BASE })).toBeNull();
  });

  it("represents the product by its default variant and lists every variant with its own stock status", () => {
    const five = variant({ id: "v-5", name: "5 L", sku: "OIL-5L", is_default: false, sort_order: 2, regular_price_paisa: 900_000, sale_price_paisa: null });
    const one = variant({ id: "v-1", name: "1 L", sku: "OIL-1L", is_default: true, sort_order: 1, regular_price_paisa: 200_000, sale_price_paisa: null });
    const detail = mapProductDetail({
      product: { ...product, product_type: "oil", viscosity_grade: "15W-40" },
      variants: [five, one],
      stock: new Map<string, StockStatus>([["v-1", "in_stock"], ["v-5", "out_of_stock"]]),
      images: [],
      brand: { name: "Brand X" },
      models: [],
      baseUrl: BASE,
    })!;
    expect(detail.variant_id).toBe("v-1");
    expect(detail.sku).toBe("OIL-1L");
    expect(detail.variants.map((v) => [v.id, v.stock_status])).toEqual([["v-1", "in_stock"], ["v-5", "out_of_stock"]]);
    expect(detail.brand).toBe("Brand X");
    expect(detail.viscosity_grade).toBe("15W-40");
    expect(detail.images).toHaveLength(1);
    expect(detail.specs).toHaveLength(3);
  });

  it("marks a variant with no stock row as out of stock", () => {
    const detail = mapProductDetail({ product, variants: [variant()], stock: new Map(), images: [], brand: null, models: [], baseUrl: BASE })!;
    expect(detail.stock_status).toBe("out_of_stock");
  });

  it("exposes no cost, wholesale or count fields", () => {
    const detail = mapProductDetail({ product, variants: [variant()], stock, images: [], brand: null, models: [], baseUrl: BASE });
    expect(JSON.stringify(detail)).not.toMatch(/cost|wholesale|on_hand|stock_qty|reserved|available/i);
  });
});

describe("mapVariant and mapCartItem", () => {
  it("maps prices and stock for a variant", () => {
    expect(mapVariant(variant({ name: "5 L", option_values: { size: "5 L" } }), "in_stock")).toMatchObject({
      name: "5 L",
      option_values: { size: "5 L" },
      retail_price_paisa: 1_650_000,
      stock_status: "in_stock",
    });
  });

  it("hides the 'Default' variant name in the cart", () => {
    const base = { product, stock_status: "in_stock" as const, images: [], baseUrl: BASE };
    expect(mapCartItem({ ...base, variant: variant() }).variant_name).toBeNull();
    expect(mapCartItem({ ...base, variant: variant({ name: "5 L" }) }).variant_name).toBe("5 L");
    const item = mapCartItem({ ...base, variant: variant() });
    expect(item).toMatchObject({ variant_id: "33333333-3333-4333-8333-333333333333", product_id: product.id, retail_price_paisa: 1_650_000 });
    expect(JSON.stringify(item)).not.toMatch(/cost|wholesale|on_hand|stock_qty/i);
  });
});

describe("mapStoreSettings", () => {
  const row = {
    business_name: "Umar Siddique Traders",
    tagline: "Parts",
    value_statement: "Quality",
    phone_primary: "0300 0000000",
    phone_secondary: null,
    whatsapp_number: "923000000000",
    email: "a@example.test",
    address_line: "Road",
    city: "Khanpur",
    province: "Punjab",
    business_hours: "Mon–Sat",
    free_delivery_threshold_paisa: null,
    cod_enabled: true,
    bank_transfer_enabled: false,
    delivery_charge_note: "Delivery charge confirmed by phone",
    return_policy_note: "Exchange within 7 days if the product is in original condition.",
  };

  it("reads the delivery and exchange texts from the settings row and orders delivery methods", () => {
    const s = mapStoreSettings(row, [
      { id: "courier", name: "Courier", description: "d2", sort_order: 2 },
      { id: "cargo", name: "Cargo", description: "d1", sort_order: 1 },
    ]);
    expect(s.delivery_charge_note).toBe("Delivery charge confirmed by phone");
    expect(s.return_policy_note).toContain("Exchange within 7 days");
    expect(s.delivery_methods.map((m) => m.id)).toEqual(["cargo", "courier"]);
    expect(s.delivery_methods[0]).toEqual({ id: "cargo", name: "Cargo", description: "d1" });
  });

  it("enables payment methods from the flags, and carries no fee", () => {
    const s = mapStoreSettings(row, []);
    expect(s.payment_methods.map((m) => [m.id, m.enabled])).toEqual([["cod", true], ["bank_transfer", false]]);
    expect(JSON.stringify(s)).not.toMatch(/fee_paisa/);
  });
});

describe("pageInfo", () => {
  it("clamps the requested page into range", () => {
    expect(pageInfo(0, 1, 9)).toEqual({ page: 1, pageCount: 1 });
    expect(pageInfo(23, 1, 9)).toEqual({ page: 1, pageCount: 3 });
    expect(pageInfo(23, 3, 9)).toEqual({ page: 3, pageCount: 3 });
    expect(pageInfo(23, 99, 9)).toEqual({ page: 3, pageCount: 3 });
    expect(pageInfo(9, 2, 9)).toEqual({ page: 1, pageCount: 1 });
  });
});
