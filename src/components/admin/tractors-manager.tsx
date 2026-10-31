"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  deleteMakeAction,
  deleteModelAction,
  reorderAction,
  saveMakeAction,
  saveModelAction,
  setActiveAction,
} from "@/features/admin/structure-actions";
import type { AdminMake, AdminModel } from "@/features/admin/types";
import { makeSchema, modelSchema, type MakeInput, type ModelInput } from "@/lib/validation/admin";

const years = (m: AdminModel) =>
  m.year_from && m.year_to ? `${m.year_from}–${m.year_to}` : m.year_from ? `from ${m.year_from}` : m.year_to ? `until ${m.year_to}` : null;

function MakeForm({ make, onDone, onCancel }: { make?: AdminMake; onDone: (m: string) => void; onCancel: () => void }) {
  const { form, submit, pending, error } = useAdminForm<MakeInput, ReturnType<typeof makeSchema.parse>>({
    resolver: zodResolver(makeSchema),
    defaults: { name: make?.name ?? "", slug: make?.slug ?? "", is_active: make?.is_active ?? true },
    action: async (values) => {
      const result = await saveMakeAction(make?.id ?? null, values);
      if (result.ok) onDone(result.message ?? "Saved.");
      return result;
    },
  });
  const { register, formState: { errors } } = form;
  const idp = make?.id ?? "new-make";
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && <FormAlert tone="error" className="sm:col-span-2">{error}</FormAlert>}
      <Field id={`${idp}-name`} label="Make (company)" hint="For example Massey Ferguson." error={errors.name?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-name`, { error: errors.name?.message, hint: true })} {...register("name")} />
      </Field>
      <Field id={`${idp}-slug`} label="Web address" optional hint="Leave empty to make it from the name." error={errors.slug?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-slug`, { error: errors.slug?.message, hint: true })} {...register("slug")} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-body-md sm:col-span-2">
        <input type="checkbox" className="size-5 accent-primary" {...register("is_active")} />
        Show in the shop&apos;s tractor selector
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <SubmitButton pending={pending} className="w-auto px-6">{make ? "Save make" : "Add make"}</SubmitButton>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function ModelForm({ makeId, model, onDone, onCancel }: { makeId: string; model?: AdminModel; onDone: (m: string) => void; onCancel: () => void }) {
  const { form, submit, pending, error } = useAdminForm<ModelInput, ReturnType<typeof modelSchema.parse>>({
    resolver: zodResolver(modelSchema),
    defaults: {
      make_id: makeId,
      name: model?.name ?? "",
      slug: model?.slug ?? "",
      year_from: model?.year_from?.toString() ?? "",
      year_to: model?.year_to?.toString() ?? "",
      is_active: model?.is_active ?? true,
    },
    action: async (values) => {
      const result = await saveModelAction(model?.id ?? null, values);
      if (result.ok) onDone(result.message ?? "Saved.");
      return result;
    },
  });
  const { register, formState: { errors } } = form;
  const idp = model?.id ?? `new-model-${makeId}`;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && <FormAlert tone="error" className="sm:col-span-2">{error}</FormAlert>}
      <Field id={`${idp}-name`} label="Model" hint="For example 385 or 260 DI." error={errors.name?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-name`, { error: errors.name?.message, hint: true })} {...register("name")} />
      </Field>
      <Field id={`${idp}-slug`} label="Web address" optional hint="Leave empty to make it from the name." error={errors.slug?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-slug`, { error: errors.slug?.message, hint: true })} {...register("slug")} />
      </Field>
      <Field id={`${idp}-from`} label="Made from (year)" optional error={errors.year_from?.message}>
        <Input inputMode="numeric" className={fieldInputClass} {...fieldProps(`${idp}-from`, { error: errors.year_from?.message })} {...register("year_from")} />
      </Field>
      <Field id={`${idp}-to`} label="Made until (year)" optional error={errors.year_to?.message}>
        <Input inputMode="numeric" className={fieldInputClass} {...fieldProps(`${idp}-to`, { error: errors.year_to?.message })} {...register("year_to")} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-body-md sm:col-span-2">
        <input type="checkbox" className="size-5 accent-primary" {...register("is_active")} />
        Show in the shop&apos;s tractor selector
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <SubmitButton pending={pending} className="w-auto px-6">{model ? "Save model" : "Add model"}</SubmitButton>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function TractorsManager({
  makes,
  models,
  compatibilityCounts,
  isAdmin,
}: {
  makes: AdminMake[];
  models: AdminModel[];
  compatibilityCounts: Record<string, number>;
  isAdmin: boolean;
}) {
  const [creatingMake, setCreatingMake] = useState(false);
  const [editingMake, setEditingMake] = useState<string | null>(null);
  const [addingModelTo, setAddingModelTo] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const report = (result: Parameters<typeof toNotice>[0]) => setNotice(toNotice(result));
  const done = (message: string) => {
    setCreatingMake(false);
    setEditingMake(null);
    setAddingModelTo(null);
    setEditingModel(null);
    setNotice({ tone: "success", text: message });
  };
  const swap = (entity: "tractor_makes" | "tractor_models", list: { id: string }[], index: number, by: -1 | 1) => {
    const ids = list.map((x) => x.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return () => reorderAction(entity, ids);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-body-md text-muted-foreground">
          The makes and models of tractors your parts fit. They fill the tractor selector in the shop. A model that products are listed for cannot be deleted: hide it
          instead.
        </p>
        <Button type="button" className="h-11" onClick={() => { setCreatingMake((v) => !v); setEditingMake(null); setNotice(null); }}>
          <Plus className="size-4" aria-hidden="true" />
          Add make
        </Button>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      </div>
      {creatingMake && (
        <Panel title="New make" id="new-make-panel">
          <MakeForm onCancel={() => setCreatingMake(false)} onDone={done} />
        </Panel>
      )}
      {makes.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-body-md text-muted-foreground">No tractor makes yet.</p>
      ) : (
        <ul className="space-y-4">
          {makes.map((make, mi) => {
            const makeModels = models.filter((m) => m.make_id === make.id);
            return (
              <li key={make.id} className="rounded-lg border border-border bg-card shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-label-lg break-words">{make.name}</span>
                      <ActiveBadge active={make.is_active} off="Hidden" />
                    </p>
                    <p className="text-body-sm text-muted-foreground">{makeModels.length} model{makeModels.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RowAction ariaLabel={`Move ${make.name} up`} disabled={mi === 0} action={swap("tractor_makes", makes, mi, -1)} onResult={report} className="size-11 p-0">
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </RowAction>
                    <RowAction ariaLabel={`Move ${make.name} down`} disabled={mi === makes.length - 1} action={swap("tractor_makes", makes, mi, 1)} onResult={report} className="size-11 p-0">
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </RowAction>
                    <Button type="button" variant="outline" className="h-11" aria-label={`Edit ${make.name}`} onClick={() => { setEditingMake(editingMake === make.id ? null : make.id); setCreatingMake(false); setNotice(null); }}>
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <RowAction ariaLabel={`${make.is_active ? "Hide" : "Show"} ${make.name}`} action={() => setActiveAction("tractor_makes", make.id, !make.is_active)} onResult={report}>
                      {make.is_active ? "Hide" : "Show"}
                    </RowAction>
                    {isAdmin && (
                      <ConfirmAction
                        label={<><Trash2 className="size-4" aria-hidden="true" />Delete</>}
                        ariaLabel={`Delete ${make.name}`}
                        title={`Delete ${make.name}?`}
                        description="This cannot be undone. A make that still has models cannot be deleted."
                        confirmLabel="Delete make"
                        destructive
                        disabled={makeModels.length > 0}
                        triggerClassName="h-11 text-destructive"
                        action={async () => {
                          const result = await deleteMakeAction(make.id);
                          report(result);
                          return result;
                        }}
                      />
                    )}
                  </div>
                </div>
                {editingMake === make.id && (
                  <div className="border-t border-border bg-surface-low p-4 lg:p-6">
                    <MakeForm make={make} onCancel={() => setEditingMake(null)} onDone={done} />
                  </div>
                )}

                <div className="border-t border-border">
                  <ul className="divide-y divide-border">
                    {makeModels.map((model, i) => {
                      const used = compatibilityCounts[model.id] ?? 0;
                      return (
                        <li key={model.id}>
                          <div className="flex flex-wrap items-center justify-between gap-3 py-3 pr-4 pl-6 lg:pl-10">
                            <div className="min-w-0 space-y-0.5">
                              <p className="flex flex-wrap items-center gap-2">
                                <span className="text-label-lg break-words">{make.name} {model.name}</span>
                                <ActiveBadge active={model.is_active} off="Hidden" />
                              </p>
                              <p className="text-body-sm text-muted-foreground">
                                {years(model) ?? "Years not set"} · {used} product{used === 1 ? "" : "s"} listed
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <RowAction ariaLabel={`Move ${model.name} up`} disabled={i === 0} action={swap("tractor_models", makeModels, i, -1)} onResult={report} className="size-11 p-0">
                                <ArrowUp className="size-4" aria-hidden="true" />
                              </RowAction>
                              <RowAction ariaLabel={`Move ${model.name} down`} disabled={i === makeModels.length - 1} action={swap("tractor_models", makeModels, i, 1)} onResult={report} className="size-11 p-0">
                                <ArrowDown className="size-4" aria-hidden="true" />
                              </RowAction>
                              <Button type="button" variant="outline" className="h-11" aria-label={`Edit ${make.name} ${model.name}`} onClick={() => { setEditingModel(editingModel === model.id ? null : model.id); setAddingModelTo(null); setNotice(null); }}>
                                <Pencil className="size-4" aria-hidden="true" />
                                Edit
                              </Button>
                              <RowAction ariaLabel={`${model.is_active ? "Hide" : "Show"} ${make.name} ${model.name}`} action={() => setActiveAction("tractor_models", model.id, !model.is_active)} onResult={report}>
                                {model.is_active ? "Hide" : "Show"}
                              </RowAction>
                              {isAdmin && (
                                <ConfirmAction
                                  label={<><Trash2 className="size-4" aria-hidden="true" />Delete</>}
                                  ariaLabel={`Delete ${make.name} ${model.name}`}
                                  title={`Delete ${make.name} ${model.name}?`}
                                  description="This cannot be undone. A model that products are listed for cannot be deleted."
                                  confirmLabel="Delete model"
                                  destructive
                                  disabled={used > 0}
                                  triggerClassName="h-11 text-destructive"
                                  action={async () => {
                                    const result = await deleteModelAction(model.id);
                                    report(result);
                                    return result;
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          {editingModel === model.id && (
                            <div className="border-t border-border bg-surface-low p-4 lg:p-6">
                              <ModelForm makeId={make.id} model={model} onCancel={() => setEditingModel(null)} onDone={done} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="border-t border-border p-4">
                    {addingModelTo === make.id ? (
                      <ModelForm makeId={make.id} onCancel={() => setAddingModelTo(null)} onDone={done} />
                    ) : (
                      <Button type="button" variant="outline" className="h-11" onClick={() => { setAddingModelTo(make.id); setEditingModel(null); setNotice(null); }}>
                        <Plus className="size-4" aria-hidden="true" />
                        Add a model to {make.name}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
