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

/**
 * The shop's own contact links, or null while the number is not set (a new project starts with empty contact
 * settings). Public pages use these so that no dead `https://wa.me/` or `tel:+` link is ever rendered.
 */
export function whatsappLink(number: string, message?: string): string | null {
  return number.replace(/\D/g, "") ? whatsappHref(number, message) : null;
}

export function telLink(phone: string): string | null {
  return phone.replace(/\D/g, "") ? telHref(phone) : null;
}

/** WhatsApp link for a customer's stored mobile number (03XXXXXXXXX, as the database keeps it). */
export function whatsappHrefForPkMobile(mobile: string, message?: string): string {
  const digits = mobile.replace(/\D/g, "");
  return whatsappHref(digits.startsWith("0") ? `92${digits.slice(1)}` : digits, message);
}
