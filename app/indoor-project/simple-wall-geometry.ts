import * as DMath from "./deterministic-math";
import buffer from "@turf/buffer";
import polygonClipping from "polygon-clipping";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { nativeEditPoint } from "./map-edits";
import { geographicPoint } from "./routing";
import { pillarWallContinuation } from "./display-geometry";

type Ring = [number, number][];
type Mask = { levelId: number; ring: Ring; box: number[] };
const box = (ring: Ring) => [
  Math.min(...ring.map((p) => p[0])),
  Math.min(...ring.map((p) => p[1])),
  Math.max(...ring.map((p) => p[0])),
  Math.max(...ring.map((p) => p[1])),
];
const overlap = (a: number[], b: number[], margin = 0) =>
  a[0] - margin <= b[2] &&
  a[2] + margin >= b[0] &&
  a[1] - margin <= b[3] &&
  a[3] + margin >= b[1];
const inside = (point: number[], b: number[]) =>
  point[0] >= b[0] && point[0] <= b[2] && point[1] >= b[1] && point[1] <= b[3];
const rectangle = (b: number[]): Ring => [
  [b[0], b[1]],
  [b[2], b[1]],
  [b[2], b[3]],
  [b[0], b[3]],
  [b[0], b[1]],
];
const toFeet = (data: IndoorDataset, ring: number[][]): Ring =>
  ring.map(
    (p) =>
      nativeEditPoint(data, p as [number, number]).map(
        (n) => Math.round(n * 1e6) / 1e6,
      ) as [number, number],
  );

/** Find compact closed wall loops, such as posts built from four Revit walls.
 * This is a reversible illustration heuristic, never a source classification.
 * Labelled arrivals and door openings veto a candidate. */
export function compactWallDetails(
  data: IndoorDataset,
  records: IndoorRecord[],
): Mask[] {
  if (data.nativeIndoorEnvelopes) return [];
  const masks: Mask[] = [];
  const extents = records.map((r) => ({
    levelId: r.levelId,
    box: box(r.ringsFeet[0]),
  }));
  for (const levelId of new Set(records.map((r) => r.levelId))) {
    const smallWalls = data.walls.filter((w) => {
      if (
        w.levelId !== levelId ||
        w.kind === "column" ||
        w.approximate ||
        w.ringsFeet.length !== 1 ||
        w.ringsFeet[0].length !== 4
      )
        return false;
      const b = box(w.ringsFeet[0]),
        width = b[2] - b[0],
        depth = b[3] - b[1];
      return (
        Math.max(width, depth) <= 5 &&
        Math.min(width, depth) <= 0.8 &&
        extents.some((r) => r.levelId === levelId && overlap(r.box, b, 5))
      );
    });
    if (smallWalls.length === 0) continue;
    try {
      const joined = buffer(
        {
          type: "MultiPolygon",
          coordinates: smallWalls.map((w) =>
            w.ringsFeet.map((r) =>
              [...r, r[0]].map((p) => geographicPoint(data, p)),
            ),
          ),
        },
        0.002,
        { units: "meters", steps: 1 },
      );
      if (!joined) continue;
      const parts =
        joined.geometry.type === "Polygon"
          ? [joined.geometry.coordinates]
          : joined.geometry.coordinates;
      for (const part of parts)
        for (const hole of part.slice(1)) {
          const b = box(toFeet(data, hole)),
            width = b[2] - b[0],
            depth = b[3] - b[1];
          if (
            Math.min(width, depth) < 0.65 ||
            Math.max(width, depth) > 3.5 ||
            width * depth > 10
          )
            continue;
          // Use the actual surrounding wall skins, rather than assuming every
          // boxed post has the same thickness. A narrow leftover skin produces
          // the small seams and bumps that this presentation mode removes.
          const searchBox = b.map((n, i) => n + (i < 2 ? -0.65 : 0.65));
          const skins = smallWalls
            .map((w) => box(w.ringsFeet[0]))
            .filter(
              (w) =>
                inside([w[0], w[1]], searchBox) &&
                inside([w[2], w[3]], searchBox),
            );
          const maskBox = b.map((n, i) =>
            i < 2
              ? Math.min(n - 0.38, ...skins.map((w) => w[i] - 0.01))
              : Math.max(n + 0.38, ...skins.map((w) => w[i] + 0.01)),
          );
          if (
            (data.doors ?? []).some(
              (d) =>
                d.levelId === levelId &&
                (inside(d.pointFeet, maskBox) ||
                  (d.footprintFeet &&
                    overlap(box(d.footprintFeet), maskBox, 0.1))),
            )
          )
            continue;
          if (
            records.some((r) => {
              if (r.levelId !== levelId) return false;
              const b = box(r.ringsFeet[0]);
              return (
                b[2] - b[0] <= 6 && b[3] - b[1] <= 6 && overlap(b, maskBox)
              );
            })
          )
            continue;
          if (
            data.nodes.some(
              (n) =>
                n.levelId === levelId &&
                n.kind === "arrival" &&
                inside(n.pointFeet, maskBox),
            )
          )
            continue;
          masks.push({ levelId, box: maskBox, ring: rectangle(maskBox) });
        }
    } catch {
      /* Uncertain wall loops remain visible. */
    }
  }
  return masks;
}

/** Remove only compact post-like wall details, then continue any adjoining
 * longer wall at its own thickness. Doors, rooms, graph and native walls stay intact. */
