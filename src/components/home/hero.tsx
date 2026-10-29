import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/lib/contact";
import type { StoreSettings } from "@/types/store";

export function Hero({ settings }: { settings: StoreSettings }) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-brand-deep text-primary-foreground">
      <Image
        src="/images/placeholders/hero.svg"
        alt=""
        width={1600}
        height={700}
        priority
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="mx-auto max-w-page px-margin py-10 lg:px-margin-desktop lg:py-16">
        <div className="max-w-2xl space-y-4">
          <h1 id="hero-title" className="text-headline-xl-mobile lg:text-headline-xl">
            Tractor parts &amp; lubricants
          </h1>
          <p className="text-body-lg text-primary-foreground/90">
            {settings.value_statement}. Replacement parts, oils and filters for the tractors used on Pakistani farms.
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button asChild className="h-11 bg-card text-foreground hover:bg-surface-low">
              <Link href="/shop">
                Shop parts
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 border-white/60 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">
              <a href={whatsappHref(settings.whatsapp_number)} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Ask on WhatsApp
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
