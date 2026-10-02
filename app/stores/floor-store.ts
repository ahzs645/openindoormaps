import { create } from "zustand";

interface FloorState {
  currentFloor: number;
  currentBuildingId: string | null;
  setCurrentBuildingId: (buildingId: string | null) => void;
  setCurrentFloor: (floor: number) => void;
}

const useFloorStore = create<FloorState>((set) => ({
  currentFloor: 0,
  currentBuildingId: null,
  setCurrentBuildingId: (currentBuildingId) => set({ currentBuildingId }),
  setCurrentFloor: (floor) => set({ currentFloor: floor }),
}));

export default useFloorStore;
