import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MapPin,
  BookOpen,
  Coffee,
  Users,
  Accessibility,
  ArrowUpDown,
  DoorOpen,
  Cross,
  HeartPulse,
  FireExtinguisher,
  Flag,
  TriangleAlert,
  VolumeX,
  Droplets,
  ParkingCircle,
  Shield,
  Info,
  Recycle,
  MoveUpRight,
} from "lucide-react";
const icons = {
  pin: MapPin,
  study: BookOpen,
  coffee: Coffee,
  washroom: Users,
  wheelchair: Accessibility,
  stairs: MoveUpRight,
  elevator: ArrowUpDown,
  exit: DoorOpen,
  firstAid: Cross,
  aed: HeartPulse,
  extinguisher: FireExtinguisher,
  assembly: Flag,
  warning: TriangleAlert,
  quiet: VolumeX,
  water: Droplets,
  parking: ParkingCircle,
  security: Shield,
  information: Info,
  recycling: Recycle,
};
/** Only bundled icons enter this markup; user labels always use textContent. */
export function editorSymbolSvg(symbol?: string) {
  const Icon = icons[symbol as keyof typeof icons];
  return Icon
    ? renderToStaticMarkup(
        createElement(Icon, { size: 22, "aria-hidden": true }),
      )
    : "";
}
