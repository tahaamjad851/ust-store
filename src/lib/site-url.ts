// Public origin of the site, used in links that go into emails (confirm email, reset password).
// Taken from configuration, never from the request's Host header, so a forged Host cannot
// point a reset link at another site.
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("Missing NEXT_PUBLIC_SITE_URL (the public https:// address of the site).");
}
