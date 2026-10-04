import type { FeatureCollection, MultiPolygon, Position } from "geojson";
import pc from "polygon-clipping";
import {
  stableWallGeometry,
  type WallGeometryRepair,
} from "./stable-wall-geometry";
import {
  EXPOSED_WALL_HEIGHT_METRES,
  ROOM_BLOCK_HEIGHT_METRES,
} from "./display-geometry";

type Point = [number, number];
type Box = [number, number, number, number];
type Reference = {
  featureId?: string | number;
  nativeElementId?: number;
  levelId?: number;
  roomKey?: string;
};
export type WallRenderIssue = Reference & {
  code:
    | "invalid-coordinate"
    | "self-intersection"
    | "invalid-hole"
    | "invalid-height"
    | "degenerate-polygon";
  part: number;
  pointGeographic?: Point;
  stage: "before-cleanup" | "after-cleanup";
};
const ref = (
  f: FeatureCollection<MultiPolygon>["features"][number],
): Reference => ({
  featureId: f.id,
  nativeElementId: f.properties?.nativeElementId,
  levelId: f.properties?.levelId,
  roomKey: f.properties?.key,
});
const bounds = (ps: Point[]): Box => [
  Math.min(...ps.map((p) => p[0])),
  Math.min(...ps.map((p) => p[1])),
  Math.max(...ps.map((p) => p[0])),
  Math.max(...ps.map((p) => p[1])),
];
const overlaps = (a: Box, b: Box, eps = 0) =>
  a[0] - eps <= b[2] &&
  a[2] + eps >= b[0] &&
  a[1] - eps <= b[3] &&
  a[3] + eps >= b[1];
