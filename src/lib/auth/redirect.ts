// Only same-site paths may be used as a post-login destination. Anything else (absolute URLs,
// protocol-relative "//host", backslash tricks, control characters) falls back to the default,
// so a crafted `?next=` link can never send a signed-in user to another site.
const FALLBACK = "/account";

// Pages that would loop or make no sense as a destination after signing in.
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password", "/auth"];

export function safeNextPath(next: unknown, fallback: string = FALLBACK): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  for (const ch of next) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || code <= 0x1f || code === 0x7f) return fallback;
  }

  let url: URL;
  try {
    url = new URL(next, "http://localhost");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://localhost") return fallback;
  if (AUTH_PAGES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return fallback;

  // new URL() resolves dot segments, so "/..//evil.example" becomes "//evil.example", which a browser
  // reads as another site. Check the normalised result, not just the input.
  const result = `${url.pathname}${url.search}`;
  if (result.startsWith("//")) return fallback;
  return result;
}

/** Login page URL carrying a validated `next` destination, if there is one. */
export function loginUrl(next?: string): string {
  const safe = next ? safeNextPath(next, "") : "";
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
