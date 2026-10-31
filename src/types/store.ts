// Public store settings (one row in store_settings, editable from admin) plus the active delivery
// methods. Components read business details from here; nothing is hardcoded in the UI.
// Delivery charges are never calculated on public pages: `delivery_charge_note` is what customers see.

export type DeliveryMethod = {
  id: string;
  name: string;
  description: string;
};

export type PaymentMethod = {
  id: "cod" | "bank_transfer";
  name: string;
  description: string;
  enabled: boolean;
};

export type StoreSettings = {
  business_name: string;
  tagline: string;
  /** Short neutral line used in the announcement bar, hero and footer. */
  value_statement: string;
  phone_primary: string;
  phone_secondary: string | null;
  /** Digits only, international format without "+", e.g. 923001234567 */
  whatsapp_number: string;
  email: string;
  address_line: string;
  city: string;
  province: string;
  business_hours: string;
  /** null = no free-delivery offer shown */
  free_delivery_threshold_paisa: number | null;
  /** Shown instead of a delivery fee, for example "Delivery charge confirmed by phone". */
  delivery_charge_note: string;
  /** Exchange terms, shown on product pages and in the FAQ. Empty = nothing shown. */
  return_policy_note: string;
  delivery_methods: DeliveryMethod[];
  payment_methods: PaymentMethod[];
};
