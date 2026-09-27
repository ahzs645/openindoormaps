import {
  Briefcase,
  Coffee,
  Crown,
  Diamond,
  Gem,
  Plane,
  ShoppingBag,
  Watch,
} from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Louis Vuitton",
    icon: Crown,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "Chanel 2025",
    icon: Gem,
    colors: "bg-rose-100 text-rose-700 dark:bg-rose-700 dark:text-rose-100",
  },
  {
    name: "Fine Jewellery",
    icon: Diamond,
    colors: "bg-sky-100 text-sky-700 dark:bg-sky-700 dark:text-sky-100",
  },
  {
    name: "Roast and Bake Hall",
    icon: Coffee,
    colors:
      "bg-orange-100 text-orange-700 dark:bg-orange-700 dark:text-orange-100",
  },
  {
    name: "Fine Watch Room",
    icon: Watch,
    colors:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100",
  },
  {
    name: "Travel Goods & Luggage",
    icon: Briefcase,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  {
    name: "Abercrombie & Kent",
    icon: Plane,
    colors: "bg-cyan-100 text-cyan-700 dark:bg-cyan-700 dark:text-cyan-100",
  },
  {
    name: "Chanel",
    icon: ShoppingBag,
    colors:
      "bg-violet-100 text-violet-700 dark:bg-violet-700 dark:text-violet-100",
  },
];

export default topLocations;
