"use client";

// The variant a visitor has picked on a product page. The price, SKU, stock status, purchase
// buttons and WhatsApp message all follow it, so the server-rendered page keeps its layout and
// only these small leaves are client components. A product with a single variant (most of them)
// behaves exactly as before: the picker is not rendered.
import { createContext, useContext, useId, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Price } from "@/components/products/price";
import { StockIndicator } from "@/components/products/stock-indicator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { STOCK_LABEL } from "@/features/inventory/stock";
import { whatsappHref } from "@/lib/contact";
import { discount, formatPKR } from "@/lib/pricing";
import type { ProductVariant } from "@/types/catalog";

type Selection = {
  variants: ProductVariant[];
  selected: ProductVariant;
  select: (id: string) => void;
};

const SelectionContext = createContext<Selection | null>(null);

export function useVariantSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("variant selection components must be used inside <VariantSelectionProvider>");
  return ctx;
}

export function VariantSelectionProvider({
  variants,
  initialVariantId,
  children,
}: {
  variants: ProductVariant[];
  initialVariantId: string;
  children: React.ReactNode;
}) {
  const [id, setId] = useState(initialVariantId);
  const selected = variants.find((v) => v.id === id) ?? variants[0];
  return <SelectionContext.Provider value={{ variants, selected, select: setId }}>{children}</SelectionContext.Provider>;
}

export function SelectedSku() {
  return <>{useVariantSelection().selected.sku}</>;
}

/** Price, saving and stock status of the selected variant. */
export function SelectedPriceBox() {
  const { selected } = useVariantSelection();
  const saving = discount(selected);
  return (
    <div aria-live="polite" className="space-y-1 rounded-lg border border-border bg-card p-4">
      <Price product={selected} size="lg" />
      {saving && <p className="text-label-md text-warning">You save {formatPKR(saving.amount_paisa)}</p>}
      <StockIndicator status={selected.stock_status} className="pt-2" />
    </div>
  );
}

export function VariantPicker({ label = "Choose an option" }: { label?: string }) {
  const { variants, selected, select } = useVariantSelection();
  const groupId = useId();
  if (variants.length < 2) return null;
  return (
    <div className="space-y-2">
      <p id={`${groupId}-label`} className="text-label-lg">
        {label}
      </p>
      <RadioGroup value={selected.id} onValueChange={select} aria-labelledby={`${groupId}-label`} className="gap-2">
        {variants.map((v) => (
          <Label
            key={v.id}
            htmlFor={`${groupId}-${v.id}`}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-brand-tint/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <RadioGroupItem id={`${groupId}-${v.id}`} value={v.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-label-lg">{v.name}</span>
              {v.stock_status !== "in_stock" && (
                <span className="block text-body-sm text-muted-foreground">{STOCK_LABEL[v.stock_status]}</span>
              )}
            </span>
            <span className="shrink-0 text-label-lg tabular">{formatPKR(v.retail_price_paisa)}</span>
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
}

export function SelectedWhatsAppButton({ number, productName }: { number: string; productName: string }) {
  const { selected } = useVariantSelection();
  const variant = selected.name.trim().toLowerCase() === "default" ? "" : `, ${selected.name}`;
  const message = `Hello, I'd like to order: ${productName}${variant} (SKU ${selected.sku}).`;
  return (
    <Button asChild className="h-12 w-full bg-whatsapp hover:bg-whatsapp-hover">
      <a href={whatsappHref(number, message)} target="_blank" rel="noopener noreferrer">
        <MessageCircle />
        Order or ask on WhatsApp
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Button>
  );
}
