import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// connection() only means something inside a Next.js render; here it must simply resolve.
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));

type Fixture = {
  user: { id: string; email?: string; is_anonymous?: boolean } | null;
  profile?: { full_name: string | null; phone: string | null; company_name: string | null; disabled_at: string | null } | null;
  role?: { role: "admin" | "staff" } | null;
  profileError?: boolean;
  roleError?: boolean;
};

let fixture: Fixture;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: fixture.user }, error: fixture.user ? null : { message: "no session" } }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "profiles"
              ? { data: fixture.profile ?? null, error: fixture.profileError ? { message: "db" } : null }
              : { data: fixture.role ?? null, error: fixture.roleError ? { message: "db" } : null },
        }),
      }),
    }),
  }),
}));

const enabledProfile = { full_name: "Ali Khan", phone: null, company_name: null, disabled_at: null };

async function guards() {
  vi.resetModules(); // getAuthState is memoised per request; start every test fresh
  return import("@/lib/auth/session");
}

beforeEach(() => {
  fixture = { user: { id: "u1", email: "ali@example.com" }, profile: enabledProfile, role: null };
});

describe("requireUser", () => {
  it("sends visitors to the sign-in page", async () => {
    fixture.user = null;
    const { requireUser } = await guards();
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("remembers where the visitor was going", async () => {
    fixture.user = null;
    const { requireUser } = await guards();
    await expect(requireUser({ next: "/account/addresses" })).rejects.toThrow("REDIRECT:/login?next=%2Faccount%2Faddresses");
  });

  it("never lets an unsafe next through", async () => {
    fixture.user = null;
    const { requireUser } = await guards();
    await expect(requireUser({ next: "https://evil.example" })).rejects.toThrow(/^REDIRECT:\/login$/);
  });

  it("does not treat Supabase anonymous users as signed in", async () => {
    fixture.user = { id: "u1", is_anonymous: true };
    const { requireUser } = await guards();
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("blocks a disabled account on every protected request", async () => {
    fixture.profile = { ...enabledProfile, disabled_at: "2026-10-30T00:00:00Z" };
    const { requireUser, requireStaff, requireAdmin } = await guards();
    await expect(requireUser()).rejects.toThrow("REDIRECT:/auth/disabled");
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/auth/disabled");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/auth/disabled");
  });

  it("blocks a disabled staff member even though they still have a role row", async () => {
    fixture.profile = { ...enabledProfile, disabled_at: "2026-10-30T00:00:00Z" };
    fixture.role = { role: "admin" };
    const { requireAdmin } = await guards();
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/auth/disabled");
  });

  it("treats a missing profile as blocked", async () => {
    fixture.profile = null;
    const { requireUser } = await guards();
    await expect(requireUser()).rejects.toThrow("REDIRECT:/auth/disabled");
  });

  it("returns the customer", async () => {
    const { requireUser } = await guards();
    await expect(requireUser()).resolves.toMatchObject({ id: "u1", email: "ali@example.com", fullName: "Ali Khan", role: null });
  });

  it("fails closed when the database cannot be read", async () => {
    fixture.profileError = true;
    const { requireUser } = await guards();
    await expect(requireUser()).rejects.toThrow("Could not load the account.");
  });

  it("fails closed when the role cannot be read", async () => {
    fixture.roleError = true;
    const { requireStaff } = await guards();
    await expect(requireStaff()).rejects.toThrow("Could not load the account.");
  });
});

describe("requireStaff", () => {
  it("gives customers a 403", async () => {
    const { requireStaff } = await guards();
    await expect(requireStaff()).rejects.toThrow("FORBIDDEN");
  });

  it("lets staff and admins in", async () => {
    fixture.role = { role: "staff" };
    let g = await guards();
    await expect(g.requireStaff()).resolves.toMatchObject({ role: "staff" });
    fixture.role = { role: "admin" };
    g = await guards();
    await expect(g.requireStaff()).resolves.toMatchObject({ role: "admin" });
  });

  it("sends visitors to sign in before checking the role", async () => {
    fixture.user = null;
    const { requireStaff } = await guards();
    await expect(requireStaff({ next: "/admin" })).rejects.toThrow("REDIRECT:/login?next=%2Fadmin");
  });
});

describe("requireAdmin", () => {
  it("refuses customers and staff", async () => {
    let g = await guards();
    await expect(g.requireAdmin()).rejects.toThrow("FORBIDDEN");
    fixture.role = { role: "staff" };
    g = await guards();
    await expect(g.requireAdmin()).rejects.toThrow("FORBIDDEN");
  });

  it("lets admins in", async () => {
    fixture.role = { role: "admin" };
    const { requireAdmin } = await guards();
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
  });
});
