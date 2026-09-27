import { useMemo, type ChangeEvent } from "react";
import { cn } from "~/lib/utils";
import useFloorStore from "~/stores/floor-store";
import { formatFloorName, type FloorNames } from "~/utils/floor";

interface FloorSelectorProps {
  availableFloors: number[];
  floorNames?: FloorNames;
  className?: string;
}

export function FloorSelector({
  availableFloors,
  floorNames,
  className,
}: FloorSelectorProps) {
  const { currentFloor, setCurrentFloor } = useFloorStore();
  const sortedFloors = useMemo(
    () => [...availableFloors].sort((a, b) => b - a),
    [availableFloors],
  );

  const handleFloorChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const floor = Number.parseFloat(event.target.value);
    setCurrentFloor(floor);
  };

  if (sortedFloors.length <= 1) return null;

  return (
    <div className={className}>
      <select
        value={currentFloor}
        onChange={handleFloorChange}
        className={cn(
          "h-9 rounded-md border bg-background px-3 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring",
        )}
        aria-label="Select floor"
      >
        {sortedFloors.map((floor) => (
          <option key={floor} value={floor}>
            {floorNames ? formatFloorName(floor, floorNames) : `Floor ${floor}`}
          </option>
        ))}
      </select>
    </div>
  );
}
