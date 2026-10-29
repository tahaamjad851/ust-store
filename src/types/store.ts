// Row shape for the planned store_settings table (single row, editable from admin).
// Components read business details from here; nothing is hardcoded in UI.

export type DeliveryMethod = {
  id: string;
  name: string;
  description: string;
  /** null = fee confirmed after the order is placed */
  fee_paisa: number | null;
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
  /** null = return period not shown */
  return_period_days: number | null;
  delivery_methods: DeliveryMethod[];
  payment_methods: PaymentMethod[];
};