const signedArea = (r: Point[]) =>
  r.reduce((s, p, i) => {
    const q = r[(i + 1) % r.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
const area = (ps: pc.MultiPolygon) =>
  ps.reduce(
    (s, rs) =>
      s +
      Math.abs(signedArea(rs[0] as Point[])) -
      rs.slice(1).reduce((v, r) => v + Math.abs(signedArea(r as Point[])), 0),
    0,
  );
const projection = (origin: Position) => {
  const sx =
      ((6_378_137 * Math.PI) / 180) * Math.cos((origin[1] * Math.PI) / 180),
    sy = (6_378_137 * Math.PI) / 180;
  return (p: Position): Point => [
    (p[0] - origin[0]) * sx,
    (p[1] - origin[1]) * sy,
  ];
};
// Proper intersections above the cleanup precision; touching native junctions
// and micrometre backtracking spurs are handled separately by the cleaner.
const crosses = (r: Point[]) => {
  for (let i = 0; i < r.length - 1; i++)
    for (let j = i + 2; j < r.length - 1; j++) {
      if (i === 0 && j === r.length - 2) continue;
      const a = r[i],
        b = r[i + 1],
        c = r[j],
        d = r[j + 1];
      if (!overlaps(bounds([a, b]), bounds([c, d]))) continue;
      const cross = (p: Point, q: Point, t: Point) =>
        (q[0] - p[0]) * (t[1] - p[1]) - (q[1] - p[1]) * (t[0] - p[0]);
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]),
        cd = Math.hypot(d[0] - c[0], d[1] - c[1]);
      if (ab < 1e-5 || cd < 1e-5) continue;
      const x = cross(a, b, c) / ab,
        y = cross(a, b, d) / ab,
        u = cross(c, d, a) / cd,
        v = cross(c, d, b) / cd;
      if (
        x * y < 0 &&
        u * v < 0 &&
        Math.min(Math.abs(x), Math.abs(y), Math.abs(u), Math.abs(v)) > 1e-5
      )
        return true;
    }
  return false;
};
function integrity(
  walls: FeatureCollection<MultiPolygon>,
  stage: WallRenderIssue["stage"],
) {
  const issues: WallRenderIssue[] = [];
  for (const f of walls.features) {
    const base = Number(f.properties?.base ?? 0),
      top = Number(f.properties?.height ?? EXPOSED_WALL_HEIGHT_METRES);
    if (!Number.isFinite(base) || !Number.isFinite(top) || top <= base)
      issues.push({ ...ref(f), code: "invalid-height", part: 0, stage });
    for (const [part, p] of f.geometry.coordinates.entries()) {
      const report = (code: WallRenderIssue["code"]) =>
        issues.push({
          ...ref(f),
          code,
          part,
          stage,
          ...(p[0]?.[0]?.slice(0, 2).every(Number.isFinite)
            ? { pointGeographic: [p[0][0][0], p[0][0][1]] as Point }
            : {}),
        });
      if (
        p.some((r) =>
          r.some((q) => q.length < 2 || !q.slice(0, 2).every(Number.isFinite)),
        )
      ) {
        report("invalid-coordinate");
        continue;
      }
      if (p.length === 0 || p.some((r) => r.length < 4)) {
        report("degenerate-polygon");
        continue;
      }
      const xy = projection(p[0][0]),
        rs = p.map((r) => r.map(xy));
      if (rs.some((r) => crosses(r))) {
        report("self-intersection");
        continue;
      }
      if (Math.abs(signedArea(rs[0])) < 1e-10) {
        report("degenerate-polygon");
        continue;
      }
      try {
        if (rs.slice(1).some((h) => area(pc.difference([h], [rs[0]])) > 1e-8))
          report("invalid-hole");
      } catch {
        report("invalid-hole");
      }
    }
  }
  return issues;
}

type FaceRisk = Reference & {
  roomKey: string;
  sharedLengthMetres: number;
  overlapAreaSquareMetres: number;
  verticalOverlapMetres: number;
};
/** Coplanar side faces are a depth-buffer risk, not evidence of a wrong native
 * wall. They are reported separately from invalid geometry. Visitor 3D's exact
 * wall mesh and depth bias are the mitigation. */
export function wallRoomFaceRisks(
  walls: FeatureCollection<MultiPolygon>,
  rooms: FeatureCollection<MultiPolygon>,
) {
  const origin =
    walls.features[0]?.geometry.coordinates[0]?.[0]?.[0] ??
    rooms.features[0]?.geometry.coordinates[0]?.[0]?.[0];
  if (!origin) return [];
  const xy = projection(origin),
    segments = (rs: Point[][]) =>
      rs.flatMap((r) =>
        r
          .slice(0, -1)
          .map((a, i) => ({ a, b: r[i + 1], box: bounds([a, r[i + 1]]) })),
      ),
    prepared = rooms.features.map((f) => {
      const rs = f.geometry.coordinates.map((p) => p.map((r) => r.map(xy)));
      return {
        f,
        rs,
        box: bounds(rs.flatMap((rings) => rings.flat())),
        edges: rs.flatMap(segments),
        base: Number(f.properties?.base ?? 0),
        top: Number(f.properties?.height ?? ROOM_BLOCK_HEIGHT_METRES),
      };
    }),
    bucket = new Map<string, Set<number>>(),
    grid = (b: Box) => {
      const keys: string[] = [];
      if (!b.every(Number.isFinite)) return keys;
      for (let x = Math.floor(b[0] / 16); x <= Math.floor(b[2] / 16); x++)
        for (let y = Math.floor(b[1] / 16); y <= Math.floor(b[3] / 16); y++)
          keys.push(`${x}:${y}`);
      return keys;
    };
  for (const [i, r] of prepared.entries())
    for (const key of grid(r.box)) {
      if (!bucket.has(key)) bucket.set(key, new Set());
      bucket.get(key)!.add(i);
    }
  const risks: FaceRisk[] = [];
  for (const f of walls.features) {
    const base = Number(f.properties?.base ?? 0),
      top = Number(f.properties?.height ?? EXPOSED_WALL_HEIGHT_METRES);
    for (const part of f.geometry.coordinates) {
      const rs = part.map((r) => r.map(xy)),
        box = bounds(rs.flat()),
        edges = segments(rs),
        candidates = new Set(
          grid(box).flatMap((k) => [...(bucket.get(k) ?? [])]),
        );
      for (const index of candidates) {
        const room = prepared[index],
          z = Math.min(top, room.top) - Math.max(base, room.base);
        if (z <= 1e-5 || !overlaps(box, room.box, 1e-5)) continue;
        let shared = 0,
          overlapArea = 0;
        for (const e of edges) {
          const dx = e.b[0] - e.a[0],
            dy = e.b[1] - e.a[1],
            len = Math.hypot(dx, dy);
          if (len < 1e-5) continue;
          for (const q of room.edges) {
            if (!overlaps(e.box, q.box, 1e-5)) continue;
            const cross = (p: Point) =>
              Math.abs(dx * (p[1] - e.a[1]) - dy * (p[0] - e.a[0])) / len;
            if (cross(q.a) > 1e-5 || cross(q.b) > 1e-5) continue;
            const t = (p: Point) =>
              ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / len;
            shared += Math.max(
              0,
              Math.min(len, Math.max(t(q.a), t(q.b))) -
                Math.max(0, Math.min(t(q.a), t(q.b))),
            );
          }
        }
        try {
          overlapArea = area(pc.intersection([rs], room.rs));
        } catch {
          /* Integrity reports invalid polygons separately. */
        }
        if (shared > 0.05 || overlapArea > 1e-6)
          risks.push({
            ...ref(f),
            roomKey: String(room.f.properties?.key ?? room.f.id),
            sharedLengthMetres: shared,
            overlapAreaSquareMetres: overlapArea,
            verticalOverlapMetres: z,
          });
      }
    }
  }
  return risks;
}

/** Uses the identical cleaner as the map; never changes source data. */
export function auditWallRenderGeometry(
  walls: FeatureCollection<MultiPolygon>,
  rooms?: FeatureCollection<MultiPolygon>,
) {
  const repairs: WallGeometryRepair[] = [];
  // Exposed walls are often a union per level and have no feature ID. Give
  // audit copies stable IDs so a finding names the exact component, without
  // changing the renderer's input or a source/native element identity.
  const tagged = {
    ...walls,
    features: walls.features.map((f, i) => ({
      ...f,
      id: f.id ?? `audit-wall:${i}`,
    })),
  };
  const cleaned = stableWallGeometry(tagged, (r) => repairs.push(r));
  const issues = [
    ...integrity(tagged, "before-cleanup"),
    ...integrity(cleaned, "after-cleanup"),
  ];
  const unresolved = issues.filter((issue) => {
    if (issue.stage === "after-cleanup") return true;
    if (issue.code === "degenerate-polygon") return false;
    const source = tagged.features.find((f) => f.id === issue.featureId);
    const retainedId = `${issue.featureId}:wall-part:${issue.part}`;
    // A retained invalid component is already named by its after-cleanup
    // finding. Do not count it twice, or count normal precision repairs as
    // failures. A discarded large/unknown invalid polygon still needs review.
    if (cleaned.features.some((f) => f.id === retainedId)) return false;
    const p = source?.geometry.coordinates[issue.part];
    if (
      !p?.[0]?.length ||
      !p.flat().every((q) => q.slice(0, 2).every(Number.isFinite))
    )
      return true;
    const xy = projection(p[0][0]),
      ring = p[0].map(xy),
      b = bounds(ring);
    const perimeter = ring
      .slice(0, -1)
      .reduce(
        (s, q, i) =>
          s + Math.hypot(q[0] - ring[i + 1][0], q[1] - ring[i + 1][1]),
        0,
      );
    return (
      Math.hypot(b[2] - b[0], b[3] - b[1]) > 0.5 ||
      Math.abs(signedArea(ring)) / (perimeter || 1) >= 1e-5
    );
  });
  return {
    cleaned,
    repairs,
    issues,
    unresolved,
    faceRisks: rooms ? wallRoomFaceRisks(cleaned, rooms) : [],
  };
}
