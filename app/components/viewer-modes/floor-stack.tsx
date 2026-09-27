import { ChevronDown, ChevronUp } from "lucide-react";
import useFloorStore from "~/stores/floor-store";
import { cn } from "~/lib/utils";

export function floorLabel(floor: number) {
  if (floor < 0) return `B${Math.abs(floor)}`;
  return `L${floor + 1}`;
}

interface FloorStackProps {
  availableFloors: number[];
  variant: "mappedin" | "situm";
  className?: string;
}

export default function FloorStack({
  availableFloors,
  variant,
  className,
}: FloorStackProps) {
  const { currentFloor, setCurrentFloor } = useFloorStore();
  if (availableFloors.length <= 1) return null;

  const sorted = [...availableFloors].sort((a, b) => b - a);
  const currentIndex = sorted.indexOf(currentFloor);
  const step = (delta: number) => {
    const next = sorted[currentIndex + delta];
    if (next !== undefined) setCurrentFloor(next);
  };

  if (variant === "situm") {
    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-md bg-[#283389] text-white shadow-lg",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Floor up"
          disabled={currentIndex <= 0}
          onClick={() => step(-1)}
          className="flex size-9 items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronUp className="size-4" />
        </button>
        <div className="border-y border-white/20 px-2 py-1.5 text-center text-xs font-semibold">
          {floorLabel(currentFloor)}
        </div>
        <button
          type="button"
          aria-label="Floor down"
          disabled={currentIndex >= sorted.length - 1}
          onClick={() => step(1)}
          className="flex size-9 items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl bg-white/95 p-1.5 shadow-lg dark:bg-card",
        className,
      )}
    >
      {sorted.map((floor) => (
        <button
          key={floor}
          type="button"
          onClick={() => setCurrentFloor(floor)}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
            floor === currentFloor
              ? "bg-[#2e4bff] text-white"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-secondary",
          )}
        >
          {floorLabel(floor)}
        </button>
      ))}
    </div>
  );
}
