"use client";

// Make -> model selector (model options show production years; fitment data is per model, not per year). Submits a plain GET form (?model=<id>) to a listing page.
import { useId, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TractorModel } from "@/types/catalog";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-body-lg md:text-body-md disabled:cursor-not-allowed disabled:opacity-60";

export function TractorSelector({
  models,
  action,
  initialModelId,
  layout = "row",
  className,
}: {
  models: TractorModel[];
  /** Listing path to submit to, e.g. /shop or /categories/tractor-parts */
  action: string;
  initialModelId?: string;
  layout?: "row" | "stacked";
  className?: string;
}) {
  const id = useId();
  const initial = models.find((m) => m.id === initialModelId);
  const [make, setMake] = useState(initial?.make ?? "");
  const [modelId, setModelId] = useState(initial?.id ?? "");

  const makes = [...new Set(models.map((m) => m.make))];
  const makeModels = models.filter((m) => m.make === make);

  return (
    <form
      action={action}
      method="get"
      className={cn(
        "grid gap-3",
        layout === "row" && "sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end",
        className,
      )}
    >
      <div className="space-y-1">
        <label htmlFor={`${id}-make`} className="text-label-md">
          1. Tractor make
        </label>
        <select
          id={`${id}-make`}
          value={make}
          onChange={(e) => {
            setMake(e.target.value);
            setModelId("");
          }}
          className={selectClass}
        >
          <option value="">Select make</option>
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-model`} className="text-label-md">
          2. Model
        </label>
        <select
          id={`${id}-model`}
          name="model"
          value={modelId}
          disabled={!make}
          required
          onChange={(e) => setModelId(e.target.value)}
          className={selectClass}
        >
          <option value="">{make ? "Select model" : "Choose a make first"}</option>
          {makeModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.model} ({m.year_from}–{m.year_to ?? "present"})
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" className="h-11 sm:col-span-2 lg:col-span-1" disabled={!modelId}>
        <Search />
        Find parts
      </Button>
    </form>
  );
}

