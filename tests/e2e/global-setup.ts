import type { FullConfig } from "@playwright/test";

// Visits the public routes once, one after the other, before any test runs.
//
// `next dev` compiles a route on its first visit and, for routes with generateStaticParams, rewrites
// .next/dev/.../prerender-manifest.json at the same time. Next's own code notes that this is "not
// safe across multiple concurrent requests": when the mobile and desktop workers hit such a route
// for the first time together, a few get "500 Unexpected end of JSON input". That is a development
// server race (a production build does not do it), so the tests are not allowed to start cold.
// Plain GETs only: nothing here signs in or changes data. Failures are ignored; the tests report them.
const ROUTES = [
  "/",
  "/shop",
  "/cart",
  "/checkout",
  "/categories/tractor-parts",
  "/categories/tractor-parts/clutch-parts",
  "/products/mf-385-dual-clutch-plate-12-inch",
  "/products/no-such-product",
  "/categories/no-such-category",
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  for (const path of ROUTES) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(new URL(path, baseURL), { redirect: "manual" });
        await res.arrayBuffer();
        if (res.status < 500) break;
      } catch {
        // The server may still be starting; try again.
      }
    }
  }
}
