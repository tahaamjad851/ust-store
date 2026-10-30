"use client";

import { useEffect, useRef } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Result of a form submission. Errors interrupt screen readers; success is announced politely.
 * The message scrolls into view when it appears (long forms put the submit button far below it), and
 * `moveFocus` also focuses it, for when the form it replaces had the focus.
 */
export function FormAlert({
  tone,
  children,
  className,
  moveFocus,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
  className?: string;
  moveFocus?: boolean;
}) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (moveFocus) ref.current?.focus();
    else ref.current?.scrollIntoView({ block: "nearest" });
  }, [moveFocus]);
  return (
    <div
      ref={ref}
      tabIndex={moveFocus ? -1 : undefined}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-body-md",
        tone === "error"
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-border bg-brand-tint text-brand-tint-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
