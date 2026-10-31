"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { ActiveBadge } from "@/components/admin/badges";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { NativeSelect } from "@/components/admin/native-select";
import { Panel } from "@/components/admin/page-header";
import { RowAction, toNotice, type Notice } from "@/components/admin/row-action";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCategoryAction, reorderAction, saveCategoryAction, setActiveAction } from "@/features/admin/structure-actions";
import type { AdminCategory } from "@/features/admin/types";
import { categorySchema, CATEGORY_ICON_NAMES, type CategoryInput } from "@/lib/validation/admin";

const iconLabel = (name: string) => name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function CategoryForm({
  category,
  tops,
  hasChildren,
  onDone,
  onCancel,
}: {
  category?: AdminCategory;
  tops: AdminCategory[];
  hasChildren: boolean;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { form, submit, pending, error } = useAdminForm<CategoryInput, ReturnType<typeof categorySchema.parse>>({
    resolver: zodResolver(categorySchema),
    defaults: {
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      parent_id: category?.parent_id ?? "",
      description: category?.description ?? "",
      icon: (CATEGORY_ICON_NAMES as readonly string[]).includes(category?.icon ?? "") ? (category!.icon as CategoryInput["icon"]) : "tools",
      is_active: category?.is_active ?? true,
    },
    action: async (values) => {
      const result = await saveCategoryAction(category?.id ?? null, values);
      if (result.ok) onDone(result.message ?? "Saved.");
      return result;
    },
  });
  const { register, formState: { errors } } = form;
  const idp = category?.id ?? "new-category";
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && <FormAlert tone="error" className="sm:col-span-2">{error}</FormAlert>}
      <Field id={`${idp}-name`} label="Name" error={errors.name?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-name`, { error: errors.name?.message })} {...register("name")} />
      </Field>
      <Field id={`${idp}-slug`} label="Web address" optional hint="Leave empty to make it from the name. Used in the page address." error={errors.slug?.message}>
        <Input className={fieldInputClass} {...fieldProps(`${idp}-slug`, { error: errors.slug?.message, hint: true })} {...register("slug")} />
      </Field>
      <Field
        id={`${idp}-parent`}
        label="Belongs to"
        hint={hasChildren ? "This category has subcategories, so it stays at the top level." : "Choose a category to make this a subcategory."}
        error={errors.parent_id?.message}
      >
        <NativeSelect disabled={hasChildren} {...fieldProps(`${idp}-parent`, { error: errors.parent_id?.message, hint: true })} {...register("parent_id")}>
          <option value="">Nothing: a top-level category</option>
          {tops.filter((t) => t.id !== category?.id).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idp}-icon`} label="Icon" error={errors.icon?.message}>
        <NativeSelect {...fieldProps(`${idp}-icon`, { error: errors.icon?.message })} {...register("icon")}>
          {CATEGORY_ICON_NAMES.map((name) => (
            <option key={name} value={name}>
              {iconLabel(name)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idp}-description`} label="Description" optional className="sm:col-span-2" error={errors.description?.message}>
        <Textarea rows={2} className="rounded-lg border-input bg-card text-body-lg md:text-body-md" {...fieldProps(`${idp}-description`, { error: errors.description?.message })} {...register("description")} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-body-md sm:col-span-2">
        <input type="checkbox" className="size-5 accent-primary" {...register("is_active")} />
        Show in the shop
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <SubmitButton pending={pending} className="w-auto px-6">
          {category ? "Save category" : "Add category"}
        </SubmitButton>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CategoriesManager({ categories, productCounts, isAdmin }: { categories: AdminCategory[]; productCounts: Record<string, number>; isAdmin: boolean }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const tops = useMemo(() => categories.filter((c) => c.parent_id === null), [categories]);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  const report = (result: Parameters<typeof toNotice>[0]) => setNotice(toNotice(result));
  const move = (siblings: AdminCategory[], index: number, by: -1 | 1) => {
    const ids = siblings.map((c) => c.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return () => reorderAction("categories", ids);
  };

  // A render function, not a component: a nested component would remount (and lose typed text) on every update.
  function renderRow(category: AdminCategory, siblings: AdminCategory[], index: number, depth: 0 | 1) {
    const kids = childrenOf(category.id);
    const count = productCounts[category.id] ?? 0;
    const inUse = count > 0 || kids.length > 0;
    return (
      <li key={category.id} className={depth === 1 ? "border-t border-border bg-surface-low/50" : undefined}>
        <div className={`flex flex-wrap items-center justify-between gap-3 p-4 ${depth === 1 ? "pl-8 lg:pl-12" : ""}`}>
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-label-lg break-words">{category.name}</span>
              <ActiveBadge active={category.is_active} off="Hidden" />
            </p>
            <p className="text-body-sm text-muted-foreground">
              <span className="font-mono">{category.slug}</span> · {count} product{count === 1 ? "" : "s"}
              {kids.length > 0 && <> · {kids.length} subcategor{kids.length === 1 ? "y" : "ies"}</>}
            </p>
            {!category.is_active && <p className="text-body-sm text-muted-foreground">Hidden: its products are not shown in the shop either.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RowAction ariaLabel={`Move ${category.name} up`} disabled={index === 0} action={move(siblings, index, -1)} onResult={report} className="size-11 p-0">
              <ArrowUp className="size-4" aria-hidden="true" />
            </RowAction>
            <RowAction ariaLabel={`Move ${category.name} down`} disabled={index === siblings.length - 1} action={move(siblings, index, 1)} onResult={report} className="size-11 p-0">
              <ArrowDown className="size-4" aria-hidden="true" />
            </RowAction>
            <Button type="button" variant="outline" className="h-11" aria-label={`Edit ${category.name}`} onClick={() => { setEditing(editing === category.id ? null : category.id); setCreating(false); setNotice(null); }}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
            <RowAction ariaLabel={`${category.is_active ? "Hide" : "Show"} ${category.name}`} action={() => setActiveAction("categories", category.id, !category.is_active)} onResult={report}>
              {category.is_active ? "Hide" : "Show"}
            </RowAction>
            {isAdmin && (
              <ConfirmAction
                label={<><Trash2 className="size-4" aria-hidden="true" />Delete</>}
                ariaLabel={`Delete ${category.name}`}
                title={`Delete ${category.name}?`}
                description="This cannot be undone. A category with products or subcategories cannot be deleted: hide it instead."
                confirmLabel="Delete category"
                destructive
                disabled={inUse}
                triggerClassName="h-11 text-destructive"
                action={async () => {
                  const result = await deleteCategoryAction(category.id);
                  report(result);
                  return result;
                }}
              />
            )}
          </div>
        </div>
        {editing === category.id && (
          <div className="border-t border-border bg-surface-low p-4 lg:p-6">
            <CategoryForm
              category={category}
              tops={tops}
              hasChildren={kids.length > 0}
              onCancel={() => setEditing(null)}
              onDone={(message) => {
                setEditing(null);
                setNotice({ tone: "success", text: message });
              }}
            />
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-body-md text-muted-foreground">
          Categories have two levels: a category and its subcategories. Use the arrows to change the order shown in the shop menu.
        </p>
        <Button type="button" className="h-11" onClick={() => { setCreating((v) => !v); setEditing(null); setNotice(null); }}>
          <Plus className="size-4" aria-hidden="true" />
          Add category
        </Button>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      </div>
      {creating && (
        <Panel title="New category" id="new-category-panel">
          <CategoryForm
            tops={tops}
            hasChildren={false}
            onCancel={() => setCreating(false)}
            onDone={(message) => {
              setCreating(false);
              setNotice({ tone: "success", text: message });
            }}
          />
        </Panel>
      )}
      {tops.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-body-md text-muted-foreground">No categories yet. Add the first one.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {tops.map((top, i) => (
            <li key={top.id} className="list-none">
              <ul>
                {renderRow(top, tops, i, 0)}
                {childrenOf(top.id).map((child, j, kids) => renderRow(child, kids, j, 1))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
