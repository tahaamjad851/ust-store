import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const OWNER = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: OWNER }) }));

// A thenable-free stand-in for the query builder that records what the action asked for.
type Entry = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };
let log: Entry[];
let result: { data: unknown; error: { message: string; code?: string } | null };
const supabase = {
  from(table: string) {
    const entry: Entry = { table, op: "", filters: [] };
    log.push(entry);
    const builder = {
      insert(payload: unknown) {
        entry.op = "insert";
        entry.payload = payload;
        return Promise.resolve(result);
      },
      update(payload: unknown) {
        entry.op = "update";
        entry.payload = payload;
        return builder;
      },
      delete() {
        entry.op = "delete";
        return builder;
      },
      eq(column: string, value: unknown) {
        entry.filters.push([column, value]);
        return builder;
      },
      select() {
        return Promise.resolve(result);
      },
    };
    return builder;
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));

import {
  createAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateAddressAction,
  updateProfileAction,
} from "@/features/customers/account-actions";

const ADDRESS_ID = "22222222-2222-4222-8222-222222222222";
const validAddress = {
  label: "",
  full_name: "Ali Khan",
  phone: "0300 1234567",
  line1: "Chak 12/4L",
  street: "",
  area: "",
  city: "Okara",
  province: "Punjab",
  postal_code: "",
  instructions: "",
  is_default: false,
};

beforeEach(() => {
  log = [];
  result = { data: [{ id: ADDRESS_ID }], error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createAddressAction", () => {
  it("validates on the server and does not touch the database when the input is wrong", async () => {
    const r = await createAddressAction({ ...validAddress, full_name: "", phone: "123", line1: "", city: "" });
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: {
        full_name: "Enter the receiver's name",
        phone: expect.stringContaining("Pakistani mobile"),
        line1: expect.any(String),
        city: expect.any(String),
      },
    });
    expect(log).toEqual([]);
  });

  it("rejects input that is not even an object", async () => {
    await expect(createAddressAction(null)).resolves.toMatchObject({ ok: false });
    await expect(createAddressAction("x")).resolves.toMatchObject({ ok: false });
    expect(log).toEqual([]);
  });

  it("saves for the signed-in user, whatever owner the request claims", async () => {
    await expect(createAddressAction({ ...validAddress, user_id: "99999999-9999-4999-8999-999999999999" })).rejects.toThrow(
      "REDIRECT:/account/addresses",
    );
    expect(log).toHaveLength(1);
    expect(log[0].payload).toMatchObject({ user_id: OWNER, phone: "03001234567", label: null, street: null, postal_code: null });
  });

  it("explains the 10-address limit", async () => {
    result = { data: null, error: { message: "address_limit_reached" } };
    await expect(createAddressAction(validAddress)).resolves.toEqual({
      ok: false,
      message: "You can save up to 10 addresses. Delete one to add another.",
    });
  });
});

describe("updateAddressAction", () => {
  it("refuses an id that is not a uuid without querying", async () => {
    await expect(updateAddressAction("1 or 1=1", validAddress)).resolves.toMatchObject({ ok: false, message: expect.stringContaining("could not find") });
    expect(log).toEqual([]);
  });

  it("validates the fields on the server", async () => {
    await expect(updateAddressAction(ADDRESS_ID, { ...validAddress, city: "" })).resolves.toMatchObject({
      ok: false,
      fieldErrors: { city: expect.any(String) },
    });
    expect(log).toEqual([]);
  });

  it("only touches the signed-in user's own row", async () => {
    await expect(updateAddressAction(ADDRESS_ID, validAddress)).rejects.toThrow("REDIRECT:/account/addresses");
    expect(log[0].filters).toEqual([
      ["id", ADDRESS_ID],
      ["user_id", OWNER],
    ]);
  });

  it("treats somebody else's address exactly like a missing one", async () => {
    result = { data: [], error: null };
    await expect(updateAddressAction(ADDRESS_ID, validAddress)).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("could not find"),
    });
  });
});

describe("deleteAddressAction and setDefaultAddressAction", () => {
  it("delete is limited to the owner's row", async () => {
    await expect(deleteAddressAction(ADDRESS_ID)).resolves.toMatchObject({ ok: true });
    expect(log[0]).toMatchObject({ table: "addresses", op: "delete" });
    expect(log[0].filters).toEqual([
      ["id", ADDRESS_ID],
      ["user_id", OWNER],
    ]);
  });

  it("delete of another customer's address looks like a missing one", async () => {
    result = { data: [], error: null };
    await expect(deleteAddressAction(ADDRESS_ID)).resolves.toMatchObject({ ok: false });
  });

  it("make default is limited to the owner's row", async () => {
    await expect(setDefaultAddressAction(ADDRESS_ID)).resolves.toMatchObject({ ok: true });
    expect(log[0].payload).toEqual({ is_default: true });
    expect(log[0].filters).toEqual([
      ["id", ADDRESS_ID],
      ["user_id", OWNER],
    ]);
  });

  it("both refuse a bad id without querying", async () => {
    await expect(deleteAddressAction("nope")).resolves.toMatchObject({ ok: false });
    await expect(setDefaultAddressAction(undefined)).resolves.toMatchObject({ ok: false });
    expect(log).toEqual([]);
  });
});

describe("updateProfileAction", () => {
  it("validates on the server", async () => {
    await expect(updateProfileAction({ full_name: "A", phone: "abc", company_name: "" })).resolves.toMatchObject({
      ok: false,
      fieldErrors: { full_name: expect.any(String), phone: expect.any(String) },
    });
    expect(log).toEqual([]);
  });

  it("updates only the signed-in user's profile and normalises the phone number", async () => {
    await expect(updateProfileAction({ full_name: "Ali Khan", phone: "+92 300 7654321", company_name: "" })).resolves.toMatchObject({ ok: true });
    expect(log[0]).toMatchObject({ table: "profiles", op: "update", payload: { full_name: "Ali Khan", phone: "03007654321", company_name: null } });
    expect(log[0].filters).toEqual([["id", OWNER]]);
  });
});
