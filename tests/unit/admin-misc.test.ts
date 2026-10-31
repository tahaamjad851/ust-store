import { describe, expect, it } from "vitest";
import { buildProductRows, buildVariantRows, categoryOptions } from "@/features/admin/catalog-rows";
import { sniffImage, productImagePath } from "@/lib/storage/image";
import { productSchema, settingsSchema, slugify, stockMovement, variantSchema, whatsappDigits, categorySchema } from "@/lib/validation/admin";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("sniffImage", () => {
  it("recognises the four accepted types by their first bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0))?.ext).toBe("jpg");
    expect(sniffImage(bytes(0x89, ...text("PNG"), 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe("png");
    expect(sniffImage(bytes(...text("RIFF"), 1, 2, 3, 4, ...text("WEBP")))?.ext).toBe("webp");
    expect(sniffImage(bytes(0, 0, 0, 0x18, ...text("ftypavif")))?.ext).toBe("avif");
  });
  it("refuses everything else, whatever the file is called", () => {
    for (const data of [text("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), text("GIF89a......"), text("%PDF-1.7......"), text("just some text"), [], [0xff, 0xd8], text("RIFF....WAVEfmt "), [0, 0, 0, 0x18, ...text("ftypheic")]]) {
      expect(sniffImage(new Uint8Array(data))).toBeNull();
    }
  });
  it("builds the only path shape the database accepts", () => {
    const path = productImagePath("11111111-2222-3333-4444-555555555555", "ab-cd-../ef", "webp");
    expect(path).toBe("products/11111111-2222-3333-4444-555555555555/abcdef.webp");
    expect(path).not.toContain("..");
  });
});

describe("slugify", () => {
  it("makes web addresses", () => {
    expect(slugify("Massey Ferguson 385 (2WD)")).toBe("massey-ferguson-385-2wd");
    expect(slugify("Nuts & Bolts")).toBe("nuts-and-bolts");
    expect(slugify("  Café  Oil ")).toBe("cafe-oil");
    expect(slugify("انجن آئل")).toBe("");
    expect(slugify("a".repeat(200), 20)).toHaveLength(20);
  });
});

describe("admin schemas", () => {
  const product = { name: "Oil", slug: "", category_id: "c22a6245-0a57-2546-7634-18dd0e244df3", brand_id: "", product_type: "oil", status: "draft", short_description: "", description: "", part_number: "", oem_part_numbers: "A1, B2\nA1", viscosity_grade: "", oil_specifications: "", origin: "", warranty_info: "", packaging_info: "", is_returnable: true, is_featured: false, seo_title: "", seo_description: "", specs: [{ label: "", value: "" }, { label: "Pack", value: "4 L" }] };
  it("parses a product: empty text becomes null, lists are split and de-duplicated, empty spec rows dropped", () => {
    const p = productSchema.parse(product);
    expect(p).toMatchObject({ brand_id: null, description: null, oem_part_numbers: ["A1", "B2"], specs: [{ label: "Pack", value: "4 L" }] });
  });
  it("accepts the seed's md5-made ids but rejects junk ids and unknown enums", () => {
    expect(productSchema.safeParse({ ...product, category_id: "nope" }).success).toBe(false);
    expect(productSchema.safeParse({ ...product, status: "deleted" }).success).toBe(false);
    expect(productSchema.safeParse({ ...product, specs: [{ label: "Only name", value: "" }] }).success).toBe(false);
    expect(productSchema.safeParse({ ...product, description: "x".repeat(10_001) }).success).toBe(false);
  });
  const variant = { sku: " gsk-1 ", name: "Default", barcode: "", regular_price: "1,250.50", sale_price: "", cost: "", weight_grams: "", length_mm: "", width_mm: "", height_mm: "", is_default: true, is_active: true };
  it("parses a variant: SKU upper-cased, prices in paisa, blanks null", () => {
    expect(variantSchema.parse(variant)).toMatchObject({ sku: "GSK-1", regular_price: 125050, sale_price: null, cost: null, barcode: null });
  });
  it("refuses a bad SKU, zero price, sale at or above regular, and bad dimensions", () => {
    for (const bad of [{ sku: "a" }, { sku: "has space" }, { regular_price: "0" }, { regular_price: "abc" }, { sale_price: "1250.50" }, { sale_price: "2000" }, { weight_grams: "-1" }, { barcode: "ab" }]) {
      expect(variantSchema.safeParse({ ...variant, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("categories: icon must be known", () => {
    const ok = { name: "X", slug: "", parent_id: "", description: "", icon: "tools", is_active: true };
    expect(categorySchema.safeParse(ok).success).toBe(true);
    expect(categorySchema.safeParse({ ...ok, icon: "<script>" }).success).toBe(false);
    expect(categorySchema.safeParse({ ...ok, slug: "Bad Slug" }).success).toBe(false);
  });
  it("settings: WhatsApp is normalised to digits, emails are listed", () => {
    expect(whatsappDigits("0321 8219594")).toBe("923218219594");
    expect(whatsappDigits("+92 321 8219594")).toBe("923218219594");
    expect(whatsappDigits("")).toBe("");
    const base = { business_name: "UST", tagline: "", value_statement: "", announcement_text: "", phone_primary: "0300", phone_secondary: "", whatsapp_number: "0321 8219594", email: "", address_line: "", city: "", province: "Punjab", business_hours: "", delivery_charge_note: "Call us", return_policy_note: "", price_change_alert_percent: "20", order_notification_emails: "A@x.com, b@x.com;a@x.com" };
    expect(settingsSchema.parse(base)).toMatchObject({ whatsapp_number: "923218219594", order_notification_emails: ["a@x.com", "b@x.com"], price_change_alert_percent: 20 });
    for (const bad of [{ whatsapp_number: "12345" }, { order_notification_emails: "not-an-email" }, { price_change_alert_percent: "0" }, { province: "Mars" }, { delivery_charge_note: "" }]) {
      expect(settingsSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("stock movements have the sign the database expects", () => {
    expect(stockMovement("receive", 5)).toEqual({ type: "receive", delta: 5 });
    expect(stockMovement("damage", 2)).toEqual({ type: "damage", delta: -2 });
    expect(stockMovement("correction_remove", 3)).toEqual({ type: "adjustment", delta: -3 });
  });
});

describe("catalog rows", () => {
  const index = {
    categories: [
      { id: "c1", parent_id: null, slug: "parts", name: "Parts", description: null, icon: null, sort_order: 1, is_active: true },
      { id: "c2", parent_id: "c1", slug: "engine", name: "Engine", description: null, icon: null, sort_order: 1, is_active: false },
    ],
    brands: [],
    products: [{ id: "p1", slug: "a", name: "A", status: "published" as const, product_type: "part" as const, category_id: "c2", brand_id: null, part_number: null, is_featured: false, updated_at: "t" }],
    variants: [
      { id: "v1", product_id: "p1", sku: "A-1", name: "Default", regular_price_paisa: 1000, sale_price_paisa: 800, is_default: true, is_active: true, sort_order: 1, updated_at: "t" },
      { id: "v2", product_id: "p1", sku: "A-2", name: "Big", regular_price_paisa: 3000, sale_price_paisa: null, is_default: false, is_active: false, sort_order: 2, updated_at: "t" },
    ],
    inventory: [{ variant_id: "v1", on_hand: 10, reserved: 0, low_stock_threshold: 5, reorder_level: null }],
  };
  it("joins variants with product, category chain and stock level", () => {
    const rows = buildVariantRows(index);
    expect(rows[0]).toMatchObject({ sku: "A-1", categoryIds: ["c2", "c1"], categoryName: "Parts › Engine", level: "ok" });
    expect(rows[1].level).toBe("out");
  });
  it("summarises a product by its ACTIVE variants only", () => {
    expect(buildProductRows(index)[0]).toMatchObject({ variantCount: 2, priceFromPaisa: 800, priceToPaisa: 800, level: "ok" });
  });
  it("lists subcategories under their parent and marks a hidden parent", () => {
    expect(categoryOptions(index.categories).map((o) => [o.id, o.isActive])).toEqual([["c1", true], ["c2", false]]);
  });
});
