import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Database tests hit the hosted dev project; they run only via npm run test:db.
    exclude: ["**/node_modules/**", "tests/integration/db/**"],
    passWithNoTests: true,
  },
});
