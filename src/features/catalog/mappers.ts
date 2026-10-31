// Pure mappers from Supabase rows to the storefront shapes in src/types/catalog.ts and
// src/types/store.ts. No I/O, so every rule here is unit-tested (tests/unit/catalog-mappers.test.ts).
import { z } from "zod";
import type {
  BrandRow,
  CategoryRow,
  CompatibilityRow,
  DeliveryMethodRow,
  ProductImageRow,
  ProductRow,
  StoreSettingsRow,
  TractorMakeRow,
  TractorModelRow,
  VariantRow,
} from "@/types/database";
import type {
  CartCatalogItem,
  Category,
  CategoryIcon,
  Product,
  ProductDetail,
  ProductImage,
  ProductSpec,
  ProductVariant,
  StockStatus,
  TractorModel,
} from "@/types/catalog";
import type { StoreSettings } from "@/types/store";

export const PRODUCT_IMAGE_BUCKET = "product-images";

// Rows as the public queries return them: the filter-only columns (is_active, status, the settings
// key) are not selected, so they are not part of the mapper inputs.
type Row<T, Filter extends keyof T> = Omit<T, Filter>;
export type PublicCategoryRow = Row<CategoryRow, "is_active">;
export type PublicMakeRow = Row<TractorMakeRow, "is_active">;
export type PublicModelRow = Row<TractorModelRow, "is_active">;
export type PublicProductRow = Row<ProductRow, "status">;
export type PublicVariantRow = Row<VariantRow, "is_active">;
export type PublicSettingsRow = Row<StoreSettingsRow, "id">;
export type PublicDeliveryRow = Row<DeliveryMethodRow, "is_active">;

const PLACEHOLDER_BY_TYPE: Record<PublicProductRow["product_type"], string> = {
  part: "/images/placeholders/part.svg",
  oil: "/images/placeholders/oil.svg",
  filter: "/images/placeholders/filter.svg",
  accessory: "/images/placeholders/part.svg",
  tool: "/images/placeholders/part.svg",
  tyre: "/images/placeholders/part.svg",
  other: "/images/placeholders/part.svg",
};

const ICONS: ReadonlySet<string> = new Set<CategoryIcon>([
  "tractor", "engine-oil", "lubricant", "hydraulic", "filter", "accessory", "tyre", "electrical", "tools",
  "engine", "clutch", "brake", "gearbox", "transmission", "steering", "cooling", "fuel", "belt", "bearing", "body",
]);

export function toCategoryIcon(icon: string | null): CategoryIcon {
  return icon !== null && ICONS.has(icon) ? (icon as CategoryIcon) : "tools";
}

/**
 * categories.image_path has no storage bucket behind it yet (category images arrive with the admin
 * phase), and next/image throws on a src it cannot resolve. Only a shipped same-origin drawing is
 * passed on; anything else shows the placeholder.
 */
export function safeCategoryImage(path: string | null): string | null {
  return path !== null && /^\/images\/[A-Za-z0-9._/-]+$/.test(path) && !path.includes("..") ? path : null;
}

export function mapCategory(row: PublicCategoryRow): Category {
  return {
    id: row.id,
    parent_id: row.parent_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: toCategoryIcon(row.icon),
    image_path: safeCategoryImage(row.image_path),
    sort_order: row.sort_order,
  };
}

/** Models with their make's name, ordered by make then model. A model whose make is not visible is dropped. */
export function mapTractorModels(makes: PublicMakeRow[], models: PublicModelRow[]): TractorModel[] {
  const makeById = new Map(makes.map((m) => [m.id, m]));
  return models
    .flatMap((m) => {
      const make = makeById.get(m.make_id);
      return make ? [{ make, model: m }] : [];
    })
    .sort(
      (a, b) =>
        a.make.sort_order - b.make.sort_order ||
        a.make.name.localeCompare(b.make.name) ||
        a.model.sort_order - b.model.sort_order ||
        a.model.name.localeCompare(b.model.name),
    )
    .map(({ make, model }) => ({
      id: model.id,
      make: make.name,
      model: model.name,
      year_from: model.year_from,
      year_to: model.year_to,
    }));
}

