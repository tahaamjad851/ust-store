// The guest's tracking link. The token is 256 bits: HMAC-SHA256 of the checkout attempt's idempotency key under a secret
// only the server has. Deriving it (instead of letting the database make a random one) means a retry of the same request
// gets the same link back, so a lost response never leaves a guest with an order and no link. The database stores only
// the SHA-256 of the token. Without the secret the token cannot be computed from the key, and the key is never shown.
import { createHmac } from "node:crypto";

export const TRACKING_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function isTrackingToken(value: unknown): value is string {
  return typeof value === "string" && TRACKING_TOKEN_PATTERN.test(value);
}

export function deriveTrackingToken(idempotencyKey: string, secret: string): string {
  if (!secret) throw new Error("A secret is needed to derive a tracking token.");
  return createHmac("sha256", secret).update(`ust-tracking-token:${idempotencyKey.toLowerCase()}`).digest("hex");
}
