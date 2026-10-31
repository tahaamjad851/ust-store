"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AdminError, dbCheck, runAdminAction, type AdminContext } from "./action";
import type { AdminResult } from "./types";
import {
  compatibilitySchema,
  createProductSchema,
  idSchema,
  PRODUCT_STATUSES,
  productSchema,
  slugify,
  variantSchema,
  type VariantValues,
} from "@/lib/validation/admin";

// Products, variants and compatibility. Staff do the day-to-day work (create, edit, archive, price,
// compatibility); only an admin sets costs and really deletes. Row-level security and the database
// guards (*_guard_delete) enforce the same, so none of this depends on this file being right.

const productPath = (id: string) => `/admin/products/${id}`;

/** The details form sends the status only when the person changed that field (see EditProductForm). */
const updateProductSchema = productSchema.extend({ status: productSchema.shape.status.optional() });

function productRow(v: z.output<typeof updateProductSchema>) {
  const slug = v.slug || slugify(v.name, 120);
  if (!slug) throw new AdminError("Check the highlighted fields.", { slug: "Enter a web address (letters and numbers)" });
  return {
    slug,
    name: v.name,
    category_id: v.category_id,
    brand_id: v.brand_id,
    product_type: v.product_type,
    ...(v.status ? { status: v.status } : {}),
    short_description: v.short_description,
    description: v.description,
    part_number: v.part_number,
    oem_part_numbers: v.oem_part_numbers,
    viscosity_grade: v.viscosity_grade,
    oil_specifications: v.oil_specifications,
    origin: v.origin,
    warranty_info: v.warranty_info,
    packaging_info: v.packaging_info,
    is_returnable: v.is_returnable,
    is_featured: v.is_featured,
    seo_title: v.seo_title,
    seo_description: v.seo_description,
    specs: v.specs,
  };
}

/** The variant columns the form edits. The default flag is handled apart (see makeDefault). */
function variantRow(v: VariantValues) {
  return {
    sku: v.sku,
    name: v.name,
    barcode: v.barcode,
    regular_price_paisa: v.regular_price,
    sale_price_paisa: v.sale_price,
    weight_grams: v.weight_grams,
    length_mm: v.length_mm,
    width_mm: v.width_mm,
    height_mm: v.height_mm,
    is_active: v.is_active,
  };
}

/** Puts a unique-violation (slug, SKU, barcode) on the field that caused it instead of the whole form. */
async function onField<T>(map: Record<string, string>, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AdminError && error.code && Object.hasOwn(map, error.code)) {
      throw new AdminError(error.message, { [map[error.code]]: error.message }, error.code, error.detail);
    }
    throw error;
  }
}

/** Costs are admin-only. Staff never touch them (a staff form does not send one, and an old cost stays as it is). */
async function saveCost(supabase: AdminContext["supabase"], variantId: string, cost: number | null) {
  if (cost === null) dbCheck(await supabase.from("product_variant_costs").delete().eq("variant_id", variantId), "clear cost");
  else dbCheck(await supabase.from("product_variant_costs").upsert({ variant_id: variantId, cost_paisa: cost }, { onConflict: "variant_id" }), "save cost");
}

/** One default variant per product: setting a new one clears the old one first (the database allows one). */
async function makeDefault(supabase: AdminContext["supabase"], productId: string, variantId: string) {
  dbCheck(await supabase.from("product_variants").update({ is_default: false }).eq("product_id", productId).eq("is_default", true).neq("id", variantId), "clear default variant");
}

// --- create -----------------------------------------------------------------------------------------------------

/**
 * Creates the product and its first variant (and opening stock). If the variant cannot be saved the product
 * stays as a draft, and the reply says so with its id, so the page can open the editor to finish the job.
 */
