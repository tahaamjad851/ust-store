import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Same .env files the dev server uses, so tests that create test users in the DEV Supabase project
// find the keys. (Only this process reads them; nothing is printed.)
loadEnvConfig(process.cwd());

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // Warms the public routes one by one so parallel workers do not race the dev server's first compile.
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Signs the admin, staff and customer test users in ONCE per run (not once per test) and saves their
    // sessions, so Supabase's sign-in rate limit is never the thing that fails a test run. The browser
    // projects depend on it, so `--project=mobile` and `--project=desktop` each work on their own.
    { name: "admin-setup", testMatch: /admin\.setup\.ts/, teardown: "admin-teardown" },
    { name: "admin-teardown", testMatch: /admin\.teardown\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, dependencies: ["admin-setup"], testIgnore: /admin\.(setup|teardown)\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, dependencies: ["admin-setup"], testIgnore: /admin\.(setup|teardown)\.ts/ },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
