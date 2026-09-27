import {
  Coffee,
  Cpu,
  Footprints,
  Shirt,
  ShoppingBag,
  Star,
  Trophy,
} from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Primark",
    icon: ShoppingBag,
    colors: "bg-sky-100 text-sky-700 dark:bg-sky-700 dark:text-sky-100",
  },
  {
    name: "Adidas",
    icon: Footprints,
    colors:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100",
  },
  {
    name: "Nike",
    icon: Trophy,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "Sfera",
    icon: Shirt,
    colors:
      "bg-violet-100 text-violet-700 dark:bg-violet-700 dark:text-violet-100",
  },
  {
    name: "Jack & Jones",
    icon: Shirt,
    colors: "bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100",
  },
  {
    name: "Winter Festival Cafe",
    icon: Coffee,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "Zara Home",
    icon: Star,
    colors: "bg-rose-100 text-rose-700 dark:bg-rose-700 dark:text-rose-100",
  },
  {
    name: "Sony",
    icon: Cpu,
    colors: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  },
];

export default topLocations;
