"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog. The page styles itself for paper (print: classes); no PDF library is involved. */
export function PrintButton() {
  return (
    <Button type="button" className="h-11" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden="true" />
      Print
    </Button>
  );
}
