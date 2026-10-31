"use client";

import { useFieldArray, type FieldValues, type UseFormReturn } from "react-hook-form";
import { errorAt } from "@/components/admin/form-errors";
import { Plus, Trash2 } from "lucide-react";
import { NativeSelect } from "@/components/admin/native-select";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUSES, PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from "@/lib/validation/admin";

const areaClass = "rounded-lg border-input bg-card text-body-lg md:text-body-md";
export const DESCRIPTION_LIMIT = 10_000;

export type Option = { id: string; label: string };

type Props = {
  form: UseFormReturn<FieldValues>;
  /** "" for the edit form, "product." inside the create form. */
  prefix: string;
  categories: (Option & { isActive: boolean })[];
  brands: Option[];
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <legend className="float-left mb-1 w-full text-headline-sm">{title}</legend>
      {hint && <p className="clear-both -mt-2 text-body-md text-muted-foreground">{hint}</p>}
      <div className="clear-both grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/**
 * Every product field of spec section 7 that the schema has. Used by the create form (`prefix` "product.")
 * and the edit form (no prefix); `form` is the react-hook-form instance of the page.
 */
export function ProductFields({ form, prefix, categories, brands }: Props) {
  const { register, watch, control, formState } = form;
  const name = (field: string) => `${prefix}${field}`;
  const error = (field: string): string | undefined => errorAt(formState.errors, name(field));
  const id = (field: string) => `p-${name(field).replace(/\./g, "-")}`;
  const text = (field: string, label: string, opts: { hint?: string; optional?: boolean; className?: string; inputMode?: "text" | "numeric" } = {}) => (
    <Field id={id(field)} label={label} hint={opts.hint} optional={opts.optional} error={error(field)} className={opts.className}>
      <Input inputMode={opts.inputMode} className={fieldInputClass} {...fieldProps(id(field), { error: error(field), hint: Boolean(opts.hint) })} {...register(name(field))} />
    </Field>
  );

  const type = watch(name("product_type"));
  const description = String(watch(name("description")) ?? "");
  const oilValues = [watch(name("viscosity_grade")), watch(name("oil_specifications")), watch(name("origin"))].some((v) => String(v ?? "").trim() !== "");
  const specs = useFieldArray({ control, name: name("specs") });

  return (
    <div className="space-y-6">
      <Section title="Basics">
        {text("name", "Product name", { className: "sm:col-span-2" })}
        <Field id={id("category_id")} label="Category" error={error("category_id")}>
          <NativeSelect {...fieldProps(id("category_id"), { error: error("category_id") })} {...register(name("category_id"))}>
            <option value="">Choose a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.isActive ? "" : " (hidden)"}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id={id("brand_id")} label="Brand" optional error={error("brand_id")}>
          <NativeSelect {...fieldProps(id("brand_id"), { error: error("brand_id") })} {...register(name("brand_id"))}>
            <option value="">No brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id={id("product_type")} label="Type" error={error("product_type")}>
          <NativeSelect {...fieldProps(id("product_type"), { error: error("product_type") })} {...register(name("product_type"))}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRODUCT_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id={id("status")} label="Status" hint="Only published products are shown in the shop." error={error("status")}>
          <NativeSelect {...fieldProps(id("status"), { error: error("status"), hint: true })} {...register(name("status"))}>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PRODUCT_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {text("slug", "Web address", { optional: true, hint: "Leave empty to make it from the name. Changing it later changes the product's page address." })}
        <label className="flex min-h-11 items-center gap-2 text-body-md">
          <input type="checkbox" className="size-5 accent-primary" {...register(name("is_featured"))} />
          Featured product (shown first)
        </label>
      </Section>

      <Section title="Description" hint="Plain text. Press Enter twice to start a new paragraph. This is what customers read on the product page.">
        <Field id={id("short_description")} label="Short description" optional hint="One or two sentences, shown under the name and in search results." className="sm:col-span-2" error={error("short_description")}>
          <Textarea rows={2} maxLength={500} className={areaClass} {...fieldProps(id("short_description"), { error: error("short_description"), hint: true })} {...register(name("short_description"))} />
        </Field>
        <Field id={id("description")} label="Full description" optional className="sm:col-span-2" error={error("description")}>
          <Textarea rows={8} className={areaClass} {...fieldProps(id("description"), { error: error("description") })} {...register(name("description"))} />
          <p className={description.length > DESCRIPTION_LIMIT ? "text-body-sm text-destructive" : "text-body-sm text-muted-foreground"} aria-live="polite">
            {description.length.toLocaleString("en-US")} of {DESCRIPTION_LIMIT.toLocaleString("en-US")} characters
          </p>
        </Field>
        <div className="sm:col-span-2" data-testid="description-preview">
          <p className="mb-1 text-label-lg">How it looks in the shop</p>
          <div className="min-h-16 rounded-lg border border-border bg-surface-low p-4">
            {description.trim() ? (
              <p className="text-body-lg whitespace-pre-line break-words">{description}</p>
            ) : (
              <p className="text-body-md text-muted-foreground">Nothing yet. Customers will see the short description instead.</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Part numbers">
        {text("part_number", "Part number", { optional: true })}
        <Field id={id("oem_part_numbers")} label="OEM or compatible part numbers" optional hint="One per line, or separated by commas." error={error("oem_part_numbers")}>
          <Textarea rows={3} className={areaClass} {...fieldProps(id("oem_part_numbers"), { error: error("oem_part_numbers"), hint: true })} {...register(name("oem_part_numbers"))} />
        </Field>
      </Section>

      {(type === "oil" || oilValues) && (
        <Section title="Oil details" hint="Only fill in what you know is true for this product.">
          {text("viscosity_grade", "Viscosity grade", { optional: true, hint: "For example 15W-40." })}
          {text("origin", "Origin", { optional: true, hint: "Only if verified, for example Made in Pakistan." })}
          <Field id={id("oil_specifications")} label="Specifications and certifications" optional hint="One per line, for example API CH-4. Only verified ones." className="sm:col-span-2" error={error("oil_specifications")}>
            <Textarea rows={3} className={areaClass} {...fieldProps(id("oil_specifications"), { error: error("oil_specifications"), hint: true })} {...register(name("oil_specifications"))} />
          </Field>
        </Section>
      )}

      <Section title="Specifications" hint="A table on the product page, for example Material: Steel.">
        <div className="space-y-3 sm:col-span-2">
          {specs.fields.map((row, index) => (
            <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto] sm:items-start">
              <Field id={`${id("specs")}-${index}-label`} label={`Specification ${index + 1}: name`} error={errorAt(formState.errors, `${name("specs")}.${index}.label`)}>
                <Input className={fieldInputClass} {...fieldProps(`${id("specs")}-${index}-label`, { error: errorAt(formState.errors, `${name("specs")}.${index}.label`) })} {...register(`${name("specs")}.${index}.label`)} />
              </Field>
              <Field id={`${id("specs")}-${index}-value`} label={`Specification ${index + 1}: value`} error={errorAt(formState.errors, `${name("specs")}.${index}.value`)}>
                <Input className={fieldInputClass} {...fieldProps(`${id("specs")}-${index}-value`, { error: errorAt(formState.errors, `${name("specs")}.${index}.value`) })} {...register(`${name("specs")}.${index}.value`)} />
              </Field>
              <Button type="button" variant="outline" className="h-11 sm:mt-[1.625rem]" aria-label={`Remove specification ${index + 1}`} onClick={() => specs.remove(index)}>
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          {error("specs") && <p className="text-body-sm text-destructive">{error("specs")}</p>}
          <Button type="button" variant="outline" className="h-11" disabled={specs.fields.length >= 30} onClick={() => specs.append({ label: "", value: "" })}>
            <Plus className="size-4" aria-hidden="true" />
            Add a specification
          </Button>
        </div>
      </Section>

      <Section title="Warranty, packaging and returns">
        <Field id={id("warranty_info")} label="Warranty" optional hint="Only if the supplier gives one." error={error("warranty_info")}>
          <Textarea rows={2} className={areaClass} {...fieldProps(id("warranty_info"), { error: error("warranty_info"), hint: true })} {...register(name("warranty_info"))} />
        </Field>
        <Field id={id("packaging_info")} label="Packaging" optional hint="For example Box of 6, or 4 L can." error={error("packaging_info")}>
          <Textarea rows={2} className={areaClass} {...fieldProps(id("packaging_info"), { error: error("packaging_info"), hint: true })} {...register(name("packaging_info"))} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-body-md sm:col-span-2">
          <input type="checkbox" className="size-5 accent-primary" {...register(name("is_returnable"))} />
          Can be exchanged or returned
        </label>
      </Section>

      <Section title="Search engines" hint="Leave empty to use the product name and short description.">
        {text("seo_title", "Page title", { optional: true, hint: "Up to 70 characters." })}
        <Field id={id("seo_description")} label="Page description" optional hint="Up to 170 characters." error={error("seo_description")}>
          <Textarea rows={2} maxLength={170} className={areaClass} {...fieldProps(id("seo_description"), { error: error("seo_description"), hint: true })} {...register(name("seo_description"))} />
        </Field>
      </Section>
    </div>
  );
}
