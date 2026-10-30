import { describe, expect, it } from "vitest";
import { loginUrl, safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNextPath("/account/addresses")).toBe("/account/addresses");
    expect(safeNextPath("/shop?q=oil&page=2")).toBe("/shop?q=oil&page=2");
  });

  it.each([
    "https://evil.example",
    "http://evil.example/account",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "account",
    "",
    "/ok\r\nSet-Cookie: x=1",
    "/ok\u0000",
    "/" + "a".repeat(600),
  ])("rejects %j", (next) => {
    expect(safeNextPath(next)).toBe("/account");
  });

  it("rejects non-strings", () => {
    expect(safeNextPath(undefined)).toBe("/account");
    expect(safeNextPath(["/a"])).toBe("/account");
    expect(safeNextPath(42)).toBe("/account");
  });

  it("does not bounce back to sign-in pages", () => {
    expect(safeNextPath("/login")).toBe("/account");
    expect(safeNextPath("/reset-password")).toBe("/account");
    expect(safeNextPath("/auth/confirm?code=1")).toBe("/account");
  });

  it("uses the fallback it is given", () => {
    expect(safeNextPath("//evil.example", "/")).toBe("/");
  });
});

describe("loginUrl", () => {
  it("adds a validated next", () => {
    expect(loginUrl("/admin")).toBe("/login?next=%2Fadmin");
    expect(loginUrl("/account/addresses?x=1")).toBe("/login?next=%2Faccount%2Faddresses%3Fx%3D1");
  });
  it("drops an unsafe or missing next", () => {
    expect(loginUrl()).toBe("/login");
    expect(loginUrl("https://evil.example")).toBe("/login");
  });
});
