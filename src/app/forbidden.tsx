import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown (with HTTP 403) when a signed-in customer opens a staff-only page.
export default function Forbidden() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-margin py-16 text-center">
      <ShieldAlert className="size-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-headline-lg-mobile text-brand-deep">You do not have access to this page</h1>
      <p className="text-body-md text-muted-foreground">
        This area is for the shop&apos;s staff. If you think this is a mistake, please contact us.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild className="h-11">
          <Link href="/">Back to the shop</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/account">My account</Link>
        </Button>
      </div>
    </main>
  );
}
