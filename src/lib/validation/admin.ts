// Schemas for every admin form and action. The browser forms use them for instant feedback, but every
// server action parses again with the same schema: only the server's result counts.
//
// Forms hold text (that is what an input gives), so numbers and prices are parsed here. Money goes
// through rupeesToPaisa(): never a float.
import { z } from "zod";
import { rupeesToPaisa } from "@/lib/pricing/money";
import type { CategoryIcon } from "@/types/catalog";
import { normalisePkMobile, PROVINCES } from "./checkout";
import { emailSchema } from "./auth";

// --- building blocks --------------------------------------------------------------------------------

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;

/** "Massey Ferguson 385 (2WD)" -> "massey-ferguson-385-2wd". Empty when nothing usable is left (for example Urdu only). */
export function slugify(text: string, max = 80): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Ids come from Postgres and from the seed (md5-made), so they are checked as GUIDs, not strictly as UUIDv4. */
export const idSchema = z.guid("That item could not be found. Reload the page.");

const nullableId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(idSchema.nullable());

const reqText = (what: string, max: number) =>
  z.string().trim().min(1, `Enter ${what}`).max(max, `Keep this under ${max} characters`);

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((v) => (v === "" ? null : v));

/** A whole number from text, or null when empty. */
const optInt = (what: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      if (!/^\d{1,9}$/.test(value) || Number(value) < min || Number(value) > max) {
        ctx.addIssue({ code: "custom", message: `${what}: enter a whole number from ${min} to ${max}` });
        return z.NEVER;
      }
      return Number(value);
    });

const reqInt = (what: string, min: number, max: number) =>
  optInt(what, min, max).refine((v): v is number => v !== null, `Enter ${what}`);

/** A price typed in rupees -> paisa; must be above zero. */
const price = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const paisa = rupeesToPaisa(value);
    if (paisa === null || paisa <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter a price, like 1250 or 1250.50" });
      return z.NEVER;
    }
    return paisa;
  });

const optPrice = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const paisa = rupeesToPaisa(value);
    if (paisa === null || paisa <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter an amount, like 1250 or 1250.50, or leave empty" });
      return z.NEVER;
    }
    return paisa;
  });

/** One entry per line or comma, blanks dropped, duplicates removed. */
function list(what: string, maxItems: number, maxLength: number) {
  return z
    .string()
    .transform((text) => [...new Set(text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))])
    .refine((items) => items.length <= maxItems, `At most ${maxItems} ${what}`)
    .refine((items) => items.every((s) => s.length <= maxLength), `Each entry must be under ${maxLength} characters`);
}

// --- categories, brands, tractors ---------------------------------------------------------------------

export const CATEGORY_ICON_NAMES = [
  "tractor", "engine-oil", "lubricant", "hydraulic", "filter", "accessory", "tyre", "electrical", "tools",
  "engine", "clutch", "brake", "gearbox", "transmission", "steering", "cooling", "fuel", "belt", "bearing", "body",
] as const satisfies readonly CategoryIcon[];

export const categorySchema = z.object({
  name: reqText("a name", 80),
  slug: z.string().trim().toLowerCase().max(80, "Keep this under 80 characters").regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, "Use lowercase letters, numbers and single dashes"),
  parent_id: nullableId,
  description: optText(500),
  icon: z.enum(CATEGORY_ICON_NAMES, { error: "Choose an icon" }),
  is_active: z.boolean(),
});
export type CategoryInput = z.input<typeof categorySchema>;

export const brandSchema = z.object({
  name: reqText("a name", 80),
  slug: z.string().trim().toLowerCase().max(80, "Keep this under 80 characters").regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, "Use lowercase letters, numbers and single dashes"),
  description: optText(1000),
  is_active: z.boolean(),
});
export type BrandInput = z.input<typeof brandSchema>;

export const makeSchema = z.object({
  name: reqText("a name", 80),
  slug: z.string().trim().toLowerCase().max(80, "Keep this under 80 characters").regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, "Use lowercase letters, numbers and single dashes"),
  is_active: z.boolean(),
});
export type MakeInput = z.input<typeof makeSchema>;

const year = optInt("Year", 1900, 2100);

export const modelSchema = z
  .object({
    make_id: idSchema,
    name: reqText("a name", 80),
    slug: z.string().trim().toLowerCase().max(80, "Keep this under 80 characters").regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, "Use lowercase letters, numbers and single dashes"),
    year_from: year,
    year_to: year,
    is_active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.year_from !== null && v.year_to !== null && v.year_to < v.year_from) {
      ctx.addIssue({ code: "custom", path: ["year_to"], message: "The last year cannot be before the first year" });
    }
  });
export type ModelInput = z.input<typeof modelSchema>;

