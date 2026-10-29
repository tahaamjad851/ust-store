import {
  Armchair,
  ArrowLeftRight,
  Bolt,
  CircleDot,
  Cog,
  Disc3,
  Droplet,
  Droplets,
  Fan,
  Fuel,
  Funnel,
  Gauge,
  Hammer,
  Settings2,
  ShieldCheck,
  Spline,
  Tractor,
  Truck,
  Wrench,
  Zap,
  type LucideProps,
} from "lucide-react";
import type { CategoryIcon as IconName } from "@/types/catalog";

const ICONS: Record<IconName, React.ComponentType<LucideProps>> = {
  tractor: Tractor,
  "engine-oil": Droplets,
  lubricant: Droplet,
  hydraulic: Gauge,
  filter: Funnel,
  accessory: Armchair,
  tyre: CircleDot,
  electrical: Zap,
  tools: Hammer,
  engine: Cog,
  clutch: Disc3,
  brake: ShieldCheck,
  gearbox: Settings2,
  transmission: ArrowLeftRight,
  steering: Wrench,
  cooling: Fan,
  fuel: Fuel,
  belt: Spline,
  bearing: Bolt,
  body: Truck,
};

export function CategoryIcon({ name, ...props }: { name: IconName } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" {...props} />;
}
