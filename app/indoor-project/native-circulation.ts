import type { IndoorDataset, IndoorRecord } from "./contract";
import { routingCalculationValue } from "./routing-cache";
import { createNativeDoorApproachQuery } from "./native-door-approach";
export type NativeCirculationCell = NonNullable<
  IndoorDataset["circulationGeometry"]
>["cells"][number];
export function validateNativeCirculationGeometry(data: IndoorDataset): void {
  const value = data.circulationGeometry;
  if (value === undefined) return;
  if (
    !value ||
    value.version !== 1 ||
    value.sourceModelSha256 !== data.source.modelSha256 ||
    typeof value.sourceGeometryKey !== "string" ||
    value.sourceGeometryKey.length > 32 * 1024 * 1024 ||
    !Array.isArray(value.cells) ||
    value.cells.length > 60_000
  )
    throw new Error("Invalid prepared native circulation geometry.");
  const ids = new Set<string>();
  if (
    value.fixtures !== undefined &&
    (!Array.isArray(value.fixtures) ||
      value.fixtures.length > 60_000 ||
      value.fixtures.some(
        (f) =>
          !f ||
          typeof f.id !== "string" ||
          f.id.length > 512 ||
          !Number.isSafeInteger(f.nativeElementId) ||
          f.nativeElementId <= 0 ||
          !Number.isFinite(f.elevationFeet) ||
          !Number.isFinite(f.heightFeet) ||
          f.heightFeet <= 0 ||
          f.heightFeet > 50 ||
          !Array.isArray(f.levelIds) ||
          f.levelIds.length === 0 ||
          f.levelIds.some(
            (id) =>
              !data.nativeLevels.some(
                (l) =>
                  l.id === id &&
                  Math.abs(l.elevationFeet - f.elevationFeet) < 0.05,
              ),
          ) ||
          !Array.isArray(f.ringsFeet) ||
          f.ringsFeet.length === 0 ||
          f.ringsFeet.some(
            (r) =>
              !Array.isArray(r) ||
              r.length < 3 ||
              r.length > 60_000 ||
              r.some(
                (p) =>
                  !Array.isArray(p) ||
                  p.length !== 2 ||
                  p.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e8),
              ),
          ),
      ))
  )
    throw new Error("Invalid native fixture geometry.");
  if (
    value.preparedRoomKeys !== undefined &&
    (!Array.isArray(value.preparedRoomKeys) ||
      value.preparedRoomKeys.length > 60_000 ||
      value.preparedRoomKeys.some(
        (key) => !data.records.some((r) => r.key === key),
      ))
  )
    throw new Error("Invalid prepared native circulation identities.");
  if (
    value.reviewSurfaces !== undefined &&
    (!Array.isArray(value.reviewSurfaces) ||
      value.reviewSurfaces.length > 60_000 ||
      value.reviewSurfaces.some(
        (s) =>
          !s ||
          !value.preparedRoomKeys?.includes(s.roomKey) ||
          !data.records.some(
            (r) =>
              r.key === s.roomKey &&
              r.levelId === s.levelId &&
              Math.abs(r.elevationFeet - s.elevationFeet) < 0.05,
          ) ||
          !Array.isArray(s.ringsFeet) ||
          s.ringsFeet.length === 0 ||
          s.ringsFeet.length > 10_000 ||
          s.ringsFeet.some(
            (r) =>
              !Array.isArray(r) ||
              r.length < 3 ||
              r.length > 60_000 ||
              r.some(
                (p) =>
                  !Array.isArray(p) ||
                  p.length !== 2 ||
                  p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e8),
              ),
          ),
      ))
  )
    throw new Error("Invalid native floor-clipped review surface.");
  for (const cell of value.cells) {
    if (
      !cell ||
      typeof cell.id !== "string" ||
      cell.id.length > 512 ||
      ids.has(cell.id) ||
      !Number.isFinite(cell.elevationFeet) ||
      !Number.isFinite(cell.sourceCoverage) ||
      cell.sourceCoverage < 0.65 ||
      cell.sourceCoverage > 1.000_001 ||
      !Array.isArray(cell.levelIds) ||
      cell.levelIds.length === 0 ||
      cell.levelIds.some((id) => !data.nativeLevels.some((l) => l.id === id)) ||
      !Array.isArray(cell.roomKeys) ||
      cell.roomKeys.length === 0 ||
      cell.roomKeys.some(
        (key) =>
          !data.records.some(
            (r) =>
              r.key === key &&
              cell.levelIds.includes(r.levelId) &&
              Math.abs(r.elevationFeet - cell.elevationFeet) < 0.05,
          ),
      ) ||
      !Array.isArray(cell.nativeFloorIds) ||
      cell.nativeFloorIds.length === 0 ||
      cell.nativeFloorIds.some(
        (id) =>
          !data.walkingSupport?.floors.some(
            (f) =>
              f.nativeElementId === id &&
              Math.abs(f.elevationFeet - cell.elevationFeet) < 0.05,
          ),
      ) ||
      !Array.isArray(cell.ringsFeet) ||
      cell.ringsFeet.length === 0 ||
      cell.ringsFeet.length > 10_000 ||
      cell.ringsFeet.some(
        (ring) =>
          !Array.isArray(ring) ||
          ring.length < 3 ||
          ring.length > 60_000 ||
          ring.some(
            (p) =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e8),
          ),
      )
    )
      throw new Error("Invalid native circulation cell or floor ownership.");
    ids.add(cell.id);
  }
}
/** Keep this wire binding identical to Reviter's preparation function. */
export function nativeCirculationGeometryKey(data: IndoorDataset): string {
  return routingCalculationValue(data, "native-circulation-binding", () =>
    JSON.stringify([
      data.source.modelSha256,
      data.records.map((r) => [
        r.key,
        r.levelId,
        r.elevationFeet,
        r.circulation,
        r.stair,
        r.walkable,
        r.access,
        r.ringsFeet,
        r.properties.floorOpeningsFeet,
        r.properties.spaceUse,
        r.properties.stairAccess,
      ]),
      data.walls,
      data.doors,
      data.walkingSupport,
    ]),
  );
}
export function nativeCirculationCells(
  data: IndoorDataset,
): NativeCirculationCell[] {
  const prepared = data.circulationGeometry;
  if (
    !prepared ||
    prepared.version !== 1 ||
    prepared.sourceModelSha256 !== data.source.modelSha256 ||
    prepared.sourceGeometryKey !== nativeCirculationGeometryKey(data)
  )
    return [];
  return prepared.cells;
}
/** A semantic record can identify several disconnected native cells. Preserve
 * all physical parts; never join them with a hull or a bounding rectangle. */
