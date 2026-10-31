// DEMO DATA: stand-in for the store_settings table until Supabase is wired up.
// Contact details were taken from the approved designs; confirm them with the client before launch.
// Free-delivery threshold and return period are PLACEHOLDERS, not confirmed business terms.
import type { StoreSettings } from "./types";

export const DEMO_STORE_SETTINGS: StoreSettings = {
  business_name: "Umar Siddique Traders",
  tagline: "Tractor & agricultural machinery parts",
  value_statement: "Quality tractor parts, delivered across Pakistan",
  phone_primary: "0300 6701477",
  phone_secondary: "0321 8219594",
  whatsapp_number: "923006701477",
  email: "umarsiddiquetraders@gmail.com",
  address_line: "Quaid-e-Millat Road",
  city: "Khanpur",
  province: "Punjab",
  business_hours: "Mon–Sat, 8:00 AM – 8:00 PM",
  free_delivery_threshold_paisa: 10_000_00, // PLACEHOLDER
  return_period_days: 7, // PLACEHOLDER
  delivery_methods: [
    {
      id: "cargo_terminal",
      name: "Cargo terminal pickup",
      description: "Sent by goods transport to the terminal in your city. You collect it there.",
      fee_paisa: null,
    },
    {
      id: "courier",
      name: "Doorstep courier",
      description: "Delivered to your address by courier. Weight limits apply.",
      fee_paisa: null,
    },
  ],
  payment_methods: [
    {
      id: "cod",
      name: "Cash on delivery",
      description: "Pay when you receive your order.",
      enabled: true,
    },
    {
      id: "bank_transfer",
      name: "Bank transfer",
      description: "Bank details are shared with your order confirmation.",
      enabled: true,
    },
  ],
};
