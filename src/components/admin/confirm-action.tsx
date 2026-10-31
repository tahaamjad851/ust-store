"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { isRedirectError } from "@/components/forms/is-redirect-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { AdminResult } from "@/features/admin/types";
import type { VariantProps } from "class-variance-authority";

type Props = {
  /** The button that opens the dialog. */
  label: React.ReactNode;
  /** Accessible name when `label` is only an icon or is not specific ("Delete" -> "Delete Engine Oil"). */
  ariaLabel?: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerSize?: VariantProps<typeof buttonVariants>["size"];
  triggerClassName?: string;
  disabled?: boolean;
  action: () => Promise<AdminResult<unknown>>;
};

/**
 * A button that asks "are you sure?" first. The dialog stays open and shows the reason when the action is
 * refused (for example a product that is on an order), and closes when it succeeds.
 */
export function ConfirmAction({
  label,
  ariaLabel,
  title,
  description,
  confirmLabel,
  destructive,
  triggerVariant = "outline",
  triggerSize,
  triggerClassName,
  disabled,
  action,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    setPending(true);
    setError(undefined);
    try {
      const result = await action();
      if (result.ok) setOpen(false);
      else setError(result.message ?? "Something went wrong. Please try again.");
    } catch (e) {
      if (isRedirectError(e)) setOpen(false);
      else setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
          if (!next) setError(undefined);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize} className={triggerClassName ?? "h-11"} disabled={disabled} aria-label={ariaLabel}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-body-md text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline" className="h-11" disabled={pending}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant={destructive ? "destructive" : "default"}
              className="h-11"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void run();
              }}
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