export async function createProductAction(input: unknown): Promise<AdminResult<{ productId: string }>> {
  return runAdminAction({
    next: "/admin/products/new",
    schema: createProductSchema,
    input,
    revalidate: ["products"],
    async run({ product, variant }, { supabase, user }) {
      const created = (await onField({ products_slug_key: "product.slug" }, async () =>
        dbCheck(await supabase.from("products").insert(productRow(product)).select("id").single(), "create product"),
      )) as { id: string };

      try {
        const inserted = dbCheck(
          await supabase.from("product_variants").insert({ ...variantRow(variant), is_default: true, product_id: created.id }).select("id").single(),
          "create variant",
        ) as { id: string };
        if (user.role === "admin" && variant.cost !== null) await saveCost(supabase, inserted.id, variant.cost);
        if (variant.initial_stock && variant.initial_stock > 0) {
          dbCheck(
            await supabase.rpc("adjust_stock", { p_variant_id: inserted.id, p_on_hand_delta: variant.initial_stock, p_movement_type: "receive", p_reason: "Opening stock" }),
            "opening stock",
          );
        }
      } catch (error) {
        if (error instanceof AdminError) {
          const fields: Record<string, string> | undefined =
            error.code === "product_variants_sku_key"
              ? { "variant.sku": error.message }
              : error.code === "product_variants_barcode_key"
                ? { "variant.barcode": error.message }
                : undefined;
          throw new AdminError(`The product was saved, but its variant was not: ${error.message}`, fields, "variant_failed", { productId: created.id });
        }
        throw error;
      }
      return { message: "Product added.", data: { productId: created.id } };
    },
  });
}

// --- the product ----------------------------------------------------------------------------------------------

export async function updateProductAction(id: string, input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(id),
    schema: z.object({ id: idSchema, values: updateProductSchema }),
    input: { id, values: input },
    revalidate: ["products"],
    async run({ id, values }, { supabase }) {
      await onField({ products_slug_key: "slug" }, async () =>
        dbCheck(await supabase.from("products").update(productRow(values)).eq("id", id).select("id").single(), "update product"),
      );
      return { message: "Product saved." };
    },
  });
}

/** Archive hides the product from the shop but keeps everything, orders included. */
export async function setProductStatusAction(id: string, status: (typeof PRODUCT_STATUSES)[number]): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(id),
    schema: z.object({ id: idSchema, status: z.enum(PRODUCT_STATUSES) }),
    input: { id, status },
    revalidate: ["products"],
    async run({ id, status }, { supabase }) {
      dbCheck(await supabase.from("products").update({ status }).eq("id", id).select("id").single(), "set product status");
      return { message: status === "archived" ? "Product archived. It is hidden from the shop." : status === "published" ? "Product published." : "Product moved to drafts." };
    },
  });
}

/**
 * A real delete, for a product that was never ordered (the database refuses otherwise). Its photos go too:
 * the rows are deleted first and the files after, so a refused delete never loses a photo.
 */
export async function deleteProductAction(id: string): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(id),
    role: "admin",
    schema: idSchema,
    input: id,
    revalidate: ["products"],
    async run(id, { supabase }) {
      const images = dbCheck(await supabase.from("product_images").select("storage_path").eq("product_id", id), "read product images") as { storage_path: string }[];
      const rows = dbCheck(await supabase.from("products").delete().eq("id", id).select("id"), "delete product");
      if (!rows || rows.length === 0) throw new AdminError("That product no longer exists.");
      if (images.length > 0) {
        const removed = await supabase.storage.from("product-images").remove(images.map((i) => i.storage_path));
        // The product is gone either way; a file that could not be removed is only an orphan in the bucket.
        if (removed.error) console.error("admin: product deleted but its photos were not removed", removed.error.message);
      }
    },
  }).then((result) => {
    if (result.ok) redirect("/admin/products");
    return result;
  });
}

// --- variants ---------------------------------------------------------------------------------------------------

