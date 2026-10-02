import { Hospital, Scan, ShoppingBag, Coffee, DoorOpen } from "lucide-react";
import type { TopLocation } from "~/types/location";

const topLocations: TopLocation[] = [
  {
    name: "Gift Shop",
    icon: ShoppingBag,
    colors: "bg-amber-100 text-amber-700",
  },
  {
    name: "Breast Health Clinic & Bone Density",
    icon: Scan,
    colors: "bg-pink-100 text-pink-700",
  },
  {
    name: "BC Children's Hospital",
    icon: Hospital,
    colors: "bg-sky-100 text-sky-700",
  },
  {
    name: "BC Women's Hospital",
    icon: Hospital,
    colors: "bg-violet-100 text-violet-700",
  },
  { name: "Starbucks", icon: Coffee, colors: "bg-orange-100 text-orange-700" },
  {
    name: "Entrance 93",
    icon: DoorOpen,
    colors: "bg-emerald-100 text-emerald-700",
  },
];
export default topLocations;
