import * as DMath from "./deterministic-math";
import pc from "polygon-clipping";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { isFlatArea } from "./display-passages";
import { unresolvedRoomBoundaryKeys } from "./boundary-evidence";
import { wallJunctionPatches } from "./wall-junctions";
import { geographicPoint } from "./routing";
import {
  displayDoorwayClosures,
  DISPLAY_DOORWAY_MAX_WIDTH_FEET,
  type DisplayDoorwayClosure,
} from "./display-doorway-closures";

type Point = [number, number];
type Rings = Point[][];
type FloorMasks = Map<string, Rings> & {
  assumedOpenings?: Map<string, DisplayDoorwayClosure[]>;
  displayEnclosures?: Set<string>;
  cornerContinuations?: Set<string>;
};
type Hit = { ring: Point[]; edge: number; t: number; point: Point };
const reach = 3; // Association with a nearby source edge, never wall-gap closure.
const distance = (a: Point, b: Point) => DMath.hypot(a[0] - b[0], a[1] - b[1]);
const nearest = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return { t, point: [a[0] + t * dx, a[1] + t * dy] as Point };
};
const ringArea = (ring: Point[]) => {
  const o = ring[0];
  return (
    Math.abs(
      ring.reduce((s, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return (
          s + (p[0] - o[0]) * (q[1] - o[1]) - (q[0] - o[0]) * (p[1] - o[1])
        );
      }, 0),
    ) / 2
  );
};
const area = (parts: Rings[]) =>
  parts.reduce(
    (s, rings) =>
      s + rings.reduce((a, r, i) => a + (i ? -1 : 1) * ringArea(r), 0),
    0,
  );
const insideRing = (p: Point, ring: Point[]) => {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
};
const inside = (p: Point, parts: Rings[]) =>
  parts.some(
    (r) => insideRing(p, r[0]) && !r.slice(1).some((h) => insideRing(p, h)),
  );
const box = (rings: Rings) => {
  const p = rings.flat();
  return [
    Math.min(...p.map((p) => p[0])),
    Math.min(...p.map((p) => p[1])),
    Math.max(...p.map((p) => p[0])),
    Math.max(...p.map((p) => p[1])),
  ];
};
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const openRing = (ring: Point[]) =>
  distance(ring[0], ring.at(-1)!) < 1e-8 ? ring.slice(0, -1) : ring;
function boundaryPath(a: Hit, b: Hit): Point[] {
  const ring = a.ring,
    n = ring.length,
    start = a.edge + a.t;
  let end = b.edge + b.t;
  if (end < start) end += n;
  const path = [a.point];
  for (let v = Math.floor(start) + 1; v < end; v++) path.push(ring[v % n]);
  path.push(b.point);
  return path;
}

/** Native wall-face floor tint for an unfinished room, never a routing mask.
 * Follow only continuous native wall-material boundary paths. Unsupported sides
 * remain semantic source seams except small aligned jamb openings explicitly
 * assumed closed for display: no wall/door, access or node is created. A fully
 * supported perimeter is marked for the visitor's separate display block.
 * Preserve precise floor openings and reject changes into another place. */