export function simpleWallGeometry(
  data: IndoorDataset,
  walls: FeatureCollection<MultiPolygon>,
  masks: Mask[],
): FeatureCollection<MultiPolygon> {
  if (data.nativeIndoorEnvelopes) return walls;
  const features = walls.features.flatMap((f) => {
    if (
      f.properties?.kind === "column" ||
      f.properties?.hiddenColumnContinuation
    )
      return [];
    const candidates = masks.filter(
      (m) => m.levelId === Number(f.properties?.levelId),
    );
    const coordinates = f.geometry.coordinates.flatMap((part) => {
      const native = part.map((r) => toFeet(data, r)),
        b = box(native[0]);
      const nearby = candidates.filter((m) => overlap(b, m.box));
      if (nearby.length === 0) return [part];
      try {
        return polygonClipping
          .difference(native, ...nearby.map((m) => [m.ring]))
          .map((p) =>
            p.map((r) => r.map((point) => geographicPoint(data, point))),
          );
      } catch {
        return [part];
      }
    });
    return coordinates.length > 0
      ? [{ ...f, geometry: { ...f.geometry, coordinates } }]
      : [];
  });
  const continuations: FeatureCollection<MultiPolygon>["features"] = [];
  for (const mask of masks) {
    const strips = data.walls
      .filter((w) => {
        if (
          w.levelId !== mask.levelId ||
          w.kind === "column" ||
          w.approximate ||
          w.ringsFeet.length !== 1 ||
          w.ringsFeet[0].length !== 4
        )
          return false;
        const b = box(w.ringsFeet[0]),
          long = Math.max(b[2] - b[0], b[3] - b[1]),
          thin = Math.min(b[2] - b[0], b[3] - b[1]);
        return (
          overlap(b, mask.box, 0.05) &&
          (long >= 4 || (thin < 0.15 && long >= 2.8))
        );
      })
      .flatMap((w) => pillarWallContinuation(w.ringsFeet, [mask.ring]));
    if (strips.length > 0)
      continuations.push({
        type: "Feature",
        properties: {
          kind: "wall",
          levelId: mask.levelId,
          simplifiedContinuation: true,
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: strips.map((p) =>
            p.map((r) => r.map((point) => geographicPoint(data, point))),
          ),
        },
      });
  }
  return {
    type: "FeatureCollection",
    features: [...features, ...continuations],
  };
}

/** Flatten only a post's local roof boundary using adjoining long room edges.
 * All other concavities, entrances and broad floor openings remain intact. */
export function simpleRoomGeometry(
  data: IndoorDataset,
  collection: FeatureCollection<MultiPolygon>,
  masks: Mask[],
): FeatureCollection<MultiPolygon> {
  if (data.nativeIndoorEnvelopes) return collection;
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const record = data.records.find(
        (r) => r.key === feature.properties?.key,
      );
      if (!record || record.circulation) return feature;
      const coordinates = feature.geometry.coordinates.flatMap((part) => {
        const native = part.map((r) => toFeet(data, r)),
          outer = native[0],
          extent = box(outer);
        const nearby = masks.filter(
          (m) => m.levelId === record.levelId && overlap(extent, m.box, 0.5),
        );
        if (nearby.length === 0) return [part];
        const sign = Math.sign(
          outer.reduce((sum, p, i) => {
            const q = outer[(i + 1) % outer.length];
            return sum + p[0] * q[1] - q[0] * p[1];
          }, 0),
        );
        if (!sign) return [part];
        const cuts: Ring[] = [],
          patches: Ring[][] = [];
        try {
          for (const mask of nearby) {
            const edges = outer.flatMap((a, i) => {
              const b = outer[(i + 1) % outer.length];
              return DMath.hypot(b[0] - a[0], b[1] - a[1]) >= 4 &&
                overlap(box([a, b]), mask.box, 0.5)
                ? [{ a, b }]
                : [];
            });
            if (edges.length === 0) continue;
            let polygon = mask.ring.slice(0, -1);
            for (const { a, b } of edges) {
              const side = (p: [number, number]) =>
                sign *
                ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
              const clipped: Ring = [];
              for (const [i, p] of polygon.entries()) {
                const q = polygon[(i + 1) % polygon.length],
                  sp = side(p),
                  sq = side(q);
                if (sp >= 0) clipped.push(p);
                if (sp >= 0 !== sq >= 0) {
                  const t = sp / (sp - sq);
                  clipped.push([
                    p[0] + t * (q[0] - p[0]),
                    p[1] + t * (q[1] - p[1]),
                  ]);
                }
              }
              polygon = clipped;
            }
            if (polygon.length < 3) continue;
            cuts.push(mask.ring);
            let patch: Ring[][] = [[polygon]];
            const broadHoles = native.slice(1).filter((r) => {
              const b = box(r);
              return Math.max(b[2] - b[0], b[3] - b[1]) > 6;
            });
            if (broadHoles.length > 0)
              patch = polygonClipping.difference(
                patch,
                ...broadHoles.map((r) => [r]),
              );
            patches.push(...patch);
          }
          if (cuts.length === 0) return [part];
          return polygonClipping
            .union(
              polygonClipping.difference(native, ...cuts.map((r) => [r])),
              ...patches,
            )
            .map((p) =>
              p.map((r) => r.map((point) => geographicPoint(data, point))),
            );
        } catch {
          return [part];
        }
      });
      return { ...feature, geometry: { ...feature.geometry, coordinates } };
    }),
  };
}
