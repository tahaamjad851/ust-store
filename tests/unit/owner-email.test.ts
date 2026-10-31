import { describe, expect, it, vi } from "vitest";
import { escapeHtml, renderOwnerOrderEmail, sendWithResend, type OwnerOrderEmail } from "@/lib/notifications/owner-order-email";
import { deriveTrackingToken, isTrackingToken } from "@/features/orders/tracking-token";
import { parseAdminOrderFilters } from "@/lib/validation/orders";

const order: OwnerOrderEmail = {
  order_id: "44444444-4444-4444-8444-444444444444",
  order_number: "UST-2026-000123",
  placed_at: "1 Nov 2026, 10:00 am",
  customer_name: "Ali Khan",
  customer_phone: "03001234567",
  customer_email: null,
  company_name: null,
  address: { line1: "Chak 12", city: "Khanpur", province: "Punjab" },
  delivery_method: "Doorstep courier",
  payment_label: "Cash on delivery",
  customer_notes: null,
  subtotal_paisa: 1_650_000,
  items: [{ product_name: "Clutch plate", variant_name: "12 inch", sku: "CP-12", quantity: 2, unit_price_paisa: 825_000, line_total_paisa: 1_650_000 }],
};

describe("renderOwnerOrderEmail", () => {
  const mail = renderOwnerOrderEmail(order, "https://shop.example/admin/orders/44444444", "Umar Siddique Traders");

  it("has the order number, the customer, the items and the 'delivery to be confirmed' line", () => {
    expect(mail.subject).toContain("UST-2026-000123");
    expect(mail.subject).toContain("Ali Khan");
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("03001234567");
      expect(part).toContain("Clutch plate");
      expect(part).toContain("CP-12");
      expect(part).toMatch(/charge to be confirmed by phone/);
      expect(part).toContain("https://shop.example/admin/orders/44444444");
    }
  });

  it("escapes everything a customer typed", () => {
    const hostile = renderOwnerOrderEmail(
      { ...order, customer_name: `<script>alert(1)</script>`, customer_notes: `"><img src=x onerror=alert(1)>`, address: { ...order.address, line1: "<b>x</b>" } },
      "https://shop.example/a",
      "Shop",
    );
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).not.toContain("<img");
    expect(hostile.html).not.toContain("<b>x</b>");
    expect(hostile.html).toContain("&lt;script&gt;");
  });

  it("keeps a customer's line break out of the subject (header injection)", () => {
    const hostile = renderOwnerOrderEmail({ ...order, customer_name: "Ali\r\nBcc: attacker@example.test" }, "https://shop.example/a", "Shop");
    expect(hostile.subject).not.toMatch(/[\r\n]/);
  });

  it("escapeHtml covers the five characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("sendWithResend", () => {
  const base = { apiKey: "re_secret_key_123", from: "Orders <orders@shop.example>", to: ["owner@shop.example"], subject: "s", html: "<p>h</p>", text: "t" };

  it("posts to Resend with the key in the Authorization header only", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    expect(await sendWithResend({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_secret_key_123");
    expect(String(init.body)).not.toContain("re_secret_key_123");
    expect(JSON.parse(String(init.body)).to).toEqual(["owner@shop.example"]);
  });

  it("returns a short reason on a refusal, with the key removed from it", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "API key re_secret_key_123 is invalid" }), { status: 401 }));
    const result = await sendWithResend({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("401");
    expect(JSON.stringify(result)).not.toContain("re_secret_key_123");
  });

  it("never throws when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed: https://api.resend.com with re_secret_key_123");
    });
    const result = await sendWithResend({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("re_secret_key_123");
  });
});

describe("tracking tokens", () => {
  const key = "33333333-3333-4333-8333-333333333333";

  it("are 256-bit hex, the same for the same attempt and different otherwise", () => {
    const a = deriveTrackingToken(key, "secret-one");
    expect(isTrackingToken(a)).toBe(true);
    expect(deriveTrackingToken(key, "secret-one")).toBe(a);
    expect(deriveTrackingToken(key.toUpperCase(), "secret-one")).toBe(a);
    expect(deriveTrackingToken("44444444-4444-4444-8444-444444444444", "secret-one")).not.toBe(a);
    expect(deriveTrackingToken(key, "secret-two")).not.toBe(a);
  });

  it("cannot be computed without the secret", () => {
    expect(() => deriveTrackingToken(key, "")).toThrow();
  });

  it("isTrackingToken refuses anything that is not 64 lowercase hex characters", () => {
    for (const bad of ["", "abc", "g".repeat(64), "A".repeat(64), `${"a".repeat(63)}`, `${"a".repeat(65)}`, "../../etc/passwd", null, 5]) {
      expect(isTrackingToken(bad)).toBe(false);
    }
  });
});

describe("parseAdminOrderFilters", () => {
  it("reads good values", () => {
    expect(parseAdminOrderFilters({ q: " ali ", status: "pending", from: "2026-11-01", to: "2026-11-30", page: "3" })).toEqual({
      q: "ali",
      status: "pending",
      from: "2026-11-01",
      to: "2026-11-30",
      page: 3,
    });
  });

  it("drops what the URL got wrong instead of failing", () => {
    expect(parseAdminOrderFilters({ status: "hacked", from: "yesterday", to: "2026-13-45", page: "-2" })).toEqual({ q: "", status: "", from: "", to: "", page: 1 });
    expect(parseAdminOrderFilters({ page: "abc" }).page).toBe(1);
    expect(parseAdminOrderFilters({ q: ["a", "b"] }).q).toBe("a");
    expect(parseAdminOrderFilters({ q: "x".repeat(500) }).q).toHaveLength(80);
  });
});
