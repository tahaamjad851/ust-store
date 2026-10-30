import { describe, expect, it } from "vitest";
import {
  addressSchema,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { fieldErrorsFrom } from "@/lib/validation/form";

const validAddress = {
  label: "Farm",
  full_name: "Ali Khan",
  phone: "0300 1234567",
  line1: "Chak 12/4L",
  street: "",
  area: "",
  city: "Okara",
  province: "Punjab",
  postal_code: "",
  instructions: "",
  is_default: false,
};

describe("emails and passwords", () => {
  it("trims and lowercases the email", () => {
    const r = loginSchema.parse({ email: "  Ali@Example.COM ", password: "x" });
    expect(r.email).toBe("ali@example.com");
  });

  it.each(["", "   ", "not-an-email", "a@b", "a b@c.com"])("rejects the email %j", (email) => {
    expect(loginSchema.safeParse({ email, password: "x" }).success).toBe(false);
  });

  it("rejects an email longer than 254 characters", () => {
    const email = `${"a".repeat(250)}@x.com`;
    expect(forgotPasswordSchema.safeParse({ email }).success).toBe(false);
  });

  it("sign-in only needs a password to be present, not to follow the new-password rules", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("enforces the new-password rules", () => {
    expect(newPasswordSchema.safeParse("abcdefg1").success).toBe(true);
    expect(newPasswordSchema.safeParse("abc1").success).toBe(false); // too short
    expect(newPasswordSchema.safeParse("abcdefgh").success).toBe(false); // no number
    expect(newPasswordSchema.safeParse("12345678").success).toBe(false); // no letter
    expect(newPasswordSchema.safeParse(`a1${"x".repeat(71)}`).success).toBe(false); // over 72
  });
});

describe("register and reset", () => {
  const base = { full_name: "Ali Khan", email: "ali@example.com", password: "tractor123", confirm_password: "tractor123" };

  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it("reports mismatched passwords on the confirm field", () => {
    const r = registerSchema.safeParse({ ...base, confirm_password: "tractor124" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrorsFrom(r.error).confirm_password).toBe("The passwords do not match");
  });

  it("requires a real name", () => {
    expect(registerSchema.safeParse({ ...base, full_name: "A" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, full_name: "x".repeat(121) }).success).toBe(false);
  });

  it("validates reset passwords the same way", () => {
    expect(resetPasswordSchema.safeParse({ password: "tractor123", confirm_password: "tractor123" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "weak", confirm_password: "weak" }).success).toBe(false);
  });

  it("ignores unknown keys instead of passing them on", () => {
    const r = registerSchema.parse({ ...base, role: "admin" });
    expect("role" in r).toBe(false);
  });
});

describe("profile", () => {
  it("normalises phone formats and turns empty optionals into null", () => {
    const r = profileSchema.parse({ full_name: "Ali Khan", phone: "+92 300 1234567", company_name: " " });
    expect(r).toEqual({ full_name: "Ali Khan", phone: "03001234567", company_name: null });
  });

  it("allows no phone but not a bad one", () => {
    expect(profileSchema.parse({ full_name: "Ali Khan", phone: "", company_name: "" }).phone).toBeNull();
    expect(profileSchema.safeParse({ full_name: "Ali Khan", phone: "12345", company_name: "" }).success).toBe(false);
  });
});

describe("address", () => {
  it("accepts a valid address and normalises it", () => {
    const r = addressSchema.parse(validAddress);
    expect(r.phone).toBe("03001234567");
    expect(r.street).toBeNull();
    expect(r.postal_code).toBeNull();
  });

  it("rejects an unknown province", () => {
    expect(addressSchema.safeParse({ ...validAddress, province: "Atlantis" }).success).toBe(false);
  });

  it("checks the postal code, phone and lengths", () => {
    expect(addressSchema.safeParse({ ...validAddress, postal_code: "123" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...validAddress, postal_code: "56300" }).success).toBe(true);
    expect(addressSchema.safeParse({ ...validAddress, phone: "0400 1234567" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...validAddress, line1: "ab" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...validAddress, instructions: "x".repeat(501) }).success).toBe(false);
    expect(addressSchema.safeParse({ ...validAddress, label: "x".repeat(41) }).success).toBe(false);
  });

  it("does not accept a user_id: addresses always belong to the signed-in user", () => {
    const r = addressSchema.parse({ ...validAddress, user_id: "00000000-0000-0000-0000-000000000001" });
    expect("user_id" in r).toBe(false);
  });
});
