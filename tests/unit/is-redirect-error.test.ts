import { redirect } from "next/navigation";
import { describe, expect, it } from "vitest";
import { isRedirectError } from "@/components/forms/is-redirect-error";

describe("isRedirectError", () => {
  it("recognises the error Next.js itself throws for redirect()", () => {
    let thrown: unknown;
    try {
      redirect("/account");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(isRedirectError(thrown)).toBe(true);
  });

  it("recognises the digest of a redirect handed to the caller of a Server Action", () => {
    expect(isRedirectError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/account/addresses;307;" }))).toBe(true);
  });

  it("does not hide real failures", () => {
    expect(isRedirectError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isRedirectError(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toBe(false);
    expect(isRedirectError(Object.assign(new Error("x"), { digest: 123 }))).toBe(false);
    expect(isRedirectError("NEXT_REDIRECT;push;/x;307;")).toBe(false);
    expect(isRedirectError(null)).toBe(false);
    expect(isRedirectError(undefined)).toBe(false);
  });
});
