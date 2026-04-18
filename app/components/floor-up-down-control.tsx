import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo } from "react";
import { cn } from "~/lib/utils";
import useFloorStore from "~/stores/floor-store";

interface FloorUpDownControlProps {
  availableFloors: number[];
  className?: string;
}

export function FloorUpDownControl({
  availableFloors,
  className,
}: FloorUpDownControlProps) {
  const { currentFloor, setCurrentFloor } = useFloorStore();
  const sortedFloors = useMemo(
    () => [...availableFloors].sort((a, b) => a - b),
    [availableFloors],
  );
  const currentIndex = sortedFloors.indexOf(currentFloor);
  const lowerFloor =
    currentIndex > 0 ? sortedFloors[currentIndex - 1] : undefined;
  const upperFloor =
    currentIndex >= 0 && currentIndex < sortedFloors.length - 1
      ? sortedFloors[currentIndex + 1]
      : undefined;

  if (sortedFloors.length <= 1) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-background shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Move up one floor"
        className="flex size-9 items-center justify-center border-b transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        disabled={upperFloor === undefined}
        onClick={() => {
          if (upperFloor !== undefined) {
            setCurrentFloor(upperFloor);
          }
        }}
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Move down one floor"
        className="flex size-9 items-center justify-center transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        disabled={lowerFloor === undefined}
        onClick={() => {
          if (lowerFloor !== undefined) {
            setCurrentFloor(lowerFloor);
          }
        }}
      >
        <ChevronDown className="size-4" />
      </button>
    </div>
  );
}
