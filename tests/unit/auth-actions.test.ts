import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const cookieJar = new Map<string, string>();
const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  delete: (name: string) => cookieJar.delete(name),
};
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const checkRateLimits = vi.fn();
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimits: (...args: unknown[]) => checkRateLimits(...args),
  clientIp: async () => "1.2.3.4",
  rateLimitMessage: () => "RATE_LIMITED",
}));

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
};
let profileRow: { disabled_at: string | null } | null = { disabled_at: null };
const supabase = {
  auth,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow, error: null }) }) }) }),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));

import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/features/customers/auth-actions";
import { MESSAGES } from "@/features/customers/types";

const user = { id: "u1", is_anonymous: false };

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  profileRow = { disabled_at: null };
  checkRateLimits.mockResolvedValue({ allowed: true });
  auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
  auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  auth.getUser.mockResolvedValue({ data: { user }, error: null });
  auth.updateUser.mockResolvedValue({ data: { user }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loginAction", () => {
  const input = { email: "Ali@Example.com", password: "tractor123" };

  it("validates on the server", async () => {
    const r = await loginAction({ email: "nope", password: "" });
    expect(r).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String), password: expect.any(String) } });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("is refused before touching Supabase when rate limited", async () => {
    checkRateLimits.mockResolvedValue({ allowed: false, reason: "limited", retryAfterSeconds: 60 });
    await expect(loginAction(input)).resolves.toEqual({ ok: false, message: "RATE_LIMITED" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rate limits by IP and by email", async () => {
    await expect(loginAction(input)).rejects.toThrow("REDIRECT:");
    expect(checkRateLimits).toHaveBeenCalledWith([
      ["login_ip", "1.2.3.4"],
      ["login_email", "ali@example.com"],
    ]);
  });

  it("gives the same message for a wrong password, an unknown email and a banned user", async () => {
    const messages = new Set<string | undefined>();
    for (const code of ["invalid_credentials", "user_not_found", "user_banned"]) {
      auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code, status: 400 } });
      const r = await loginAction(input);
      expect(r.ok).toBe(false);
      messages.add(r.ok ? undefined : r.message);
    }
    expect([...messages]).toEqual([MESSAGES.invalidCredentials]);
  });

  it("explains an unconfirmed email (only reachable with the right password)", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "email_not_confirmed", status: 400 } });
    await expect(loginAction(input)).resolves.toEqual({ ok: false, message: MESSAGES.emailNotConfirmed });
  });

  it("signs a disabled account straight back out", async () => {
    profileRow = { disabled_at: "2026-10-30T00:00:00Z" };
    await expect(loginAction(input)).resolves.toEqual({ ok: false, message: MESSAGES.accountDisabled });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("treats a missing profile like a disabled account", async () => {
    profileRow = null;
    await expect(loginAction(input)).resolves.toEqual({ ok: false, message: MESSAGES.accountDisabled });
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("refuses anonymous Supabase users", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: true } }, error: null });
    await expect(loginAction(input)).resolves.toEqual({ ok: false, message: MESSAGES.accountDisabled });
  });

  it("redirects to a safe next, otherwise to the account", async () => {
    await expect(loginAction({ ...input, next: "/account/addresses" })).rejects.toThrow("REDIRECT:/account/addresses");
    await expect(loginAction({ ...input, next: "//evil.example" })).rejects.toThrow("REDIRECT:/account");
    await expect(loginAction({ ...input, next: "https://evil.example" })).rejects.toThrow("REDIRECT:/account");
    await expect(loginAction(input)).rejects.toThrow("REDIRECT:/account");
  });
});

