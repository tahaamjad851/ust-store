"use server";

import { z } from "zod";
import { AdminError, dbCheck, runAdminAction, type AdminContext } from "./action";
import type { AdminResult } from "./types";
import {
  brandSchema,
  categorySchema,
  idSchema,
  makeSchema,
  modelSchema,
  orderSchema,
  slugify,
} from "@/lib/validation/admin";

// Categories, brands, tractor makes and models. Staff create, edit, reorder and turn things on or off;
// only an admin deletes (row-level security says so too). The database refuses to delete anything that is
// still in use (see the *_guard_delete triggers), so "safe delete" does not depend on this code.

const NEXT = { categories: "/admin/categories", brands: "/admin/brands", tractors: "/admin/tractors" } as const;

/** Looks a key up in a map without ever reading inherited keys ("__proto__"): the key is client input. */
function lookup<T>(map: Record<string, T>, key: string, fallback: T): T {
  return Object.hasOwn(map, key) ? map[key] : fallback;
}

/** The slug the owner typed, or one made from the name. An empty result is reported on the field. */
function slugFor(slug: string, name: string): string {
  const value = slug || slugify(name);
  if (!value) throw new AdminError("Check the highlighted fields.", { slug: "Enter a web address (letters and numbers)" });
  return value;
}

/** New items go to the end of their list: the largest sort_order among their siblings plus 10. */
async function nextSortOrder(
  supabase: AdminContext["supabase"],
  table: "categories" | "tractor_makes" | "tractor_models",
  scope?: { column: "parent_id" | "make_id"; value: string | null },
): Promise<number> {
  let query = supabase.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  if (scope) query = scope.value === null ? query.is(scope.column, null) : query.eq(scope.column, scope.value);
  const rows = dbCheck(await query, `next sort order of ${table}`) as { sort_order: number }[] | null;
  return (rows?.[0]?.sort_order ?? 0) + 10;
}

const saveSchema = <T extends z.ZodType>(values: T) => z.object({ id: idSchema.nullable(), values });

// --- categories ---------------------------------------------------------------------------------------

export async function saveCategoryAction(id: string | null, input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: NEXT.categories,
    schema: saveSchema(categorySchema),
    input: { id, values: input },
    revalidate: ["categories"],
    async run({ id, values }, { supabase }) {
      const row = {
        name: values.name,
        slug: slugFor(values.slug, values.name),
        parent_id: values.parent_id,
        description: values.description,
        icon: values.icon,
        is_active: values.is_active,
      };
      if (id) dbCheck(await supabase.from("categories").update(row).eq("id", id).select("id").single(), "update category");
      else {
        const sort_order = await nextSortOrder(supabase, "categories", { column: "parent_id", value: values.parent_id });
        dbCheck(await supabase.from("categories").insert({ ...row, sort_order }), "create category");
      }
      return { message: id ? "Category saved." : "Category added." };
    },
  });
}

export async function deleteCategoryAction(id: string): Promise<AdminResult> {
  return deleteRow("categories", id, NEXT.categories, ["categories"], "Category deleted.");
}

// --- brands -------------------------------------------------------------------------------------------

export async function saveBrandAction(id: string | null, input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: NEXT.brands,
    schema: saveSchema(brandSchema),
    input: { id, values: input },
    // A brand name is shown on product pages.
    revalidate: ["categories"],
    async run({ id, values }, { supabase }) {
      const row = { name: values.name, slug: slugFor(values.slug, values.name), description: values.description, is_active: values.is_active };
      if (id) dbCheck(await supabase.from("brands").update(row).eq("id", id).select("id").single(), "update brand");
      else dbCheck(await supabase.from("brands").insert(row), "create brand");
      return { message: id ? "Brand saved." : "Brand added." };
    },
  });
}

export async function deleteBrandAction(id: string): Promise<AdminResult> {
  return deleteRow("brands", id, NEXT.brands, ["categories"], "Brand deleted.");
}

// --- tractor makes and models -----------------------------------------------------------------------------

export async function saveMakeAction(id: string | null, input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: NEXT.tractors,
    schema: saveSchema(makeSchema),
    input: { id, values: input },
    revalidate: ["tractors"],
    async run({ id, values }, { supabase }) {
      const row = { name: values.name, slug: slugFor(values.slug, values.name), is_active: values.is_active };
      if (id) dbCheck(await supabase.from("tractor_makes").update(row).eq("id", id).select("id").single(), "update make");
      else {
        const sort_order = await nextSortOrder(supabase, "tractor_makes");
        dbCheck(await supabase.from("tractor_makes").insert({ ...row, sort_order }), "create make");
      }
      return { message: id ? "Make saved." : "Make added." };
    },
  });
}

