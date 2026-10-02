import {
  BookOpen,
  Bus,
  Coffee,
  Dumbbell,
  FlaskConical,
  HeartPulse,
  Toilet,
  UtensilsCrossed,
} from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Library Cafe",
    icon: Coffee,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "Food Court",
    icon: UtensilsCrossed,
    colors: "bg-rose-100 text-rose-700 dark:bg-rose-700 dark:text-rose-100",
  },
  {
    name: "Reading Room",
    icon: BookOpen,
    colors:
      "bg-violet-100 text-violet-700 dark:bg-violet-700 dark:text-violet-100",
  },
  {
    name: "Chemistry Lab S110",
    icon: FlaskConical,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  {
    name: "Health & Wellness Centre",
    icon: HeartPulse,
    colors: "bg-red-100 text-red-700 dark:bg-red-700 dark:text-red-100",
  },
  {
    name: "Fitness Centre",
    icon: Dumbbell,
    colors:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100",
  },
  {
    name: "Union Restrooms",
    icon: Toilet,
    colors: "bg-sky-100 text-sky-700 dark:bg-sky-700 dark:text-sky-100",
  },
  {
    name: "Campus Bus Loop",
    icon: Bus,
    colors: "bg-lime-100 text-lime-700 dark:bg-lime-700 dark:text-lime-100",
  },
];

export default topLocations;
