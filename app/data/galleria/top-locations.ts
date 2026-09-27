import {
  BookOpen,
  Coffee,
  Pill,
  Shirt,
  ShoppingBasket,
  Toilet,
  UtensilsCrossed,
  Gamepad2,
} from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Cafe Aroma",
    icon: Coffee,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "Galleria Food Hall",
    icon: UtensilsCrossed,
    colors: "bg-rose-100 text-rose-700 dark:bg-rose-700 dark:text-rose-100",
  },
  {
    name: "Restrooms",
    icon: Toilet,
    colors: "bg-sky-100 text-sky-700 dark:bg-sky-700 dark:text-sky-100",
  },
  {
    name: "Nova Pharmacy",
    icon: Pill,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  {
    name: "Verde Grocer",
    icon: ShoppingBasket,
    colors: "bg-lime-100 text-lime-700 dark:bg-lime-700 dark:text-lime-100",
  },
  {
    name: "Atlas Books",
    icon: BookOpen,
    colors:
      "bg-violet-100 text-violet-700 dark:bg-violet-700 dark:text-violet-100",
  },
  {
    name: "Northwind Apparel",
    icon: Shirt,
    colors:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100",
  },
  {
    name: "Pixel Toys",
    icon: Gamepad2,
    colors: "bg-pink-100 text-pink-700 dark:bg-pink-700 dark:text-pink-100",
  },
];

export default topLocations;
