import {
  BookOpen,
  Car,
  Coffee,
  Cpu,
  Library,
  Store,
  Trophy,
  UtensilsCrossed,
} from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Thurgood Marshall Library",
    icon: Library,
    colors:
      "bg-violet-100 text-violet-700 dark:bg-violet-700 dark:text-violet-100",
  },
  {
    name: "Student Center",
    icon: Store,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "SC-1024 - Book Store",
    icon: BookOpen,
    colors:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100",
  },
  {
    name: "SC-SAXBYS",
    icon: Coffee,
    colors:
      "bg-orange-100 text-orange-700 dark:bg-orange-700 dark:text-orange-100",
  },
  {
    name: "SC-1020 - The Pub",
    icon: UtensilsCrossed,
    colors: "bg-rose-100 text-rose-700 dark:bg-rose-700 dark:text-rose-100",
  },
  {
    name: "Computer Science Building",
    icon: Cpu,
    colors: "bg-sky-100 text-sky-700 dark:bg-sky-700 dark:text-sky-100",
  },
  {
    name: "Bulldog Football Stadium",
    icon: Trophy,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  {
    name: "Parking Lot A",
    icon: Car,
    colors: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  },
];

export default topLocations;
