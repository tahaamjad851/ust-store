// The home page questions, each built only from what the shop has actually set up. A question whose answer would
// need data that is missing (no tractor models, no delivery method, no WhatsApp number, no exchange text) is left out,
// so no answer ever reads "by . " or promises something that is not there. Unit-tested in tests/unit/store-text.test.ts.
import { orList } from "@/lib/store-text";
import type { StoreSettings } from "@/types/store";

export type FaqItem = { q: string; a: string };

export function faqItems(settings: StoreSettings, opts: { hasTractorModels: boolean }): FaqItem[] {
  const cod = settings.payment_methods.find((m) => m.id === "cod" && m.enabled);
  const methods = orList(settings.delivery_methods.map((m) => m.name.toLowerCase()));
  const note = settings.delivery_charge_note.trim().replace(/\.+$/, "");
  const hasWhatsApp = settings.whatsapp_number.replace(/\D/g, "") !== "";

  const items: (FaqItem | false | "" | null | undefined)[] = [
    opts.hasTractorModels && {
      q: "How do I check a part fits my tractor?",
      a: hasWhatsApp
        ? "Use the tractor selector to filter by make and model. If you are unsure, send us your tractor model and a photo of the old part on WhatsApp before ordering."
        : "Use the tractor selector to filter by make and model.",
    },
    methods !== "" && {
      q: "How is my order delivered?",
      a: `We deliver by ${methods}.${note ? ` ${note}.` : ""}`,
    },
    cod && cod.description.trim() !== "" && { q: "Can I pay cash on delivery?", a: cod.description },
    settings.return_policy_note.trim() !== "" && {
      q: "Can I exchange a part that doesn't fit?",
      a: settings.return_policy_note,
    },
    hasWhatsApp && {
      q: "Do you sell in bulk to workshops and dealers?",
      a: "Yes. Ask us on WhatsApp for a quote on larger orders.",
    },
  ];
  return items.filter((i): i is FaqItem => Boolean(i));
}
