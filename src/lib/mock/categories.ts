// DEMO DATA: stand-in for the categories table. Names follow the approved navigation drawer design.
import type { Category, CategoryIcon } from "@/types/catalog";

const IMG = "/images/placeholders/category.svg";

function top(id: string, slug: string, name: string, icon: CategoryIcon, sort: number, description: string): Category {
  return { id, parent_id: null, slug, name, description, icon, image_path: IMG, sort_order: sort, is_active: true };
}

function sub(id: string, parentId: string, slug: string, name: string, icon: CategoryIcon, sort: number, description: string): Category {
  return { id, parent_id: parentId, slug, name, description, icon, image_path: IMG, sort_order: sort, is_active: true };
}

export const DEMO_CATEGORIES: Category[] = [
  top("cat-tractor-parts", "tractor-parts", "Tractor Parts", "tractor", 1, "Replacement parts for engines, clutches, brakes, hydraulics and more."),
  top("cat-engine-oils", "engine-oils", "Engine Oils", "engine-oil", 2, "Diesel engine oils for tractors and farm machinery."),
  top("cat-lubricants", "lubricants", "Lubricants", "lubricant", 3, "Gear oils, greases and transmission lubricants."),
  top("cat-hydraulic-oils", "hydraulic-oils", "Hydraulic Oils", "hydraulic", 4, "Hydraulic and transmission fluids."),
  top("cat-filters", "filters", "Filters", "filter", 5, "Oil, air, fuel and hydraulic filters."),
  top("cat-accessories", "tractor-accessories", "Tractor Accessories", "accessory", 6, "Lights, seats, mirrors and other accessories."),
  top("cat-tyres-radiators", "tyres-radiators", "Tyres & Radiators", "tyre", 7, "Tyres, tubes and radiators."),
  top("cat-electrical", "electrical-wires", "Electrical & Wires", "electrical", 8, "Starters, alternators, switches and wiring."),
  top("cat-hardware", "hardware-tools", "Hardware & Tools", "tools", 9, "Hand tools, fasteners and workshop hardware."),

  sub("sub-engine", "cat-tractor-parts", "engine-parts", "Engine Parts", "engine", 1, "Pistons, liners, gaskets, valves and bearings."),
  sub("sub-clutch", "cat-tractor-parts", "clutch-parts", "Clutch Parts", "clutch", 2, "Clutch plates, pressure plates, release bearings and kits."),
  sub("sub-brake", "cat-tractor-parts", "brake-parts", "Brake Parts", "brake", 3, "Brake shoes, discs, linings and master cylinders."),
  sub("sub-gearbox", "cat-tractor-parts", "gearbox-parts", "Gearbox Parts", "gearbox", 4, "Gears, shafts and selector forks."),
  sub("sub-transmission", "cat-tractor-parts", "transmission-parts", "Transmission Parts", "transmission", 5, "Crown wheels, pinions and differential parts."),
  sub("sub-hydraulic", "cat-tractor-parts", "hydraulic-system-parts", "Hydraulic System Parts", "hydraulic", 6, "Hydraulic pumps, lift cylinders and control valves."),
  sub("sub-steering", "cat-tractor-parts", "steering-parts", "Steering Parts", "steering", 7, "Steering boxes, tie rod ends and power steering parts."),
  sub("sub-cooling", "cat-tractor-parts", "cooling-system-parts", "Cooling System Parts", "cooling", 8, "Water pumps, fan blades, thermostats and hoses."),
  sub("sub-electrical", "cat-tractor-parts", "electrical-parts", "Electrical Parts", "electrical", 9, "Starters, alternators, lights and switches."),
  sub("sub-fuel", "cat-tractor-parts", "fuel-system-parts", "Fuel System Parts", "fuel", 10, "Injection pumps, injectors and lift pumps."),
  sub("sub-belts", "cat-tractor-parts", "belts-pulleys", "Belts & Pulleys", "belt", 11, "Fan belts, alternator belts and pulleys."),
  sub("sub-bearings", "cat-tractor-parts", "bearings-seals", "Bearings & Seals", "bearing", 12, "Bearings, oil seals and O-ring kits."),
  sub("sub-body", "cat-tractor-parts", "tractor-body-parts", "Tractor Body Parts", "body", 13, "Grilles, mudguards, linkage and drawbars."),

  sub("sub-oil-filters", "cat-filters", "oil-filters", "Oil Filters", "filter", 1, "Engine oil filters."),
  sub("sub-air-filters", "cat-filters", "air-filters", "Air Filters", "filter", 2, "Primary and secondary air filter elements."),
  sub("sub-fuel-filters", "cat-filters", "fuel-filters", "Fuel Filters", "filter", 3, "Diesel fuel filters and water separators."),
];
