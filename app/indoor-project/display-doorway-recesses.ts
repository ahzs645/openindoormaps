import * as DMath from "./deterministic-math";
import pc from "polygon-clipping";
import type { IndoorDataset } from "./contract";

type Point = [number, number];
type Rings = Point[][];
type Door = NonNullable<IndoorDataset["doors"]>[number];
export type DisplayDoorwayRecessInput = {
  roomKey: string;
  levelId: number;
  /** Current display geometry, never the navigation interior. */
  partsFeet: Rings[];
  doors: readonly Door[];
  /** Coplanar native floor support; its inner rings remain protected. */
  floorSupportPartsFeet: Rings[];
  /** Native wall/column material that must not receive room tint. */
  wallPartsFeet?: Rings[];
  /** Stair, atrium, ramp/open-drop apertures in addition to all existing holes. */
  protectedPartsFeet?: Rings[];
  /** Other identified room interiors on this level, excluding circulation. */
  neighbouringPartsFeet?: Rings[];
  maxWidthFeet?: number;
};
export type DisplayDoorwayRecess = {
  nativeDoorId: number;
  connectedRoomKeys: string[];
  widthFeet: number;
  recessDepthFeet: number;
  addedSquareFeet: number;
  addedPartsFeet: Rings[];
  evidence: string;
};
export type DisplayDoorwayRecessResult = {
  partsFeet: Rings[];
  closures: DisplayDoorwayRecess[];
};

const area = (parts: Rings[]) =>
  parts.reduce(
    (sum, rings) =>
      sum +
      rings.reduce((a, ring, i) => {
        if (!ring.length) return a;
        const [ox, oy] = ring[0];
        const value =
          Math.abs(
            ring.reduce((v, p, j) => {
              const q = ring[(j + 1) % ring.length];
              return v + (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy);
            }, 0),
          ) / 2;
        return a + (i ? -value : value);
      }, 0),
    0,
  );