export function nativeCirculationSurfaces(
  data: IndoorDataset,
  records: IndoorRecord[],
) {
  const keys = new Set(records.filter((r) => r.circulation).map((r) => r.key));
  const cells = nativeCirculationCells(data).filter(
    (c) =>
      c.roomKeys.some((k) => keys.has(k)) &&
      records.some(
        (r) =>
          c.roomKeys.includes(r.key) &&
          Math.abs(c.elevationFeet - r.elevationFeet) < 0.05 &&
          c.levelIds.includes(r.levelId),
      ),
  );
  const valid =
    data.circulationGeometry?.sourceGeometryKey ===
      nativeCirculationGeometryKey(data) &&
    data.circulationGeometry.sourceModelSha256 === data.source.modelSha256;
  const reviewSurfaces = valid
    ? (data.circulationGeometry?.reviewSurfaces ?? []).filter((s) =>
        keys.has(s.roomKey),
      )
    : [];
  const covered = new Set(
    valid && data.circulationGeometry?.preparedRoomKeys
      ? data.circulationGeometry.preparedRoomKeys.filter((k) => keys.has(k))
      : cells.flatMap((c) => c.roomKeys),
  );
  return {
    cells,
    covered,
    reviewSurfaces,
    fixtures: valid
      ? (data.circulationGeometry?.fixtures ?? []).filter((f) =>
          records.some(
            (r) =>
              f.levelIds.includes(r.levelId) &&
              Math.abs(r.elevationFeet - f.elevationFeet) < 0.05,
          ),
        )
      : [],
    rings: [
      ...cells.map((c) => c.ringsFeet),
      ...reviewSurfaces.map((s) => s.ringsFeet),
      ...records
        .filter((r) => !r.circulation || !covered.has(r.key))
        .map((r) => r.ringsFeet),
    ],
  };
}

const insideRing = (p: number[], ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t =
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
    if (
      t >= 0 &&
      t <= 1 &&
      Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 1e-6
    )
      return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + (dx * (p[1] - a[1])) / dy)
      inside = !inside;
  }
  return inside;
};