export async function saveVariantAction(productId: string, variantId: string | null, input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    schema: z.object({ productId: idSchema, variantId: idSchema.nullable(), values: variantSchema }),
    input: { productId, variantId, values: input },
    revalidate: ["products"],
    async run({ productId, variantId, values }, { supabase, user }) {
      const fields = { product_variants_sku_key: "sku", product_variants_barcode_key: "barcode" };
      let id = variantId;
      await onField(fields, async () => {
        if (id) {
          dbCheck(await supabase.from("product_variants").update(variantRow(values)).eq("id", id).eq("product_id", productId).select("id").single(), "update variant");
        } else {
          const inserted = dbCheck(
            await supabase.from("product_variants").insert({ ...variantRow(values), is_default: false, product_id: productId }).select("id").single(),
            "create variant",
          ) as { id: string };
          id = inserted.id;
        }
      });
      // Only "make default" is acted on: unchecking it would leave the product without one.
      if (values.is_default && id) {
        await makeDefault(supabase, productId, id);
        dbCheck(await supabase.from("product_variants").update({ is_default: true }).eq("id", id), "set default variant");
      }
      if (user.role === "admin" && id) await saveCost(supabase, id, values.cost);
      return { message: variantId ? "Variant saved." : "Variant added." };
    },
  });
}

export async function deleteVariantAction(productId: string, variantId: string): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    role: "admin",
    schema: z.object({ productId: idSchema, variantId: idSchema }),
    input: { productId, variantId },
    revalidate: ["products"],
    async run({ productId, variantId }, { supabase }) {
      const siblings = dbCheck(await supabase.from("product_variants").select("id,is_default").eq("product_id", productId), "read variants") as { id: string; is_default: boolean }[];
      const target = siblings.find((v) => v.id === variantId);
      if (!target) throw new AdminError("That variant no longer exists.");
      if (siblings.length === 1) {
        throw new AdminError("A product needs at least one variant. Turn the variant off, or delete the whole product.");
      }
      const rows = dbCheck(await supabase.from("product_variants").delete().eq("id", variantId).eq("product_id", productId).select("id"), "delete variant");
      if (!rows || rows.length === 0) throw new AdminError("That variant no longer exists.");
      if (target.is_default) {
        const next = siblings.find((v) => v.id !== variantId)!;
        await makeDefault(supabase, productId, next.id);
        dbCheck(await supabase.from("product_variants").update({ is_default: true }).eq("id", next.id), "promote default variant");
      }
      return { message: "Variant deleted." };
    },
  });
}

export async function reorderVariantsAction(productId: string, ids: string[]): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    schema: z.object({ productId: idSchema, ids: z.array(idSchema).min(1).max(100) }),
    input: { productId, ids },
    revalidate: ["products"],
    async run({ ids }, { supabase }) {
      dbCheck(await supabase.rpc("catalog_reorder", { p_entity: "product_variants", p_ids: ids }), "reorder variants");
      return { message: "Order saved." };
    },
  });
}

// --- compatibility ------------------------------------------------------------------------------------------------

export async function saveCompatibilityAction(productId: string, compatibilityId: string | null, input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    schema: z.object({ productId: idSchema, compatibilityId: idSchema.nullable(), values: compatibilitySchema }),
    input: { productId, compatibilityId, values: input },
    revalidate: ["products"],
    async run({ productId, compatibilityId, values }, { supabase }) {
      const row = { tractor_model_id: values.tractor_model_id, year_from: values.year_from, year_to: values.year_to, notes: values.notes };
      if (compatibilityId) {
        dbCheck(await supabase.from("product_compatibility").update(row).eq("id", compatibilityId).eq("product_id", productId).select("id").single(), "update compatibility");
      } else {
        dbCheck(await supabase.from("product_compatibility").insert({ ...row, product_id: productId }), "add compatibility");
      }
      return { message: compatibilityId ? "Saved." : "Tractor model added." };
    },
  });
}

export async function removeCompatibilityAction(productId: string, compatibilityId: string): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    schema: z.object({ productId: idSchema, compatibilityId: idSchema }),
    input: { productId, compatibilityId },
    revalidate: ["products"],
    async run({ productId, compatibilityId }, { supabase }) {
      const rows = dbCheck(await supabase.from("product_compatibility").delete().eq("id", compatibilityId).eq("product_id", productId).select("id"), "remove compatibility");
      if (!rows || rows.length === 0) throw new AdminError("That entry no longer exists.");
      return { message: "Removed." };
    },
  });
}
