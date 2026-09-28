import { Footprints, Layers3, Route } from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Floor 1 overview",
    icon: Layers3,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  {
    name: "Floor 2 overview",
    icon: Layers3,
    colors: "bg-sky-100 text-sky-700 dark:bg-sky-700 dark:text-sky-100",
  },
  {
    name: "Stair",
    icon: Footprints,
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "Ramp",
    icon: Route,
    colors:
      "bg-violet-100 text-violet-700 dark:bg-violet-700 dark:text-violet-100",
  },
];

export default topLocations;
