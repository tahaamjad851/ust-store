import { MessageCircle } from "lucide-react";
import { whatsappHref } from "@/lib/contact";

export function WhatsAppButton({ number }: { number: string }) {
  return (
    <a
      href={whatsappHref(number)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp (opens in a new tab)"
      className="fixed right-4 bottom-20 z-40 inline-flex size-14 items-center justify-center gap-2 rounded-full bg-whatsapp text-white shadow-float hover:bg-whatsapp-hover lg:bottom-6 lg:h-12 lg:w-auto lg:px-5"
    >
      <MessageCircle className="size-6" aria-hidden="true" />
      <span className="hidden text-label-lg lg:inline" aria-hidden="true">
        WhatsApp us
      </span>
    </a>
  );
}
