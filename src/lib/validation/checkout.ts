// Checkout schemas. The browser form checks the fields with `checkoutSchema`; the server action checks them again
// together with the cart (`placeOrderInputSchema`). Neither carries a price, a total, a discount or a delivery
// charge: the cart is variant ids and quantities, and the database prices everything (place_order()).
import { z } from "zod";

export const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu & Kashmir",
] as const;

export const ADDRESS_TYPES = [
  { value: "farm", label: "Farm / dera" },
  { value: "workshop", label: "Workshop" },
  { value: "shop", label: "Shop / business" },
  { value: "house", label: "House" },
] as const;

/** The payment methods a customer can pick; which of them is offered is decided by store_settings. */
export const PAYMENT_METHOD_IDS = ["cod", "bank_transfer", "online"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

/** Normalises "+92 300 1234567", "92-300-1234567" or "0300 1234567" to "03001234567". */
export function normalisePkMobile(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.startsWith("92") ? `0${digits.slice(2)}` : digits;
}

const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

export const checkoutSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((v) => /^03\d{9}$/.test(normalisePkMobile(v)), "Enter a Pakistani mobile number, e.g. 0300 1234567"),
  full_name: z.string().trim().min(2, "Enter your name").max(80, "Keep this under 80 characters"),
  email: z.union([z.literal(""), z.email("Enter a valid email or leave it empty").max(120)]),
  company_name: optionalText(120),
  address_type: z.enum(ADDRESS_TYPES.map((a) => a.value) as [string, ...string[]], { error: "Choose an address type" }),
  province: z.enum(PROVINCES, { error: "Choose a province" }),
  city: z.string().trim().min(2, "Enter your city or tehsil").max(60, "Keep this under 60 characters"),
  // 120 is the database limit for this line.
  address: z.string().trim().min(5, "Enter your address").max(120, "Keep this under 120 characters"),
  landmark: optionalText(120),
  cargo_terminal: optionalText(120),
  delivery_method_id: z.string().min(1, "Choose a delivery method").max(40),
  payment_method: z.enum(PAYMENT_METHOD_IDS, { error: "Choose a payment method" }),
  call_to_confirm: z.boolean(),
  notes: optionalText(500),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** The cart as the browser holds it: ids and quantities, nothing else. Same limits as the cart itself. */
export const cartLinesSchema = z
  .array(z.object({ variant_id: z.guid(), quantity: z.number().int().min(1).max(99) }))
  .min(1, "Your cart is empty")
  .max(50, "Too many different items in one order");

export type CartLines = z.infer<typeof cartLinesSchema>;

/** What the place-order action receives. `idempotency_key` is made once per checkout attempt in the browser. */
export const placeOrderInputSchema = z.object({
  idempotency_key: z.guid(),
  items: cartLinesSchema,
  form: checkoutSchema,
});

export type PlaceOrderInput = z.infer<typeof placeOrderInputSchema>;