type Bounds = [number, number, number, number];
type IndexedRing = { points: number[][]; bounds: Bounds };
type IndexedSurface = { z: number; rings: IndexedRing[]; bounds: Bounds };
const ringBounds = (points: number[][]): Bounds => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  return [minX, minY, maxX, maxY];
};
const overlaps = (a: Bounds, b: Bounds) =>
  a[0] <= b[2] + 1e-6 &&
  a[2] >= b[0] - 1e-6 &&
  a[1] <= b[3] + 1e-6 &&
  a[3] >= b[1] - 1e-6;
const inBounds = (p: number[], b: Bounds) =>
  p[0] >= b[0] - 1e-6 &&
  p[0] <= b[2] + 1e-6 &&
  p[1] >= b[1] - 1e-6 &&
  p[1] <= b[3] + 1e-6;
const containsRing = (p: number[], r: IndexedRing) =>
  inBounds(p, r.bounds) && insideRing(p, r.points);
const supportedNativePoint = (p: number[], surfaces: IndexedSurface[]) =>
  surfaces.some(
    (s) =>
      containsRing(p, s.rings[0]) &&
      !s.rings.slice(1).some((h) => containsRing(p, h)),
  );

/** Existing source walks cannot override a regenerated physical floor boundary.
 * Test every interval cut by a polygon edge, so even a thin fixture is a veto. */
export function nativeCirculationWalkBlockers(
  data: IndoorDataset,
): Set<string> {
  const cells = nativeCirculationCells(data),
    prepared = data.circulationGeometry;
  const blocked = new Set<string>();
  if (
    !prepared?.preparedRoomKeys ||
    prepared.sourceGeometryKey !== nativeCirculationGeometryKey(data) ||
    prepared.sourceModelSha256 !== data.source.modelSha256
  )
    return blocked;
  const keys = new Set(prepared.preparedRoomKeys);
  const doorApproaches = createNativeDoorApproachQuery(data);
  const surfaces = [
    ...cells.map((c) => ({ z: c.elevationFeet, rings: c.ringsFeet })),
    ...(prepared.reviewSurfaces ?? []).map((s) => ({
      z: s.elevationFeet,
      rings: s.ringsFeet,
    })),
  ].map((surface): IndexedSurface => {
    const rings = surface.rings.map((points) => ({
      points,
      bounds: ringBounds(points),
    }));
    return { z: surface.z, rings, bounds: rings[0].bounds };
  });
  for (const edge of data.edges) {
    if (
      edge.kind !== "walk" ||
      edge.nativeCellId ||
      edge.roomKeys.length === 0 ||
      !edge.roomKeys.every((k) => keys.has(k))
    )
      continue;
    const approachSurfaces = doorApproaches(edge).map(
      (surface): IndexedSurface => {
        const rings = surface.rings.map((points) => ({
          points,
          bounds: ringBounds(points),
        }));
        return { z: surface.z, rings, bounds: rings[0].bounds };
      },
    );
    for (let i = 1; i < edge.pointsFeet.length; i++) {
      const a = edge.pointsFeet[i - 1],
        b = edge.pointsFeet[i];
      const segmentBounds: Bounds = [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
      ];
      // Bounds only reject irrelevant geometry. The exact boundary cuts and
      // interval checks below still veto gaps and arbitrarily thin obstacles.
      const local = [...surfaces, ...approachSurfaces].filter(
        (s) =>
          Math.abs(s.z - a[2]) < 0.05 &&
          Math.abs(s.z - b[2]) < 0.05 &&
          overlaps(s.bounds, segmentBounds),
      );
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        cuts = [0, 1];
      for (const surface of local)
        for (const indexed of surface.rings.filter((r) =>
          overlaps(r.bounds, segmentBounds),
        ))
          for (let j = 0; j < indexed.points.length; j++) {
            const p = indexed.points[j],
              q = indexed.points[(j + 1) % indexed.points.length],
              ex = q[0] - p[0],
              ey = q[1] - p[1],
              den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-12) continue;
            const ox = p[0] - a[0],
              oy = p[1] - a[1],
              t = (ox * ey - oy * ex) / den,
              u = (ox * dy - oy * dx) / den;
            if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
          }
      cuts.sort((x, y) => x - y);
      if (
        !supportedNativePoint(a, local) ||
        !supportedNativePoint(b, local) ||
        cuts
          .slice(1)
          .some(
            (t, j) =>
              t - cuts[j] > 1e-9 &&
              !supportedNativePoint(
                [
                  a[0] + (dx * (t + cuts[j])) / 2,
                  a[1] + (dy * (t + cuts[j])) / 2,
                ],
                local,
              ),
          )
      ) {
        blocked.add(edge.id);
        break;
      }
    }
  }
  return blocked;
}
