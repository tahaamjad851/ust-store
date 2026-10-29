// DEMO DATA: stand-in for the tractor_models and product_fitments tables.
import type { ProductFitment, TractorModel } from "@/types/catalog";

export const DEMO_TRACTOR_MODELS: TractorModel[] = [
  { id: "tm-mf-240", make: "Massey Ferguson", model: "MF 240", year_from: 1985, year_to: null },
  { id: "tm-mf-260", make: "Massey Ferguson", model: "MF 260", year_from: 1995, year_to: null },
  { id: "tm-mf-375", make: "Massey Ferguson", model: "MF 375", year_from: 2000, year_to: null },
  { id: "tm-mf-385", make: "Massey Ferguson", model: "MF 385", year_from: 1985, year_to: null },
  { id: "tm-fiat-480", make: "Fiat / New Holland", model: "Fiat 480", year_from: 1985, year_to: 2010 },
  { id: "tm-fiat-640", make: "Fiat / New Holland", model: "Fiat 640", year_from: 1985, year_to: 2010 },
  { id: "tm-nh-7056", make: "Fiat / New Holland", model: "NH 70-56", year_from: 2008, year_to: null },
  { id: "tm-belarus-mtz50", make: "Belarus", model: "MTZ-50", year_from: 1980, year_to: 2005 },
];

export const DEMO_PRODUCT_FITMENTS: ProductFitment[] = [
  { product_id: "p-mf385-clutch-plate", tractor_model_id: "tm-mf-385" },
  { product_id: "p-mf385-clutch-plate", tractor_model_id: "tm-mf-375" },
  { product_id: "p-fiat480-clutch-plate", tractor_model_id: "tm-fiat-480" },
  { product_id: "p-fiat480-clutch-plate", tractor_model_id: "tm-fiat-640" },
  { product_id: "p-mf240-pressure-plate", tractor_model_id: "tm-mf-240" },
  { product_id: "p-mf240-pressure-plate", tractor_model_id: "tm-mf-260" },
  { product_id: "p-release-bearing", tractor_model_id: "tm-mf-385" },
  { product_id: "p-release-bearing", tractor_model_id: "tm-mf-375" },
  { product_id: "p-nh7056-friction-disc", tractor_model_id: "tm-nh-7056" },
  { product_id: "p-clutch-finger-kit", tractor_model_id: "tm-mf-260" },
  { product_id: "p-clutch-finger-kit", tractor_model_id: "tm-mf-385" },
  { product_id: "p-belarus-clutch-plate", tractor_model_id: "tm-belarus-mtz50" },
  { product_id: "p-pilot-bush", tractor_model_id: "tm-fiat-480" },
  { product_id: "p-starter-ring-gear", tractor_model_id: "tm-mf-385" },
  { product_id: "p-piston-liner-set", tractor_model_id: "tm-mf-240" },
  { product_id: "p-hydraulic-pump", tractor_model_id: "tm-fiat-480" },
  { product_id: "p-hydraulic-pump", tractor_model_id: "tm-fiat-640" },
  { product_id: "p-fuel-filter", tractor_model_id: "tm-nh-7056" },
  { product_id: "p-oil-filter", tractor_model_id: "tm-mf-385" },
  { product_id: "p-oil-filter", tractor_model_id: "tm-mf-240" },
  { product_id: "p-air-filter", tractor_model_id: "tm-mf-385" },
  { product_id: "p-radiator", tractor_model_id: "tm-mf-240" },
];
