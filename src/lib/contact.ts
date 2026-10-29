// Builds contact links from store settings values.

/** https://wa.me link. `number` is digits in international format, e.g. 923001234567. */
export function whatsappHref(number: string, message?: string): string {
  const digits = number.replace(/\D/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

/** tel: link from a Pakistani local number such as "0300 1234567". */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `tel:${digits.startsWith("0") ? `+92${digits.slice(1)}` : `+${digits}`}`;
}
