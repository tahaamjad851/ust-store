"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { ActiveBadge } from "@/components/admin/badges";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { RowAction, toNotice, type Notice } from "@/components/admin/row-action";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { VariantFields } from "@/components/admin/variant-fields";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { deleteVariantAction, reorderVariantsAction, saveVariantAction } from "@/features/admin/product-actions";
import type { AdminVariantDetail } from "@/features/admin/types";
import { formatPKRExact, paisaToRupeesInput } from "@/lib/pricing/money";
import { variantSchema, type VariantInput } from "@/lib/validation/admin";

const n = (v: number | null) => (v === null ? "" : String(v));

function VariantForm({
  productId,
  variant,
  isAdmin,
  hasVariants,
  onDone,
  onCancel,
}: {
  productId: string;
  variant?: AdminVariantDetail;
  isAdmin: boolean;
  hasVariants: boolean;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { form, submit, pending, error } = useAdminForm<VariantInput, ReturnType<typeof variantSchema.parse>>({
    resolver: zodResolver(variantSchema),
    defaults: {
      name: variant?.name ?? (hasVariants ? "" : "Default"),
      sku: variant?.sku ?? "",
      barcode: variant?.barcode ?? "",
      regular_price: variant ? paisaToRupeesInput(variant.regular_price_paisa) : "",
      sale_price: variant?.sale_price_paisa != null ? paisaToRupeesInput(variant.sale_price_paisa) : "",
      cost: variant?.cost_paisa != null ? paisaToRupeesInput(variant.cost_paisa) : "",
      weight_grams: n(variant?.weight_grams ?? null),
      length_mm: n(variant?.length_mm ?? null),
      width_mm: n(variant?.width_mm ?? null),
      height_mm: n(variant?.height_mm ?? null),
      is_default: variant?.is_default ?? false,
      is_active: variant?.is_active ?? true,
    },
    action: async (values) => {
      const result = await saveVariantAction(productId, variant?.id ?? null, values);
      if (result.ok) onDone(result.message ?? "Saved.");
      return result;
    },
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <VariantFields form={form as unknown as UseFormReturn<FieldValues>} prefix="" isAdmin={isAdmin} isCurrentDefault={variant?.is_default} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} className="w-auto px-6">
          {variant ? "Save variant" : "Add variant"}
        </SubmitButton>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function VariantsManager({ productId, variants, isAdmin }: { productId: string; variants: AdminVariantDetail[]; isAdmin: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const report = (result: Parameters<typeof toNotice>[0]) => setNotice(toNotice(result));
  const done = (message: string) => {
    setAdding(false);
    setEditing(null);
    setNotice({ tone: "success", text: message });
  };
  const move = (index: number, by: -1 | 1) => {
    const ids = variants.map((v) => v.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return () => reorderVariantsAction(productId, ids);
  };

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="empty:hidden">
        {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      </div>
      {variants.length === 0 ? (
        <p className="rounded-lg border border-warning/40 bg-warning-container p-4 text-body-md text-warning-foreground">
          This product has no variant yet, so customers cannot buy it. Add one below.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {variants.map((v, i) => (
            <li key={v.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-label-lg break-words">{v.name}</span>
                    {v.is_default && <span className="rounded-sm bg-brand-tint px-2 py-0.5 text-label-md text-brand-tint-foreground">Default</span>}
                    <ActiveBadge active={v.is_active} on="Available" off="Unavailable" />
                  </p>
                  <p className="text-body-sm text-muted-foreground">
                    <span className="font-mono break-all">{v.sku}</span> · {formatPKRExact(v.regular_price_paisa)}
                    {v.sale_price_paisa !== null && <> (sale {formatPKRExact(v.sale_price_paisa)})</>} · {v.on_hand} in stock
                    {v.reserved > 0 && <>, {v.reserved} reserved</>}
                    {isAdmin && v.cost_paisa !== null && <> · cost {formatPKRExact(v.cost_paisa)}</>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RowAction ariaLabel={`Move ${v.name} up`} disabled={i === 0} action={move(i, -1)} onResult={report} className="size-11 p-0">
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </RowAction>
                  <RowAction ariaLabel={`Move ${v.name} down`} disabled={i === variants.length - 1} action={move(i, 1)} onResult={report} className="size-11 p-0">
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </RowAction>
                  <Button type="button" variant="outline" className="h-11" aria-label={`Edit variant ${v.name}`} onClick={() => { setEditing(editing === v.id ? null : v.id); setAdding(false); setNotice(null); }}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit
                  </Button>
                  {isAdmin && (
                    <ConfirmAction
                      label={<><Trash2 className="size-4" aria-hidden="true" />Delete</>}
                      ariaLabel={`Delete variant ${v.name}`}
                      title={`Delete ${v.name}?`}
                      description={
                        <>
                          This removes the variant, its stock history and its price history. It cannot be undone. A variant that is on an order cannot be deleted: turn it off instead
                          (untick &ldquo;Available in the shop&rdquo;).
                        </>
                      }
                      confirmLabel="Delete variant"
                      destructive
                      disabled={variants.length === 1}
                      triggerClassName="h-11 text-destructive"
                      action={async () => {
                        const result = await deleteVariantAction(productId, v.id);
                        report(result);
                        return result;
                      }}
                    />
                  )}
                </div>
              </div>
              {editing === v.id && (
                <div className="border-t border-border bg-surface-low p-4 lg:p-6">
                  <VariantForm productId={productId} variant={v} isAdmin={isAdmin} hasVariants onCancel={() => setEditing(null)} onDone={done} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="rounded-lg border border-border bg-surface-low p-4 lg:p-6">
          <h3 className="mb-3 text-headline-sm">New variant</h3>
          <VariantForm productId={productId} isAdmin={isAdmin} hasVariants={variants.length > 0} onCancel={() => setAdding(false)} onDone={done} />
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-11" onClick={() => { setAdding(true); setEditing(null); setNotice(null); }}>
          <Plus className="size-4" aria-hidden="true" />
          Add a variant
        </Button>
      )}
    </div>
  );
}
