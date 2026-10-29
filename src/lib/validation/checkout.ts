// Checkout form schema. Shared with the server action that will create orders later;
// the server must re-validate and re-price, never trust these values for money.
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
  business_order: z.boolean(),
  address_type: z.enum(ADDRESS_TYPES.map((a) => a.value) as [string, ...string[]], { error: "Choose an address type" }),
  province: z.enum(PROVINCES, { error: "Choose a province" }),
  city: z.string().trim().min(2, "Enter your city or tehsil").max(60, "Keep this under 60 characters"),
  address: z.string().trim().min(5, "Enter your address").max(200, "Keep this under 200 characters"),
  landmark: optionalText(120),
  cargo_terminal: optionalText(120),
  delivery_method_id: z.string().min(1, "Choose a delivery method").max(40),
  payment_method: z.enum(["cod", "bank_transfer"], { error: "Choose a payment method" }),
  call_to_confirm: z.boolean(),
  notes: optionalText(500),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