export function wallFaceRoomFloorMasks(
  data: IndoorDataset,
  records: IndoorRecord[],
  maxOpeningWidthFeet = DISPLAY_DOORWAY_MAX_WIDTH_FEET,
): FloorMasks {
  const rejected = unresolvedRoomBoundaryKeys(data),
    result: FloorMasks = Object.assign(new Map<string, Rings>(), {
      assumedOpenings: new Map<string, DisplayDoorwayClosure[]>(),
      displayEnclosures: new Set<string>(),
      cornerContinuations: new Set<string>(),
    });
  if (data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256)
    return result;
  for (const room of records.filter(
    (r) => rejected.has(r.key) && !isFlatArea(r),
  )) {
    try {
      const source = openRing(room.ringsFeet[0]);
      if (source.length < 3) continue;
      const seed = source.reduce(
        (p, q) =>
          [p[0] + q[0] / source.length, p[1] + q[1] / source.length] as Point,
        [0, 0] as Point,
      );
      if (!inside(seed, [room.ringsFeet])) continue;
      const scope = box(room.ringsFeet).map(
        (v, i) => v + (i < 2 ? -reach : reach),
      );
      const walls = data.walls.filter(
        (w) =>
          w.levelId === room.levelId &&
          (w.kind === "wall" || w.kind === "column") &&
          !w.approximate &&
          overlaps(scope, box(w.ringsFeet)),
      );
      if (walls.length === 0) continue;
      const openings = displayDoorwayClosures(walls, maxOpeningWidthFeet);
      // Native plan projections sometimes stop a few inches before a corner.
      // Continue only measured short end caps to an existing nearby wall face.
      // These assumptions close room display; they never become physical walls
      // or establish a routing boundary, doorway, or access connection.
      const corners = wallJunctionPatches(walls, 0.3);
      // A known native door closes the visual room perimeter at its measured
      // threshold, even if the source scene depicts its leaf swung open.
      // The passage remains open in routing and in the doorway marker layer.
      const thresholds = (data.doors ?? []).filter(
        (d) =>
          d.levelId === room.levelId &&
          d.roomKeys.includes(room.key) &&
          Number.isInteger(d.nativeElementId) &&
          d.nativeElementId > 0 &&
          d.footprintFeet &&
          overlaps(scope, box([d.footprintFeet])),
      );
      const wallMaterial = pc.union(
        walls[0].ringsFeet,
        ...walls.slice(1).map((w) => w.ringsFeet),
        ...corners.map((w) => w.rings),
        ...openings.map((o) => o.rings),
      ) as Rings[];
      // Most native wall footprints already span their door openings. Keep
      // their straight inner face; a thicker door leaf must not notch it.
      const caps = thresholds.filter((d) => !inside(d.pointFeet, wallMaterial));
      const material =
        caps.length > 0
          ? (pc.union(
              wallMaterial,
              ...caps.map((d) => [d.footprintFeet!]),
            ) as Rings[])
          : wallMaterial;
      const contours = material.flat().map(openRing);
      const nativeEnclosures = material
        .flatMap((part) => part.slice(1))
        .filter((ring) => insideRing(seed, ring));
      const hit = (p: Point): Hit | undefined => {
        let best: Hit | undefined,
          minimum = reach;
        for (const ring of contours)
          for (let edge = 0; edge < ring.length; edge++) {
            const a = ring[edge],
              b = ring[(edge + 1) % ring.length],
              len = distance(a, b);
            if (len < 0.1) continue;
            const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
              normal: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
            const side = inside(
              [mid[0] + normal[0] * 0.001, mid[1] + normal[1] * 0.001],
              material,
            )
              ? -1
              : 1;
            if (
              ((seed[0] - mid[0]) * normal[0] +
                (seed[1] - mid[1]) * normal[1]) *
                side <=
              0
            )
              continue;
            const q = nearest(p, a, b),
              d = distance(p, q.point);
            if (d < minimum) {
              minimum = d;
              best = { ring, edge, ...q };
            }
          }
        return best;
      };
      const hits = source.map(hit),
        out: Point[] = [];
      let followed = 0;
      for (let i = 0; i < source.length; i++) {
        const j = (i + 1) % source.length,
          a = hits[i],
          b = hits[j];
        let path: Point[] | undefined;
        if (a && b && a.ring === b.ring) {
          const paths = [boundaryPath(a, b), boundaryPath(b, a).reverse()].sort(
            (a, b) =>
              a.reduce((s, p, i) => s + (i ? distance(p, a[i - 1]) : 0), 0) -
              b.reduce((s, p, i) => s + (i ? distance(p, b[i - 1]) : 0), 0),
          );
          path = paths.find(
            (path) =>
              path.reduce(
                (s, p, i) => s + (i ? distance(p, path[i - 1]) : 0),
                0,
              ) <=
                distance(source[i], source[j]) + 2 * reach &&
              path.every(
                (p) =>
                  distance(p, nearest(p, source[i], source[j]).point) <= reach,
              ),
          );
        }
        if (path) {
          followed++;
          out.push(...path.slice(0, -1));
        } else out.push(a?.point ?? source[i]);
      }
      if (nativeEnclosures.length > 1) continue;
      if (nativeEnclosures.length === 0 && followed < 2) continue;
      // Prefer the actual closed native interior over matching each coarse
      // source vertex to a face. Source notches can otherwise create diagonals
      // and disconnected fragments even when the measured room is enclosed.
      const ring =
        nativeEnclosures.length === 1
          ? openRing(nativeEnclosures[0])
          : out.filter((p, i) => i === 0 || distance(p, out[i - 1]) > 1e-7);
      if (ring.length < 3) continue;
      const candidates = pc.difference(
        [ring, ...room.ringsFeet.slice(1)],
        ...material,
      ) as Rings[];
      // Do not subtract the enlarged doorway display cutter here. It is for
      // carving visible wall openings, and used to bite into the room floor.
      // Following native notches can split a coarse source contour into a
      // room interior and detached scraps. Only its identified, seed-containing
      // component can belong to this room. Never choose between multiple
      // seeded parts or discard a substantial disconnected source area.
      const seeded = candidates.filter((part) => inside(seed, [part]));
      if (seeded.length !== 1) continue;
      const parts = seeded;
      const detachedArea = area(candidates) - area(parts);
      if (detachedArea > area([room.ringsFeet]) * 0.02) continue;
      const sourceArea = area([room.ringsFeet]),
        maskArea = area(parts);
      if (
        maskArea < sourceArea * 0.8 ||
        maskArea > sourceArea * 1.4 ||
        area(pc.intersection(parts, room.ringsFeet) as Rings[]) <
          sourceArea * 0.8
      )
        continue;
      const floors = data.walkingSupport.floors
        .filter((f) => Math.abs(f.elevationFeet - room.elevationFeet) < 0.15)
        .flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
      if (
        floors.length === 0 ||
        area(pc.difference(parts, ...floors) as Rings[]) > 0.002
      )
        continue;
      const added = pc.difference(parts, room.ringsFeet) as Rings[];
      if (
        records.some(
          (other) =>
            other.key !== room.key &&
            other.levelId === room.levelId &&
            (!other.circulation ||
              !other.walkable ||
              other.access === "staff") &&
            overlaps(scope, box(other.ringsFeet)) &&
            area(pc.intersection(added, other.ringsFeet) as Rings[]) > 0.5,
        )
      )
        continue;
      if (area(added) < 0.01) continue;
      result.set(room.key, parts[0]);
      if (nativeEnclosures.length === 1 && corners.length > 0)
        result.cornerContinuations!.add(room.key);
      // A floor mask can use source seams, but a display volume must have its
      // entire perimeter supported by native material or doorway caps. Sample
      // every tenth of a foot; tolerate only 0.05 ft of plan/mesh corner error.
      const supported = parts[0].every((ring) =>
        ring.every((a, i) => {
          const b = ring[(i + 1) % ring.length];
          const steps = Math.max(1, Math.ceil(distance(a, b) / 0.1));
          for (let j = 0; j <= steps; j++) {
            const p: Point = [
              a[0] + ((b[0] - a[0]) * j) / steps,
              a[1] + ((b[1] - a[1]) * j) / steps,
            ];
            if (
              !contours.some((r) =>
                r.some(
                  (q, k) =>
                    distance(p, nearest(p, q, r[(k + 1) % r.length]).point) <=
                    0.05,
                ),
              )
            )
              return false;
          }
          return true;
        }),
      );
      if (supported) result.displayEnclosures!.add(room.key);
      // Only retain assumptions that actually bound this accepted room mask.
      const used = openings.filter((o) =>
        o.rings[0].some((p) => parts[0][0].some((q) => distance(p, q) < 0.03)),
      );
      if (used.length > 0) result.assumedOpenings!.set(room.key, used);
    } catch {
      /* Ambiguous topology remains a source seam. */
    }
  }
  return result;
}