// --- products ---------------------------------------------------------------------------------------

export const PRODUCT_TYPES = ["part", "oil", "filter", "accessory", "tool", "tyre", "other"] as const;
export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;

export const PRODUCT_TYPE_LABELS: Record<(typeof PRODUCT_TYPES)[number], string> = {
  part: "Spare part",
  oil: "Oil or lubricant",
  filter: "Filter",
  accessory: "Accessory",
  tool: "Tool",
  tyre: "Tyre",
  other: "Other",
};

export const PRODUCT_STATUS_LABELS: Record<(typeof PRODUCT_STATUSES)[number], string> = {
  draft: "Draft (hidden)",
  published: "Published (visible in the shop)",
  archived: "Archived (hidden)",
};

const specRow = z.object({ label: z.string().trim().max(60, "Keep this under 60 characters"), value: z.string().trim().max(200, "Keep this under 200 characters") });

export const productSchema = z.object({
  name: reqText("the product name", 200),
  slug: z.string().trim().toLowerCase().max(120, "Keep this under 120 characters").regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, "Use lowercase letters, numbers and single dashes"),
  category_id: idSchema,
  brand_id: nullableId,
  product_type: z.enum(PRODUCT_TYPES, { error: "Choose a type" }),
  status: z.enum(PRODUCT_STATUSES, { error: "Choose a status" }),
  short_description: optText(500),
  description: optText(10_000),
  part_number: optText(80),
  oem_part_numbers: list("OEM or compatible part numbers", 50, 80),
  viscosity_grade: optText(40),
  oil_specifications: list("oil specifications", 30, 100),
  origin: optText(80),
  warranty_info: optText(1000),
  packaging_info: optText(500),
  is_returnable: z.boolean(),
  is_featured: z.boolean(),
  seo_title: optText(70),
  seo_description: optText(170),
  // Rows left empty are dropped; a row needs both a label and a value.
  specs: z
    .array(specRow)
    .transform((rows) => rows.filter((r) => r.label !== "" || r.value !== ""))
    .refine((rows) => rows.length <= 30, "At most 30 specifications")
    .refine((rows) => rows.every((r) => r.label !== "" && r.value !== ""), "Fill in both the name and the value of every specification"),
});
export type ProductInput = z.input<typeof productSchema>;
export type ProductValues = z.output<typeof productSchema>;

const variantFields = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(SKU_PATTERN, "Use 2 to 64 capital letters, numbers, dots, dashes or slashes, starting with a letter or number"),
  name: reqText("a variant name, like 5 L or Default", 120),
  barcode: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^[0-9A-Za-z-]{4,64}$/.test(v), "A barcode has 4 to 64 letters, numbers or dashes"),
  regular_price: price,
  sale_price: optPrice,
  /** Purchase cost. Only an administrator can read or set it; it is ignored for staff. */
  cost: optPrice,
  weight_grams: optInt("Weight", 0, 10_000_000),
  length_mm: optInt("Length", 0, 100_000),
  width_mm: optInt("Width", 0, 100_000),
  height_mm: optInt("Height", 0, 100_000),
  is_default: z.boolean(),
  is_active: z.boolean(),
});

function saleBelowRegular(v: { sale_price: number | null; regular_price: number }, ctx: z.RefinementCtx) {
  if (v.sale_price !== null && v.sale_price >= v.regular_price) {
    ctx.addIssue({ code: "custom", path: ["sale_price"], message: "The sale price must be lower than the regular price" });
  }
}

export const variantSchema = variantFields.superRefine(saleBelowRegular);
export type VariantInput = z.input<typeof variantSchema>;
export type VariantValues = z.output<typeof variantSchema>;

/** The first variant of a new product also takes the opening stock. */
export const newVariantSchema = variantFields
  .extend({ initial_stock: optInt("Opening stock", 0, 1_000_000) })
  .superRefine(saleBelowRegular);
export type NewVariantInput = z.input<typeof newVariantSchema>;

export const createProductSchema = z.object({ product: productSchema, variant: newVariantSchema });

export const compatibilitySchema = z
  .object({
    tractor_model_id: idSchema,
    year_from: year,
    year_to: year,
    notes: optText(300),
  })
  .superRefine((v, ctx) => {
    if (v.year_from !== null && v.year_to !== null && v.year_to < v.year_from) {
      ctx.addIssue({ code: "custom", path: ["year_to"], message: "The last year cannot be before the first year" });
    }
  });
export type CompatibilityInput = z.input<typeof compatibilitySchema>;

export const imageAltSchema = z.object({ alt_text: z.string().trim().max(200, "Keep this under 200 characters") });

// --- stock --------------------------------------------------------------------------------------------

