import { describe, expect, it } from "vitest";
import { describeDbError } from "@/features/admin/db-errors";

describe("describeDbError", () => {
  it("explains the rules the database enforces on purpose", () => {
    expect(describeDbError({ code: "23503", message: "product_has_orders" }).message).toMatch(/on an order.*Archive/);
    expect(describeDbError({ code: "23503", message: "variant_has_orders" }).message).toMatch(/Turn it off/);
    expect(describeDbError({ code: "23514", message: "category_depth" }).message).toMatch(/two levels/);
    expect(describeDbError({ code: "P0001", message: "stale_data" }).message).toMatch(/Reload/);
    expect(describeDbError({ code: "23514", message: "image_limit" }).message).toMatch(/8 photos/);
  });

  it("names what is already used for unique violations", () => {
    expect(describeDbError({ code: "23505", message: 'duplicate key value violates unique constraint "product_variants_sku_key"' }).message).toBe(
      "That SKU is already used by another variant.",
    );
    expect(describeDbError({ code: "23505", message: 'duplicate key value violates unique constraint "products_slug_key"' }).message).toMatch(/web address/);
    expect(describeDbError({ code: "23505", message: 'duplicate key value violates unique constraint "something_new"' }).message).toBe("That value is already used.");
  });

  it("treats a row-level-security refusal as 'not allowed'", () => {
    expect(describeDbError({ code: "42501", message: 'new row violates row-level security policy for table "brands"' }).code).toBe("forbidden");
    expect(describeDbError({ message: "new row violates row-level security policy" }).message).toMatch(/not allowed/);
  });

  it("never leaks the raw database text for anything unknown", () => {
    const described = describeDbError({ code: "XX000", message: 'relation "secret_table" does not exist at character 15' });
    expect(described.message).toBe("Something went wrong. Please try again.");
    expect(JSON.stringify(described)).not.toContain("secret_table");
  });

  it("recognises an expired session", () => {
    expect(describeDbError({ code: "PGRST301", message: "JWT expired" }).code).toBe("session");
  });
});
