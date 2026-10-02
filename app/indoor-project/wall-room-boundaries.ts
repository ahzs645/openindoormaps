import polygonClipping from "polygon-clipping";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { wallJunctionPatches } from "./wall-junctions";

type Rings = [number, number][][];
const bounds = (rings: Rings) => {
  const points = rings.flat();
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
};
const intersects = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
function area(parts: Rings[]): number {
  let total = 0;
  for (const rings of parts)
    for (const [i, ring] of rings.entries()) {
      const [ox, oy] = ring[0];
      let signed = 0;
      for (const [j, p] of ring.entries()) {
        const q = ring[(j + 1) % ring.length];
        signed += (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy);
      }
      total += ((i === 0 ? 1 : -1) * Math.abs(signed)) / 2;
    }
  return total;
}
// Native faces can differ by floating-point noise at shared vertices. This
// 0.0001 ft display precision is much smaller than a real wall or opening.
const snap = (rings: Rings): Rings =>
  rings.map((ring) =>
    ring.map(([x, y]) => [
      Math.round(x * 10_000) / 10_000,
      Math.round(y * 10_000) / 10_000,
    ]),
  );

/** Recover only bounded spaces formed by actual native wall faces. Source room
 * outlines identify the enclosure; they never close missing walls. Door
 * footprints close thresholds only for enclosure discovery, then get cut out
 * again by the display renderer. No rooms or routes are created or altered. */
export function wallRoomBoundaries(
  data: IndoorDataset,
  records: IndoorRecord[],
): Map<string, Rings> {
  const levels = new Set(
    records.filter((r) => r.walkable && !r.circulation).map((r) => r.levelId),
  );
  // Repair only levels with unfinished rooms. Same-level wall joints cannot
  // contribute to an enclosure on any other level.
  if (levels.size === 0) return new Map();
  const nativeWalls = data.walls.filter(
    (w) => w.kind === "wall" && levels.has(w.levelId),
  );
  const walls = [
    ...nativeWalls,
    ...wallJunctionPatches(nativeWalls).map((p) => ({
      levelId: p.levelId,
      ringsFeet: p.rings,
    })),
  ].map((w) => ({ ...w, box: bounds(w.ringsFeet) }));
  const doors = (data.doors ?? [])
    .filter((d) => d.footprintFeet)
    .map((d) => ({
      levelId: d.levelId,
      rings: [d.footprintFeet!] as Rings,
      box: bounds([d.footprintFeet!]),
    }));
  const masks = records
    .filter(
      (r) =>
        r.circulation ||
        (!r.walkable &&
          /open drop|open to (?:below|lower)/i.test(
            String(r.properties.notes ?? ""),
          )),
    )
    .map((r) => ({ ...r, box: bounds(r.ringsFeet) }));
  const resolved = new Map<string, Rings>();
  for (const r of records.filter((r) => r.walkable && !r.circulation)) {
    const box = bounds(r.ringsFeet).map((n, i) => n + (i < 2 ? -3 : 3));
    const local = walls
      .filter((w) => w.levelId === r.levelId && intersects(w.box, box))
      .map((w) => w.ringsFeet);
    if (local.length === 0) continue;
    const thresholds = doors
      .filter((d) => d.levelId === r.levelId && intersects(d.box, box))
      .map((d) => d.rings);
    try {
      const window: Rings = [
        [
          [box[0], box[1]],
          [box[2], box[1]],
          [box[2], box[3]],
          [box[0], box[3]],
        ],
      ];
      // Long diagonal native walls have very broad boxes. Trim their faces to
      // the room neighbourhood before union; the window itself is never a wall.
      const surfaces = [...local, ...thresholds].flatMap((rings) =>
        polygonClipping.intersection(snap(rings), window),
      );
      if (surfaces.length === 0) continue;
      const enclosures = polygonClipping
        .union(surfaces[0], ...surfaces.slice(1))
        .flatMap((part) => part.slice(1).map((ring) => [ring]));
      const sourceArea = area([r.ringsFeet]);
      if (sourceArea <= 0) continue;
      const matches = enclosures.filter((cell) => {
        const cellArea = area([cell]);
        if (cellArea <= 0 || !intersects(bounds(cell), bounds(r.ringsFeet)))
          return false;
        const overlap = area(polygonClipping.intersection(cell, r.ringsFeet));
        if (overlap / sourceArea < 0.8 || overlap / cellArea < 0.8)
          return false;
        // A closed shared lobby cannot become a private room block.
        return !masks.some(
          (mask) =>
            mask.levelId === r.levelId &&
            intersects(mask.box, bounds(cell)) &&
            area(polygonClipping.intersection(cell, mask.ringsFeet)) /
              cellArea >
              0.05,
        );
      });
      if (matches.length !== 1) continue;
      const holes = r.ringsFeet.slice(1).map((ring) => [ring]);
      const parts =
        holes.length > 0
          ? polygonClipping.difference(matches[0], ...holes)
          : [matches[0]];
      if (parts.length === 1) resolved.set(r.key, parts[0]);
    } catch {
      // An invalid or incomplete native enclosure retains the source outline.
    }
  }
  return resolved;
}