/** What the stock form offers. The database movement types are receive, return, damage and adjustment. */
export const STOCK_KINDS = ["receive", "return", "damage", "correction_add", "correction_remove"] as const;
export const STOCK_KIND_LABELS: Record<(typeof STOCK_KINDS)[number], string> = {
  receive: "Stock received",
  return: "Returned to the shelf",
  damage: "Damaged or lost",
  correction_add: "Count correction: add",
  correction_remove: "Count correction: remove",
};

export const stockAdjustSchema = z.object({
  variant_id: idSchema,
  kind: z.enum(STOCK_KINDS, { error: "Choose what happened" }),
  quantity: reqInt("a quantity", 1, 1_000_000),
  reason: z.string().trim().min(3, "Write a short reason (at least 3 characters)").max(500, "Keep this under 500 characters"),
});
export type StockAdjustInput = z.input<typeof stockAdjustSchema>;

export function stockMovement(kind: (typeof STOCK_KINDS)[number], quantity: number) {
  switch (kind) {
    case "receive":
      return { type: "receive" as const, delta: quantity };
    case "return":
      return { type: "return" as const, delta: quantity };
    case "damage":
      return { type: "damage" as const, delta: -quantity };
    case "correction_add":
      return { type: "adjustment" as const, delta: quantity };
    case "correction_remove":
      return { type: "adjustment" as const, delta: -quantity };
  }
}

export const thresholdsSchema = z.object({
  variant_id: idSchema,
  low_stock_threshold: reqInt("a low-stock level", 0, 100_000),
  reorder_level: optInt("Reorder level", 0, 100_000),
});
export type ThresholdsInput = z.input<typeof thresholdsSchema>;

// --- daily prices -------------------------------------------------------------------------------------

const paisa = z.number().int().min(1).max(100_000_000_000);

export const dailyChangeSchema = z.object({
  variant_id: idSchema,
  expected_updated_at: z.string().min(10).max(40).optional(),
  expected_on_hand: z.number().int().min(0).max(1_000_000).optional(),
  regular_price_paisa: paisa.optional(),
  sale_price_paisa: paisa.nullable().optional(),
  is_active: z.boolean().optional(),
  set_on_hand: z.number().int().min(0).max(1_000_000).optional(),
});

export const dailyChangesSchema = z.object({
  changes: z.array(dailyChangeSchema).min(1, "There is nothing to save").max(500, "Save at most 500 changes at a time"),
  confirm_large: z.boolean(),
});
export type DailyChangesInput = z.input<typeof dailyChangesSchema>;

// --- store settings -----------------------------------------------------------------------------------

/** "0321 8219594" or "+92 321 8219594" -> "923218219594". Empty stays empty. */
export function whatsappDigits(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  return `92${normalisePkMobile(trimmed).slice(1)}`;
}

export const settingsSchema = z.object({
  business_name: reqText("the business name", 120),
  tagline: z.string().trim().max(200, "Keep this under 200 characters"),
  value_statement: z.string().trim().max(200, "Keep this under 200 characters"),
  announcement_text: z.string().trim().max(200, "Keep this under 200 characters"),
  phone_primary: z.string().trim().max(30, "Keep this under 30 characters"),
  phone_secondary: optText(30),
  whatsapp_number: z
    .string()
    .trim()
    .transform(whatsappDigits)
    .refine((v) => v === "" || /^92\d{10}$/.test(v), "Enter a Pakistani mobile number, like 0321 8219594"),
  email: z
    .string()
    .trim()
    .max(254, "Keep this under 254 characters")
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address"),
  address_line: z.string().trim().max(200, "Keep this under 200 characters"),
  city: z.string().trim().max(80, "Keep this under 80 characters"),
  province: z.string().trim().refine((v) => v === "" || (PROVINCES as readonly string[]).includes(v), "Choose a province"),
  business_hours: z.string().trim().max(120, "Keep this under 120 characters"),
  delivery_charge_note: reqText("the delivery note", 200),
  return_policy_note: z.string().trim().max(300, "Keep this under 300 characters"),
  price_change_alert_percent: reqInt("a percentage", 1, 500),
  /** Private: who is emailed about new orders. */
  order_notification_emails: z
    .string()
    .transform((text) => [...new Set(text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))])
    .refine((emails) => emails.length <= 5, "At most 5 email addresses")
    .refine((emails) => emails.every((e) => emailSchema.safeParse(e).success), "Check the email addresses (separate several with commas)"),
});
export type SettingsInput = z.input<typeof settingsSchema>;

export const courierSchema = z.object({
  name: reqText("a courier name", 60),
  is_active: z.boolean(),
});
export type CourierInput = z.input<typeof courierSchema>;

/** The list of ids a reorder sends: the whole sibling list, in the new order. */
export const orderSchema = z.array(idSchema).min(1).max(500);
