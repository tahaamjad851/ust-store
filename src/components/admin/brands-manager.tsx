"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ActiveBadge } from "@/components/admin/badges";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Panel } from "@/components/admin/page-header";
import { RowAction, toNotice, type Notice } from "@/components/admin/row-action";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteBrandAction, saveBrandAction, setActiveAction } from "@/features/admin/structure-actions";
import type { AdminBrand } from "@/features/admin/types";
import { brandSchema, type BrandInput } from "@/lib/validation/admin";

function BrandForm({ brand, onDone, onCancel }: { brand?: AdminBrand; onDone: (message: string) => void; onCancel: () => void }) {
  const { form, submit, pending, error } = useAdminForm<BrandInput, ReturnType<typeof brandSchema.parse>>({
    resolver: zodResolver(brandSchema),
    defaults: { name: brand?.name ?? "", slug: brand?.slug ?? "", description: brand?.description ?? "", is_active: brand?.is_active ?? true },
    action: async (values) => {
      const result = await saveBrandAction(brand?.id ?? null, values);
      if (result.ok) onDone(result.message ?? "Saved.");
      return result;
    },
  });
  const { register, formState: { errors } } = form;
  const idp = brand?.id ?? "new-brand";
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && <FormAlert tone="error" className="sm:col-span-2">{error}</FormAlert>}
      <Field id={`${idp}-name`} label="Brand name" error={errors.name?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-name`, { error: errors.name?.message })} {...register("name")} />
      </Field>
      <Field id={`${idp}-slug`} label="Web address" optional hint="Leave empty to make it from the name." error={errors.slug?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-slug`, { error: errors.slug?.message, hint: true })} {...register("slug")} />
      </Field>
      <Field id={`${idp}-description`} label="Description" optional className="sm:col-span-2" error={errors.description?.message}>
        <Textarea rows={2} className="rounded-lg border-input bg-card text-body-lg md:text-body-md" {...fieldProps(`${idp}-description`, { error: errors.description?.message })} {...register("description")} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-body-md sm:col-span-2">
        <input type="checkbox" className="size-5 accent-primary" {...register("is_active")} />
        Show the brand name in the shop
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <SubmitButton pending={pending} className="w-auto px-6">
          {brand ? "Save brand" : "Add brand"}
        </SubmitButton>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function BrandsManager({ brands, productCounts, isAdmin }: { brands: AdminBrand[]; productCounts: Record<string, number>; isAdmin: boolean }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const report = (result: Parameters<typeof toNotice>[0]) => setNotice(toNotice(result));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-body-md text-muted-foreground">Brands appear on product pages. A brand that products still use cannot be deleted: hide it instead.</p>
        <Button type="button" className="h-11" onClick={() => { setCreating((v) => !v); setEditing(null); setNotice(null); }}>
          <Plus className="size-4" aria-hidden="true" />
          Add brand
        </Button>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      </div>
      {creating && (
        <Panel title="New brand" id="new-brand-panel">
          <BrandForm onCancel={() => setCreating(false)} onDone={(m) => { setCreating(false); setNotice({ tone: "success", text: m }); }} />
        </Panel>
      )}
      {brands.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-body-md text-muted-foreground">No brands yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {brands.map((brand) => {
            const count = productCounts[brand.id] ?? 0;
            return (
              <li key={brand.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-label-lg break-words">{brand.name}</span>
                      <ActiveBadge active={brand.is_active} off="Hidden" />
                    </p>
                    <p className="text-body-sm text-muted-foreground">
                      <span className="font-mono">{brand.slug}</span> · {count} product{count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" className="h-11" aria-label={`Edit ${brand.name}`} onClick={() => { setEditing(editing === brand.id ? null : brand.id); setCreating(false); setNotice(null); }}>
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <RowAction ariaLabel={`${brand.is_active ? "Hide" : "Show"} ${brand.name}`} action={() => setActiveAction("brands", brand.id, !brand.is_active)} onResult={report}>
                      {brand.is_active ? "Hide" : "Show"}
                    </RowAction>
                    {isAdmin && (
                      <ConfirmAction
                        label={<><Trash2 className="size-4" aria-hidden="true" />Delete</>}
                        ariaLabel={`Delete ${brand.name}`}
                        title={`Delete ${brand.name}?`}
                        description="This cannot be undone. A brand that products still use cannot be deleted."
                        confirmLabel="Delete brand"
                        destructive
                        disabled={count > 0}
                        triggerClassName="h-11 text-destructive"
                        action={async () => {
                          const result = await deleteBrandAction(brand.id);
                          report(result);
                          return result;
                        }}
                      />
                    )}
                  </div>
                </div>
                {editing === brand.id && (
                  <div className="border-t border-border bg-surface-low p-4 lg:p-6">
                    <BrandForm brand={brand} onCancel={() => setEditing(null)} onDone={(m) => { setEditing(null); setNotice({ tone: "success", text: m }); }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
