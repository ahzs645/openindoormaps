import {
  Coffee,
  Footprints,
  MapPin,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
} from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Lululemon",
    icon: Shirt,
    colors: "bg-rose-100 text-rose-700 dark:bg-rose-700 dark:text-rose-100",
  },
  {
    name: "Roots",
    icon: Footprints,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  {
    name: "The Body Shop",
    icon: Sparkles,
    colors: "bg-pink-100 text-pink-700 dark:bg-pink-700 dark:text-pink-100",
  },
  {
    name: "Starbucks",
    icon: Coffee,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  {
    name: "Urban Planet",
    icon: Store,
    colors: "bg-sky-100 text-sky-700 dark:bg-sky-700 dark:text-sky-100",
  },
  {
    name: "PINK",
    icon: Star,
    colors:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-700 dark:text-fuchsia-100",
  },
  {
    name: "Express",
    icon: ShoppingBag,
    colors:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100",
  },
  {
    name: "Entrance",
    icon: MapPin,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
];

export default topLocations;
