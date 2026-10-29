"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_LINE_QTY } from "./cart-provider";

export function QuantityStepper({
  value,
  onChange,
  label,
  max = MAX_LINE_QTY,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Accessible name, e.g. "Quantity for MF 385 clutch plate" */
  label: string;
  max?: number;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(1, Number.isFinite(n) ? Math.trunc(n) : 1)));
  return (
    <div role="group" aria-label={label} className="inline-flex h-11 items-center rounded-lg border border-input bg-card">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= 1}
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
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        aria-label="Quantity"
        className="h-full w-12 border-x border-border bg-transparent text-center text-label-lg tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label="Increase quantity"
        className="inline-flex size-11 items-center justify-center rounded-r-lg hover:bg-surface-low disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
