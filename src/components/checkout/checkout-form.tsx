"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Lock, MessageCircle, ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { usePricedLines } from "@/components/cart/use-priced-lines";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { whatsappHref } from "@/lib/contact";
import { formatPKR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { ADDRESS_TYPES, checkoutSchema, PROVINCES, type CheckoutInput } from "@/lib/validation/checkout";
import type { CartCatalogItem } from "@/services/catalog";
import type { StoreSettings } from "@/types/store";

type Props = {
  catalog: CartCatalogItem[];
  settings: Pick<StoreSettings, "delivery_methods" | "payment_methods" | "free_delivery_threshold_paisa" | "whatsapp_number" | "phone_primary">;
};

const fieldInput = "h-11 rounded-lg border-input bg-card text-body-lg md:text-body-md";

function FieldErrorText({ id, error }: { id: string; error?: FieldError }) {
  if (!error?.message) return null;
  return (
    <p id={id} className="text-body-sm text-destructive">
      {error.message}
    </p>
  );
}

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: React.ReactNode }) {
  const id = `checkout-step-${step}`;
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-lg border border-border bg-card p-4 lg:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-label-lg text-primary-foreground" aria-hidden="true">
          {step}
        </span>
        <div>
          <h2 id={id} className="text-headline-sm">
            <span className="sr-only">Step {step}: </span>
            {title}
          </h2>
          {description && <p className="text-body-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function CheckoutForm({ catalog, settings }: Props) {
  const { hydrated } = useCart();
  const { priced, totals } = usePricedLines(catalog, settings.free_delivery_threshold_paisa);
  const [submitted, setSubmitted] = useState(false);
  const paymentMethods = settings.payment_methods.filter((m) => m.enabled);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    shouldFocusError: true,
    defaultValues: {
      phone: "",
      full_name: "",
      email: "",
      business_order: false,
      address_type: "farm",
      province: "Punjab",
      city: "",
      address: "",
      landmark: "",
      cargo_terminal: "",
      delivery_method_id: settings.delivery_methods[0]?.id ?? "",
      payment_method: paymentMethods[0]?.id ?? "cod",
      call_to_confirm: true,
      notes: "",
    },
  });

  // DEMO: orders are not connected yet. Validate only; nothing leaves the browser.
  const onSubmit = handleSubmit(() => setSubmitted(true));

  if (!hydrated) {
    return <p className="py-16 text-center text-body-lg text-muted-foreground">Loading your order…</p>;
  }

  if (priced.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <ShoppingCart className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-headline-md">Your cart is empty</h2>
        <p className="mt-1 text-body-md text-muted-foreground">Add parts to your cart before checking out.</p>
        <Button asChild className="mt-4 h-11">
          <Link href="/shop">Browse parts</Link>
        </Button>
      </div>
    );
  }

  const describedBy = (name: keyof CheckoutInput, hint?: string) =>
    [errors[name] ? `${name}-error` : null, hint].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="space-y-4">
        <Section step={1} title="Contact details" description="We use these to confirm your order and arrange delivery.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0300 1234567"
                aria-invalid={!!errors.phone}
                aria-describedby={describedBy("phone")}
                className={fieldInput}
                {...register("phone")}
              />
              <FieldErrorText id="phone-error" error={errors.phone} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                autoComplete="name"
                aria-invalid={!!errors.full_name}
                aria-describedby={describedBy("full_name")}
                className={fieldInput}
                {...register("full_name")}
              />
              <FieldErrorText id="full_name-error" error={errors.full_name} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="email">
                Email <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={describedBy("email")}
                className={fieldInput}
                {...register("email")}
              />
              <FieldErrorText id="email-error" error={errors.email} />
            </div>
          </div>
          <Controller
            control={control}
            name="business_order"
            render={({ field }) => (
              <div className="flex items-start gap-3 rounded-lg bg-surface-low p-3">
                <Checkbox
                  id="business_order"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5 size-5"
                />
                <Label htmlFor="business_order" className="block text-body-md font-normal">
                  <span className="font-semibold">This is a business order</span>
                  <span className="block text-body-sm text-muted-foreground">Workshop, fleet or dealer. We may contact you about wholesale pricing.</span>
                </Label>
              </div>
            )}
          />
        </Section>

        <Section step={2} title="Delivery address">
          <Controller
            control={control}
            name="address_type"
            render={({ field }) => (
              <fieldset className="space-y-2">
                <legend className="text-label-lg">Address type</legend>
                <RadioGroup
                  ref={(el) => field.ref(el?.querySelector<HTMLButtonElement>('[role="radio"][data-state="checked"], [role="radio"]') ?? null)}
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-invalid={!!errors.address_type}
                  aria-describedby={describedBy("address_type")}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {ADDRESS_TYPES.map((t) => (
                    <Label
                      key={t.value}
                      htmlFor={`address_type-${t.value}`}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-brand-tint/40"
                    >
                      <RadioGroupItem id={`address_type-${t.value}`} value={t.value} />
                      {t.label}
                    </Label>
                  ))}
                </RadioGroup>
                <FieldErrorText id="address_type-error" error={errors.address_type} />
              </fieldset>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="province">Province</Label>
              <select
                id="province"
                autoComplete="address-level1"
                aria-invalid={!!errors.province}
                aria-describedby={describedBy("province")}
                className="h-11 w-full rounded-lg border border-input bg-card px-3 text-body-lg md:text-body-md"
                {...register("province")}
              >
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <FieldErrorText id="province-error" error={errors.province} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City / tehsil</Label>
              <Input
                id="city"
                autoComplete="address-level2"
                aria-invalid={!!errors.city}
                aria-describedby={describedBy("city")}
                className={fieldInput}
                {...register("city")}
              />
              <FieldErrorText id="city-error" error={errors.city} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                autoComplete="street-address"
                placeholder="Village / chak, street, house or shop number"
                aria-invalid={!!errors.address}
                aria-describedby={describedBy("address")}
                className={fieldInput}
                {...register("address")}
              />
              <FieldErrorText id="address-error" error={errors.address} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="landmark">
                Nearby landmark <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="landmark" aria-describedby={describedBy("landmark")} className={fieldInput} {...register("landmark")} />
              <FieldErrorText id="landmark-error" error={errors.landmark} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo_terminal">
                Preferred cargo terminal <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="cargo_terminal"
                aria-describedby={describedBy("cargo_terminal", "cargo_terminal-hint")}
                className={fieldInput}
                {...register("cargo_terminal")}
              />
              <p id="cargo_terminal-hint" className="text-body-sm text-muted-foreground">
                Useful for heavy parts sent by goods transport.
              </p>
              <FieldErrorText id="cargo_terminal-error" error={errors.cargo_terminal} />
            </div>
          </div>
        </Section>

        <Section step={3} title="Delivery method">
          <Controller
            control={control}
            name="delivery_method_id"
            render={({ field }) => (
              <RadioGroup
                ref={(el) => field.ref(el?.querySelector<HTMLButtonElement>('[role="radio"][data-state="checked"], [role="radio"]') ?? null)}
                value={field.value}
                onValueChange={field.onChange}
                aria-label="Delivery method"
                aria-invalid={!!errors.delivery_method_id}
                aria-describedby={describedBy("delivery_method_id")}
                className="gap-2"
              >
                {settings.delivery_methods.map((m) => (
                  <Label
                    key={m.id}
                    htmlFor={`delivery-${m.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-brand-tint/40"
                  >
                    <RadioGroupItem id={`delivery-${m.id}`} value={m.id} className="mt-0.5" />
                    <span className="flex-1">
                      <span className="block text-label-lg">{m.name}</span>
                      <span className="block text-body-sm text-muted-foreground">{m.description}</span>
                    </span>
                    <span className="text-label-md tabular">
                      {totals.free_delivery ? "Free" : m.fee_paisa === null ? "Fee confirmed later" : formatPKR(m.fee_paisa)}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
          <FieldErrorText id="delivery_method_id-error" error={errors.delivery_method_id} />
        </Section>

        <Section step={4} title="Payment method">
          <Controller
            control={control}
            name="payment_method"
            render={({ field }) => (
              <RadioGroup
                ref={(el) => field.ref(el?.querySelector<HTMLButtonElement>('[role="radio"][data-state="checked"], [role="radio"]') ?? null)}
                value={field.value}
                onValueChange={field.onChange}
                aria-label="Payment method"
                aria-invalid={!!errors.payment_method}
                aria-describedby={describedBy("payment_method")}
                className="gap-2"
              >
                {paymentMethods.map((m) => (
                  <Label
                    key={m.id}
                    htmlFor={`payment-${m.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-brand-tint/40"
                  >
                    <RadioGroupItem id={`payment-${m.id}`} value={m.id} className="mt-0.5" />
                    <span>
                      <span className="block text-label-lg">{m.name}</span>
                      <span className="block text-body-sm text-muted-foreground">{m.description}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
          <FieldErrorText id="payment_method-error" error={errors.payment_method} />
        </Section>

        <Section step={5} title="Fitment check & notes">
          <Controller
            control={control}
            name="call_to_confirm"
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="call_to_confirm"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5 size-5"
                />
                <Label htmlFor="call_to_confirm" className="block text-body-md font-normal">
                  Call me to confirm the parts fit my tractor before dispatch
                </Label>
              </div>
            )}
          />
          <div className="space-y-1.5">
            <Label htmlFor="notes">
              Order notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Tractor model, packing requests or delivery instructions"
              aria-describedby={describedBy("notes")}
              className="rounded-lg border-input bg-card text-body-lg md:text-body-md"
              {...register("notes")}
            />
            <FieldErrorText id="notes-error" error={errors.notes} />
          </div>
        </Section>
      </div>

      <aside aria-labelledby="checkout-summary-title" className="space-y-4 lg:sticky lg:top-4">
        <section className="rounded-lg border border-border bg-card p-4 shadow-card lg:p-6">
          <h2 id="checkout-summary-title" className="text-headline-md">
            Order summary
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {priced.map(({ product, quantity, line_total_paisa }) => (
              <li key={product.id} className="flex gap-3 py-3">
                <Image
                  src={product.image_paths[0]}
                  alt={`${product.name} (placeholder image)`}
                  width={56}
                  height={56}
                  className="size-14 rounded-lg border border-border bg-surface-low"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-label-md">{product.name}</p>
                  <p className="text-body-sm text-muted-foreground">Qty: {quantity}</p>
                </div>
                <p className="text-label-lg tabular">{formatPKR(line_total_paisa)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-2 border-t border-border pt-3 text-body-md">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular">{formatPKR(totals.subtotal_paisa)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd>{totals.free_delivery ? "Free" : "Confirmed after order"}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="text-headline-sm">Total</dt>
              <dd className="text-price-lg text-primary tabular">{formatPKR(totals.subtotal_paisa)}</dd>
            </div>
          </dl>

          <div role="status" aria-live="polite">
            {submitted && (
              <p className="mt-4 flex gap-2 rounded-lg bg-warning-container p-3 text-body-sm text-warning-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Demo only: online ordering isn&apos;t connected yet, so nothing was sent. Please order on WhatsApp for now.
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting} className="mt-4 h-12 w-full text-label-lg">
            <Lock />
            Place order ({formatPKR(totals.subtotal_paisa)})
          </Button>
          <Link href="/cart" className="mt-1 flex min-h-11 items-center justify-center text-label-md text-primary underline">
            Back to cart
          </Link>
        </section>

        <section aria-labelledby="checkout-help-title" className="rounded-lg border border-border bg-surface-container p-4">
          <h2 id="checkout-help-title" className="text-headline-sm">
            Need help with your order?
          </h2>
          <p className="mt-1 text-body-md text-muted-foreground">
            Call <span className="tabular">{settings.phone_primary}</span> or message us before you order.
          </p>
          <Button asChild className={cn("mt-3 h-11 w-full bg-whatsapp hover:bg-whatsapp-hover")}>
            <a href={whatsappHref(settings.whatsapp_number)} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              WhatsApp us
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        </section>
      </aside>
    </form>
  );
}
