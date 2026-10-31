// Rupee text <-> integer paisa for the admin. Money is never a float: the text is split on the
// decimal point and read as whole numbers, so "1250.10" is exactly 125010 paisa.

/** The largest price the database accepts (Rs 1,000,000,000) in paisa. Mirrors apply_daily_changes(). */
export const MAX_PRICE_PAISA = 100_000_000_000;

/**
 * "1,250", "Rs 1,250.5", "PKR 1250.50" -> paisa. Null for anything that is not a plain,
 * non-negative amount with at most two decimals (no exponent, no sign, no letters).
 */
export function rupeesToPaisa(input: string): number | null {
  const text = input
    .trim()
    .replace(/^(?:rs\.?|pkr)\s*/i, "")
    .replace(/\s/g, "");
  // Commas are accepted only as thousands separators ("1,250"), never as stray characters ("12,,").
  if (text.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text)) return null;
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text.replace(/,/g, ""));
  if (!match) return null;
  const paisa = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return paisa <= MAX_PRICE_PAISA ? paisa : null;
}

/** 125010 -> "1250.10"; 125000 -> "1250". What goes into a price input. */
export function paisaToRupeesInput(paisa: number): string {
  const whole = Math.floor(paisa / 100);
  const cents = paisa % 100;
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, "0")}`;
}

/** 125000 -> "Rs 1,250"; 125050 -> "Rs 1,250.50". Unlike formatPKR() it never rounds away paisa. */
export function formatPKRExact(paisa: number): string {
  const whole = Math.floor(paisa / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = paisa % 100;
  return cents === 0 ? `Rs ${whole}` : `Rs ${whole}.${String(cents).padStart(2, "0")}`;
}
