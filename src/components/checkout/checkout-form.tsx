"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Lock, MessageCircle, ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { usePricedLines } from "@/components/cart/use-priced-lines";
import { FormAlert } from "@/components/forms/form-alert";
import { ProductImageView } from "@/components/products/product-image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { loadCheckoutPrefill, placeOrderAction, type CheckoutPrefill } from "@/features/orders/actions";
import { telLink, whatsappLink } from "@/lib/contact";
import { formatPKR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { ADDRESS_TYPES, checkoutSchema, PROVINCES, type CheckoutInput } from "@/lib/validation/checkout";
import { isRedirectError } from "@/components/forms/is-redirect-error";
import type { StoreSettings } from "@/types/store";

type Props = {
  settings: Pick<
    StoreSettings,
    "delivery_methods" | "payment_methods" | "delivery_charge_note" | "whatsapp_number" | "phone_primary"
  >;
};

const fieldInput = "h-11 rounded-lg border-input bg-card text-body-lg md:text-body-md";
const KEY_STORAGE = "ust-checkout-key";
const DELIVERY_PROMISE = "Delivery charge will be confirmed by phone.";

/** One key per checkout attempt, kept for the tab so a refresh or a retry after a network problem reuses it. */
function readKey(): string {
  try {
    const stored = window.sessionStorage.getItem(KEY_STORAGE);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  } catch {
    // Storage blocked: a key per page view still protects against double clicks.
  }
  return newKey();
}
function newKey(): string {
  const key = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(KEY_STORAGE, key);
  } catch {
    // see above
  }
  return key;
}
function forgetKey() {
  try {
    window.sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // nothing stored
  }
}

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

