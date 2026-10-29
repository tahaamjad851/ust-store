"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { MAX_LINE_QTY } from "./cart-provider";

export function QuantityStepper({
  value,
  onChange,
  label,
  max = MAX_LINE_QTY,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Accessible name, e.g. "Quantity for MF 385 clutch plate" */
  label: string;
  max?: number;
  disabled?: boolean;
}) {
  // While typing, keep the raw text so clearing the field doesn't snap to 1; clamp on blur.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(1, Number.isFinite(n) ? Math.trunc(n) : 1));
  const set = (n: number) => onChange(clamp(n));

  return (
    <div role="group" aria-label={label} className="inline-flex h-11 items-center rounded-lg border border-input bg-card">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={disabled || value <= 1}
        aria-label="Decrease quantity"
        className="inline-flex size-11 items-center justify-center rounded-l-lg hover:bg-surface-low disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        disabled={disabled}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= 1) set(n);
        }}
        onBlur={() => {
          if (draft !== null) set(Number(draft));
          setDraft(null);
        }}
        aria-label="Quantity"
        className="h-full w-12 border-x border-border bg-transparent text-center text-base font-semibold tabular [appearance:textfield] disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
        className="inline-flex size-11 items-center justify-center rounded-r-lg hover:bg-surface-low disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
