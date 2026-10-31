"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { NativeSelect } from "@/components/admin/native-select";
import { toNotice, type Notice } from "@/components/admin/row-action";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeCompatibilityAction, saveCompatibilityAction } from "@/features/admin/product-actions";
import type { AdminCompatibility } from "@/features/admin/types";
import { compatibilitySchema, type CompatibilityInput } from "@/lib/validation/admin";

export type ModelOption = { id: string; label: string; isActive: boolean };

const yearsText = (c: AdminCompatibility) =>
  c.year_from && c.year_to ? `${c.year_from}–${c.year_to}` : c.year_from ? `from ${c.year_from}` : c.year_to ? `until ${c.year_to}` : null;

function CompatibilityForm({
  productId,
  entry,
  options,
  onDone,
  onCancel,
}: {
  productId: string;
  entry?: AdminCompatibility;
  options: ModelOption[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { form, submit, pending, error } = useAdminForm<CompatibilityInput, ReturnType<typeof compatibilitySchema.parse>>({
    resolver: zodResolver(compatibilitySchema),
    defaults: {
      tractor_model_id: entry?.tractor_model_id ?? "",
      year_from: entry?.year_from?.toString() ?? "",
      year_to: entry?.year_to?.toString() ?? "",
      notes: entry?.notes ?? "",
    },
    action: async (values) => {
      const result = await saveCompatibilityAction(productId, entry?.id ?? null, values);
      if (result.ok) onDone(result.message ?? "Saved.");
      return result;
    },
  });
  const { register, formState: { errors } } = form;
  const idp = entry?.id ?? "new-fit";
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && <FormAlert tone="error" className="sm:col-span-2">{error}</FormAlert>}
      <Field id={`${idp}-model`} label="Tractor model" className="sm:col-span-2" error={errors.tractor_model_id?.message}>
        <NativeSelect disabled={Boolean(entry)} {...fieldProps(`${idp}-model`, { error: errors.tractor_model_id?.message })} {...register("tractor_model_id")}>
          <option value="">Choose a tractor model</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
              {o.isActive ? "" : " (hidden)"}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idp}-from`} label="Fits from (year)" optional hint="Only if it fits part of the production run." error={errors.year_from?.message}>
        <Input inputMode="numeric" className={fieldInputClass} {...fieldProps(`${idp}-from`, { error: errors.year_from?.message, hint: true })} {...register("year_from")} />
      </Field>
      <Field id={`${idp}-to`} label="Fits until (year)" optional error={errors.year_to?.message}>
        <Input inputMode="numeric" className={fieldInputClass} {...fieldProps(`${idp}-to`, { error: errors.year_to?.message })} {...register("year_to")} />
      </Field>
      <Field id={`${idp}-notes`} label="Note" optional className="sm:col-span-2" hint="For example: 4WD only, or check the number on the old part." error={errors.notes?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-notes`, { error: errors.notes?.message, hint: true })} {...register("notes")} />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <SubmitButton pending={pending} className="w-auto px-6">
          {entry ? "Save" : "Add model"}
        </SubmitButton>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Which tractors a part fits. Never assume a part fits every model: an empty list shows "not listed for a specific model". */
export function CompatibilityEditor({ productId, entries, models }: { productId: string; entries: AdminCompatibility[]; models: ModelOption[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const labelOf = (id: string) => models.find((m) => m.id === id)?.label ?? "Unknown model";
  const free = models.filter((m) => !entries.some((e) => e.tractor_model_id === m.id));
  const done = (message: string) => {
    setAdding(false);
    setEditing(null);
    setNotice({ tone: "success", text: message });
  };

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="empty:hidden">
        {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      </div>
      {entries.length === 0 ? (
        <p className="text-body-md text-muted-foreground">Not listed for any tractor model. The shop shows &ldquo;Universal or not listed for a specific model&rdquo;.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((e) => (
            <li key={e.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-label-lg break-words">{labelOf(e.tractor_model_id)}</p>
                  <p className="text-body-sm text-muted-foreground">
                    {yearsText(e) ?? "All years"}
                    {e.notes && <> · {e.notes}</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-11" aria-label={`Edit ${labelOf(e.tractor_model_id)}`} onClick={() => { setEditing(editing === e.id ? null : e.id); setAdding(false); setNotice(null); }}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit
                  </Button>
                  <ConfirmAction
                    label={<><Trash2 className="size-4" aria-hidden="true" />Remove</>}
                    ariaLabel={`Remove ${labelOf(e.tractor_model_id)}`}
                    title="Remove this tractor model?"
                    description={`${labelOf(e.tractor_model_id)} will no longer be listed for this product.`}
                    confirmLabel="Remove"
                    destructive
                    triggerClassName="h-11 text-destructive"
                    action={async () => {
                      const result = await removeCompatibilityAction(productId, e.id);
                      setNotice(toNotice(result));
                      return result;
                    }}
                  />
                </div>
              </div>
              {editing === e.id && (
                <div className="border-t border-border bg-surface-low p-4 lg:p-6">
                  <CompatibilityForm productId={productId} entry={e} options={models} onCancel={() => setEditing(null)} onDone={done} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="rounded-lg border border-border bg-surface-low p-4 lg:p-6">
          <CompatibilityForm productId={productId} options={free} onCancel={() => setAdding(false)} onDone={done} />
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-11" disabled={free.length === 0} onClick={() => { setAdding(true); setEditing(null); setNotice(null); }}>
          <Plus className="size-4" aria-hidden="true" />
          Add a tractor model
        </Button>
      )}
      {free.length === 0 && models.length === 0 && (
        <p className="text-body-sm text-muted-foreground">There are no tractor models yet. Add makes and models under Tractors first.</p>
      )}
    </div>
  );
}