const inRing = (p: Point, ring: Point[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
};
const inParts = (p: Point, parts: Rings[]) =>
  parts.some((r) => inRing(p, r[0]) && !r.slice(1).some((h) => inRing(p, h)));

/** Fill only a measured door's shallow display recess up to the two matching
 * adjacent room-wall faces. Never hull the room, bridge an unmeasured opening,
 * fill the full threshold into a corridor, or change source/access/graph data. */
export function fillMeasuredDoorwayRecesses(
  input: DisplayDoorwayRecessInput,
): DisplayDoorwayRecessResult {
  const { roomKey, levelId } = input;
  if (!input.partsFeet.length || !input.floorSupportPartsFeet.length)
    return { partsFeet: input.partsFeet, closures: [] };
  let current = input.partsFeet;
  const closures: DisplayDoorwayRecess[] = [];
  const originalHoles = input.partsFeet.flatMap((p) =>
    p.slice(1).map((h) => [h]),
  );
  const blockers = [
    ...originalHoles,
    ...(input.wallPartsFeet ?? []),
    ...(input.protectedPartsFeet ?? []),
    ...(input.neighbouringPartsFeet ?? []),
  ];
  for (const d of input.doors) {
    if (
      d.levelId !== levelId ||
      d.state !== "connected" ||
      !d.footprintFeet ||
      d.footprintFeet.length !== 4 ||
      !d.normalFeet ||
      !d.roomKeys.includes(roomKey) ||
      new Set(d.roomKeys).size < 2 ||
      !Number.isSafeInteger(d.nativeElementId)
    )
      continue;
    const nl = DMath.hypot(...d.normalFeet);
    if (!Number.isFinite(nl) || nl < 0.9 || nl > 1.1) continue;
    const n: Point = [d.normalFeet[0] / nl, d.normalFeet[1] / nl],
      t: Point = [-n[1], n[0]];
    const local = (p: Point): Point => {
      const x = p[0] - d.pointFeet[0],
        y = p[1] - d.pointFeet[1];
      return [x * t[0] + y * t[1], x * n[0] + y * n[1]];
    };
    const native = (x: number, y: number): Point => [
      d.pointFeet[0] + t[0] * x + n[0] * y,
      d.pointFeet[1] + t[1] * x + n[1] * y,
    ];
    const aperture = d.footprintFeet.map(local),
      xs = aperture.map((p) => p[0]),
      ys = aperture.map((p) => p[1]);
    const lo = Math.min(...xs),
      hi = Math.max(...xs),
      ymin = Math.min(...ys),
      ymax = Math.max(...ys),
      width = hi - lo;
    if (
      width < 0.5 ||
      width > (input.maxWidthFeet ?? 8) ||
      ymax - ymin < 0.05 ||
      ymax - ymin > 3 ||
      aperture.some(
        (p) =>
          Math.min(Math.abs(p[0] - lo), Math.abs(p[0] - hi)) > 0.02 ||
          Math.min(Math.abs(p[1] - ymin), Math.abs(p[1] - ymax)) > 0.02,
      )
    )
      continue;
    const middle = (lo + hi) / 2;
    const sides = [-1, 1].filter((side) =>
      inParts(native(middle, side > 0 ? ymax + 0.15 : ymin - 0.15), current),
    );
    if (sides.length !== 1) continue;
    const sign = sides[0],
      edge = sign > 0 ? ymax : -ymin;
    const farEdge = sign > 0 ? ymin : -ymax;
    const anchors = (x: number) =>
      current.flatMap((p) => {
        const ring = p[0].map(local).map((q) => [q[0], q[1] * sign] as Point);
        return ring.flatMap((a, i) => {
          const b = ring[(i + 1) % ring.length];
          if (
            Math.abs(b[0] - a[0]) < 1e-8 ||
            x < Math.min(a[0], b[0]) ||
            x > Math.max(a[0], b[0])
          )
            return [];
          const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
          return y >= farEdge - 0.02 && y <= edge + 0.02 ? [y] : [];
        });
      });
    const left = anchors(lo - 0.03),
      right = anchors(hi + 0.03);
    // Both measured jambs must meet the same shallow room-wall face. A real
    // alcove, asymmetric recess or another opening needs separate review.
    if (
      left.length !== 1 ||
      right.length !== 1 ||
      Math.abs(left[0] - right[0]) > 0.02
    )
      continue;
    const face = (left[0] + right[0]) / 2,
      depth = edge - face;
    if (
      depth <= 0.005 ||
      depth > 1 ||
      face < farEdge - 0.01 ||
      ![0.25, 0.5, 0.75].every((s) =>
        inParts(native(lo + s * width, sign * (edge + 0.05)), current),
      )
    )
      continue;
    const patch: Rings = [
      [
        native(lo, sign * face),
        native(hi, sign * face),
        native(hi, sign * (edge + 0.01)),
        native(lo, sign * (edge + 0.01)),
      ],
    ];
    try {
      let safe = pc.intersection(
        [patch],
        [[d.footprintFeet]],
        input.floorSupportPartsFeet,
      );
      if (blockers.length) safe = pc.difference(safe, ...blockers);
      const added = pc.difference(safe, current);
      const addedArea = area(added);
      if (addedArea < 0.001 || addedArea > width * depth * 1.02) continue;
      const joined = pc.union(current, added);
      // A threshold fill attaches to the identified room and must not create
      // an isolated coloured island or combine separate room components.
      if (joined.length !== current.length) continue;
      current = joined;
      closures.push({
        nativeDoorId: d.nativeElementId,
        connectedRoomKeys: [...d.roomKeys],
        widthFeet: width,
        recessDepthFeet: depth,
        addedSquareFeet: addedArea,
        addedPartsFeet: added,
        evidence:
          "Measured native aperture, connected room identity and matching adjacent room-wall faces; display-only shallow recess fill.",
      });
    } catch {
      // Invalid local clipping evidence leaves the original display untouched.
    }
  }
  return { partsFeet: current, closures };
}
