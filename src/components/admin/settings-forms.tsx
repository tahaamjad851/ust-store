"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ActiveBadge } from "@/components/admin/badges";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { NativeSelect } from "@/components/admin/native-select";
import { RowAction, toNotice, type Notice } from "@/components/admin/row-action";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCourierAction, reorderCouriersAction, saveCourierAction, saveSettingsAction, setCourierActiveAction } from "@/features/admin/settings-actions";
import type { AdminCourier, AdminSettings } from "@/features/admin/types";
import { PROVINCES } from "@/lib/validation/checkout";
import { settingsSchema, type SettingsInput } from "@/lib/validation/admin";

export function SettingsForm({ settings, notificationEmails }: { settings: AdminSettings; notificationEmails: string[] }) {
  const { form, submit, pending, error, success } = useAdminForm<SettingsInput, ReturnType<typeof settingsSchema.parse>>({
    resolver: zodResolver(settingsSchema),
    defaults: {
      business_name: settings.business_name,
      tagline: settings.tagline,
      value_statement: settings.value_statement,
      announcement_text: settings.announcement_text,
      phone_primary: settings.phone_primary,
      phone_secondary: settings.phone_secondary ?? "",
      whatsapp_number: settings.whatsapp_number ? `0${settings.whatsapp_number.slice(2)}` : "",
      email: settings.email,
      address_line: settings.address_line,
      city: settings.city,
      province: settings.province,
      business_hours: settings.business_hours,
      delivery_charge_note: settings.delivery_charge_note,
      return_policy_note: settings.return_policy_note,
      price_change_alert_percent: String(settings.price_change_alert_percent),
      order_notification_emails: notificationEmails.join(", "),
    },
    action: saveSettingsAction,
  });
  const { register, formState: { errors } } = form;
  const text = (name: keyof SettingsInput, label: string, opts: { hint?: string; optional?: boolean; type?: string } = {}) => (
    <Field id={`s-${name}`} label={label} hint={opts.hint} optional={opts.optional} error={errors[name]?.message as string | undefined}>
      <Input type={opts.type} className={fieldInputClass} {...fieldProps(`s-${name}`, { error: errors[name]?.message as string | undefined, hint: Boolean(opts.hint) })} {...register(name)} />
    </Field>
  );
  const area = (name: keyof SettingsInput, label: string, hint?: string) => (
    <Field id={`s-${name}`} label={label} hint={hint} className="sm:col-span-2" error={errors[name]?.message as string | undefined}>
      <Textarea rows={2} className="rounded-lg border-input bg-card text-body-lg md:text-body-md" {...fieldProps(`s-${name}`, { error: errors[name]?.message as string | undefined, hint: Boolean(hint) })} {...register(name)} />
    </Field>
  );
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-headline-sm">Business</legend>
        {text("business_name", "Business name")}
        {text("tagline", "Tagline", { optional: true })}
        {text("announcement_text", "Top bar text", { optional: true, hint: "The line in the bar at the very top of the shop. Empty hides it." })}
        {text("value_statement", "Short line for the home page and footer", { optional: true })}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-headline-sm">Contact</legend>
        {text("phone_primary", "Phone", { type: "tel" })}
        {text("phone_secondary", "Second phone", { optional: true, type: "tel" })}
        {text("whatsapp_number", "WhatsApp number", { hint: "For example 0321 8219594. Customers message this number.", type: "tel" })}
        {text("email", "Email shown in the shop", { optional: true, type: "email" })}
        {text("address_line", "Address", { optional: true })}
        {text("city", "City", { optional: true })}
        <Field id="s-province" label="Province" optional error={errors.province?.message}>
          <NativeSelect {...fieldProps("s-province", { error: errors.province?.message })} {...register("province")}>
            <option value="">Not shown</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </NativeSelect>
        </Field>
        {text("business_hours", "Opening hours", { optional: true })}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-headline-sm">Delivery and exchange</legend>
        {area("delivery_charge_note", "Delivery note", "Shown instead of a delivery charge, for example: Delivery charge confirmed by phone.")}
        {area("return_policy_note", "Exchange text", "Shown on product pages and in the FAQ. Empty hides it.")}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-headline-sm">Prices and orders</legend>
        {text("price_change_alert_percent", "Ask to confirm price changes above (%)", { hint: "On the Daily prices page." })}
        <Field id="s-order_notification_emails" label="Email for new orders" optional hint="Private: never shown in the shop. Separate several addresses with commas." error={errors.order_notification_emails?.message}>
          <Input type="text" inputMode="email" className={fieldInputClass} {...fieldProps("s-order_notification_emails", { error: errors.order_notification_emails?.message, hint: true })} {...register("order_notification_emails")} />
        </Field>
      </fieldset>
      {error && <FormAlert tone="error">{error}</FormAlert>}
      {success && <FormAlert tone="success">{success}</FormAlert>}
      <SubmitButton pending={pending} className="w-auto px-8">Save settings</SubmitButton>
    </form>
  );
}

export function CouriersEditor({ couriers }: { couriers: AdminCourier[] }) {
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const report = (r: Parameters<typeof toNotice>[0]) => setNotice(toNotice(r));
  const move = (i: number, by: -1 | 1) => {
    const ids = couriers.map((c) => c.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    return () => reorderCouriersAction(ids);
  };
  return (
    <div className="space-y-4">
      <div aria-live="polite" className="empty:hidden">{notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}</div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {couriers.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <p className="flex items-center gap-2">
              <span className="text-label-lg">{c.name}</span>
              <ActiveBadge active={c.is_active} off="Not used" />
            </p>
            <div className="flex flex-wrap gap-2">
              <RowAction ariaLabel={`Move ${c.name} up`} disabled={i === 0} action={move(i, -1)} onResult={report} className="size-11 p-0"><ArrowUp className="size-4" aria-hidden="true" /></RowAction>
              <RowAction ariaLabel={`Move ${c.name} down`} disabled={i === couriers.length - 1} action={move(i, 1)} onResult={report} className="size-11 p-0"><ArrowDown className="size-4" aria-hidden="true" /></RowAction>
              <RowAction ariaLabel={`${c.is_active ? "Stop using" : "Use"} ${c.name}`} action={() => setCourierActiveAction(c.id, !c.is_active)} onResult={report}>
                {c.is_active ? "Stop using" : "Use"}
              </RowAction>
              <ConfirmAction
                label={<><Trash2 className="size-4" aria-hidden="true" />Delete</>}
                ariaLabel={`Delete ${c.name}`}
                title={`Delete ${c.name}?`}
                description="It is removed from the list. Orders are not affected."
                confirmLabel="Delete courier"
                destructive
                triggerClassName="h-11 text-destructive"
                action={async () => {
                  const r = await deleteCourierAction(c.id);
                  report(r);
                  return r;
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await saveCourierAction(null, { name, is_active: true });
          report(r);
          if (r.ok) setName("");
        }}
      >
        <Field id="new-courier" label="Add a courier" className="min-w-0 flex-1">
          <Input id="new-courier" className={fieldInputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" className="h-11" disabled={name.trim() === ""}>
          <Plus className="size-4" aria-hidden="true" />
          Add courier
        </Button>
      </form>
    </div>
  );
}
