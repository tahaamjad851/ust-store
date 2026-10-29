import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StoreNotFound() {
  return (
    <div className="mx-auto max-w-page px-margin py-16 text-center lg:px-margin-desktop">
      <SearchX className="mx-auto size-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 text-headline-lg-mobile lg:text-headline-lg">We couldn&apos;t find that page</h1>
      <p className="mx-auto mt-2 max-w-md text-body-lg text-muted-foreground">
        The part or category may have moved or is no longer listed. Try searching or browse all products.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild className="h-11">
          <Link href="/shop">Browse all products</Link>
        </Button>
        <Button asChild variant="outline" className="h-11 border-input">
          <Link href="/">Go to home page</Link>
        </Button>
      </div>
    </div>
  );
}
