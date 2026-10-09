import pc from "polygon-clipping";
import { stableWallGeometry } from "./stable-wall-geometry";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import { floorHeightDatum } from "./relative-heights";
import { EXPOSED_WALL_HEIGHT_METRES } from "./display-geometry";
export type WindowExportMode = "native" | "simplified";
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
const ring = (r: number[][]) =>
  Array.isArray(r) &&
  r.length >= 3 &&
  r.length <= 1000 &&
  r.every(
    (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
  );
export function validateNativeWindowDisplay(data: IndoorDataset) {
  const d = data.windowDisplay;
  if (d === undefined) return;
  const level = new Set(data.nativeLevels.map((l) => l.id));
  const heights = (e: {
    baseElevationFeet: number;
    topElevationFeet: number;
    assemblyTopElevationFeet: number;
  }) =>
    [e.baseElevationFeet, e.topElevationFeet, e.assemblyTopElevationFeet].every(
      Number.isFinite,
    ) &&
    e.topElevationFeet > e.baseElevationFeet &&
    e.assemblyTopElevationFeet >= e.baseElevationFeet;
  if (
    !d ||
    d.version !== 1 ||
    d.sourceModelSha256 !== data.source.modelSha256 ||
    !["native", "simplified"].includes(d.mode) ||
    d.routing !== "original-barriers" ||
    !Array.isArray(d.elements) ||
    d.elements.length > 100000 ||
    !Array.isArray(d.wallCuts) ||
    d.wallCuts.length > 20000 ||
    !Array.isArray(d.unresolvedNativeElementIds) ||
    d.unresolvedNativeElementIds.length > 100000 ||
    !d.unresolvedNativeElementIds.every(positive)
  )
    throw new Error("Invalid native window display evidence.");
  const ids = new Set<string>();
  for (const e of d.elements) {
    const id = e.levelId + ":" + e.nativeElementId;
    if (
      !positive(e.nativeElementId) ||
      !positive(e.hostId) ||
      !level.has(e.levelId) ||
      ids.has(id) ||
      !["glazing", "frame", "opaque-panel", "unknown-panel"].includes(e.role) ||
      !["native-material", "category-or-type"].includes(e.materialEvidence) ||
      !ring(e.footprintFeet) ||
      !heights(e) ||
      (e.transparency !== undefined &&
        (!Number.isFinite(e.transparency) ||
          e.transparency < 0 ||
          e.transparency > 1)) ||
      (e.materialId !== undefined && !positive(e.materialId)) ||
      (e.materialColorSrgb !== undefined &&
        (!Array.isArray(e.materialColorSrgb) ||
          e.materialColorSrgb.length !== 3 ||
          !e.materialColorSrgb.every(
            (c) => Number.isInteger(c) && c >= 0 && c <= 255,
          )))
    )
      throw new Error("Invalid native window member.");
    ids.add(id);
  }
  for (const c of d.wallCuts)
    if (
      !positive(c.hostId) ||
      !positive(c.nativeWallId) ||
      !level.has(c.levelId) ||
      !heights(c) ||
      !Array.isArray(c.ringsFeet) ||
      !c.ringsFeet.length ||
      !c.ringsFeet.every(ring) ||
      !data.walls.some(
        (w) =>
          w.levelId === c.levelId &&
          w.nativeElementId === c.nativeWallId &&
          !w.approximate &&
          JSON.stringify(w.ringsFeet) === c.wallGeometryKey,
      )
    )
      throw new Error("Native window opening has stale wall evidence.");
}
export function withWindowExportMode(
  data: IndoorDataset,
  mode: WindowExportMode,
) {
  validateNativeWindowDisplay(data);
  if (mode === "native" && !data.windowDisplay?.elements.length)
    throw new Error(
      "Native window evidence is missing. Prepare this master in Reviter before exporting preserved windows.",
    );
  const next = structuredClone(data);
  if (next.windowDisplay) next.windowDisplay.mode = mode;
  return next;
}
/** Only the explicit native-window comparison omits a proven complete curtain
 * envelope. Do this before merging wall faces: cutting the merged facade cannot
 * distinguish the oversized host margins from the real sill and head material.
 * The returned display input shares all original navigation/source collections.
 */
export function nativeWindowDisplayInput(data: IndoorDataset): IndoorDataset {
  // Strict sections already carry measured retained wall/window material.
  // Legacy comparison heuristics must not alter their original owner inventory
  // or the source binding used by exact aperture/material queries.
  if (data.nativeIndoorEnvelopes && data.nativeMaterialSections) return data;
  const detail = data.windowDisplay;
  if (
    detail?.mode !== "native" ||
    detail.sourceModelSha256 !== data.source.modelSha256
  )
    return data;
  const key = (levelId: number, id: number) => `${levelId}:${id}`;
  const walls = new Map(
    data.walls.map((w) => [key(w.levelId, w.nativeElementId), w]),
  );
  const members = new Map<string, typeof detail.elements>();
  for (const e of detail.elements) {
    const k = key(e.levelId, e.hostId);
    const group = members.get(k) ?? [];
    group.push(e);
    members.set(k, group);
  }
  const omitted = new Set<string>();
  const area = (parts: pc.MultiPolygon) =>
    parts.reduce(
      (total, p) =>
        total +
        p.reduce(
          (sum, r, i) =>
            sum +
            ((i ? -1 : 1) *
              Math.abs(
                r.reduce((a, q, j) => {
                  const t = r[(j + 1) % r.length];
                  return a + q[0] * t[1] - t[0] * q[1];
                }, 0),
              )) /
              2,
          0,
        ),
      0,
    );
  for (const cut of detail.wallCuts) {
    const hostKey = key(cut.levelId, cut.hostId);
    const host = walls.get(hostKey);
    const facade = walls.get(key(cut.levelId, cut.nativeWallId));
    const group = members.get(hostKey);
    if (
      !host?.approximate ||
      host.kind === "column" ||
      host.ringsFeet.length !== 1 ||
      new Set(host.ringsFeet[0].map((p) => p.join(","))).size !== 4 ||
      !facade ||
      facade.approximate ||
      JSON.stringify(facade.ringsFeet) !== cut.wallGeometryKey ||
      detail.unresolvedNativeElementIds.includes(cut.hostId) ||
      !group?.some((e) => e.role !== "frame")
    )
      continue;
    try {
      // A reviewed cut certifies complete persisted assembly membership. Still
      // reject changed host/member geometry rather than discarding its fallback.
      const precise = group.map((e) => [e.footprintFeet]);
      if (
        precise.some((p) => area(pc.difference(p, host.ringsFeet)) > 0.005) ||
        area(pc.difference(cut.ringsFeet, facade.ringsFeet)) > 0.005
      )
        continue;
      omitted.add(hostKey);
      for (const e of group) {
        const k = key(e.levelId, e.nativeElementId),
          duplicate = walls.get(k);
        if (
          duplicate?.kind === "wall" &&
          area(pc.xor(duplicate.ringsFeet, [e.footprintFeet])) < 0.005
        )
          omitted.add(k);
      }
    } catch {
      // Ambiguous or malformed evidence retains the original opaque fallback.
    }
  }
  return omitted.size
    ? {
        ...data,
        walls: data.walls.filter(
          (w) => !omitted.has(key(w.levelId, w.nativeElementId)),
        ),
      }
    : data;
}
/** Display comparison only: floors, rooms, source barriers and graph are unchanged. */
export function nativeWindowGeometry(
  data: IndoorDataset,
  levelIds: readonly number[],
  building: string,
  relative = false,
) {
  const detail = data.windowDisplay,
    active = detail?.mode === "native";
  const datum = floorHeightDatum(data, levelIds),
    levels = new Map(data.nativeLevels.map((l) => [l.id, l.elevationFeet]));
  const heights = (c: {
    levelId: number;
    baseElevationFeet: number;
    topElevationFeet: number;
    assemblyTopElevationFeet: number;
  }) => {
    const floor = levels.get(c.levelId) ?? datum;
    const scale =
      EXPOSED_WALL_HEIGHT_METRES /
      Math.max(0.1, c.assemblyTopElevationFeet - floor);
    const base = relative
      ? (floor - datum) * data.alignment.verticalMetresPerFoot
      : 0;
    return {
      base: base + Math.max(0, c.baseElevationFeet - floor) * scale,
      height: base + Math.max(0, c.topElevationFeet - floor) * scale,
    };
  };
  const records = data.records.filter(
    (r) => building === "all" || r.building === building,
  );
  const roomBounds = records.map((r) => {
    const q = r.ringsFeet.flat();
    return {
      levelId: r.levelId,
      b: [
        Math.min(...q.map((p) => p[0])) - 8,
        Math.min(...q.map((p) => p[1])) - 8,
        Math.max(...q.map((p) => p[0])) + 8,
        Math.max(...q.map((p) => p[1])) + 8,
      ],
    };
  });
  const visible = (id: number, rings: number[][][]) => {
    if (!levelIds.includes(id)) return false;
    if (building === "all" || data.nativeIndoorEnvelopes) return true;
    const q = rings.flat(),
      b = [
        Math.min(...q.map((p) => p[0])),
        Math.min(...q.map((p) => p[1])),
        Math.max(...q.map((p) => p[0])),
        Math.max(...q.map((p) => p[1])),
      ];
    return roomBounds.some(
      (r) =>
        r.levelId === id &&
        r.b[0] <= b[2] &&
        r.b[2] >= b[0] &&
        r.b[1] <= b[3] &&
        r.b[3] >= b[1],
    );
  };
  const features: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: active
      ? detail.elements
          .filter((e) => visible(e.levelId, [e.footprintFeet]))
          .map((e) => ({
            type: "Feature",
            properties: {
              nativeElementId: e.nativeElementId,
              hostId: e.hostId,
              levelId: e.levelId,
              role: e.role,
              atPlanCut:
                e.baseElevationFeet - 0.1 <= (levels.get(e.levelId) ?? 0) + 4 &&
                e.topElevationFeet + 0.1 >= (levels.get(e.levelId) ?? 0) + 4,
              ...heights(e),
              nativeWindowColor: e.materialColorSrgb
                ? "#" +
                  e.materialColorSrgb
                    .map((c) => c.toString(16).padStart(2, "0"))
                    .join("")
                : e.role === "glazing"
                  ? "#88ccdf"
                  : e.role === "frame"
                    ? "#586973"
                    : "#a3a3a0",
              opacity: e.role === "glazing" ? 1 - (e.transparency ?? 0.6) : 1,
            },
            geometry: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [...e.footprintFeet, e.footprintFeet[0]].map((p) =>
                    geographicPoint(data, p),
                  ),
                ],
              ],
            },
          }))
      : [],
  };
  const bounds = (points: number[][]) =>
    points.reduce(
      (b, p) => [
        Math.min(b[0], p[0]),
        Math.min(b[1], p[1]),
        Math.max(b[2], p[0]),
        Math.max(b[3], p[1]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
  const cuts = active
    ? detail.wallCuts
        .filter((c) => visible(c.levelId, c.ringsFeet))
        .map((c) => ({
          ...c,
          ...heights(c),
          coordinates: c.ringsFeet.map((r) =>
            r.map((p) => geographicPoint(data, p)),
          ),
          bounds: bounds(
            c.ringsFeet.flat().map((p) => geographicPoint(data, p)),
          ),
        }))
    : [];
  const cutWalls = (
    walls: FeatureCollection<MultiPolygon>,
    three: boolean,
  ): FeatureCollection<MultiPolygon> => {
    if (data.nativeIndoorEnvelopes || !cuts.length) return walls;
    return stableWallGeometry({
      ...walls,
      features: stableWallGeometry(walls).features.flatMap((f) => {
        const box = bounds(f.geometry.coordinates.flat(2));
        const matched = cuts.filter(
          (c) =>
            c.levelId === Number(f.properties?.levelId) &&
            c.bounds[0] <= box[2] &&
            c.bounds[2] >= box[0] &&
            c.bounds[1] <= box[3] &&
            c.bounds[3] >= box[1],
        );
        if (!matched.length) return [f];
        const base = Number(f.properties?.base ?? 0),
          top = Number(f.properties?.height ?? EXPOSED_WALL_HEIGHT_METRES);
        const stops = three
          ? [
              ...new Set([
                base,
                top,
                ...matched
                  .flatMap((c) => [c.base, c.height])
                  .filter((z) => z > base && z < top),
              ]),
            ].sort((a, b) => a - b)
          : [base, top];
        return stops.slice(0, -1).flatMap((lo, i) => {
          const hi = stops[i + 1]!,
            z = (lo + hi) / 2;
          const ms = matched.filter(
            (c) => !three || (c.base <= z && c.height >= z),
          );
          if (!ms.length)
            return [
              { ...f, properties: { ...f.properties, base: lo, height: hi } },
            ];
          try {
            // Affine local coordinates avoid clipping cancellation at large WGS84 offsets.
            const o = data.alignment.originGeographic;
            const local = (p: number[]): pc.Pair => [
              (p[0] - o[0]) * 100000,
              (p[1] - o[1]) * 100000,
            ];
            const poly = (p: number[][][]) => p.map((r) => r.map(local));
            const parts = pc.difference(
              f.geometry.coordinates.map(poly),
              ...ms.map((c) => poly(c.coordinates)),
            );
            const coordinates = parts.map((p) =>
              p.map((r) =>
                r.map((q) => [q[0] / 100000 + o[0], q[1] / 100000 + o[1]]),
              ),
            );
            return coordinates.length
              ? [
                  {
                    ...f,
                    properties: { ...f.properties, base: lo, height: hi },
                    geometry: { ...f.geometry, coordinates },
                  },
                ]
              : [];
          } catch {
            return [
              { ...f, properties: { ...f.properties, base: lo, height: hi } },
            ];
          }
        });
      }),
    });
  };
  return { features, cutWalls };
}
