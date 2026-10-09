import type { IndoorDataset } from "./contract";
type Point = [number, number];
type Rings = Point[][];
type Wall = IndoorDataset["walls"][number];
type Bounds = [number, number, number, number];
const roomArea = (ring: Point[]) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
// Mirrors Reviter native-room-presentation's supported-junction proof. Keep
// source and visitor checks identical; no model or annotation is modified.
export type NativeWallJunctionRepair = {
  levelId: number;
  nativeWallElementId: number;
  supportingElementId: number;
  supportingElementKind: "wall" | "column";
  repairKind: "end-cap" | "corner";
  gapFeet: number;
  toleranceFeet: number;
  ringsFeet: Rings;
};
export const NATIVE_ROOM_JUNCTION_TOLERANCE_FEET = 0.08; // 24.4 mm; supported native end caps only.
const JUNCTION_TOLERANCE = NATIVE_ROOM_JUNCTION_TOLERANCE_FEET;
const CORNER_TOLERANCE = 0.04; // A single supported cap corner has less evidence than a complete cap.
const bounds = (rings: Rings): Bounds => {
  const ps = rings.flat();
  return [
    Math.min(...ps.map((p) => p[0])),
    Math.min(...ps.map((p) => p[1])),
    Math.max(...ps.map((p) => p[0])),
    Math.max(...ps.map((p) => p[1])),
  ];
};
const intersects = (a: Bounds, b: Bounds) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const padded = (b: Bounds, d: number): Bounds => [
  b[0] - d,
  b[1] - d,
  b[2] + d,
  b[3] + d,
];
const edges = (rings: Rings): [Point, Point][] =>
  rings.flatMap((r) =>
    r.map((a, i) => [a, r[(i + 1) % r.length]!] as [Point, Point]),
  );
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearest(p: Point, rings: Rings): Point {
  let best: Point = p;
  let minimum = Infinity;
  for (const [a, b] of edges(rings)) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    const q: Point = [a[0] + dx * t, a[1] + dy * t];
    if (distance(p, q) < minimum) {
      best = q;
      minimum = distance(p, q);
    }
  }
  return best;
}
/** A crossed or collapsed endpoint projection cannot become a barrier. */
function validJunctionPatch(rings: Rings): boolean {
  const ring = rings[0]!.filter(
    (p, i, points) => i === 0 || distance(p, points[i - 1]!) > 1e-7,
  );
  if (ring.length > 1 && distance(ring[0]!, ring.at(-1)!) < 1e-7) ring.pop();
  if (
    rings.length !== 1 ||
    ring.length < 3 ||
    ring.some((p) => !p.every(Number.isFinite)) ||
    roomArea(ring) < 1e-10
  )
    return false;
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < ring.length; i++)
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!,
        c = ring[j]!,
        d = ring[(j + 1) % ring.length]!;
      if (
        cross(a, b, c) * cross(a, b, d) < -1e-16 &&
        cross(c, d, a) * cross(c, d, b) < -1e-16
      )
        return false;
    }
  return true;
}

/** Query native evidence locally without changing its original order. Long
 * diagonal envelopes use a small overflow list instead of allocating a huge
 * campus-sized grid. This is an index, not a geometry approximation. */
function evidenceIndex<
  T extends { levelId: number; box: Bounds; index: number },
>(entries: T[]) {
  const size = 32,
    bins = new Map<string, T[]>(),
    overflow = new Map<number, T[]>();
  const extent = (box: Bounds) => [
    Math.floor(box[0] / size),
    Math.floor(box[1] / size),
    Math.floor(box[2] / size),
    Math.floor(box[3] / size),
  ];
  for (const entry of entries) {
    const [x0, y0, x1, y1] = extent(entry.box);
    if ((x1! - x0! + 1) * (y1! - y0! + 1) > 256) {
      overflow.set(entry.levelId, [
        ...(overflow.get(entry.levelId) ?? []),
        entry,
      ]);
      continue;
    }
    for (let x = x0!; x <= x1!; x++)
      for (let y = y0!; y <= y1!; y++) {
        const key = `${entry.levelId}:${x}:${y}`;
        bins.set(key, [...(bins.get(key) ?? []), entry]);
      }
  }
  return (levelId: number, box: Bounds): T[] => {
    const [x0, y0, x1, y1] = extent(box),
      found = new Set(overflow.get(levelId) ?? []);
    for (let x = x0!; x <= x1!; x++)
      for (let y = y0!; y <= y1!; y++)
        for (const entry of bins.get(`${levelId}:${x}:${y}`) ?? [])
          found.add(entry);
    return [...found]
      .filter((entry) => intersects(entry.box, box))
      .sort((a, b) => a.index - b.index);
  };
}

/** Extend only a short native wall end cap to independently recovered barrier
 * material. A column can support a wall endpoint, but cannot invent a partition.
 * No room annotation, window edge or door footprint supplies missing walls. */
