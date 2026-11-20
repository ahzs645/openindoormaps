import type { CorridorXY } from "../../app/indoor-project/corridor-centerline";
import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import {
  nativeExactPartsForProposals,
  nativeRationalFootprintSupported,
  nativeRationalPathSupported,
} from "../../app/indoor-project/native-exact-planar-topology";

export const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): CorridorXY[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** Exact two-foot strip support against native-style rational parts. */
export function clearance(parts: NativeRationalParts) {
  return (path: CorridorXY[]) =>
    path.slice(1).every((b, i) => {
      const a = path[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      if (length === 0) return nativeRationalPathSupported([a, b], parts);
      const nx = -dy / length,
        ny = dx / length;
      const footprint = nativeRationalOverlay("union", [
        [
          [
            [a[0] + nx, a[1] + ny],
            [b[0] + nx, b[1] + ny],
            [b[0] - nx, b[1] - ny],
            [a[0] - nx, a[1] - ny],
          ],
        ],
      ]);
      return nativeRationalFootprintSupported(footprint, parts);
    });
}

export type FixtureTerminal = {
  id: string;
  point: CorridorXY;
  approachDirection?: CorridorXY;
};

/** A branched corridor component: a 120 ft main hall (centre y = 4) with door
 * recesses on both walls, a side corridor up at x = 40-47, a side corridor
 * down at x = 80-87, a genuine corner at the east end (up to y = 40), and a
 * lobby at the west end with an island (a loop around an obstacle). */
export function branchedCorridorFixture(blocked: CorridorXY[][] = []) {
  const doors: FixtureTerminal[] = [];
  const pieces: CorridorXY[][][] = [
    [rect(0, 0, 120, 8)],
    [rect(40, 8, 7, 30)],
    [rect(80, -30, 7, 30)],
    [rect(112, 8, 8, 32)],
    [rect(-40, -8, 40, 24)],
  ];
  const bottom = [12, 24, 31, 55, 66, 72, 95, 104];
  const top = [17, 28, 60, 70, 99];
  for (const x of bottom) {
    pieces.push([rect(x - 1.5, -1, 3, 1)]);
    doors.push({
      id: `s${x}`,
      point: [x, -0.5],
      approachDirection: [0, 1],
    });
  }
  for (const x of top) {
    pieces.push([rect(x - 1.5, 8, 3, 1)]);
    doors.push({ id: `n${x}`, point: [x, 8.5], approachDirection: [0, -1] });
  }
  // Doors in the side corridors, the corner corridor and the lobby.
  pieces.push([rect(47, 24.5, 1, 3)]);
  doors.push({ id: "up", point: [47.5, 26], approachDirection: [-1, 0] });
  pieces.push([rect(79, -20.5, 1, 3)]);
  doors.push({ id: "down", point: [79.5, -19], approachDirection: [1, 0] });
  pieces.push([rect(114.5, 40, 3, 1)]);
  doors.push({ id: "corner", point: [116, 40.5], approachDirection: [0, -1] });
  pieces.push([rect(-26, 16, 3, 1)]);
  doors.push({
    id: "lobby-n",
    point: [-24.5, 16.5],
    approachDirection: [0, -1],
  });
  pieces.push([rect(-26, -9, 3, 1)]);
  doors.push({
    id: "lobby-s",
    point: [-24.5, -8.5],
    approachDirection: [0, 1],
  });
  pieces.push([rect(-41, 2.5, 1, 3)]);
  doors.push({ id: "lobby-w", point: [-40.5, 4], approachDirection: [1, 0] });
  const island = rect(-30, 0, 14, 8);
  const union = nativeRationalOverlay("union", pieces);
  const parts = nativeRationalOverlay("difference", union, [
    [island],
    ...blocked.map((ring) => [ring]),
  ]);
  const rings = nativeExactPartsForProposals(
    nativeRationalOverlay("difference", union, [[island]]),
  )[0];
  return { parts, rings, terminals: doors, island };
}
