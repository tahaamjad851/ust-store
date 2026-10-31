import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The exact Supabase project origin, from NEXT_PUBLIC_SUPABASE_URL. It is the only external host
 * the CSP and next/image allow. There is no wildcard fallback: a production build or server start
 * without a valid URL stops here rather than shipping a policy that trusts every Supabase project.
 * (`next typegen`, which `npm run typecheck` runs, loads this file in the build phase too, so the
 * variable must be set there as well; any valid https URL will do.)
 */
function supabaseOrigin(phase: string): URL | null {
  const required = phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER;
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let url: URL | null = null;
  try {
    url = raw ? new URL(raw) : null;
  } catch {
    url = null;
  }
  // Plain http is only for a local Supabase stack on this machine.
  const valid = url !== null && (url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)));
  if (!valid && required) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing or not a valid https URL (e.g. https://<project-ref>.supabase.co). " +
        "The production build needs it: it pins the Content-Security-Policy and the image host to that exact project.",
    );
  }
  return valid ? url : null;
}

// Static CSP. 'unsafe-inline' scripts are needed for Next.js hydration without nonces;
// tighten to a nonce-based CSP in the proxy once auth and payments are in place.
const buildCsp = (origin: URL | null) => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${origin ? ` ${origin.origin}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${origin ? ` ${origin.origin} ${origin.origin.replace(/^http/, "ws")}` : ""}${isDev ? " ws://localhost:*" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = (origin: URL | null) => [
  { key: "Content-Security-Policy", value: buildCsp(origin) },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()",
  },
];

const nextConfig = (phase: string): NextConfig => {
  const origin = supabaseOrigin(phase);
  return {
    cacheComponents: true,
    partialPrefetching: true,
    poweredByHeader: false,
    // forbidden() gives customers a real 403 on /admin (see src/lib/auth/session.ts).
    // Product photos are uploaded through a Server Action (the browser shrinks them first; the server accepts up to 4 MB).
    experimental: { authInterrupts: true, serverActions: { bodySizeLimit: "5mb" } },
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
    images: {
      // Product photos come from the product-images bucket of this one project, nothing else.
      remotePatterns: origin
        ? [
            {
              protocol: origin.protocol === "https:" ? "https" : "http",
              hostname: origin.hostname,
              port: origin.port,
              pathname: "/storage/v1/object/public/product-images/**",
              search: "",
            },
          ]
        : [],
      // Next refuses to fetch images from loopback addresses; a local Supabase stack needs this in dev only.
      dangerouslyAllowLocalIP: isDev && origin !== null && LOOPBACK_HOSTS.has(origin.hostname),
    },
    async headers() {
      return [
        { source: "/:path*", headers: securityHeaders(origin) },
        // The tracking link is the key to an order: no shared cache may keep it, no search engine may list it.
        {
          source: "/order/:token*",
          headers: [
            { key: "Cache-Control", value: "private, no-store" },
            { key: "X-Robots-Tag", value: "noindex, nofollow" },
          ],
        },
      ];
    },
  };
};

export default nextConfig;
