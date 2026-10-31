// Deletes the users admin.setup.ts created (the ids are in the file it wrote) and removes their saved sessions.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { test as teardown } from "@playwright/test";
import { service } from "./helpers/dev-project";

teardown("delete the test users", async () => {
  const file = "tests/e2e/.auth/users.json";
  if (!existsSync(file)) return;
  const users = JSON.parse(readFileSync(file, "utf8")) as Record<string, { id: string }>;
  for (const { id } of Object.values(users)) await service().auth.admin.deleteUser(id);
  rmSync("tests/e2e/.auth", { recursive: true, force: true });
});
