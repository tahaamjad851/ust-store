import { describe, expect, it } from "vitest";
import { faqItems } from "@/components/home/faq-items";
import { telLink, whatsappLink } from "@/lib/contact";
import { addressText, joinSentences, orList } from "@/lib/store-text";
import type { StoreSettings } from "@/types/store";

const settings = (over: Partial<StoreSettings> = {}): StoreSettings => ({
  business_name: "Shop", tagline: "", value_statement: "", phone_primary: "", phone_secondary: null, whatsapp_number: "",
  email: "", address_line: "", city: "", province: "", business_hours: "", announcement_text: "",
  delivery_charge_note: "", return_policy_note: "", delivery_methods: [], payment_methods: [
    { id: "cod", name: "Cash on delivery", description: "Pay when you receive your order.", enabled: false },
  ], ...over,
});

describe("text built from optional settings", () => {
  it("joins only the parts that are filled in, without doubled dots", () => {
    expect(joinSentences("Tractor parts", "Delivered to you.")).toBe("Tractor parts. Delivered to you.");
    expect(joinSentences("", "  ", "Only this...")).toBe("Only this.");
    expect(joinSentences("", null, undefined, " . ")).toBe("");
  });

  it("an address has no stray commas when parts are missing", () => {
    expect(addressText({ address_line: "Main Road", city: "Khanpur", province: "Punjab" })).toBe("Main Road, Khanpur, Punjab");
    expect(addressText({ address_line: "", city: "Khanpur", province: "" })).toBe("Khanpur");
    expect(addressText({ address_line: " ", city: "", province: "" })).toBe("");
  });

  it("lists names in plain words", () => {
    expect(orList([])).toBe("");
    expect(orList(["Courier"])).toBe("Courier");
    expect(orList(["Courier", "Cargo"])).toBe("Courier or Cargo");
    expect(orList(["A", "B", "C"])).toBe("A, B or C");
  });
});

describe("contact links exist only when the number is set", () => {
  it("no dead wa.me or tel links for an empty setting (a new project starts empty)", () => {
    expect(whatsappLink("")).toBeNull();
    expect(whatsappLink(" - ")).toBeNull();
    expect(telLink("")).toBeNull();
    expect(whatsappLink("923218219594")).toBe("https://wa.me/923218219594");
    expect(whatsappLink("0321 8219594", "Hi there")).toContain("?text=Hi%20there");
    expect(telLink("0300 6701477")).toBe("tel:+923006701477");
  });
});

describe("home page questions", () => {
  it("a brand-new shop (nothing set up) has no questions at all, so no empty section", () => {
    expect(faqItems(settings(), { hasTractorModels: false })).toEqual([]);
  });

  it("each question needs its data: no delivery method, no delivery answer; no WhatsApp, no WhatsApp mention", () => {
    const s = settings({ whatsapp_number: "", delivery_methods: [], return_policy_note: "" });
    const items = faqItems(s, { hasTractorModels: true });
    expect(items.map((i) => i.q)).toEqual(["How do I check a part fits my tractor?"]);
    expect(JSON.stringify(items)).not.toMatch(/whatsapp/i);
  });

  it("builds the delivery answer from the delivery methods and the note, never 'by . '", () => {
    const s = settings({
      delivery_methods: [
        { id: "a", name: "Doorstep courier", description: "" },
        { id: "b", name: "Cargo terminal pickup", description: "" },
      ],
      delivery_charge_note: "Delivery charge confirmed by phone.",
      whatsapp_number: "923218219594",
      return_policy_note: "Exchange within 7 days.",
      payment_methods: [{ id: "cod", name: "Cash on delivery", description: "Pay when you receive your order.", enabled: true }],
    });
    const byQ = Object.fromEntries(faqItems(s, { hasTractorModels: true }).map((i) => [i.q, i.a]));
    expect(byQ["How is my order delivered?"]).toBe("We deliver by doorstep courier or cargo terminal pickup. Delivery charge confirmed by phone.");
    expect(byQ["Can I pay cash on delivery?"]).toBe("Pay when you receive your order.");
    expect(byQ["Can I exchange a part that doesn't fit?"]).toBe("Exchange within 7 days.");
    expect(byQ["Do you sell in bulk to workshops and dealers?"]).toMatch(/quote/);
    expect(JSON.stringify(byQ)).not.toMatch(/wholesale/i);
  });
});
