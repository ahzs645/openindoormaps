import type { RouteInstruction } from "~/indoor-directions/types";

/** Average indoor walking speed (m/s). */
export const WALKING_SPEED = 1.2;

/**
 * Per-floor travel time in seconds, matching the edge costs used by the
 * vendor ports (Pointr taxonomy: stairs 60s, escalator 45s).
 */
const TRANSITION_SECONDS: Record<string, number> = {
  stairs: 60,
  escalator: 45,
  ramp: 30,
};

/** Elevators: one wait (board + leave) plus a short ride per floor. */
const ELEVATOR_WAIT_SECONDS = 90;
const ELEVATOR_SECONDS_PER_FLOOR = 15;

export interface RouteSummary {
  distanceMeters: number;
  durationSeconds: number;
  floorChanges: number;
}

export function summarizeRoute(instructions: RouteInstruction[]): RouteSummary {
  let distanceMeters = 0;
  let durationSeconds = 0;
  let floorChanges = 0;
  for (const instruction of instructions) {
    if (instruction.type === "floor-change") {
      // Mirrors the route edge costs (scripts/port_vendors_common.py).
      const floors = instruction.floorsTraversed ?? 1;
      floorChanges += floors;
      durationSeconds +=
        instruction.networkType === "elevator"
          ? ELEVATOR_WAIT_SECONDS + ELEVATOR_SECONDS_PER_FLOOR * floors
          : (TRANSITION_SECONDS[instruction.networkType ?? ""] ?? 60) * floors;
    } else {
      distanceMeters += instruction.distanceMeters;
      durationSeconds += instruction.distanceMeters / WALKING_SPEED;
    }
  }
  return { distanceMeters, durationSeconds, floorChanges };
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

export function formatArrivalTime(
  seconds: number,
  now: Date = new Date(),
): string {
  const arrival = new Date(now.getTime() + seconds * 1000);
  return arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
