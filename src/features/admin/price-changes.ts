// Pure logic of the Daily prices page: turning what was typed into the change list that is sent to
// apply_daily_changes(), and deciding which changes need a second confirmation. The database enforces the
// same rules again (valid prices, stale data, the confirmation); this keeps the page honest before saving.
import { rupeesToPaisa } from "@/lib/pricing/money";

export type PriceRow = {
  variantId: string;
  regularPaisa: number;
  salePaisa: number | null;
  isActive: boolean;
  onHand: number;
  /** product_variants.updated_at exactly as the database returned it. Sent back to detect a stale page. */
  updatedAt: string;
};

/** What was typed into the row. A field that is `undefined` was not touched. */
export type RowEdit = {
  regular?: string;
  /** "" removes the sale price. */
  sale?: string;
  isActive?: boolean;
  onHand?: string;
};

/** One element of the array apply_daily_changes() takes. Absent keys are left alone by the database. */
export type DailyChange = {
  variant_id: string;
  expected_updated_at?: string;
  expected_on_hand?: number;
  regular_price_paisa?: number;
  sale_price_paisa?: number | null;
  is_active?: boolean;
  set_on_hand?: number;
};

export type RowCheck = {
  /** Field name -> message; non-empty means this row cannot be saved. */
  errors: Partial<Record<"regular" | "sale" | "onHand", string>>;
  /** Null when nothing differs from what is stored. */
  change: DailyChange | null;
};

export const MAX_STOCK = 1_000_000;

/** The price a customer pays: the sale price when there is one. */
export const effectivePaisa = (regularPaisa: number, salePaisa: number | null) => salePaisa ?? regularPaisa;

/** Percent change from `from` to `to`, unsigned. 0 when `from` is 0. */
export function percentChange(from: number, to: number): number {
  return from > 0 ? (Math.abs(to - from) * 100) / from : 0;
}

export function checkRowEdit(row: PriceRow, edit: RowEdit | undefined): RowCheck {
  const errors: RowCheck["errors"] = {};
  if (!edit) return { errors, change: null };
  const change: DailyChange = { variant_id: row.variantId };

  let regular = row.regularPaisa;
  if (edit.regular !== undefined) {
    const parsed = rupeesToPaisa(edit.regular);
    if (parsed === null || parsed <= 0) errors.regular = "Enter a price, like 1250 or 1250.50";
    else regular = parsed;
  }

  let sale = row.salePaisa;
  if (edit.sale !== undefined) {
    if (edit.sale.trim() === "") sale = null;
    else {
      const parsed = rupeesToPaisa(edit.sale);
      if (parsed === null || parsed <= 0) errors.sale = "Enter a sale price, or leave empty for no sale";
      else sale = parsed;
    }
  }
  if (!errors.regular && !errors.sale && sale !== null && sale >= regular) {
    errors.sale = "The sale price must be lower than the regular price";
  }

  let target: number | undefined;
  if (edit.onHand !== undefined) {
    const text = edit.onHand.trim();
    if (!/^\d{1,7}$/.test(text) || Number(text) > MAX_STOCK) errors.onHand = "Enter a whole number, 0 or more";
    else target = Number(text);
  }

  if (Object.keys(errors).length > 0) return { errors, change: null };

  let touched = false;
  if (regular !== row.regularPaisa) {
    change.regular_price_paisa = regular;
    touched = true;
  }
  if (sale !== row.salePaisa) {
    change.sale_price_paisa = sale;
    touched = true;
  }
  if (edit.isActive !== undefined && edit.isActive !== row.isActive) {
    change.is_active = edit.isActive;
    touched = true;
  }
  if (touched) change.expected_updated_at = row.updatedAt;
  if (target !== undefined && target !== row.onHand) {
    change.set_on_hand = target;
    change.expected_on_hand = row.onHand;
    touched = true;
  }
  return { errors, change: touched ? change : null };
}

export type LargeChange = { variantId: string; fromPaisa: number; toPaisa: number; percent: number };

/** Changes that move the price the customer pays by more than `thresholdPercent`. */
export function findLargeChanges(rows: PriceRow[], changes: DailyChange[], thresholdPercent: number): LargeChange[] {
  const byId = new Map(rows.map((r) => [r.variantId, r]));
  const large: LargeChange[] = [];
  for (const change of changes) {
    const row = byId.get(change.variant_id);
    if (!row) continue;
    const regular = change.regular_price_paisa ?? row.regularPaisa;
    const sale = change.sale_price_paisa === undefined ? row.salePaisa : change.sale_price_paisa;
    const from = effectivePaisa(row.regularPaisa, row.salePaisa);
    const to = effectivePaisa(regular, sale);
    const percent = percentChange(from, to);
    if (to !== from && percent > thresholdPercent) {
      large.push({ variantId: row.variantId, fromPaisa: from, toPaisa: to, percent: Math.round(percent * 10) / 10 });
    }
  }
  return large;
}
