import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let headerValues: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues[name.toLowerCase()] ?? null }),
}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

import { checkRateLimit, checkRateLimits, clientIp, RATE_LIMITS, rateLimitMessage } from "@/lib/auth/rate-limit";

beforeEach(() => {
  rpc.mockReset();
  headerValues = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("checkRateLimit", () => {
  it("never sends the raw subject to the database", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await checkRateLimit("login_email", "Ali@Example.com");
    const args = rpc.mock.calls[0][1];
    expect(args.p_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("example.com");
    expect(args).toMatchObject({ p_bucket: "login_email", p_limit: 8, p_window_seconds: 900 });
  });

  it("treats the same address in any case as one subject", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await checkRateLimit("login_email", "Ali@Example.com");
    await checkRateLimit("login_email", " ali@example.com ");
    expect(rpc.mock.calls[0][1].p_key).toBe(rpc.mock.calls[1][1].p_key);
  });

  it("allows within the limit", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await expect(checkRateLimit("login_ip", "1.2.3.4")).resolves.toEqual({ allowed: true });
  });

  it("refuses over the limit and reports when to retry", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 421 }], error: null });
    await expect(checkRateLimit("login_ip", "1.2.3.4")).resolves.toEqual({ allowed: false, reason: "limited", retryAfterSeconds: 421 });
  });

  it("fails closed on a database error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(checkRateLimit("login_ip", "1.2.3.4")).resolves.toEqual({ allowed: false, reason: "unavailable" });
  });

  it("fails closed when the call throws or the answer is malformed", async () => {
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(checkRateLimit("login_ip", "x")).resolves.toEqual({ allowed: false, reason: "unavailable" });
    rpc.mockResolvedValueOnce({ data: [{ nope: true }], error: null });
    await expect(checkRateLimit("login_ip", "x")).resolves.toEqual({ allowed: false, reason: "unavailable" });
  });

  it("has a bucket for contact-type actions", () => {
    expect(RATE_LIMITS.contact_ip).toEqual({ limit: 5, windowSeconds: 3600 });
  });
});

describe("checkRateLimits", () => {
  it("stops at the first refusal", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null })
      .mockResolvedValueOnce({ data: [{ allowed: false, retry_after_seconds: 30 }], error: null });
    const r = await checkRateLimits([
      ["login_ip", "a"],
      ["login_email", "b"],
      ["forgot_ip", "c"],
    ]);
    expect(r).toMatchObject({ allowed: false, reason: "limited" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("allows when every check passes", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await expect(
      checkRateLimits([
        ["login_ip", "a"],
        ["login_email", "b"],
      ]),
    ).resolves.toEqual({ allowed: true });
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry, then 'unknown'", async () => {
    headerValues = { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" };
    await expect(clientIp()).resolves.toBe("9.9.9.9");
    headerValues = { "x-forwarded-for": "1.1.1.1, 2.2.2.2" };
    await expect(clientIp()).resolves.toBe("1.1.1.1");
    headerValues = {};
    await expect(clientIp()).resolves.toBe("unknown");
  });
});

describe("rateLimitMessage", () => {
  it("rounds the wait up to whole minutes", () => {
    expect(rateLimitMessage({ allowed: false, reason: "limited", retryAfterSeconds: 61 })).toBe(
      "Too many attempts. Please wait 2 minutes and try again.",
    );
    expect(rateLimitMessage({ allowed: false, reason: "limited", retryAfterSeconds: 5 })).toBe(
      "Too many attempts. Please wait 1 minute and try again.",
    );
  });
  it("does not blame the visitor when the limiter is down", () => {
    expect(rateLimitMessage({ allowed: false, reason: "unavailable" })).not.toMatch(/too many/i);
  });
});
