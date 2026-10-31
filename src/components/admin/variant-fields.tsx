"use client";

import type { FieldValues, UseFormReturn } from "react-hook-form";
import { errorAt } from "@/components/admin/form-errors";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { Input } from "@/components/ui/input";

type Props = {
  form: UseFormReturn<FieldValues>;
  /** "" in the variant editor, "variant." inside the create-product form. */
  prefix: string;
  /** Cost prices are visible to admins only. */
  isAdmin: boolean;
  /** Opening stock, only when the variant is being created. */
  showStock?: boolean;
  /** This variant is already the default: the box stays checked (another variant must be made the default instead). */
  isCurrentDefault?: boolean;
  /** Hide the default checkbox (the first variant of a product is the default). */
  hideDefault?: boolean;
};

/** SKU, barcode, prices, size and flags of one variant (a size, pack or grade with its own SKU and stock). */
export function VariantFields({ form, prefix, isAdmin, showStock, isCurrentDefault, hideDefault }: Props) {
  const { register, formState } = form;
  const name = (field: string) => `${prefix}${field}`;
  const error = (field: string): string | undefined => errorAt(formState.errors, name(field));
  const id = (field: string) => `v-${name(field).replace(/\./g, "-")}`;
  const input = (
    field: string,
    label: string,
    opts: { hint?: string; optional?: boolean; inputMode?: "text" | "numeric" | "decimal"; placeholder?: string } = {},
  ) => (
    <Field id={id(field)} label={label} hint={opts.hint} optional={opts.optional} error={error(field)}>
      <Input
        inputMode={opts.inputMode}
        placeholder={opts.placeholder}
        className={fieldInputClass}
        {...fieldProps(id(field), { error: error(field), hint: Boolean(opts.hint) })}
        {...register(name(field))}
      />
    </Field>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {input("name", "Variant name", { hint: "For example 5 L, Standard or Default." })}
      {input("sku", "SKU", { hint: "Your own code, unique for every variant. Capital letters, numbers and dashes." })}
      {input("barcode", "Barcode", { optional: true })}
      {input("regular_price", "Regular price (Rs)", { inputMode: "decimal", hint: "What customers pay. Includes any tax." })}
      {input("sale_price", "Sale price (Rs)", { optional: true, inputMode: "decimal", hint: "Lower than the regular price. Empty means no sale." })}
      {isAdmin ? input("cost", "Cost price (Rs)", { optional: true, inputMode: "decimal", hint: "What you pay. Only administrators can see it." }) : <div className="hidden lg:block" aria-hidden="true" />}
      {showStock && input("initial_stock", "Opening stock", { optional: true, inputMode: "numeric", hint: "How many you have now." })}
      {input("weight_grams", "Weight (grams)", { optional: true, inputMode: "numeric" })}
      {input("length_mm", "Length (mm)", { optional: true, inputMode: "numeric" })}
      {input("width_mm", "Width (mm)", { optional: true, inputMode: "numeric" })}
      {input("height_mm", "Height (mm)", { optional: true, inputMode: "numeric" })}
      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
        <label className="flex min-h-11 items-center gap-2 text-body-md">
          <input type="checkbox" className="size-5 accent-primary" {...register(name("is_active"))} />
          Available in the shop
        </label>
        {!hideDefault && (
          <label className="flex min-h-11 items-center gap-2 text-body-md">
            <input type="checkbox" className="size-5 accent-primary" disabled={isCurrentDefault} {...register(name("is_default"))} />
            Default variant (the one shown first)
            {isCurrentDefault && <span className="text-body-sm text-muted-foreground"> — to change it, make another variant the default</span>}
          </label>
        )}
      </div>
    </div>
  );
}
