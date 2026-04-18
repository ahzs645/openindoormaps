import { ToyBrick, Baby } from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Jucarii",
    icon: ToyBrick,
    colors: "bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100",
  },
  {
    name: "Puericultura Mare",
    icon: Baby,
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
];

export default topLocations;
