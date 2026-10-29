// Builds contact links from store settings values.
import { z } from "zod";

/** https://wa.me link. `number` is digits in international format, e.g. 923001234567. */
export function whatsappHref(number: string, message?: string): string {
  const digits = number.replace(/\D/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

/** mailto: link, or null if the address isn't a plain email (blocks injected ?bcc= / ?body= parameters). */
export function mailtoHref(email: string): string | null {
  const parsed = z.email().max(254).safeParse(email.trim());
  return parsed.success ? `mailto:${encodeURIComponent(parsed.data).replace("%40", "@")}` : null;
}

/** tel: link from a Pakistani local number such as "0300 1234567". */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `tel:${digits.startsWith("0") ? `+92${digits.slice(1)}` : `+${digits}`}`;
}