export function wallFaceFloorSurfaces(
  data: IndoorDataset,
  records: IndoorRecord[],
  areas: FeatureCollection<MultiPolygon>,
  masks = wallFaceRoomFloorMasks(data, records),
): FeatureCollection<MultiPolygon> {
  if (masks.size === 0) return areas;
  const byKey = new Map(data.records.map((r) => [r.key, r]));
  return {
    ...areas,
    features: areas.features.map((f) => {
      if (
        f.properties?.circulation !== true ||
        f.properties?.access === "staff"
      )
        return f;
      const owner = byKey.get(String(f.properties?.key));
      if (!owner) return f;
      const applicable = [...masks].filter(([key]) => {
        const r = byKey.get(key)!;
        return (
          r.levelId === owner.levelId &&
          Math.abs(r.elevationFeet - owner.elevationFeet) < 0.15
        );
      });
      if (applicable.length === 0) return f;
      try {
        const coordinates = pc.difference(
          f.geometry.coordinates as pc.MultiPolygon,
          ...applicable.map(([, rings]) =>
            rings.map((r) => [...r, r[0]].map((p) => geographicPoint(data, p))),
          ),
        );
        return {
          ...f,
          properties: {
            ...f.properties,
            wallFaceFloorMasks: applicable.map(([key]) => key),
          },
          geometry: { ...f.geometry, coordinates },
        };
      } catch {
        return f;
      }
    }),
  };
}

export function wallFaceSelectionSurfaces(
  data: IndoorDataset,
  areas: FeatureCollection<MultiPolygon>,
  masks: ReadonlyMap<string, Rings> & {
    assumedOpenings?: ReadonlyMap<string, DisplayDoorwayClosure[]>;
    displayEnclosures?: ReadonlySet<string>;
    cornerContinuations?: ReadonlySet<string>;
  },
): FeatureCollection<MultiPolygon> {
  if (masks.size === 0) return areas;
  return {
    ...areas,
    features: areas.features.map((f) => {
      const rings = masks.get(String(f.properties?.key));
      return rings
        ? {
            ...f,
            properties: {
              ...f.properties,
              floorMaskSource: masks.displayEnclosures?.has(
                String(f.properties?.key),
              )
                ? "assumed-native-wall-enclosure"
                : "partial-native-wall-faces",
              boundaryReviewRequired: true,
              displayCornerContinuation: masks.cornerContinuations?.has(
                String(f.properties?.key),
              )
                ? {
                    maximumFeet: 0.3,
                    assumption:
                      "short-native-end-cap-to-existing-wall-face-for-display-only",
                  }
                : undefined,
              displayDoorwayClosures:
                masks.assumedOpenings
                  ?.get(String(f.properties?.key))
                  ?.map((o) => ({
                    wallIds: o.wallIds,
                    widthFeet: o.widthFeet,
                    assumption: "closed-for-room-display-only",
                  })) ?? [],
            },
            geometry: {
              type: "MultiPolygon" as const,
              coordinates: [
                rings.map((r) =>
                  [...r, r[0]].map((p) => geographicPoint(data, p)),
                ),
              ],
            },
          }
        : f;
    }),
  };
}