const specSchema = z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(200) });

/** products.specs is free-form JSON from the admin: keep well-formed {label, value} pairs only. */
export function parseSpecs(value: unknown, limit = 30): ProductSpec[] {
  if (!Array.isArray(value)) return [];
  const specs: ProductSpec[] = [];
  for (const entry of value) {
    const parsed = specSchema.safeParse(entry);
    if (parsed.success) specs.push(parsed.data);
    if (specs.length >= limit) break;
  }
  return specs;
}

export function parseOptionValues(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" || typeof v === "number") out[k.slice(0, 40)] = String(v).slice(0, 80);
  }
  return out;
}

/** Unknown or missing status means "cannot confirm", which must never read as available. */
export function toStockStatus(status: string | null | undefined): StockStatus {
  return status === "in_stock" || status === "low_stock" || status === "out_of_stock" ? status : "out_of_stock";
}

/** What the customer pays and what to show crossed out. A sale price that is not lower is ignored. */
export function variantPrices(v: Pick<PublicVariantRow, "regular_price_paisa" | "sale_price_paisa">) {
  const onSale = v.sale_price_paisa !== null && v.sale_price_paisa < v.regular_price_paisa;
  return {
    retail_price_paisa: onSale ? (v.sale_price_paisa as number) : v.regular_price_paisa,
    compare_at_price_paisa: onSale ? v.regular_price_paisa : null,
  };
}

/**
 * Public URL of an object in the product-images bucket. `baseUrl` is NEXT_PUBLIC_SUPABASE_URL.
 * Returns null for a path that could escape the bucket folder.
 */
