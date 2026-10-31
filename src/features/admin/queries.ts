// Reads for the admin pages. They run as the signed-in staff member (anon key + session cookie), so
// row-level security applies: a customer who somehow reached this code would get empty results, and
// cost prices come back only for an admin. Every query lists its columns.
//
// The catalogue of a small shop fits in memory, so the list pages load it whole (a few flat queries,
// joined here) and filter in the browser: search is instant and unsaved edits survive a filter change.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminBrand,
  AdminCategory,
  AdminCompatibility,
  AdminCourier,
  AdminImage,
  AdminMake,
  AdminModel,
  AdminProductDetail,
  AdminSettings,
  AdminVariantDetail,
  CatalogIndex,
  PriceChangeRow,
  StockMovementRow,
} from "./types";

/** PostgREST returns at most 1000 rows per request: read in pages, in a stable order. */
const PAGE = 1000;
/** A safety stop, far above any realistic shop here. */
const MAX_ROWS = 20_000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>;

async function fetchAll<T>(what: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const res = await page(from, from + PAGE - 1);
    if (res.error) throw new Error(`admin: reading ${what} failed (${res.error.code ?? "no code"}): ${res.error.message}`);
    const chunk = res.data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
  throw new Error(`admin: ${what} has more than ${MAX_ROWS} rows`);
}

function ok<T>(res: { data: T | null; error: { code?: string; message: string } | null }, what: string): T {
  if (res.error) throw new Error(`admin: reading ${what} failed (${res.error.code ?? "no code"}): ${res.error.message}`);
  return res.data as T;
}

const CATEGORY_COLUMNS = "id,parent_id,slug,name,description,icon,sort_order,is_active";
const BRAND_COLUMNS = "id,slug,name,description,is_active";
const MAKE_COLUMNS = "id,slug,name,sort_order,is_active";
const MODEL_COLUMNS = "id,make_id,slug,name,year_from,year_to,sort_order,is_active";
const PRODUCT_ROW_COLUMNS = "id,slug,name,status,product_type,category_id,brand_id,part_number,is_featured,updated_at";
const VARIANT_ROW_COLUMNS = "id,product_id,sku,name,regular_price_paisa,sale_price_paisa,is_default,is_active,sort_order,updated_at";
const INVENTORY_COLUMNS = "variant_id,on_hand,reserved,low_stock_threshold,reorder_level";
const PRODUCT_COLUMNS =
  "id,slug,name,short_description,description,category_id,brand_id,product_type,part_number,oem_part_numbers,specs,viscosity_grade,oil_specifications,origin,warranty_info,packaging_info,is_returnable,is_featured,status,seo_title,seo_description,published_at,created_at,updated_at";
const VARIANT_DETAIL_COLUMNS =
  "id,product_id,sku,barcode,name,regular_price_paisa,sale_price_paisa,weight_grams,length_mm,width_mm,height_mm,is_default,is_active,sort_order,updated_at";
const IMAGE_COLUMNS = "id,product_id,storage_path,alt_text,sort_order,is_primary";
const COMPATIBILITY_COLUMNS = "id,product_id,tractor_model_id,year_from,year_to,notes";
const SETTINGS_COLUMNS =
  "business_name,tagline,value_statement,announcement_text,phone_primary,phone_secondary,whatsapp_number,email,address_line,city,province,business_hours,delivery_charge_note,return_policy_note,price_change_alert_percent";

// --- the catalogue ---------------------------------------------------------------------------------------

export async function loadCatalogIndex(db: SupabaseClient): Promise<CatalogIndex> {
  const [categories, brands, products, variants, inventory] = await Promise.all([
    fetchAll<AdminCategory>("categories", (a, b) =>
      db.from("categories").select(CATEGORY_COLUMNS).order("sort_order").order("id").range(a, b),
    ),
    fetchAll<AdminBrand>("brands", (a, b) => db.from("brands").select(BRAND_COLUMNS).order("name").order("id").range(a, b)),
    fetchAll<CatalogIndex["products"][number]>("products", (a, b) =>
      db.from("products").select(PRODUCT_ROW_COLUMNS).order("name").order("id").range(a, b),
    ),
    fetchAll<CatalogIndex["variants"][number]>("variants", (a, b) =>
      db.from("product_variants").select(VARIANT_ROW_COLUMNS).order("product_id").order("sort_order").order("id").range(a, b),
    ),
    fetchAll<CatalogIndex["inventory"][number]>("inventory", (a, b) =>
      db.from("inventory").select(INVENTORY_COLUMNS).order("variant_id").range(a, b),
    ),
  ]);
  return { categories, brands, products, variants, inventory };
}

export async function loadTractors(db: SupabaseClient): Promise<{ makes: AdminMake[]; models: AdminModel[]; compatibilityCounts: Record<string, number> }> {
  const [makes, models, compat] = await Promise.all([
    db.from("tractor_makes").select(MAKE_COLUMNS).order("sort_order").order("name"),
    fetchAll<AdminModel>("tractor models", (a, b) => db.from("tractor_models").select(MODEL_COLUMNS).order("sort_order").order("id").range(a, b)),
    fetchAll<{ tractor_model_id: string }>("compatibility", (a, b) =>
      db.from("product_compatibility").select("tractor_model_id").order("id").range(a, b),
    ),
  ]);
  const compatibilityCounts: Record<string, number> = {};
  for (const row of compat) compatibilityCounts[row.tractor_model_id] = (compatibilityCounts[row.tractor_model_id] ?? 0) + 1;
  return { makes: ok<AdminMake[]>(makes, "tractor makes"), models, compatibilityCounts };
}

