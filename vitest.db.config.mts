// Database tests against the hosted Supabase DEV project. Run with: npm run test:db
// Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY from
// .env.local at run time; tests refuse to start unless DB_TESTS=dev is set by the npm script.
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/db/**/*.test.ts"],
    // --mode dev-db (set by npm run test:db) is the explicit opt-in checked in helpers.ts.
    env: { ...loadEnv(mode, process.cwd(), ""), DB_TESTS: mode === "dev-db" ? "dev" : "" },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
}));