export function CheckoutForm({ settings }: Props) {
  const router = useRouter();
  const { hydrated, clear } = useCart();
  const { priced, totals, sellableCount, status, retry } = usePricedLines();
  const paymentMethods = settings.payment_methods.filter((m) => m.enabled);
  const [prefill, setPrefill] = useState<CheckoutPrefill>({ signedIn: false });
  const [formError, setFormError] = useState<string>();
  const [placedNumber, setPlacedNumber] = useState<string>();
  const [pending, setPending] = useState(false);
  const keyRef = useRef<string | null>(null);
  const submitting = useRef(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    formState: { errors },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    shouldFocusError: true,
    defaultValues: {
      phone: "",
      full_name: "",
      email: "",
      company_name: "",
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

  // Read before any early return below: hooks run in the same order on every render.
  const review = useWatch({ control });

  // A signed-in customer's details fill the empty fields; anything already typed is left alone.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    keyRef.current = readKey();
    loadCheckoutPrefill().then((p) => {
      setPrefill(p);
      if (!p.signedIn) return;
      const current = getValues();
      if (!current.full_name) setValue("full_name", p.full_name);
      if (!current.phone) setValue("phone", p.phone);
      if (!current.email) setValue("email", p.email);
    });
  }, [getValues, setValue]);

  const chooseAddress = useCallback(
    (id: string) => {
      if (!prefill.signedIn) return;
      const a = prefill.addresses.find((x) => x.id === id);
      if (!a) return;
      setValue("address", a.line1, { shouldValidate: true });
      setValue("city", a.city, { shouldValidate: true });
      setValue("landmark", a.area);
      if ((PROVINCES as readonly string[]).includes(a.province)) setValue("province", a.province as CheckoutInput["province"]);
    },
    [prefill, setValue],
  );

  const sellable = priced.filter((l) => l.product.stock_status !== "out_of_stock");

  // handleSubmit() is called inside the event handler, so the refs it reads are only touched when the form is submitted.
  const onSubmit = (event: React.BaseSyntheticEvent) =>
    handleSubmit(async (values) => {
    // One request at a time: a second click while the first is out does nothing (and would reuse the same key anyway).
    if (submitting.current || sellable.length === 0) return;
    submitting.current = true;
    setPending(true);
    setFormError(undefined);
    try {
      const key = keyRef.current ?? readKey();
      keyRef.current = key;
      const result = await placeOrderAction({
        idempotency_key: key,
        // Ids and quantities only. The server prices every line from the database.
        items: sellable.map((l) => ({ variant_id: l.product.variant_id, quantity: l.quantity })),
        form: values,
      });
      if (result.ok) {
        forgetKey();
        clear();
        if (result.redirectTo) router.push(result.redirectTo);
        else setPlacedNumber(result.orderNumber);
        return;
      }
      if (result.newKey) keyRef.current = newKey();
      Object.entries(result.fieldErrors ?? {}).forEach(([name, message]) => setError(name as keyof CheckoutInput, { type: "server", message }, { shouldFocus: true }));
      setFormError(result.message);
    } catch (e) {
      // A network failure: the order may or may not exist. The same key makes pressing the button again safe.
      if (!isRedirectError(e)) setFormError("We could not reach the server. Your order may not have been sent. Press Place order again; it will not be placed twice.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  })(event);

  if (placedNumber) {
    return (
      <div role="status" className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h2 className="mt-3 text-headline-md">Order {placedNumber} received</h2>
        <p className="mt-1 text-body-md text-muted-foreground">Keep this number. We will call you to confirm your order and the delivery charge.</p>
        <Button asChild className="mt-4 h-11">
          <Link href="/shop">Continue shopping</Link>
        </Button>
      </div>
    );
  }

  if (!hydrated || (status === "loading" && priced.length === 0)) {
    return (
      <p role="status" className="py-16 text-center text-body-lg text-muted-foreground">
        Loading your order…
      </p>
    );
  }

  if (status === "error" && priced.length === 0) {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <h2 className="text-headline-md">We couldn&apos;t load your order</h2>
        <p className="mt-1 text-body-md text-muted-foreground">Your cart is saved on this device. Check your connection and try again.</p>
        <Button type="button" className="mt-4 h-11" onClick={retry}>
          Try again
        </Button>
      </div>
    );
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

  const deliveryName = settings.delivery_methods.find((m) => m.id === review.delivery_method_id)?.name ?? "";
  const paymentName = settings.payment_methods.find((m) => m.id === review.payment_method)?.name ?? "";
  const addressType = ADDRESS_TYPES.find((t) => t.value === review.address_type)?.label ?? "";
  const hasOutOfStock = priced.some((l) => l.product.stock_status === "out_of_stock");

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="space-y-4">
        <Section step={1} title="Contact details" description="We use these to confirm your order and arrange delivery.">
          {prefill.signedIn && (
            <p className="text-body-sm text-muted-foreground">Signed in. We filled in your saved details; change them if this order is for someone else.</p>
          )}
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
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="company_name">
                Business name <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="company_name"
                autoComplete="organization"
                aria-invalid={!!errors.company_name}
                aria-describedby={describedBy("company_name")}
                className={fieldInput}
                {...register("company_name")}
              />
              <FieldErrorText id="company_name-error" error={errors.company_name} />
            </div>
          </div>
        </Section>

        <Section step={2} title="Delivery address">
          {prefill.signedIn && prefill.addresses.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="saved-address">Use a saved address</Label>
              <select
                id="saved-address"
                defaultValue=""
                onChange={(e) => chooseAddress(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-card px-3 text-body-lg md:text-body-md"
              >
                <option value="">Choose a saved address…</option>
                {prefill.addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {[a.label, a.line1, a.city].filter(Boolean).join(", ")}
                  </option>
                ))}
              </select>
            </div>
          )}
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
                aria-describedby={[describedBy("delivery_method_id"), "delivery-note"].filter(Boolean).join(" ")}
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
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
          <p id="delivery-note" className="text-body-sm text-muted-foreground">
            {settings.delivery_charge_note}
          </p>
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

        <Section step={6} title="Review and place order" description="Check your details, then place your order. You pay nothing now.">
          <dl className="grid gap-3 text-body-md sm:grid-cols-2" data-testid="checkout-review">
            <div>
              <dt className="text-label-md text-muted-foreground">Contact</dt>
              <dd className="break-words">
                {review.full_name || "—"}
                <br />
                {review.phone || "—"}
                {review.email && (
                  <>
                    <br />
                    {review.email}
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-label-md text-muted-foreground">Deliver to</dt>
              <dd className="break-words">
                {[review.address, review.landmark].filter(Boolean).join(", ") || "—"}
                <br />
                {[review.city, review.province].filter(Boolean).join(", ")}
                {addressType && <span className="block text-body-sm text-muted-foreground">{addressType}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-label-md text-muted-foreground">Delivery method</dt>
              <dd>{deliveryName || "—"}</dd>
            </div>
            <div>
              <dt className="text-label-md text-muted-foreground">Payment</dt>
              <dd>{paymentName || "—"}</dd>
            </div>
          </dl>
          <div className="rounded-lg bg-surface-low p-3 text-body-md">
            <p className="flex justify-between gap-3">
              <span>Items total</span>
              <span className="tabular font-semibold">{formatPKR(totals.subtotal_paisa)}</span>
            </p>
            <p className="mt-1 text-body-sm text-muted-foreground">{DELIVERY_PROMISE} It is added to your total once we agree it with you.</p>
          </div>
          {hasOutOfStock && (
            <FormAlert tone="error">Some items are out of stock and are not included in this order.</FormAlert>
          )}
          <div role="alert" aria-live="assertive">
            {formError && <FormAlert tone="error">{formError}</FormAlert>}
          </div>
          <Button type="submit" disabled={pending || sellableCount === 0} className="h-12 w-full text-label-lg" data-testid="place-order">
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Lock aria-hidden="true" />}
            {pending ? "Placing your order…" : `Place order (${formatPKR(totals.subtotal_paisa)})`}
          </Button>
        </Section>
      </div>

      <aside aria-labelledby="checkout-summary-title" className="space-y-4 lg:sticky lg:top-4">
        <section className="rounded-lg border border-border bg-card p-4 shadow-card lg:p-6">
          <h2 id="checkout-summary-title" className="text-headline-md">
            Order summary
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {priced.map(({ product, quantity, line_total_paisa }) => (
              <li key={product.variant_id} className="flex gap-3 py-3">
                <ProductImageView
                  image={product.image}
                  width={56}
                  height={56}
                  sizes="56px"
                  className="size-14 rounded-lg border border-border bg-surface-low"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-label-md">
                    {product.name}
                    {product.variant_name && `, ${product.variant_name}`}
                  </p>
                  <p className="text-body-sm text-muted-foreground">
                    Qty: {quantity}
                    {product.stock_status === "out_of_stock" && " · Out of stock, not included"}
                  </p>
                </div>
                <p className="text-label-lg tabular">
                  {product.stock_status === "out_of_stock" ? (
                    <span className="text-body-sm text-muted-foreground">Not included</span>
                  ) : (
                    formatPKR(line_total_paisa)
                  )}
                </p>
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
              <dd className="max-w-48 text-right">{DELIVERY_PROMISE}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="text-headline-sm">Total</dt>
              <dd className="text-price-lg text-primary tabular">{formatPKR(totals.subtotal_paisa)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-body-sm text-muted-foreground">The total above does not include delivery.</p>
          <Link href="/cart" className="mt-3 flex min-h-11 items-center justify-center text-label-md text-primary underline">
            Back to cart
          </Link>
        </section>

        {(telLink(settings.phone_primary) || whatsappLink(settings.whatsapp_number)) && (
          <section aria-labelledby="checkout-help-title" className="rounded-lg border border-border bg-surface-container p-4">
            <h2 id="checkout-help-title" className="text-headline-sm">
              Need help with your order?
            </h2>
            <p className="mt-1 text-body-md text-muted-foreground">
              {telLink(settings.phone_primary) ? (
                <>
                  Call <span className="tabular">{settings.phone_primary}</span>
                  {whatsappLink(settings.whatsapp_number) ? " or message us before you order." : " before you order."}
                </>
              ) : (
                "Message us before you order."
              )}
            </p>
            {whatsappLink(settings.whatsapp_number) && (
              <Button asChild className={cn("mt-3 h-11 w-full bg-whatsapp hover:bg-whatsapp-hover")}>
                <a href={whatsappLink(settings.whatsapp_number) ?? undefined} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  WhatsApp us
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
          </section>
        )}
      </aside>
    </form>
  );
}
