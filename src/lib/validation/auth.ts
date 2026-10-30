// Schemas for sign-in, registration, password reset and the account pages.
// Every server action re-validates with these; the browser forms use the same schemas for
// instant feedback, but only the server's result counts.
import { z } from "zod";
import { normalisePkMobile, PROVINCES } from "./checkout";

export const PASSWORD_MIN = 8;
// bcrypt (used by Supabase Auth) ignores everything past 72 bytes.
export const PASSWORD_MAX = 72;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .max(254, "That email address is too long")
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

/** Password rules for choosing a new password (register, reset). Sign-in only checks presence. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

const confirmPassword = z.string().min(1, "Re-enter your password");

function passwordsMatch(data: { password: string; confirm_password: string }, ctx: z.RefinementCtx) {
  if (data.password !== data.confirm_password) {
    ctx.addIssue({ code: "custom", path: ["confirm_password"], message: "The passwords do not match" });
  }
}

const fullName = z.string().trim().min(2, "Enter your full name").max(120, "Keep this under 120 characters");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200, "That password is too long"),
  // Validated again with safeNextPath() before any redirect.
  next: z.string().max(512).optional(),
});

export const registerSchema = z
  .object({
    full_name: fullName,
    email: emailSchema,
    password: newPasswordSchema,
    confirm_password: confirmPassword,
  })
  .superRefine(passwordsMatch);

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirm_password: confirmPassword })
  .superRefine(passwordsMatch);

// --- Account ---------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((v) => (v === "" ? null : v));

const MOBILE_MESSAGE = "Enter a Pakistani mobile number, e.g. 0300 1234567";

/** Pakistani mobile in any common format, stored as 03XXXXXXXXX. */
const mobile = z
  .string()
  .trim()
  .transform(normalisePkMobile)
  .refine((v) => /^03\d{9}$/.test(v), MOBILE_MESSAGE);

export const profileSchema = z.object({
  full_name: fullName,
  phone: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : normalisePkMobile(v)))
    .refine((v) => v === null || /^03\d{9}$/.test(v), MOBILE_MESSAGE),
  company_name: optionalText(120),
});

export const addressSchema = z.object({
  label: optionalText(40),
  full_name: z.string().trim().min(2, "Enter the receiver's name").max(80, "Keep this under 80 characters"),
  phone: mobile,
  line1: z.string().trim().min(3, "Enter the address").max(120, "Keep this under 120 characters"),
  street: optionalText(120),
  area: optionalText(120),
  city: z.string().trim().min(2, "Enter your city or tehsil").max(60, "Keep this under 60 characters"),
  province: z.enum(PROVINCES, { error: "Choose a province" }),
  postal_code: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{5}$/.test(v), "Postal codes have 5 digits"),
  instructions: optionalText(500),
  is_default: z.boolean(),
});

export const addressIdSchema = z.uuid("Address not found");

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileValues = z.output<typeof profileSchema>;
export type AddressInput = z.input<typeof addressSchema>;
export type AddressValues = z.output<typeof addressSchema>;
