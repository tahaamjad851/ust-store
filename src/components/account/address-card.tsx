"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Star, Trash2 } from "lucide-react";
import { FormAlert } from "@/components/forms/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteAddressAction, setDefaultAddressAction } from "@/features/customers/account-actions";
import { MESSAGES } from "@/features/customers/types";

export type AddressView = {
  id: string;
  label: string | null;
  full_name: string;
  phone: string;
  line1: string;
  street: string | null;
  area: string | null;
  city: string;
  province: string;
  postal_code: string | null;
  instructions: string | null;
  is_default: boolean;
};

export function AddressCard({ address }: { address: AddressView }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const deleteRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // The buttons swap places when confirming, so move the keyboard focus along with them.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const run = (action: () => ReturnType<typeof deleteAddressAction>) => {
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.message ?? MESSAGES.unexpected);
      } catch {
        setError(MESSAGES.unexpected);
      }
      setConfirming(false);
    });
  };

  const lines = [address.line1, address.street, address.area, `${address.city}, ${address.province}`, address.postal_code].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label-lg">{address.label ?? "Address"}</h3>
        {address.is_default && <Badge className="bg-brand-tint text-brand-tint-foreground">Default</Badge>}
      </div>
      <address className="space-y-0.5 text-body-md not-italic">
        <p className="font-medium">{address.full_name}</p>
        <p className="tabular text-muted-foreground">{address.phone}</p>
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        {address.instructions && <p className="pt-1 text-body-sm text-muted-foreground">{address.instructions}</p>}
      </address>

      {error && <FormAlert tone="error">{error}</FormAlert>}

      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-11">
          <Link href={`/account/addresses/${address.id}/edit`}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit<span className="sr-only"> {address.label ?? "address"}</span>
          </Link>
        </Button>
        {!address.is_default && (
          <Button variant="outline" className="h-11" disabled={pending} onClick={() => run(() => setDefaultAddressAction(address.id))}>
            <Star className="size-4" aria-hidden="true" />
            Make default<span className="sr-only"> {address.label ?? "address"}</span>
          </Button>
        )}
        {confirming ? (
          <>
            <Button variant="destructive" className="h-11" disabled={pending} onClick={() => run(() => deleteAddressAction(address.id))}>
              Yes, delete<span className="sr-only"> {address.label ?? "address"}</span>
            </Button>
            <Button ref={keepRef} variant="ghost" className="h-11" disabled={pending} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button ref={deleteRef} variant="ghost" className="h-11 text-destructive hover:text-destructive" disabled={pending} onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Delete<span className="sr-only"> {address.label ?? "address"}</span>
          </Button>
        )}
      </div>
    </li>
  );
}
