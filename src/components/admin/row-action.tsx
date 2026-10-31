"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { isRedirectError } from "@/components/forms/is-redirect-error";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { AdminResult } from "@/features/admin/types";
import type { VariantProps } from "class-variance-authority";

type Props = {
  children: React.ReactNode;
  /** Names the button for screen readers when the visible text is short ("Edit" -> "Edit Engine Parts"). */
  ariaLabel?: string;
  action: () => Promise<AdminResult<unknown>>;
  /** Called with the result, so the page can show a message. */
  onResult: (result: AdminResult<unknown>) => void;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  disabled?: boolean;
  className?: string;
  title?: string;
};

/** A button that runs an admin action right away (no confirmation) and reports the result. */
export function RowAction({ children, ariaLabel, action, onResult, variant = "outline", size, disabled, className, title }: Props) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      title={title}
      aria-label={ariaLabel}
      className={className ?? "h-11"}
      disabled={disabled || pending}
      onClick={async () => {
        setPending(true);
        try {
          onResult(await action());
        } catch (e) {
          if (!isRedirectError(e)) onResult({ ok: false, message: "Something went wrong. Please try again." });
        } finally {
          setPending(false);
        }
      }}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}

/** A notice line under a page header: the result of the last action. Polite for success, assertive for errors. */
export type Notice = { tone: "success" | "error"; text: string } | null;

export function toNotice(result: AdminResult<unknown>): Notice {
  return result.ok
    ? { tone: "success", text: result.message ?? "Saved." }
    : { tone: "error", text: result.message ?? "Something went wrong. Please try again." };
}
