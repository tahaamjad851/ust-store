"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { NativeSelect } from "@/components/admin/native-select";
import { RowAction, toNotice, type Notice } from "@/components/admin/row-action";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminResult } from "@/features/admin/types";
import { addOrderNoteAction, markCodCollectedAction, setDeliveryChargeAction, setOrderStatusAction, setShipmentAction } from "@/features/orders/admin-actions";
import { nextStatuses, STATUS_LABEL, type OrderStatus } from "@/features/orders/status";
import { orderTotal } from "@/features/orders/totals";
import { formatPKRExact, paisaToRupeesInput, rupeesToPaisa } from "@/lib/pricing/money";
import {
  deliveryChargeSchema,
  orderNoteSchema,
  shipmentSchema,
  type DeliveryChargeInput,
  type OrderNoteInput,
  type ShipmentInput,
} from "@/lib/validation/orders";

/** The result of the last action, announced to screen readers (errors immediately, success politely). */
function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div role={notice.tone === "error" ? "alert" : "status"}>
      <FormAlert tone={notice.tone}>{notice.text}</FormAlert>
    </div>
  );
}

// --- status -----------------------------------------------------------------------------------------------------

export function StatusPanel({ orderId, status, paymentBlocked }: { orderId: string; status: OrderStatus; paymentBlocked: boolean }) {
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const options = nextStatuses(status);
  const forward = options.filter((s) => s !== "cancelled");
  const canCancel = options.includes("cancelled");

  if (options.length === 0) {
    return <p className="text-body-md text-muted-foreground">This order is {STATUS_LABEL[status].toLowerCase()}. No further status changes are possible.</p>;
  }

  const send = (next: OrderStatus) => async (): Promise<AdminResult<unknown>> => {
    const result = await setOrderStatusAction({ order_id: orderId, status: next, note });
    if (result.ok) setNote("");
    return result;
  };

  return (
    <div className="space-y-4">
      <Field id="status-note" label="Note for the customer" optional hint="Shown on the customer's order. Write internal remarks in Internal notes instead.">
        <Input id="status-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={fieldInputClass} aria-describedby="status-note-hint" />
      </Field>
      {paymentBlocked && (
        <p className="text-body-sm text-warning-foreground">This order is not paid yet. A bank-transfer or online order must be marked paid before it can be dispatched.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {forward.map((next) => (
          <RowAction key={next} variant="default" action={send(next)} onResult={(r) => setNotice(toNotice(r))}>
            Mark as {STATUS_LABEL[next]}
          </RowAction>
        ))}
        {canCancel && (
          <ConfirmAction
            label="Cancel order"
            title="Cancel this order?"
            description="The reserved stock goes back on the shelf. A cancelled order cannot be reopened."
            confirmLabel="Yes, cancel the order"
            destructive
            triggerVariant="outline"
            triggerClassName="h-11 border-destructive text-destructive hover:bg-destructive/10"
            action={send("cancelled")}
          />
        )}
      </div>
      <NoticeLine notice={notice} />
    </div>
  );
}

// --- delivery charge --------------------------------------------------------------------------------------------

export function DeliveryChargePanel(props: {
  orderId: string;
  subtotalPaisa: number;
  discountPaisa: number;
  shippingPaisa: number;
  confirmed: boolean;
  /** Why the charge cannot be changed (order finished or money collected), or null. */
  lockedReason: string | null;
}) {
  const { form, submit, pending, error, success } = useAdminForm<DeliveryChargeInput, ReturnType<typeof deliveryChargeSchema.parse>>({
    resolver: zodResolver(deliveryChargeSchema),
    defaults: { order_id: props.orderId, amount: props.confirmed ? paisaToRupeesInput(props.shippingPaisa) : "" },
    action: (values) => setDeliveryChargeAction(values),
  });
  const { register, watch, formState: { errors } } = form;
  const typed = rupeesToPaisa(watch("amount") ?? "");
  const preview = typed === null ? null : orderTotal({ subtotal_paisa: props.subtotalPaisa, discount_paisa: props.discountPaisa, shipping_paisa: typed });

  if (props.lockedReason) {
    return (
      <p className="text-body-md">
        {props.confirmed ? `Delivery charge: ${props.shippingPaisa === 0 ? "free" : formatPKRExact(props.shippingPaisa)}.` : "The delivery charge was never entered."}{" "}
        <span className="text-muted-foreground">{props.lockedReason}</span>
      </p>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      {success && <FormAlert tone="success">{success}</FormAlert>}
      <input type="hidden" {...register("order_id")} />
      <p className="text-body-md text-muted-foreground">
        {props.confirmed ? "The charge agreed with the customer." : "Not entered yet. The customer was told it will be confirmed by phone."}
      </p>
      <Field id="delivery-charge" label="Delivery charge (Rs)" hint="Enter 0 if delivery is free. The total is recalculated for you." error={errors.amount?.message}>
        <Input inputMode="decimal" className={fieldInputClass} {...fieldProps("delivery-charge", { error: errors.amount?.message, hint: true })} {...register("amount")} />
      </Field>
      {preview !== null && (
        <p className="text-body-md" aria-live="polite">
          Order total will be <strong className="tabular" data-testid="charge-preview">{formatPKRExact(preview)}</strong>
        </p>
      )}
      <SubmitButton pending={pending} className="w-auto px-6">
        Save delivery charge
      </SubmitButton>
    </form>
  );
}

// --- courier and tracking ---------------------------------------------------------------------------------------

export function ShipmentPanel({ orderId, couriers, courier, tracking, closed }: { orderId: string; couriers: string[]; courier: string; tracking: string; closed: boolean }) {
  const options = courier && !couriers.some((c) => c.toLowerCase() === courier.toLowerCase()) ? [courier, ...couriers] : couriers;
  const { form, submit, pending, error, success } = useAdminForm<ShipmentInput, ReturnType<typeof shipmentSchema.parse>>({
    resolver: zodResolver(shipmentSchema),
    defaults: { order_id: orderId, courier, tracking_number: tracking },
    action: (values) => setShipmentAction(values),
  });
  const { register, formState: { errors } } = form;
  if (closed) return <p className="text-body-md text-muted-foreground">This order is cancelled, so the courier cannot be changed.</p>;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && <FormAlert tone="error" className="sm:col-span-2">{error}</FormAlert>}
      {success && <FormAlert tone="success" className="sm:col-span-2">{success}</FormAlert>}
      <input type="hidden" {...register("order_id")} />
      <Field id="courier" label="Courier" error={errors.courier?.message}>
        <NativeSelect {...fieldProps("courier", { error: errors.courier?.message })} {...register("courier")}>
          <option value="">Choose a courier…</option>
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="tracking-number" label="Tracking number" optional error={errors.tracking_number?.message}>
        <Input className={fieldInputClass} {...fieldProps("tracking-number", { error: errors.tracking_number?.message })} {...register("tracking_number")} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending} className="w-auto px-6">
          Save courier and tracking
        </SubmitButton>
      </div>
    </form>
  );
}

