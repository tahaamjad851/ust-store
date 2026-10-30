// Postgres-backed rate limiting for server actions (see supabase/migrations/…_auth_support.sql).
// Counters live in public.rate_limits and are only reachable with the service role, so the
// subject (IP address, email) is hashed here and nobody can burn another person's bucket from
// the browser. The limiter fails closed: if the database cannot be reached the action is refused.
import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// An email-only bucket would let anyone lock a victim out by failing on purpose, so the tight
// limits are per (email + IP) and per IP; the email-only buckets are generous ceilings against
// attacks spread over many addresses.
export const RATE_LIMITS = {
  login_ip: { limit: 20, windowSeconds: 15 * 60 },
  login_email_ip: { limit: 8, windowSeconds: 15 * 60 },
  login_email: { limit: 40, windowSeconds: 60 * 60 },
  register_ip: { limit: 5, windowSeconds: 60 * 60 },
  forgot_ip: { limit: 5, windowSeconds: 60 * 60 },
  forgot_email_ip: { limit: 3, windowSeconds: 60 * 60 },
  forgot_email: { limit: 10, windowSeconds: 60 * 60 },
  reset_ip: { limit: 10, windowSeconds: 60 * 60 },
  // Contact and quote-request actions (added with their pages) use this bucket.
  contact_ip: { limit: 5, windowSeconds: 60 * 60 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;
export type RateLimitDenied = { allowed: false; reason: "limited"; retryAfterSeconds: number } | { allowed: false; reason: "unavailable" };
export type RateLimitResult = { allowed: true } | RateLimitDenied;

/**
 * Caller's IP address. Hosting platforms set these headers; on Vercel they cannot be forged by the
 * visitor. If the site is ever self-hosted, put it behind a proxy that overwrites them.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

// Keyed hash (HMAC) so that a copy of the table cannot be reversed by trying every IP address or a
// list of emails. The key is the service-role key, which this code already needs and never exposes.
function hashSubject(subject: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createHmac("sha256", key).update(subject.trim().toLowerCase()).digest("hex");
}

/** True when the caller's address could not be determined (the subject is, or ends in, "unknown"). */
const ipUnknown = (subject: string) => subject === "unknown" || subject.endsWith("|unknown");

export async function checkRateLimit(bucket: RateLimitBucket, subject: string): Promise<RateLimitResult> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  // Without an address every visitor would share one bucket and lock each other out. Real hosts set
  // the header; in local development there is none, so this only applies in production.
  if (bucket.includes("_ip") && ipUnknown(subject) && process.env.NODE_ENV === "production") {
    console.error("rate limiter: no client address in request headers", bucket);
    return { allowed: false, reason: "unavailable" };
  }
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_bucket: bucket,
      p_key: hashSubject(subject),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row || typeof row.allowed !== "boolean") {
      console.error("rate limiter error", bucket, error?.message ?? "unexpected response");
      return { allowed: false, reason: "unavailable" };
    }
    if (row.allowed) return { allowed: true };
    return { allowed: false, reason: "limited", retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 60) };
  } catch (e) {
    console.error("rate limiter failure", bucket, e instanceof Error ? e.message : e);
    return { allowed: false, reason: "unavailable" };
  }
}

/** Counts every check in order and returns the first refusal (or allowed). */
export async function checkRateLimits(checks: ReadonlyArray<readonly [RateLimitBucket, string]>): Promise<RateLimitResult> {
  for (const [bucket, subject] of checks) {
    const result = await checkRateLimit(bucket, subject);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}

export function rateLimitMessage(result: RateLimitDenied): string {
  if (result.reason === "unavailable") return "Something went wrong on our side. Please try again in a moment.";
  const minutes = Math.ceil(result.retryAfterSeconds / 60);
  return `Too many attempts. Please wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again.`;
}