export async function loadProduct(db: SupabaseClient, id: string) {
  const [product, variants, images, compat] = await Promise.all([
    db.from("products").select(PRODUCT_COLUMNS).eq("id", id).maybeSingle(),
    db.from("product_variants").select(VARIANT_DETAIL_COLUMNS).eq("product_id", id).order("sort_order").order("id"),
    db.from("product_images").select(IMAGE_COLUMNS).eq("product_id", id).order("sort_order").order("created_at"),
    db.from("product_compatibility").select(COMPATIBILITY_COLUMNS).eq("product_id", id).order("created_at"),
  ]);
  const productRow = ok<AdminProductDetail | null>(product as never, "product");
  if (!productRow) return null;
  const variantRows = ok<Omit<AdminVariantDetail, "cost_paisa" | "on_hand" | "reserved">[]>(variants as never, "variants");
  const ids = variantRows.map((v) => v.id);
  const [inv, cost] = await Promise.all([
    ids.length ? db.from("inventory").select(INVENTORY_COLUMNS).in("variant_id", ids) : Promise.resolve({ data: [], error: null }),
    // Staff get no rows here: costs are admin-only in the database, not just hidden in the page.
    ids.length ? db.from("product_variant_costs").select("variant_id,cost_paisa").in("variant_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  const invById = new Map(ok<{ variant_id: string; on_hand: number; reserved: number }[]>(inv as never, "inventory").map((r) => [r.variant_id, r]));
  const costById = new Map(ok<{ variant_id: string; cost_paisa: number }[]>(cost as never, "costs").map((r) => [r.variant_id, r.cost_paisa]));
  const detailed: AdminVariantDetail[] = variantRows.map((v) => ({
    ...v,
    cost_paisa: costById.get(v.id) ?? null,
    on_hand: invById.get(v.id)?.on_hand ?? 0,
    reserved: invById.get(v.id)?.reserved ?? 0,
  }));
  return {
    product: productRow,
    variants: detailed,
    images: ok<AdminImage[]>(images as never, "images"),
    compatibility: ok<AdminCompatibility[]>(compat as never, "compatibility"),
  };
}

// --- prices and stock history -----------------------------------------------------------------------------

async function withActorNames<T extends { changed_by?: string | null; actor_id?: string | null }>(db: SupabaseClient, rows: T[]) {
  const ids = [...new Set(rows.flatMap((r) => r.changed_by ?? r.actor_id ?? []))];
  const names = new Map<string, string>();
  if (ids.length) {
    const res = await db.from("profiles").select("id,full_name").in("id", ids);
    for (const p of ok<{ id: string; full_name: string | null }[]>(res as never, "profiles")) names.set(p.id, p.full_name ?? "Staff member");
  }
  return (id: string | null | undefined) => (id ? (names.get(id) ?? "Staff member") : null);
}

export async function loadPriceChanges(db: SupabaseClient, options: { variantId?: string; limit?: number } = {}): Promise<PriceChangeRow[]> {
  let query = db
    .from("price_changes")
    .select("id,variant_id,sku,product_name,old_regular_paisa,new_regular_paisa,old_sale_paisa,new_sale_paisa,changed_by,source,batch_id,created_at")
    .order("id", { ascending: false })
    .limit(Math.min(options.limit ?? 50, 200));
  if (options.variantId) query = query.eq("variant_id", options.variantId);
  const rows = ok<Omit<PriceChangeRow, "changed_by_name">[]>((await query) as never, "price changes");
  const nameOf = await withActorNames(db, rows);
  return rows.map((r) => ({ ...r, changed_by_name: nameOf(r.changed_by) }));
}

export async function loadStockMovements(db: SupabaseClient, variantId: string, limit = 50): Promise<StockMovementRow[]> {
  const res = await db
    .from("stock_movements")
    .select("id,movement_type,on_hand_delta,reserved_delta,on_hand_after,reserved_after,reason,actor_id,order_id,created_at")
    .eq("variant_id", variantId)
    .order("id", { ascending: false })
    .limit(limit);
  const rows = ok<(Omit<StockMovementRow, "actor_name"> & { actor_id: string | null })[]>(res as never, "stock movements");
  const nameOf = await withActorNames(db, rows);
  return rows.map(({ actor_id, ...r }) => ({ ...r, actor_name: nameOf(actor_id) }));
}

// --- settings ----------------------------------------------------------------------------------------------

export async function loadSettings(db: SupabaseClient): Promise<AdminSettings> {
  const res = await db.from("store_settings").select(SETTINGS_COLUMNS).eq("id", true).single();
  return ok<AdminSettings>(res as never, "store settings");
}

/** The alert percentage is readable by staff too (it is a public column). */
export async function loadPriceAlertPercent(db: SupabaseClient): Promise<number> {
  const res = await db.from("store_settings").select("price_change_alert_percent").eq("id", true).single();
  return ok<{ price_change_alert_percent: number }>(res as never, "store settings").price_change_alert_percent;
}

export async function loadNotificationEmails(db: SupabaseClient): Promise<string[]> {
  const res = await db.from("store_private_settings").select("order_notification_emails").eq("id", true).single();
  return ok<{ order_notification_emails: string[] }>(res as never, "private settings").order_notification_emails;
}

export async function loadCouriers(db: SupabaseClient): Promise<AdminCourier[]> {
  const res = await db.from("couriers").select("id,name,sort_order,is_active").order("sort_order").order("name");
  return ok<AdminCourier[]>(res as never, "couriers");
}