describe("registerAction", () => {
  const input = { full_name: "Ali Khan", email: "ali@example.com", password: "tractor123", confirm_password: "tractor123" };

  it("validates on the server", async () => {
    const r = await registerAction({ ...input, confirm_password: "other123" });
    expect(r).toMatchObject({ ok: false, fieldErrors: { confirm_password: "The passwords do not match" } });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("is refused when rate limited", async () => {
    checkRateLimits.mockResolvedValue({ allowed: false, reason: "limited", retryAfterSeconds: 60 });
    await expect(registerAction(input)).resolves.toEqual({ ok: false, message: "RATE_LIMITED" });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("asks the visitor to check their email, and sends the name along", async () => {
    await expect(registerAction(input)).resolves.toEqual({ ok: true, message: MESSAGES.registerSent });
    const args = auth.signUp.mock.calls[0][0];
    expect(args.email).toBe("ali@example.com");
    expect(args.options.data).toEqual({ full_name: "Ali Khan" });
    expect(args.options.emailRedirectTo).toMatch(/\/auth\/confirm\?next=%2Faccount$/);
  });

  it("answers the same for an address that is already registered", async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "user_already_exists", status: 422 } });
    await expect(registerAction(input)).resolves.toEqual({ ok: true, message: MESSAGES.registerSent });
  });

  it("reports a weak password on the password field", async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "weak_password", status: 422 } });
    await expect(registerAction(input)).resolves.toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
  });

  it("does not leak other errors", async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "unexpected_failure", status: 500 } });
    const r = await registerAction(input);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("unexpected_failure");
  });

  it("goes to the account when Supabase signs the new user straight in", async () => {
    auth.signUp.mockResolvedValue({ data: { user, session: { access_token: "t" } }, error: null });
    await expect(registerAction(input)).rejects.toThrow("REDIRECT:/account");
  });
});

describe("forgotPasswordAction", () => {
  it("gives the same answer whether or not the account exists, and whether or not sending worked", async () => {
    const results = [];
    for (const error of [null, { code: "user_not_found", status: 400 }, { code: "over_email_send_rate_limit", status: 429 }]) {
      auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error });
      results.push(await forgotPasswordAction({ email: "someone@example.com" }));
    }
    expect(results).toEqual(Array(3).fill({ ok: true, message: MESSAGES.forgotSent }));
  });

  it("points the link at the confirm route and on to the reset page", async () => {
    await forgotPasswordAction({ email: "someone@example.com" });
    expect(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo).toMatch(/\/auth\/confirm\?next=%2Freset-password$/);
  });

  it("validates the email and rate limits by IP and email", async () => {
    await expect(forgotPasswordAction({ email: "bad" })).resolves.toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
    await forgotPasswordAction({ email: "Someone@Example.com" });
    expect(checkRateLimits).toHaveBeenCalledWith([
      ["forgot_ip", "1.2.3.4"],
      ["forgot_email", "someone@example.com"],
    ]);
  });

  it("is refused when rate limited", async () => {
    checkRateLimits.mockResolvedValue({ allowed: false, reason: "limited", retryAfterSeconds: 60 });
    await expect(forgotPasswordAction({ email: "someone@example.com" })).resolves.toEqual({ ok: false, message: "RATE_LIMITED" });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("resetPasswordAction", () => {
  const input = { password: "newtractor1", confirm_password: "newtractor1" };

  it("needs the cookie that only a verified reset link sets", async () => {
    await expect(resetPasswordAction(input)).resolves.toEqual({ ok: false, message: MESSAGES.linkExpired });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("needs a session as well", async () => {
    cookieJar.set("ust-recovery", "1");
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
    await expect(resetPasswordAction(input)).resolves.toEqual({ ok: false, message: MESSAGES.linkExpired });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("does not let a disabled account change its password", async () => {
    cookieJar.set("ust-recovery", "1");
    profileRow = { disabled_at: "2026-10-30T00:00:00Z" };
    await expect(resetPasswordAction(input)).resolves.toEqual({ ok: false, message: MESSAGES.accountDisabled });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("validates the new password on the server", async () => {
    cookieJar.set("ust-recovery", "1");
    await expect(resetPasswordAction({ password: "short", confirm_password: "short" })).resolves.toMatchObject({
      ok: false,
      fieldErrors: { password: expect.any(String) },
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("saves the password, ends the other sessions, clears the cookie and goes to the account", async () => {
    cookieJar.set("ust-recovery", "1");
    await expect(resetPasswordAction(input)).rejects.toThrow("REDIRECT:/account");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "newtractor1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(cookieJar.has("ust-recovery")).toBe(false);
  });

  it("reports a reused password on the field", async () => {
    cookieJar.set("ust-recovery", "1");
    auth.updateUser.mockResolvedValue({ data: {}, error: { code: "same_password", status: 422 } });
    await expect(resetPasswordAction(input)).resolves.toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
    expect(cookieJar.has("ust-recovery")).toBe(true);
  });
});
