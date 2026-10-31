import { describe, expect, it } from "vitest";
import { formatPKRExact, MAX_PRICE_PAISA, paisaToRupeesInput, rupeesToPaisa } from "@/lib/pricing/money";

describe("rupeesToPaisa", () => {
  it.each([
    ["1250", 125000],
    ["1,250", 125000],
    ["1250.5", 125050],
    ["1250.50", 125050],
    ["1250.05", 125005],
    ["0.99", 99],
    ["0", 0],
    ["Rs 1,250", 125000],
    ["rs. 99.9", 9990],
    ["PKR 10", 1000],
    ["  42  ", 4200],
    ["1 250", 125000],
  ])("reads %j as %i paisa", (text, paisa) => {
    expect(rupeesToPaisa(text)).toBe(paisa);
  });

  it.each(["", " ", ".", "abc", "-5", "+5", "1e3", "12.345", "1.2.3", "Rs", "12,,", "٣٢", "1250 rupees", "0x10", "NaN", "Infinity", "1250.", ".5"])(
    "refuses %j",
    (text) => {
      expect(rupeesToPaisa(text)).toBeNull();
    },
  );

  it("is exact where floating point is not", () => {
    expect(rupeesToPaisa("19.99")).toBe(1999);
    expect(rupeesToPaisa("1.15")).toBe(115); // 1.15 * 100 is 114.99999999999999 in floating point
    expect(rupeesToPaisa("4.35")).toBe(435);
  });

  it("refuses amounts above the database limit", () => {
    expect(rupeesToPaisa("1000000000")).toBe(MAX_PRICE_PAISA);
    expect(rupeesToPaisa("1000000000.01")).toBeNull();
    expect(rupeesToPaisa("99999999999999")).toBeNull();
  });
});

describe("paisaToRupeesInput / formatPKRExact", () => {
  it("round-trips with rupeesToPaisa", () => {
    for (const paisa of [0, 1, 99, 100, 101, 125000, 125005, 125050, 99999999]) {
      expect(rupeesToPaisa(paisaToRupeesInput(paisa))).toBe(paisa);
    }
  });
  it("writes whole rupees without decimals", () => {
    expect(paisaToRupeesInput(125000)).toBe("1250");
    expect(paisaToRupeesInput(125050)).toBe("1250.50");
    expect(paisaToRupeesInput(5)).toBe("0.05");
  });
  it("formats with grouping and keeps paisa", () => {
    expect(formatPKRExact(125000)).toBe("Rs 1,250");
    expect(formatPKRExact(125050)).toBe("Rs 1,250.50");
    expect(formatPKRExact(100000000)).toBe("Rs 1,000,000");
    expect(formatPKRExact(5)).toBe("Rs 0.05");
  });
});
