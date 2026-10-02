import { useEffect } from "react";
import { useMap } from "./map";

export type RoomView = "2d" | "3d";

export function RoomViewControl({
  view,
  onChange,
  pitch,
}: {
  view: RoomView;
  onChange: (view: RoomView) => void;
  pitch: number;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    // Flat rooms stay flat even when rotating or using a touch gesture.
    map.setLight({ color: "#ffffff", intensity: 0.2 });
    map.setMaxPitch(view === "2d" ? 0 : 60);
    map.easeTo({ pitch: view === "2d" ? 0 : pitch, duration: 350 });
  }, [map, isLoaded, view, pitch]);

  return (
    <div
      role="group"
      aria-label="Room view"
      className="flex rounded-full bg-white p-1 text-sm text-gray-700 shadow-md"
    >
      {(["2d", "3d"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-label={`${mode.toUpperCase()} rooms`}
          aria-pressed={view === mode}
          onClick={() => onChange(mode)}
          className={`rounded-full px-4 py-2 font-semibold ${view === mode ? "bg-[#00629d] text-white" : "hover:bg-gray-100"}`}
        >
          {mode.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
