import { create } from "zustand";
import { defaultFloor } from "~/data/building";

interface FloorState {
  currentFloor: number;
  setCurrentFloor: (floor: number) => void;
}

const useFloorStore = create<FloorState>((set) => ({
  currentFloor: defaultFloor,
  setCurrentFloor: (floor) => set({ currentFloor: floor }),
}));

export default useFloorStore;