export function publicImageUrl(baseUrl: string, storagePath: string): string | null {
  if (!storagePath || storagePath.startsWith("/") || storagePath.split("/").some((p) => p === ".." || p === "." || p === "")) {
    return null;
  }
  const origin = new URL(baseUrl).origin;
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${origin}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${encoded}`;
}

export function placeholderImage(product: Pick<PublicProductRow, "name" | "product_type">): ProductImage {
  return {
    src: PLACEHOLDER_BY_TYPE[product.product_type] ?? PLACEHOLDER_BY_TYPE.part,
    alt: `${product.name} (placeholder image)`,
    placeholder: true,
  };
}

/** Images of one product, primary first then by sort order. A placeholder when there are none. */
export function mapImages(
  product: Pick<PublicProductRow, "name" | "product_type">,
  rows: ProductImageRow[],
  baseUrl: string,
): ProductImage[] {
  const images = [...rows]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .flatMap((r, i) => {
      const src = publicImageUrl(baseUrl, r.storage_path);
      return src ? [{ src, alt: r.alt_text.trim() || (i === 0 ? product.name : `${product.name}, view ${i + 1}`), placeholder: false }] : [];
    });
  return images.length > 0 ? images : [placeholderImage(product)];
}

/** The variant a product is represented by in lists: the default, else the first by sort order. */
export function pickDisplayVariant<T extends Pick<PublicVariantRow, "is_default" | "sort_order">>(variants: T[]): T | undefined {
  return [...variants].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.sort_order - b.sort_order)[0];
}

export type CardProductRow = Pick<PublicProductRow, "id" | "slug" | "name" | "short_description" | "part_number" | "product_type" | "specs">;

export type ProductCardInput = {
  product: CardProductRow;
  variant: PublicVariantRow;
  stock_status: StockStatus;
  images: ProductImageRow[];
  baseUrl: string;
  specLimit?: number;
};

export function mapProductCard({ product, variant, stock_status, images, baseUrl, specLimit = 2 }: ProductCardInput): Product {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    short_description: product.short_description ?? "",
    variant_id: variant.id,
    sku: variant.sku,
    part_number: product.part_number,
    ...variantPrices(variant),
    stock_status,
    image: mapImages(product, images, baseUrl)[0],
    specs: parseSpecs(product.specs, specLimit),
  };
}

export function mapVariant(v: PublicVariantRow, stock_status: StockStatus): ProductVariant {
  return {
    id: v.id,
    sku: v.sku,
    name: v.name,
    option_values: parseOptionValues(v.option_values),
    ...variantPrices(v),
    stock_status,
    is_default: v.is_default,
  };
}

export type ProductDetailInput = {
  product: PublicProductRow;
  variants: PublicVariantRow[];
  stock: Map<string, StockStatus>;
  images: ProductImageRow[];
  brand: Pick<BrandRow, "name"> | null;
  models: TractorModel[];
  baseUrl: string;
};

/** Returns null when the product has no active variant to sell. */
export function mapProductDetail({ product, variants, stock, images, brand, models, baseUrl }: ProductDetailInput): ProductDetail | null {
  const ordered = [...variants].sort((a, b) => a.sort_order - b.sort_order);
  const display = pickDisplayVariant(ordered);
  if (!display) return null;
  const mapped = ordered.map((v) => mapVariant(v, toStockStatus(stock.get(v.id))));
  const card = mapProductCard({ product, variant: display, stock_status: toStockStatus(stock.get(display.id)), images, baseUrl, specLimit: 30 });
  return {
    ...card,
    description: product.description ?? "",
    brand: brand?.name ?? null,
    origin: product.origin,
    viscosity_grade: product.viscosity_grade,
    oil_specifications: product.oil_specifications,
    warranty_info: product.warranty_info,
    packaging_info: product.packaging_info,
    oem_part_numbers: product.oem_part_numbers,
    category_id: product.category_id,
    variants: mapped,
    images: mapImages(product, images, baseUrl),
    models,
    seo_title: product.seo_title,
    seo_description: product.seo_description,
  };
}

export function mapCartItem(input: {
  variant: PublicVariantRow;
  product: CardProductRow;
  stock_status: StockStatus;
  images: ProductImageRow[];
  baseUrl: string;
}): CartCatalogItem {
  const { variant, product } = input;
  return {
    variant_id: variant.id,
    product_id: product.id,
    slug: product.slug,
    name: product.name,
    variant_name: variant.name.trim().toLowerCase() === "default" ? null : variant.name,
    sku: variant.sku,
    ...variantPrices(variant),
    stock_status: input.stock_status,
    image: mapImages(product, input.images, input.baseUrl)[0],
  };
}

/** Short badge for a product card: the first model it is listed for. */
export function fitmentLabel(rows: Pick<CompatibilityRow, "tractor_model_id">[], models: Map<string, TractorModel>): string | undefined {
  for (const r of rows) {
    const model = models.get(r.tractor_model_id);
    if (model) return `Fits ${model.model}`;
  }
  return undefined;
}

const PAYMENT_COPY = {
  cod: { name: "Cash on delivery", description: "Pay when you receive your order." },
  bank_transfer: { name: "Bank transfer", description: "Bank details are shared with your order confirmation." },
} as const;

export function mapStoreSettings(row: PublicSettingsRow, deliveryMethods: PublicDeliveryRow[]): StoreSettings {
  return {
    business_name: row.business_name,
    tagline: row.tagline,
    value_statement: row.value_statement,
    phone_primary: row.phone_primary,
    phone_secondary: row.phone_secondary,
    whatsapp_number: row.whatsapp_number,
    email: row.email,
    address_line: row.address_line,
    city: row.city,
    province: row.province,
    business_hours: row.business_hours,
    announcement_text: row.announcement_text,
    delivery_charge_note: row.delivery_charge_note,
    return_policy_note: row.return_policy_note,
    delivery_methods: [...deliveryMethods]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ id, name, description }) => ({ id, name, description })),
    payment_methods: [
      { id: "cod", ...PAYMENT_COPY.cod, enabled: row.cod_enabled },
      { id: "bank_transfer", ...PAYMENT_COPY.bank_transfer, enabled: row.bank_transfer_enabled },
    ],
  };
}

/** Pagination arithmetic for a server-side page: the requested page is clamped into range. */
export function pageInfo(total: number, requested: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(Math.max(1, requested), pageCount), pageCount };
}