export async function deleteMakeAction(id: string): Promise<AdminResult> {
  return deleteRow("tractor_makes", id, NEXT.tractors, ["tractors"], "Make deleted.");
}

export async function saveModelAction(id: string | null, input: unknown): Promise<AdminResult> {
  return runAdminAction({
    next: NEXT.tractors,
    schema: saveSchema(modelSchema),
    input: { id, values: input },
    revalidate: ["tractors"],
    async run({ id, values }, { supabase }) {
      const row = {
        make_id: values.make_id,
        name: values.name,
        slug: slugFor(values.slug, values.name),
        year_from: values.year_from,
        year_to: values.year_to,
        is_active: values.is_active,
      };
      if (id) dbCheck(await supabase.from("tractor_models").update(row).eq("id", id).select("id").single(), "update model");
      else {
        const sort_order = await nextSortOrder(supabase, "tractor_models", { column: "make_id", value: values.make_id });
        dbCheck(await supabase.from("tractor_models").insert({ ...row, sort_order }), "create model");
      }
      return { message: id ? "Model saved." : "Model added." };
    },
  });
}

export async function deleteModelAction(id: string): Promise<AdminResult> {
  return deleteRow("tractor_models", id, NEXT.tractors, ["tractors"], "Model deleted.");
}

// --- shared: reorder, on/off, delete ------------------------------------------------------------------------

const ORDERABLE = ["categories", "tractor_makes", "tractor_models"] as const;
const TOGGLEABLE = ["categories", "brands", "tractor_makes", "tractor_models"] as const;
const AREA = { categories: "categories", brands: "categories", tractor_makes: "tractors", tractor_models: "tractors" } as const;
const PAGE = { categories: NEXT.categories, brands: NEXT.brands, tractor_makes: NEXT.tractors, tractor_models: NEXT.tractors } as const;

/** Saves a new order. `ids` is the whole list of siblings, in the order they should appear. */
export async function reorderAction(entity: (typeof ORDERABLE)[number], ids: string[]): Promise<AdminResult> {
  return runAdminAction({
    next: lookup<string>(PAGE, entity, NEXT.categories),
    schema: z.object({ entity: z.enum(ORDERABLE), ids: orderSchema }),
    input: { entity, ids },
    revalidate: [lookup<"categories" | "tractors">(AREA, entity, "categories")],
    async run({ entity, ids }, { supabase }) {
      dbCheck(await supabase.rpc("catalog_reorder", { p_entity: entity, p_ids: ids }), "reorder");
      return { message: "Order saved." };
    },
  });
}

/** Shows or hides something in the shop. Hiding a category hides every product in it and below it. */
export async function setActiveAction(entity: (typeof TOGGLEABLE)[number], id: string, isActive: boolean): Promise<AdminResult> {
  return runAdminAction({
    next: lookup<string>(PAGE, entity, NEXT.categories),
    schema: z.object({ entity: z.enum(TOGGLEABLE), id: idSchema, isActive: z.boolean() }),
    input: { entity, id, isActive },
    revalidate: [lookup<"categories" | "tractors">(AREA, entity, "categories")],
    async run({ entity, id, isActive }, { supabase }) {
      dbCheck(await supabase.from(entity).update({ is_active: isActive }).eq("id", id).select("id").single(), "set active");
      return { message: isActive ? "Shown in the shop." : "Hidden from the shop." };
    },
  });
}

async function deleteRow(
  table: "categories" | "brands" | "tractor_makes" | "tractor_models",
  id: string,
  next: string,
  revalidate: ("categories" | "tractors")[],
  message: string,
): Promise<AdminResult> {
  return runAdminAction({
    next,
    role: "admin",
    schema: idSchema,
    input: id,
    revalidate,
    async run(id, { supabase }) {
      // The database refuses while the row is in use; a row that is gone (or not deletable by this user) returns nothing.
      const rows = dbCheck(await supabase.from(table).delete().eq("id", id).select("id"), `delete ${table}`);
      if (!rows || rows.length === 0) throw new AdminError("That item no longer exists.");
      return { message };
    },
  });
}
