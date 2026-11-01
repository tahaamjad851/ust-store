// Text built from store settings, tolerant of empty values. Settings such as the address, the hours or the tagline
// are optional (and empty on a new project), so nothing public may print them unconditionally.

const clean = (value: string | null | undefined): string => (value ?? "").trim();

/** "A. B." from the parts that are not empty; trailing dots on a part are not doubled. Empty when all are empty. */
export function joinSentences(...parts: (string | null | undefined)[]): string {
  const sentences = parts.map(clean).filter(Boolean).map((p) => p.replace(/[.\s]+$/, "")).filter(Boolean);
  return sentences.length > 0 ? `${sentences.join(". ")}.` : "";
}

/** "Quaid-e-Millat Road, Khanpur, Punjab": the parts that are filled in, or "" when none is. */
export function addressText(settings: { address_line: string; city: string; province: string }): string {
  return [settings.address_line, settings.city, settings.province].map(clean).filter(Boolean).join(", ");
}

/** "a or b" / "a" / "" from a list of names. */
export function orList(names: readonly string[]): string {
  const list = names.map(clean).filter(Boolean);
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : (list[0] ?? "");
}
