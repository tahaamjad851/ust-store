import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  canTransition,
  isClosed,
  isOpen,
  nextStatuses,
  ORDER_STATUS_VALUES,
  STATUS_LABEL,
  TRANSITIONS,
  WORKFLOW_STATUSES,
  type OrderStatus,
} from "@/features/orders/status";

describe("order status workflow", () => {
  it("has the labels the shop owner asked for", () => {
    expect(WORKFLOW_STATUSES.map((s) => STATUS_LABEL[s])).toEqual(["New", "Contacted", "Confirmed", "Dispatched", "Delivered", "Cancelled", "Exchange requested"]);
  });

  it("allows the intended path and nothing that skips a step", () => {
    expect(canTransition("pending", "contacted")).toBe(true);
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("contacted", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "dispatched")).toBe(true);
    expect(canTransition("dispatched", "delivered")).toBe(true);
    expect(canTransition("delivered", "exchange_requested")).toBe(true);
    expect(canTransition("exchange_requested", "delivered")).toBe(true);

    expect(canTransition("pending", "dispatched")).toBe(false);
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("confirmed", "delivered")).toBe(false);
    expect(canTransition("confirmed", "exchange_requested")).toBe(false);
  });

  it("never goes backwards", () => {
    expect(canTransition("contacted", "pending")).toBe(false);
    expect(canTransition("dispatched", "confirmed")).toBe(false);
    expect(canTransition("delivered", "dispatched")).toBe(false);
  });

  it("can cancel until the goods are delivered, and a cancelled order stays cancelled", () => {
    for (const s of ["pending", "contacted", "confirmed", "dispatched"] as const) expect(canTransition(s, "cancelled")).toBe(true);
    for (const s of ["delivered", "exchange_requested"] as const) expect(canTransition(s, "cancelled")).toBe(false);
    expect(nextStatuses("cancelled")).toEqual([]);
  });

  it("leads nowhere into the retired statuses", () => {
    const retired = ["processing", "shipped", "returned"] as const;
    for (const from of ORDER_STATUS_VALUES) for (const to of retired) expect(canTransition(from, to)).toBe(false);
  });

  it("no status can move to itself", () => {
    for (const s of ORDER_STATUS_VALUES) expect(canTransition(s, s)).toBe(false);
  });

  it("classifies open and closed orders", () => {
    expect(isOpen("pending")).toBe(true);
    expect(isOpen("dispatched")).toBe(true);
    expect(isOpen("delivered")).toBe(false);
    expect(isClosed("delivered")).toBe(true);
    expect(isClosed("cancelled")).toBe(true);
    expect(isClosed("confirmed")).toBe(false);
  });

  // The database refuses invalid moves; this keeps the table the buttons come from identical to the SQL.
  it("matches _order_transition_allowed() in the migration", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20261102100000_orders.sql"), "utf8");
    const body = /create or replace function public\._order_transition_allowed[\s\S]*?\$\$;/.exec(sql)?.[0] ?? "";
    const pairs = [...body.matchAll(/\('(\w+)', '(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const fromTable = ORDER_STATUS_VALUES.flatMap((from) => TRANSITIONS[from].map((to) => `${from}>${to}`)).sort();
    expect(pairs.length).toBeGreaterThan(10);
    expect(fromTable).toEqual(pairs);
  });
});

describe("order timeline", () => {
  const at = (n: number) => `2026-11-0${n}T10:00:00Z`;
  const states = (status: OrderStatus, history: { status: OrderStatus; at: string }[]) =>
    buildTimeline(status, history).map((s) => `${s.status}:${s.state}`);

  it("shows a new order as received, with the rest still to come", () => {
    expect(states("pending", [{ status: "pending", at: at(1) }])).toEqual(["pending:current", "confirmed:upcoming", "dispatched:upcoming", "delivered:upcoming"]);
  });

  it("shows 'contacted' only if it happened", () => {
    const withContact = states("contacted", [
      { status: "pending", at: at(1) },
      { status: "contacted", at: at(2) },
    ]);
    expect(withContact).toEqual(["pending:done", "contacted:current", "confirmed:upcoming", "dispatched:upcoming", "delivered:upcoming"]);
    expect(states("confirmed", [{ status: "pending", at: at(1) }, { status: "confirmed", at: at(2) }])).not.toContain("contacted:done");
  });

  it("marks everything done on a delivered order and carries the times", () => {
    const history = [
      { status: "pending" as const, at: at(1) },
      { status: "confirmed" as const, at: at(2) },
      { status: "dispatched" as const, at: at(3) },
      { status: "delivered" as const, at: at(4) },
    ];
    const steps = buildTimeline("delivered", history);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect(steps[2].at).toBe(at(3));
  });

  it("stops a cancelled order at what happened, then 'Cancelled'", () => {
    const steps = buildTimeline("cancelled", [
      { status: "pending", at: at(1) },
      { status: "confirmed", at: at(2) },
      { status: "cancelled", at: at(3) },
    ]);
    expect(steps.map((s) => `${s.status}:${s.state}`)).toEqual(["pending:done", "confirmed:done", "cancelled:stopped"]);
  });

  it("adds the exchange after delivery", () => {
    const steps = buildTimeline("exchange_requested", [
      { status: "pending", at: at(1) },
      { status: "delivered", at: at(4) },
      { status: "exchange_requested", at: at(5) },
    ]);
    expect(steps.at(-1)).toMatchObject({ status: "exchange_requested", state: "current" });
    expect(steps.find((s) => s.status === "delivered")?.state).toBe("done");
  });

  it("places retired statuses where they belong and invents no times", () => {
    expect(states("shipped", [])).toContain("dispatched:current");
    expect(buildTimeline("pending", []).every((s) => s.at === null)).toBe(true);
  });
});
