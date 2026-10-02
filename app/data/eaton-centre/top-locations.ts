import {
  Coffee,
  Info,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Toilet,
  UtensilsCrossed,
} from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Apple",
    icon: Smartphone,
    colors: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  },
  {
    name: "Urban Eatery",
    icon: UtensilsCrossed,
    colors: "bg-rose-100 text-rose-700 dark:bg-rose-700 dark:text-rose-100",
  },
  {
    name: "Zara",
    icon: Shirt,
    colors:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100",
  },
  {
    name: "Sephora",
    icon: Sparkles,
    colors: "bg-pink-100 text-pink-700 dark:bg-pink-700 dark:text-pink-100",
  },
  {
    name: "Uniqlo",
    icon: ShoppingBag,
    colors: "bg-red-100 text-red-700 dark:bg-red-700 dark:text-red-100",
  },
  {
    name: "Columbus Café & Co.",
    icon: Coffee,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "Guest Services",
    icon: Info,
    colors: "bg-sky-100 text-sky-700 dark:bg-sky-700 dark:text-sky-100",
  },
  {
    name: "Washrooms",
    icon: Toilet,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
];

export default topLocations;
