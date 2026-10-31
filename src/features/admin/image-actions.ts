"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AdminError, dbCheck, runAdminAction, type AdminContext } from "./action";
import type { AdminResult } from "./types";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT, productImagePath, sniffImage } from "@/lib/storage/image";
import { idSchema, imageAltSchema } from "@/lib/validation/admin";

// Product photos: upload, replace, remove, alt text, primary image and order. Files go to the public
// product-images bucket and rows to product_images, both with the signed-in staff session (the bucket's
// policies and the table's row-level security decide, not this code). The database fixes the path shape,
// the limit of 8, and keeps exactly one primary image.

const BUCKET = "product-images";
const productPath = (id: string) => `/admin/products/${id}`;

type Prepared = { bytes: Uint8Array; mime: string; ext: "jpg" | "png" | "webp" | "avif" };

/** Reads the uploaded file and decides what it really is. Throws a message the owner can act on. */
async function readImage(form: FormData): Promise<Prepared> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AdminError("Choose a photo first.");
  if (file.size > MAX_IMAGE_BYTES) throw new AdminError("That photo is too large. Photos must be under 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new AdminError("That file is not a JPEG, PNG, WebP or AVIF photo.");
  return { bytes, ...kind };
}

async function putObject(supabase: AdminContext["supabase"], productId: string, image: Prepared): Promise<string> {
  const path = productImagePath(productId, randomUUID(), image.ext);
  const { error } = await supabase.storage.from(BUCKET).upload(path, image.bytes, { contentType: image.mime, cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("admin: photo upload failed", error.message);
    throw new AdminError("The photo could not be uploaded. Please try again.");
  }
  return path;
}

/** A file left behind is only an orphan in a public bucket; it is logged, never shown as a failure. */
async function dropObject(supabase: AdminContext["supabase"], path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("admin: could not remove a photo file", path, error.message);
}

const uploadFields = z.object({ productId: idSchema, alt: imageAltSchema.shape.alt_text });

export async function uploadProductImageAction(form: FormData): Promise<AdminResult<{ imageId: string }>> {
  const productId = String(form.get("productId") ?? "");
  return runAdminAction({
    next: productPath(productId),
    schema: uploadFields,
    input: { productId, alt: String(form.get("alt") ?? "") },
    revalidate: ["products"],
    async run({ productId, alt }, { supabase }) {
      const image = await readImage(form);
      // A friendly early message; the database enforces the limit itself (product_images_before_write).
      const count = dbCheck(await supabase.from("product_images").select("id").eq("product_id", productId), "count photos") as { id: string }[];
      if (count.length >= MAX_IMAGES_PER_PRODUCT) throw new AdminError(`A product can have up to ${MAX_IMAGES_PER_PRODUCT} photos. Remove one first.`);

      const path = await putObject(supabase, productId, image);
      const inserted = await supabase.from("product_images").insert({ product_id: productId, storage_path: path, alt_text: alt }).select("id").single();
      if (inserted.error) {
        await dropObject(supabase, path);
        dbCheck(inserted, "save photo");
      }
      return { message: "Photo added.", data: { imageId: (inserted.data as { id: string }).id } };
    },
  });
}

const replaceFields = z.object({ productId: idSchema, imageId: idSchema });

/** The new file gets a new name (so no cache shows the old picture); the old file is removed afterwards. */
export async function replaceProductImageAction(form: FormData): Promise<AdminResult> {
  const productId = String(form.get("productId") ?? "");
  return runAdminAction({
    next: productPath(productId),
    schema: replaceFields,
    input: { productId, imageId: String(form.get("imageId") ?? "") },
    revalidate: ["products"],
    async run({ productId, imageId }, { supabase }) {
      const image = await readImage(form);
      const current = dbCheck(await supabase.from("product_images").select("storage_path").eq("id", imageId).eq("product_id", productId).maybeSingle(), "read photo") as { storage_path: string } | null;
      if (!current) throw new AdminError("That photo no longer exists. Reload the page.");

      const path = await putObject(supabase, productId, image);
      const updated = await supabase.from("product_images").update({ storage_path: path }).eq("id", imageId).eq("product_id", productId).select("id").single();
      if (updated.error) {
        await dropObject(supabase, path);
        dbCheck(updated, "replace photo");
      }
      await dropObject(supabase, current.storage_path);
      return { message: "Photo replaced." };
    },
  });
}

export async function removeProductImageAction(productId: string, imageId: string): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    schema: z.object({ productId: idSchema, imageId: idSchema }),
    input: { productId, imageId },
    revalidate: ["products"],
    async run({ productId, imageId }, { supabase }) {
      // Row first, file after: a refused delete never loses a file. The database promotes the next photo to primary.
      const rows = dbCheck(await supabase.from("product_images").delete().eq("id", imageId).eq("product_id", productId).select("storage_path"), "remove photo") as { storage_path: string }[];
      if (rows.length === 0) throw new AdminError("That photo no longer exists. Reload the page.");
      await dropObject(supabase, rows[0].storage_path);
      return { message: "Photo removed." };
    },
  });
}

export async function setImageAltAction(productId: string, imageId: string, alt: string): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    schema: z.object({ productId: idSchema, imageId: idSchema, alt: imageAltSchema.shape.alt_text }),
    input: { productId, imageId, alt },
    revalidate: ["products"],
    async run({ productId, imageId, alt }, { supabase }) {
      dbCheck(await supabase.from("product_images").update({ alt_text: alt }).eq("id", imageId).eq("product_id", productId).select("id").single(), "save alt text");
      return { message: "Description saved." };
    },
  });
}

export async function setPrimaryImageAction(productId: string, imageId: string): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    schema: z.object({ productId: idSchema, imageId: idSchema }),
    input: { productId, imageId },
    revalidate: ["products"],
    async run({ imageId }, { supabase }) {
      dbCheck(await supabase.rpc("set_primary_image", { p_image_id: imageId }), "set primary photo");
      return { message: "Main photo changed." };
    },
  });
}

export async function reorderImagesAction(productId: string, ids: string[]): Promise<AdminResult> {
  return runAdminAction({
    next: productPath(productId),
    schema: z.object({ productId: idSchema, ids: z.array(idSchema).min(1).max(MAX_IMAGES_PER_PRODUCT) }),
    input: { productId, ids },
    revalidate: ["products"],
    async run({ ids }, { supabase }) {
      dbCheck(await supabase.rpc("catalog_reorder", { p_entity: "product_images", p_ids: ids }), "reorder photos");
      return { message: "Order saved." };
    },
  });
}
