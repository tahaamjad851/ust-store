import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Result of a form submission. Errors interrupt screen readers; success is announced politely. */
export function FormAlert({ tone, children, className }: { tone: "error" | "success"; children: React.ReactNode; className?: string }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
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
