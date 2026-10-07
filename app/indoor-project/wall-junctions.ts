import type { IndoorDataset } from "./contract";

type Point = [number, number];
type Rings = Point[][];
type Wall = IndoorDataset["walls"][number];
const defaultTolerance = 0.02; // feet: 6.1 mm, smaller than a doorway or wall thickness
const overlap = 0.0002; // avoid zero-width contacts after display rounding
type Edge = { a: Point; b: Point; box: number[] };
const edges = (rings: Rings, tolerance: number): Edge[] =>
  rings.flatMap((ring) =>
    ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return {
        a,
        b,
        box: [
          Math.min(a[0], b[0]) - tolerance,
          Math.min(a[1], b[1]) - tolerance,
          Math.max(a[0], b[0]) + tolerance,
          Math.max(a[1], b[1]) + tolerance,
        ],
      };
    }),
  );
// A joint is allowed only within tolerance. Long/curved walls may have hundreds
// of remote segments; skip those without changing nearest-face selection.
const nearest = (
  p: Point,
  segments: Edge[],
  tolerance: number,
): Point | undefined => {
  let best: Point | undefined,
    distance = Infinity;
  for (const { a, b, box } of segments) {
    if (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3])
      continue;
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    const q: Point = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= tolerance && d < distance) {
      best = q;
      distance = d;
    }
  }
  return best;
};
const box = (rings: Rings, tolerance: number) => {
  const p = rings.flat();
  return [
    Math.min(...p.map((p) => p[0])) - tolerance,
    Math.min(...p.map((p) => p[1])) - tolerance,
    Math.max(...p.map((p) => p[0])) + tolerance,
    Math.max(...p.map((p) => p[1])) + tolerance,
  ];
};
const intersects = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

const cells = (levelId: number, bounds: number[]): string[] => {
  const keys: string[] = [];
  for (let x = Math.floor(bounds[0] / 32); x <= Math.floor(bounds[2] / 32); x++)
    for (
      let y = Math.floor(bounds[1] / 32);
      y <= Math.floor(bounds[3] / 32);
      y++
    )
      keys.push(`${levelId}:${x}:${y}`);
  return keys;
};
const extend = (p: Point, q: Point, distance: number): Point =>
  distance < 1e-7
    ? q
    : [
        q[0] + ((q[0] - p[0]) / distance) * overlap,
        q[1] + ((q[1] - p[1]) / distance) * overlap,
      ];

/** Closure of native wall end-cap gaps. The physical display renderer defaults
 * to 6.1 mm numerical cleanup. Identified room-display enclosures can explicitly
 * allow 0.3 ft corner continuations; those remain labelled display assumptions.
 * Extend only a short end cap whose two corners meet an existing same-floor
 * wall face. Annotations, door thresholds and columns cannot supply walls. */
export function wallJunctionPatches(
  walls: Wall[],
  tolerance = defaultTolerance,
): { levelId: number; rings: Rings }[] {
  const native = walls
    .filter((w) => w.kind === "wall")
    .map((w) => ({
      ...w,
      box: box(w.ringsFeet, tolerance),
      edges: edges(w.ringsFeet, tolerance),
    }));
  // Query near each end cap instead of comparing every pair of campus walls.
  const grid = new Map<string, Set<(typeof native)[number]>>();
  for (const wall of native)
    for (const key of cells(wall.levelId, wall.box)) {
      const bucket = grid.get(key) ?? new Set();
      bucket.add(wall);
      grid.set(key, bucket);
    }
  const patches: { levelId: number; rings: Rings }[] = [];
  for (const wall of native) {
    const ring = wall.ringsFeet[0];
    if (wall.ringsFeet.length !== 1 || ring.length !== 4) continue;
    const lengths = ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    });
    const longest = Math.max(...lengths);
    for (const [i, a] of ring.entries()) {
      if (lengths[i] > 2 || lengths[i] * 3 > longest) continue;
      const b = ring[(i + 1) % ring.length];
      const capBox = box([[a, b]], tolerance);
      const nearby = new Set(
        cells(wall.levelId, capBox).flatMap((key) => [
          ...(grid.get(key) ?? []),
        ]),
      );
      for (const other of nearby) {
        if (
          other === wall ||
          other.levelId !== wall.levelId ||
          !intersects(capBox, other.box)
        )
          continue;
        const qa = nearest(a, other.edges, tolerance);
        if (!qa) continue;
        const qb = nearest(b, other.edges, tolerance);
        if (!qb) continue;
        const da = Math.hypot(qa[0] - a[0], qa[1] - a[1]),
          db = Math.hypot(qb[0] - b[0], qb[1] - b[1]);
        if (da > tolerance || db > tolerance || Math.max(da, db) < 1e-7)
          continue;
        patches.push({
          levelId: wall.levelId,
          rings: [[a, b, extend(b, qb, db), extend(a, qa, da)]],
        });
      }
    }
  }
  return patches;
}
