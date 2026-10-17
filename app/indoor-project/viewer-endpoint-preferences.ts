import type { ProjectArrivalMode } from "./route-arrival";
export const arrivalChoices = [
  {
    value: "inside" as const,
    name: "Inside room",
    description: "Start and finish at the rooms’ saved arrival points",
  },
  {
    value: "doorway" as const,
    name: "At doorway",
    description: "Stop at the selected entrance’s threshold",
  },
  {
    value: "hallway" as const,
    name: "Hallway outside door",
    description:
      "Use the hallway center with centerlines enabled, or the hallway side of each door",
  },
];
export function loadArrivalMode(): ProjectArrivalMode {
  try {
    const value = globalThis.localStorage.getItem(
      "indoor-project-endpoint-mode-v2",
    );
    if (value === "inside" || value === "doorway" || value === "hallway")
      return value;
  } catch {
    /* Storage is optional. */
  }
  return "hallway";
}
export function saveArrivalMode(mode: ProjectArrivalMode) {
  try {
    globalThis.localStorage.setItem("indoor-project-endpoint-mode-v2", mode);
  } catch {
    /* Storage is optional. */
  }
}
