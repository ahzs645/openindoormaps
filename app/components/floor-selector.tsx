import { availableFloors } from "~/data/building";
import useFloorStore from "~/stores/floor-store";
import { formatFloorLabel } from "~/utils/floor-utils";

const floorOptions = [...availableFloors].sort(
  (first, second) => second - first,
);

export function FloorSelector() {
  const { currentFloor, setCurrentFloor } = useFloorStore();

  const handleFloorChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const floor = Number.parseInt(event.target.value);
    setCurrentFloor(floor);
  };

  if (floorOptions.length === 0) {
    return null;
  }

  return (
    <div className="absolute right-2 top-2 z-10">
      <select
        value={currentFloor}
        onChange={handleFloorChange}
        className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none dark:bg-gray-900"
      >
        {floorOptions.map((floor) => (
          <option key={floor} value={floor}>
            {formatFloorLabel(floor)}
          </option>
        ))}
      </select>
    </div>
  );
}