// --- cash on delivery -------------------------------------------------------------------------------------------

export function CodPanel({ orderId, amountLabel, canCollect, hint }: { orderId: string; amountLabel: string; canCollect: boolean; hint: string }) {
  const [notice, setNotice] = useState<Notice>(null);
  return (
    <div className="space-y-3">
      <p className="text-body-md">
        Cash to collect: <strong className="tabular">{amountLabel}</strong>
      </p>
      <p className="text-body-sm text-muted-foreground">{hint}</p>
      {canCollect && (
        <RowAction variant="default" action={() => markCodCollectedAction({ order_id: orderId })} onResult={(r) => setNotice(toNotice(r))}>
          <Banknote className="size-4" aria-hidden="true" />
          Mark cash as collected
        </RowAction>
      )}
      <NoticeLine notice={notice} />
    </div>
  );
}

// --- internal notes ---------------------------------------------------------------------------------------------

export function NoteForm({ orderId }: { orderId: string }) {
  const { form, submit, pending, error, success } = useAdminForm<OrderNoteInput, ReturnType<typeof orderNoteSchema.parse>>({
    resolver: zodResolver(orderNoteSchema),
    defaults: { order_id: orderId, note: "" },
    action: (values) => addOrderNoteAction(values),
    resetOnSuccess: true,
  });
  const { register, formState: { errors } } = form;
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      {success && <FormAlert tone="success">{success}</FormAlert>}
      <input type="hidden" {...register("order_id")} />
      <Field id="internal-note" label="Add an internal note" hint="Only staff see this. Customers never do." error={errors.note?.message}>
        <Textarea rows={3} className="rounded-lg border-input bg-card text-body-lg md:text-body-md" {...fieldProps("internal-note", { error: errors.note?.message, hint: true })} {...register("note")} />
      </Field>
      <SubmitButton pending={pending} className="w-auto px-6">
        Add note
      </SubmitButton>
    </form>
  );
}