export function recoverNativeWallJunctionRepairs(
  walls: Wall[],
  doors: NonNullable<IndoorDataset["doors"]>,
): NativeWallJunctionRepair[] {
  const result: NativeWallJunctionRepair[] = [];
  const nearbyWalls = evidenceIndex(
    walls.flatMap((wall, index) =>
      (wall.kind === "wall" || wall.kind === "column") &&
      wall.ringsFeet[0]?.length >= 3
        ? [{ wall, index, levelId: wall.levelId, box: bounds(wall.ringsFeet) }]
        : [],
    ),
  );
  const nearbyDoors = evidenceIndex(
    doors.flatMap((door, index) =>
      door.footprintFeet?.length
        ? [
            {
              door,
              index,
              levelId: door.levelId,
              box: bounds([door.footprintFeet]),
            },
          ]
        : [],
    ),
  );
  const doorIntersects = (levelId: number, patch: Rings) =>
    nearbyDoors(levelId, bounds(patch)).length > 0;
  for (const wall of walls.filter((w) => w.kind === "wall")) {
    const ring = wall.ringsFeet[0]!;
    if (wall.ringsFeet.length !== 1 || ring.length !== 4) continue;
    const lengths = ring.map((a, i) =>
      distance(a, ring[(i + 1) % ring.length]!),
    );
    for (const [i, a] of ring.entries()) {
      if (lengths[i]! > 2 || lengths[i]! * 3 > Math.max(...lengths)) continue;
      const b = ring[(i + 1) % ring.length]!;
      for (const { wall: other } of nearbyWalls(
        wall.levelId,
        padded(bounds([[a, b]]), JUNCTION_TOLERANCE),
      ).filter((entry) => entry.wall !== wall)) {
        const qa = nearest(a, other.ringsFeet),
          qb = nearest(b, other.ringsFeet);
        const da = distance(a, qa),
          db = distance(b, qb);
        if (Math.max(da, db) > JUNCTION_TOLERANCE) {
          // A tapered/butt junction can meet the supporting face at only one
          // cap corner. Repair a microscopic wedge at that corner, not the
          // unsupported remainder of the cap. This closes polygonization seams
          // such as Studio 05-122's 3.8 mm finish-face corner.
          for (const [p, q, gap, towards] of [
            [a, qa, da, b],
            [b, qb, db, a],
          ] as [Point, Point, number, Point][]) {
            if (gap < 1e-7 || gap > CORNER_TOLERANCE) continue;
            const capLength = distance(p, towards);
            const span = Math.min(CORNER_TOLERANCE, capLength);
            const c: Point = [
              p[0] + ((towards[0] - p[0]) * span) / capLength,
              p[1] + ((towards[1] - p[1]) * span) / capLength,
            ];
            const patch: Rings = [[p, q, c]];
            if (
              !validJunctionPatch(patch) ||
              doorIntersects(wall.levelId, patch)
            )
              continue;
            result.push({
              levelId: wall.levelId,
              nativeWallElementId: wall.nativeElementId,
              supportingElementId: other.nativeElementId,
              supportingElementKind:
                other.kind === "column" ? "column" : "wall",
              repairKind: "corner",
              gapFeet: gap,
              toleranceFeet: CORNER_TOLERANCE,
              ringsFeet: patch,
            });
          }
          continue;
        }
        if (Math.max(da, db) < 1e-7) continue;
        // Extend microscopically into the supporting face so precision reduction
        // cannot reopen a zero-width T contact. Total repair remains <= .08 ft.
        const extend = (p: Point, q: Point, d: number): Point =>
          d < 1e-7
            ? q
            : [
                q[0] +
                  ((q[0] - p[0]) / d) *
                    Math.min(0.0002, JUNCTION_TOLERANCE - d),
                q[1] +
                  ((q[1] - p[1]) / d) *
                    Math.min(0.0002, JUNCTION_TOLERANCE - d),
              ];
        const patch: Rings = [[a, b, extend(b, qb, db), extend(a, qa, da)]];
        if (!validJunctionPatch(patch) || doorIntersects(wall.levelId, patch))
          continue;
        result.push({
          levelId: wall.levelId,
          nativeWallElementId: wall.nativeElementId,
          supportingElementId: other.nativeElementId,
          supportingElementKind: other.kind === "column" ? "column" : "wall",
          repairKind: "end-cap",
          gapFeet: Math.max(da, db),
          toleranceFeet: JUNCTION_TOLERANCE,
          ringsFeet: patch,
        });
      }
    }
  }
  return result;
}

const repairCache = new WeakMap<IndoorDataset, Map<number, Wall[]>>();
export function nativeJointBarriers(
  data: IndoorDataset,
  levelId: number,
): Wall[] {
  // Strict physical material already includes only checked, explicitly applied
  // corrections. A proximity candidate must not become shadow construction.
  if (data.nativeIndoorEnvelopes) return [];
  let floors = repairCache.get(data);
  if (!floors) {
    floors = new Map();
    repairCache.set(data, floors);
  }
  let result = floors.get(levelId);
  if (!result) {
    result = recoverNativeWallJunctionRepairs(
      data.walls.filter((w) => w.levelId === levelId),
      data.doors?.filter((d) => d.levelId === levelId) ?? [],
    ).map((repair) => ({
      levelId: repair.levelId,
      nativeElementId: repair.nativeWallElementId,
      kind: "wall" as const,
      ringsFeet: repair.ringsFeet,
    }));
    floors.set(levelId, result);
  }
  return result;
}
