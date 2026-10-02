import polygonClipping from "polygon-clipping";
import type { FeatureCollection, Polygon, MultiPolygon, Point } from "geojson";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { geographicPoint } from "./routing";
import { wallRoomBoundaries } from "./wall-room-boundaries";
import { wallJunctionPatches } from "./wall-junctions";
import {
  projectPlaceColor,
  projectPlaceDisplayName,
  projectPlaceMetadata,
  projectPlaceCategory,
} from "./visitor-metadata";

import {
  isDisplayPassage,
  isRoomSizedWallEnvelope,
  isPassThroughPlace,
  vestibuleDoorIds,
  HALLWAY_COLOR,
} from "./display-passages";
import { ROOM_DETAIL_ZOOM } from "./zoom-presentation";
import { circulationThresholds } from "./circulation-thresholds";
import { nativeCirculationSurfaces } from "./native-circulation";

type Ring = [number, number][];
type Rings = Ring[];
const close = (ring: Ring): Ring => [...ring, ring[0]];
const bounds = (rings: Rings) => {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings)
    for (const [x, y] of ring) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  return box;
};
const intersects = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const segmentDistance = (
  point: [number, number],
  a: [number, number],
  b: [number, number],
) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
        (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
};

const touches = (a: Ring, b: Ring) =>
  a.some((point) =>
    b.some(
      (start, i) =>
        segmentDistance(point, start, b[(i + 1) % b.length]) <= 0.05,
    ),
  );

// A roof's outer edges bound its continuation through solid column material.
// The hull is never used to add free floor space: every addition is clipped to
// the actual native column first.
function roofHull(parts: Rings[]): Rings {
  const points = parts
    .flatMap((part) => part[0])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (list: Ring) => {
    const hull: Ring = [];
    for (const point of list) {
      while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), point) <= 0)
        hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [close([...half(points), ...half([...points].reverse())])];
}
/** Continue a straight wall through a touching hidden pillar, using only the
 * wall's existing thickness and the pillar's actual footprint. Display only. */
export function pillarWallContinuation(wall: Rings, pillar: Rings): Rings[] {
  const ring = wall[0];
  if (ring.length !== 4) return [];
  let length = 0,
    axis: [number, number] = [1, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > length) {
      length = d;
      axis = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
    }
  }
  const project = ([x, y]: [number, number]): [number, number] => [
    x * axis[0] + y * axis[1],
    -x * axis[1] + y * axis[0],
  ];
  const restore = ([u, v]: [number, number]): [number, number] => [
    u * axis[0] - v * axis[1],
    u * axis[1] + v * axis[0],
  ];
  const w = bounds([ring.map((point) => project(point))]),
    p = bounds(pillar.map((r) => r.map((point) => project(point))));
  const thickness = w[3] - w[1];
  if (
    thickness <= 0 ||
    thickness > 2 ||
    length < thickness * 3 ||
    !intersects(
      w.map((n, i) => n + (i < 2 ? -0.05 : 0.05)),
      p,
    )
  )
    return [];
  // Reject merely overlapping bounding boxes on diagonal or mitered ends.
  try {
    if (
      !touches(ring, pillar[0]) &&
      !touches(pillar[0], ring) &&
      polygonClipping.intersection(wall, pillar).length === 0
    )
      return [];
    const strip: Ring = [
      [p[0], w[1]],
      [p[2], w[1]],
      [p[2], w[3]],
      [p[0], w[3]],
    ].map((point) => restore(point as [number, number]));
    return polygonClipping.intersection(pillar, [strip]);
  } catch {
    return [];
  }
}
export const ROOM_BLOCK_HEIGHT_METRES = 0.6;
// Quantized vector tiles can leave coincident edges even after exact footprint
// subtraction. Separate wall tops by 1 cm so the depth buffer never alternates
// between a wall and an adjacent room roof while the camera moves.
export const EXPOSED_WALL_HEIGHT_METRES = 0.61;

const isOpenDrop = (r: IndoorRecord) =>
  !r.walkable &&
  /open drop|open to (?:below|lower)/i.test(String(r.properties.notes ?? ""));

// These bands can claim only existing native wall material. They never expand
// a room into free floor space, circulation or a floor opening.
function boundaryBands(rings: Rings): Rings[] {
  const reach = 3;
  return rings.flatMap((ring) =>
    ring.flatMap((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!length) return [];
      const dx = ((b[0] - a[0]) / length) * reach;
      const dy = ((b[1] - a[1]) / length) * reach;
      return [
        [
          close([
            [a[0] - dy - dx, a[1] + dx - dy],
            [b[0] - dy + dx, b[1] + dx + dy],
            [b[0] + dy + dx, b[1] - dx + dy],
            [a[0] + dy - dx, a[1] - dx - dy],
          ]),
        ],
      ];
    }),
  );
}
/** Remove roof-owned wall material independently per wall component. A remote
 * malformed roof must not restore coplanar walls underneath every other room. */
function subtractDisplayMasks(
  walls: Rings[],
  roofs: Rings[],
  retainUncertain: boolean,
): Rings[] {
  const indexed = roofs.map((rings) => ({ rings, box: bounds(rings) }));
  const precise = (parts: Rings[]): Rings[] =>
    parts.flatMap((rings) => {
      const cleaned = rings.map((ring) => {
        const rounded = ring.map(
          ([x, y]) =>
            [
              Math.round(x * 1_000_000) / 1_000_000,
              Math.round(y * 1_000_000) / 1_000_000,
            ] as [number, number],
        );
        return rounded.filter(
          (point, i) =>
            i === 0 ||
            point[0] !== rounded[i - 1][0] ||
            point[1] !== rounded[i - 1][1],
        );
      });
      if (new Set(cleaned[0].map((point) => point.join(","))).size < 3)
        return [];
      return [
        [
          cleaned[0],
          ...cleaned
            .slice(1)
            .filter(
              (ring) => new Set(ring.map((point) => point.join(","))).size >= 3,
            ),
        ],
      ];
    });
  return walls.flatMap((wall) => {
    const box = bounds(wall);
    const nearby = indexed
      .filter((roof) => intersects(box, roof.box))
      .map((roof) => roof.rings);
    if (nearby.length === 0) return [wall];
    try {
      return polygonClipping.difference(wall, nearby);
    } catch {
      // One millionth of a foot removes floating-point duplicate vertices only;
      // it cannot close any meaningful wall gap, door or floor opening.
      try {
        const subject = precise([wall]);
        return subject.length > 0
          ? polygonClipping.difference(subject, precise(nearby))
          : [];
      } catch {
        // Preserve only this uncertain component, never all floor walls.
        return retainUncertain ? [wall] : [];
      }
    }
  });
}
export function subtractRoomRoofsFromWalls(
  walls: Rings[],
  roofs: Rings[],
): Rings[] {
  return subtractDisplayMasks(walls, roofs, true);
}
const polygonArea = (rings: Rings) =>
  rings.reduce((sum, ring, i) => {
    const [ox, oy] = ring[0];
    const signed = ring.reduce((total, p, j) => {
      const q = ring[(j + 1) % ring.length];
      return total + (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy);
    }, 0);
    return sum + ((i ? -1 : 1) * Math.abs(signed)) / 2;
  }, 0);
export function roomDisplayColor(r: IndoorRecord, selected: boolean): string {
  if (selected) return "#ffe09d";
  if (!r.walkable) return "#ffffff";
  if (r.stair && !r.circulation) return "#cfd9e4";
  if (isDisplayPassage(r)) return HALLWAY_COLOR;
  if (r.access === "staff") return "#dce1e6";

  if (/washroom|toilet|\bwc\b|all gender/i.test(r.name)) return "#bce7f1";
  if (/library|study|reading/i.test(r.name)) return "#b8d5a5";
  if (/class|lecture|seminar|meeting|hall\b/i.test(r.name)) return "#eee7d5";
  return "#f5f5f4";
}

/** Display-only subtraction of recovered door footprints. Never changes rooms or graph. */
export type ProjectDisplayGeometry = {
  areas: FeatureCollection<MultiPolygon>;
  walls: FeatureCollection<MultiPolygon>;
  roomBlocks: FeatureCollection<MultiPolygon>;
  exposedWalls: FeatureCollection<MultiPolygon>;
  doorFootprints: FeatureCollection<Polygon>;
  doorMarkers: FeatureCollection<Point>;
  records: IndoorRecord[];
  uncutSurfaces: number;
  lowerRooms: FeatureCollection<MultiPolygon>;
  lowerWalls: FeatureCollection<MultiPolygon>;
  lowerOpenings: FeatureCollection<MultiPolygon>;
  labels: FeatureCollection<Point>;
};

export function projectDisplayGeometry(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  selected = "",
  showPillars = false,
  includeLowerFloors = true,
  showPassThroughPlaces = false,
  showVestibuleDoors = false,
  physicalWalls?: Set<IndoorDataset["walls"][number]>,
): ProjectDisplayGeometry {
  // A room/wall is queried repeatedly while carving roofs and thresholds.
  // Keep this cache local: edits between invocations must see new coordinates.
  const boxes = new WeakMap<Rings, number[]>();
  const getBounds = bounds;
  const cachedBounds = (rings: Rings) => {
    let box = boxes.get(rings);
    if (!box) {
      box = getBounds(rings);
      boxes.set(rings, box);
    }
    return box;
  };
  const records = data.records.filter(
    (r) =>
      levelIds.includes(r.levelId) &&
      (building === "all" || r.building === building),
  );
  const prepared = new Map(
    (data.presentation?.rooms ?? []).map((room) => [room.roomKey, room]),
  );
  const boundaries = wallRoomBoundaries(
    data,
    records.filter((r) => !prepared.has(r.key)),
  );
  const boundarySource = (key: string) => {
    if (prepared.has(key)) {
      const source = prepared.get(key)!.boundarySource;
      if (source === "revit-finish-face") return "prepared-revit-finish-face";
      if (source === "registered-source-wall-enclosure")
        return "prepared-registered-source-walls";
      if (source === "source-backed-native-wall-enclosure")
        return "prepared-source-backed-native-walls";
      return "prepared-native-walls";
    }
    return boundaries.has(key) ? "native-walls" : "source-footprint";
  };
  const displayRecords = records.map((r) => ({
    ...r,
    circulation: isDisplayPassage(r),
    ringsFeet:
      prepared.get(r.key)?.interiorRingsFeet ??
      boundaries.get(r.key) ??
      r.ringsFeet,
  }));
  const keys = new Set(records.map((r) => r.key));
  const recordBounds = records.map((r) => ({
    levelId: r.levelId,
    box: cachedBounds(r.ringsFeet),
  }));
  const inBuilding = (levelId: number, box: number[]) =>
    building === "all" ||
    recordBounds.some((r) => r.levelId === levelId && intersects(r.box, box));
  const doors = (data.doors ?? []).filter(
    (d) =>
      levelIds.includes(d.levelId) &&
      (d.roomKeys.some((k) => keys.has(k)) ||
        inBuilding(
          d.levelId,
          cachedBounds([d.footprintFeet ?? [d.pointFeet]]),
        )),
  );
  // Compute bounds once per wall, rather than once per door/wall pair. Keep
  // native element identities so a door still cuts copies on split levels.
  const wallsByLevel = new Map<
    number,
    { wall: IndoorDataset["walls"][number]; box: number[] }[]
  >();
  const wallLevelsByElement = new Map<
    IndoorDataset["walls"][number]["nativeElementId"],
    Set<number>
  >();
  for (const wall of data.walls) {
    const entries = wallsByLevel.get(wall.levelId) ?? [];
    entries.push({ wall, box: cachedBounds(wall.ringsFeet) });
    wallsByLevel.set(wall.levelId, entries);
    const levels = wallLevelsByElement.get(wall.nativeElementId) ?? new Set();
    levels.add(wall.levelId);
    wallLevelsByElement.set(wall.nativeElementId, levels);
  }
  const cutters = doors
    .filter((d) => d.footprintFeet)
    .map((d) => ({
      levelId: d.levelId,
      // One physical wall element can be repeated on the native split levels
      // grouped into a campus floor. Its door must cut every copy of that wall.
      wallLevels: (() => {
        const doorBox = cachedBounds([d.footprintFeet!]);
        const hosts = new Set(
          (wallsByLevel.get(d.levelId) ?? [])
            .filter(({ wall, box }) => {
              if (!intersects(box, doorBox)) return false;
              try {
                return (
                  polygonClipping.intersection(wall.ringsFeet, [
                    close(d.footprintFeet!),
                  ]).length > 0
                );
              } catch {
                return false;
              }
            })
            .map(({ wall }) => wall.nativeElementId),
        );
        return new Set([
          d.levelId,
          ...[...hosts].flatMap((id) => [
            ...(wallLevelsByElement.get(id) ?? []),
          ]),
        ]);
      })(),
      // Extend only across wall thickness; the measured clear width is kept.
      // Native door rectangles often stop partway through a wall face.
      rings: [
        close(
          d.footprintFeet!.map((p) => {
            const n = d.normalFeet;
            if (!n) return p;
            const side =
              (p[0] - d.pointFeet[0]) * n[0] + (p[1] - d.pointFeet[1]) * n[1];
            return [
              p[0] + Math.sign(side) * n[0],
              p[1] + Math.sign(side) * n[1],
            ] as [number, number];
          }),
        ),
      ],
      box: cachedBounds([d.footprintFeet!]).map((n, i) => n + (i < 2 ? -1 : 1)),
    }));
  let uncutSurfaces = 0;
  const cut = (rings: Rings, levelId: number, wall = false): Rings[] => {
    const box = cachedBounds(rings);
    const nearby = cutters.filter(
      (d) =>
        (wall ? d.wallLevels.has(levelId) : d.levelId === levelId) &&
        intersects(d.box, box),
    );
    if (nearby.length === 0) return [rings.map((ring) => close(ring))];
    try {
      return polygonClipping.difference(
        rings.map((ring) => close(ring)),
        ...nearby.map((d) => d.rings),
      );
    } catch {
      // Keep malformed source polygons visible; do not fabricate an aperture.
      uncutSurfaces++;
      return [rings.map((ring) => close(ring))];
    }
  };
  const polygon = (parts: Rings[]): MultiPolygon => ({
    type: "MultiPolygon",
    coordinates: parts.map((rings) =>
      rings.map((ring) => ring.map((p) => geographicPoint(data, p))),
    ),
  });
  const nativeCirculation = nativeCirculationSurfaces(data, records);
  const areas: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: displayRecords
      .filter((r) => !r.circulation || !nativeCirculation.covered.has(r.key))
      .map((r) => ({
        type: "Feature",
        id: r.key,
        properties: {
          key: r.key,
          building: r.building,
          name: r.number
            ? `${r.number}\n${projectPlaceDisplayName(data, r)}`
            : projectPlaceDisplayName(data, r),
          circulation: r.circulation,
          walkable: r.walkable,
          openDrop: isOpenDrop(r),
          access: r.access,
          selected: r.key === selected,
          passThrough: isPassThroughPlace(r),
          color:
            r.key === selected
              ? roomDisplayColor(r, true)
              : (projectPlaceColor(data, r) ?? roomDisplayColor(r, false)),
          boundarySource: boundarySource(r.key),
        },
        geometry: polygon(
          r.walkable && !r.circulation
            ? cut(r.ringsFeet, r.levelId)
            : [r.ringsFeet.map((ring) => close(ring))],
        ),
      })),
  };
  for (const cell of nativeCirculation.cells) {
    const owner =
      records.find(
        (r) => r.key === selected && cell.roomKeys.includes(r.key),
      ) ?? records.find((r) => cell.roomKeys.includes(r.key))!;
    areas.features.push({
      type: "Feature",
      id: cell.id,
      properties: {
        key: owner.key,
        roomKeys: cell.roomKeys,
        building: owner.building,
        circulation: true,
        walkable: true,
        openDrop: false,
        selected: cell.roomKeys.includes(selected),
        color: HALLWAY_COLOR,
        boundarySource: "prepared-native-circulation",
        nativeCellId: cell.id,
      },
      geometry: polygon([cell.ringsFeet]),
    });
  }
  for (const [i, surface] of nativeCirculation.reviewSurfaces.entries()) {
    const owner = records.find((r) => r.key === surface.roomKey)!;
    areas.features.push({
      type: "Feature",
      id: `native-review:${owner.key}:${i}`,
      properties: {
        key: owner.key,
        building: owner.building,
        circulation: true,
        walkable: true,
        openDrop: false,
        selected: owner.key === selected,
        color: HALLWAY_COLOR,
        boundarySource: "native-floor-clipped-review",
        needsReview: true,
      },
      geometry: polygon([surface.ringsFeet]),
    });
  }
  for (const threshold of circulationThresholds(data, records))
    areas.features.push({
      type: "Feature",
      id: `threshold:${threshold.id}`,
      properties: {
        key: threshold.owner.key,
        building: threshold.owner.building,
        circulation: true,
        walkable: true,
        openDrop: false,
        selected: false,
        color: HALLWAY_COLOR,
        boundarySource: "prepared-native-opening",
        openingId: threshold.id,
      },
      geometry: polygon(threshold.parts),
    });
  // Merge actual wall faces before carving doors, removing overlapping extrusion
  // seams. Columns remain native routing obstacles even when hidden in this view.
  const wallFeatures: FeatureCollection<MultiPolygon>["features"] = [];
  const wallPartsByLevel = new Map<number, Rings[]>();
  const indexedWallPartsByLevel = new Map<
    number,
    { rings: Rings; box: number[] }[]
  >();
  const wallSurfacesByLevel = new Map<
    number,
    { rings: Rings; box: number[] }[]
  >();
  for (const levelId of levelIds) {
    const nativeWalls = data.walls.filter(
      (w) =>
        (!physicalWalls || physicalWalls.has(w)) &&
        w.levelId === levelId &&
        w.kind !== "column" &&
        !isRoomSizedWallEnvelope(w) &&
        inBuilding(w.levelId, cachedBounds(w.ringsFeet)),
    );
    // Bounds-only walls remain routing obstacles, but cannot establish a
    // finished room roof or an exact wall-sized extrusion in the visitor view.
    for (const w of data.walls.filter(
      (w) =>
        (!physicalWalls || physicalWalls.has(w)) &&
        w.levelId === levelId &&
        isRoomSizedWallEnvelope(w) &&
        w.kind !== "column" &&
        inBuilding(w.levelId, cachedBounds(w.ringsFeet)),
    )) {
      wallFeatures.push({
        type: "Feature",
        properties: {
          kind: "approximate-wall",
          levelId,
          nativeElementId: w.nativeElementId,
          approximate: true,
        },
        geometry: polygon(cut(w.ringsFeet, levelId, true)),
      });
    }
    const hiddenColumns = showPillars
      ? []
      : data.walls
          .filter(
            (w) =>
              (!physicalWalls || physicalWalls.has(w)) &&
              w.levelId === levelId &&
              w.kind === "column" &&
              inBuilding(w.levelId, cachedBounds(w.ringsFeet)),
          )
          .map((w) => ({ rings: w.ringsFeet, box: cachedBounds(w.ringsFeet) }));
    const surfaces = nativeWalls.flatMap((w) => {
      const box = cachedBounds(w.ringsFeet).map(
        (n, i) => n + (i < 2 ? -0.05 : 0.05),
      );
      return [
        w.ringsFeet.map((ring) => close(ring)),
        ...hiddenColumns
          .filter((p) => intersects(box, p.box))
          .flatMap((p) => pillarWallContinuation(w.ringsFeet, p.rings)),
      ];
    });
    surfaces.push(...wallJunctionPatches(nativeWalls).map((p) => p.rings));
    wallSurfacesByLevel.set(
      levelId,
      surfaces.map((rings) => ({ rings, box: cachedBounds(rings) })),
    );
    if (surfaces.length > 0) {
      let merged: Rings[];
      try {
        merged = polygonClipping.union(surfaces[0], ...surfaces.slice(1));
      } catch {
        merged = surfaces;
      }
      wallFeatures.push({
        type: "Feature",
        properties: { kind: "wall", levelId },
        geometry: polygon(merged.flatMap((rings) => cut(rings, levelId, true))),
      });
      wallPartsByLevel.set(levelId, merged);
      indexedWallPartsByLevel.set(
        levelId,
        merged.map((rings) => ({ rings, box: cachedBounds(rings) })),
      );
    }
    if (showPillars)
      for (const w of data.walls.filter(
        (w) =>
          (!physicalWalls || physicalWalls.has(w)) &&
          w.levelId === levelId &&
          w.kind === "column" &&
          inBuilding(w.levelId, cachedBounds(w.ringsFeet)),
      ))
        wallFeatures.push({
          type: "Feature",
          properties: {
            kind: "column",
            levelId,
            nativeElementId: w.nativeElementId,
          },
          geometry: polygon([w.ringsFeet.map((ring) => close(ring))]),
        });
  }
  const walls: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: wallFeatures,
  };
  const blockPartsByLevel = new Map<number, Rings[]>();
  // Reserve prepared material before processing legacy fallbacks, independent of key order.
  for (const r of displayRecords) {
    const parts = prepared.get(r.key)?.blockPartsFeet;
    if (parts && !r.circulation)
      blockPartsByLevel.set(r.levelId, [
        ...(blockPartsByLevel.get(r.levelId) ?? []),
        ...parts,
      ]);
  }
  const roofs = new Map<string, Rings[]>();
  const roomBlocks: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: displayRecords
      .filter((r) => r.walkable && !r.circulation && !isOpenDrop(r))
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => {
        const original = r.ringsFeet.map((ring) => close(ring));
        const roomBounds = cachedBounds(r.ringsFeet).map(
          (n, i) => n + (i < 2 ? -3 : 3),
        );
        let parts: Rings[] = [original];
        const preparedParts = prepared.get(r.key)?.blockPartsFeet;
        if (preparedParts)
          parts = preparedParts.flatMap((part) => cut(part, r.levelId, true));
        else
          try {
            const nearby = (wallSurfacesByLevel.get(r.levelId) ?? [])
              .filter((wall) => intersects(wall.box, roomBounds))
              .map((wall) => wall.rings);
            if (nearby.length > 0 && boundaries.has(r.key)) {
              const bands = boundaryBands(r.ringsFeet);
              const wallMaterial = polygonClipping.intersection(
                polygonClipping.union(nearby[0], ...nearby.slice(1)),
                polygonClipping.union(bands[0], ...bands.slice(1)),
              );
              if (wallMaterial.length > 0)
                parts = polygonClipping
                  .union(original, wallMaterial)
                  .filter(
                    (part) =>
                      polygonClipping.intersection(part, original).length > 0,
                  );
            }
            const protectedFloor = records
              .filter(
                (other) =>
                  other.levelId === r.levelId &&
                  (isDisplayPassage(other) || isOpenDrop(other)) &&
                  intersects(cachedBounds(other.ringsFeet), roomBounds),
              )
              .map((other) => other.ringsFeet.map((ring) => close(ring)));
            const holes = r.ringsFeet.slice(1).map((ring) => [close(ring)]);
            const claimed = (blockPartsByLevel.get(r.levelId) ?? []).filter(
              (parts) => intersects(cachedBounds(parts), roomBounds),
            );
            if (
              protectedFloor.length > 0 ||
              holes.length > 0 ||
              claimed.length > 0
            )
              parts = polygonClipping.difference(
                parts,
                ...protectedFloor,
                ...holes,
                ...claimed,
              );
            parts = parts.flatMap((rings) => cut(rings, r.levelId));
            if (!boundaries.has(r.key)) {
              // A coarse annotation has not proved which side of a wall belongs
              // to this room. Keep native walls visible and omit detached slivers.
              const nativeMaterial = [
                ...nearby,
                ...data.walls
                  .filter(
                    (wall) =>
                      wall.levelId === r.levelId &&
                      wall.kind === "column" &&
                      intersects(cachedBounds(wall.ringsFeet), roomBounds),
                  )
                  .map((wall) => wall.ringsFeet),
              ];
              parts = subtractDisplayMasks(parts, nativeMaterial, false)
                .sort((a, b) => polygonArea(b) - polygonArea(a))
                .slice(0, 1);
            }
          } catch {
            // Invalid boundaries retain the source footprint, never a guessed box.
            parts = cut(r.ringsFeet, r.levelId);
            if (!boundaries.has(r.key)) {
              const nativeMaterial = data.walls
                .filter(
                  (wall) =>
                    wall.levelId === r.levelId &&
                    intersects(cachedBounds(wall.ringsFeet), roomBounds),
                )
                .map((wall) => wall.ringsFeet);
              const protectedFloor = records
                .filter(
                  (other) =>
                    other.levelId === r.levelId &&
                    (isDisplayPassage(other) || isOpenDrop(other)) &&
                    intersects(cachedBounds(other.ringsFeet), roomBounds),
                )
                .map((other) => other.ringsFeet);
              const claimed = (blockPartsByLevel.get(r.levelId) ?? []).filter(
                (part) => intersects(cachedBounds(part), roomBounds),
              );
              const doorCuts = cutters
                .filter(
                  (door) =>
                    door.levelId === r.levelId &&
                    intersects(door.box, roomBounds),
                )
                .map((door) => door.rings);
              parts = subtractDisplayMasks(
                parts,
                [...nativeMaterial, ...protectedFloor, ...claimed, ...doorCuts],
                false,
              )
                .sort((a, b) => polygonArea(b) - polygonArea(a))
                .slice(0, 1);
            }
          }
        if (parts.length > 0) roofs.set(r.key, parts);
        if (!preparedParts)
          blockPartsByLevel.set(r.levelId, [
            ...(blockPartsByLevel.get(r.levelId) ?? []),
            ...parts,
          ]);
        return {
          type: "Feature" as const,
          id: r.key,
          properties: {
            key: r.key,
            color:
              r.key === selected
                ? roomDisplayColor(r, true)
                : (projectPlaceColor(data, r) ?? roomDisplayColor(r, false)),
            height: ROOM_BLOCK_HEIGHT_METRES,
            boundarySource: boundarySource(r.key),
          },
          geometry: polygon(parts),
        };
      }),
  };
  // Partition each hidden column by the continuation of all touching roofs,
  // independently of record/key order. Competing continuations stay neutral.
  const neutralColumns: FeatureCollection<MultiPolygon>["features"] = [];
  if (!showPillars) {
    const hulls = new Map(
      [...roofs].map(([key, parts]) => [key, roofHull(parts)]),
    );
    const additions = new Map<string, Rings[]>();
    for (const column of data.walls.filter(
      (w) => w.kind === "column" && levelIds.includes(w.levelId),
    )) {
      const box = cachedBounds(column.ringsFeet);
      try {
        const nearby = displayRecords.filter(
          (r) =>
            roofs.has(r.key) &&
            r.levelId === column.levelId &&
            intersects(cachedBounds(hulls.get(r.key)!), box),
        );
        const protectedFloor = records
          .filter(
            (other) =>
              other.levelId === column.levelId &&
              (isDisplayPassage(other) || isOpenDrop(other)) &&
              intersects(cachedBounds(other.ringsFeet), box),
          )
          .map((other) => other.ringsFeet);
        // Entirely column-shaped holes are solid recesses; broader floor/room
        // holes remain protected, including genuine atria touching a pillar.
        const holes = records
          .filter((other) => other.levelId === column.levelId)
          .flatMap((other) => other.ringsFeet.slice(1))
          .filter(
            (ring) =>
              intersects(cachedBounds([ring]), box) &&
              polygonClipping.difference([ring], column.ringsFeet).length > 0,
          )
          .map((ring) => [ring]);
        const doorCuts = cutters
          .filter((d) => d.levelId === column.levelId && intersects(d.box, box))
          .map((d) => d.rings);
        const candidates = nearby.flatMap((r) => {
          const parts = roofs.get(r.key)!;
          if (
            !parts.some(
              (part) =>
                touches(part[0], column.ringsFeet[0]) ||
                touches(column.ringsFeet[0], part[0]) ||
                polygonClipping.intersection(part, column.ringsFeet).length > 0,
            )
          )
            return [];
          let material = polygonClipping.intersection(
            column.ringsFeet,
            hulls.get(r.key)!,
          );
          const others = nearby
            .filter((other) => other.key !== r.key)
            .flatMap((other) => roofs.get(other.key)!);
          if (
            protectedFloor.length > 0 ||
            holes.length > 0 ||
            others.length > 0 ||
            doorCuts.length > 0
          )
            material = polygonClipping.difference(
              material,
              ...protectedFloor,
              ...holes,
              ...others,
              ...doorCuts,
            );
          return material.length > 0 ? [{ key: r.key, material }] : [];
        });
        const ambiguous: Rings[] = [];
        for (let i = 0; i < candidates.length; i++)
          for (let j = i + 1; j < candidates.length; j++)
            ambiguous.push(
              ...polygonClipping.intersection(
                candidates[i].material,
                candidates[j].material,
              ),
            );
        for (const candidate of candidates) {
          const unique =
            ambiguous.length > 0
              ? polygonClipping.difference(candidate.material, ambiguous)
              : candidate.material;
          additions.set(candidate.key, [
            ...(additions.get(candidate.key) ?? []),
            ...unique,
          ]);
        }
        // The unassigned remainder is still real solid column material. Keep
        // only attached, unprotected material as a neutral roof at wall height.
        const neutral =
          candidates.length > 0
            ? polygonClipping.difference(
                column.ringsFeet,
                ...nearby.flatMap((r) => roofs.get(r.key)!),
                ...(indexedWallPartsByLevel.get(column.levelId) ?? [])
                  .filter((wall) => intersects(wall.box, box))
                  .map((wall) => wall.rings),
                ...candidates.flatMap((candidate) =>
                  ambiguous.length > 0
                    ? polygonClipping.difference(candidate.material, ambiguous)
                    : candidate.material,
                ),
                ...protectedFloor,
                ...holes,
                ...doorCuts,
              )
            : [];
        if (neutral.length > 0)
          neutralColumns.push({
            type: "Feature",
            properties: {
              kind: "wall",
              levelId: column.levelId,
              nativeElementId: column.nativeElementId,
              hiddenColumnContinuation: true,
            },
            geometry: polygon(neutral),
          });
      } catch {
        /* Uncertain column continuation retains the existing roofs. */
      }
    }
    for (const feature of roomBlocks.features) {
      const key = String(feature.properties?.key),
        extra = additions.get(key);
      if (!extra?.length) continue;
      try {
        const parts = polygonClipping.union(roofs.get(key)!, extra);
        feature.geometry = polygon(parts);
        const levelId = displayRecords.find((r) => r.key === key)!.levelId;
        blockPartsByLevel.set(levelId, [
          ...(blockPartsByLevel.get(levelId) ?? []),
          ...extra,
        ]);
      } catch {
        /* Malformed roofs retain their original native footprint. */
      }
    }
  }
  for (const fixture of nativeCirculation.fixtures) {
    if (
      !levelIds.some((id) => fixture.levelIds.includes(id)) ||
      !inBuilding(fixture.levelIds[0], cachedBounds(fixture.ringsFeet))
    )
      continue;
    roomBlocks.features.push({
      type: "Feature",
      id: fixture.id,
      properties: {
        key: fixture.id,
        levelId: fixture.levelIds[0],
        nativeElementId: fixture.nativeElementId,
        color: "#e5e4df",
        height: ROOM_BLOCK_HEIGHT_METRES,
        selected: false,
        walkable: false,
        boundarySource: "prepared-native-fixture",
      },
      geometry: polygon([fixture.ringsFeet.map((ring) => close(ring))]),
    });
    // The architectural 2D review hides room extrusions, so give native fixtures
    // their own neutral ground footprint as well as a solid 3D cap.
    areas.features.push({
      ...roomBlocks.features.at(-1)!,
      properties: {
        ...roomBlocks.features.at(-1)!.properties,
        circulation: false,
        height: 0,
      },
    });
    for (const levelId of fixture.levelIds)
      blockPartsByLevel.set(levelId, [
        ...(blockPartsByLevel.get(levelId) ?? []),
        fixture.ringsFeet,
      ]);
  }
  // Remove wall material owned by a block so its roof has one colour and height,
  // with no raised perimeter shell or overlapping coplanar surfaces.
  const exposedWalls: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      ...wallFeatures.map((wall) => {
        if (wall.properties?.kind === "column" || wall.properties?.approximate)
          return wall;
        const levelId = Number(wall.properties?.levelId);
        const blocks = physicalWalls
          ? levelIds.flatMap((id) => blockPartsByLevel.get(id) ?? [])
          : (blockPartsByLevel.get(levelId) ?? []);
        try {
          const parts = (wallPartsByLevel.get(levelId) ?? []).flatMap((rings) =>
            cut(rings, levelId, true),
          );
          return {
            ...wall,
            geometry: polygon(
              blocks.length > 0
                ? subtractRoomRoofsFromWalls(parts, blocks)
                : parts,
            ),
          };
        } catch {
          return wall;
        }
      }),
      ...neutralColumns,
    ],
  };
  const hiddenDoors = showVestibuleDoors
    ? new Set<string>()
    : vestibuleDoorIds(data);
  const visibleDoors = doors.filter((door) => !hiddenDoors.has(door.id));
  const doorFootprints: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: visibleDoors.flatMap((d) =>
      d.footprintFeet
        ? [
            {
              type: "Feature" as const,
              properties: {
                id: d.id,
                nativeElementId: d.nativeElementId,
                state: d.state,
                color: d.state === "connected" ? "#bce7f1" : "#ffdca3",
              },
              geometry: {
                type: "Polygon" as const,
                coordinates: [
                  close(d.footprintFeet).map((p) => geographicPoint(data, p)),
                ],
              },
            },
          ]
        : [],
    ),
  };
  const doorMarkers: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: visibleDoors.map((d) => ({
      type: "Feature",
      properties: {
        id: d.id,
        nativeElementId: d.nativeElementId,
        kind: "door",
        enabled: data.edges.find((e) => e.id === d.id)?.enabled ?? false,
        review: d.state !== "connected",
      },
      geometry: {
        type: "Point",
        coordinates: geographicPoint(data, d.pointFeet),
      },
    })),
  };
  // Only existing floor/room holes and explicitly reviewed open drops reveal
  // another floor. Native column footprints are solid obstructions, not atria.
  const lowerFeatures: FeatureCollection<MultiPolygon>["features"] = [];
  const lowerWallFeatures: FeatureCollection<MultiPolygon>["features"] = [];
  const lowerOpeningFeatures: FeatureCollection<MultiPolygon>["features"] = [];
  const lowerBlockCache = new Map<
    string,
    ReturnType<typeof projectDisplayGeometry>
  >();
  for (const upper of includeLowerFloors ? records : []) {
    const openingRings = isOpenDrop(upper)
      ? [upper.ringsFeet[0]]
      : upper.ringsFeet.slice(1);
    if (openingRings.length === 0) continue;
    const columns = data.walls.filter(
      (wall) => wall.levelId === upper.levelId && wall.kind === "column",
    );
    const openings = openingRings.flatMap((ring) => {
      try {
        return polygonClipping.difference(
          [close(ring)],
          ...columns
            .filter((column) =>
              intersects(cachedBounds(column.ringsFeet), cachedBounds([ring])),
            )
            .map((column) => column.ringsFeet),
        );
      } catch {
        return []; // Uncertain apertures do not reveal a guessed floor.
      }
    });
    if (openings.length === 0) continue;
    const lower = data.records
      .filter(
        (r) =>
          r.building === upper.building &&
          r.walkable &&
          !isOpenDrop(r) &&
          !!r.surfaceId &&
          r.surfaceId !== upper.surfaceId &&
          Number.isFinite(r.elevationFeet) &&
          r.elevationFeet < upper.elevationFeet - 0.5 &&
          !levelIds.includes(r.levelId) &&
          openings.some((opening) =>
            intersects(
              cachedBounds(opening),
              cachedBounds(
                prepared.get(r.key)?.blockPartsFeet.flat() ?? r.ringsFeet,
              ),
            ),
          ),
      )
      .filter((r) => {
        try {
          const footprints = prepared.get(r.key)?.blockPartsFeet ?? [
            r.ringsFeet,
          ];
          return polygonClipping
            .intersection(footprints, openings)
            .some((parts) => parts[0]?.length >= 3);
        } catch {
          return false;
        }
      });
    // Prefer an actual floor directly underneath this aperture, not a higher
    // mezzanine elsewhere in the building. Never overlay a second lower storey.
    const elevation = Math.max(...lower.map((r) => r.elevationFeet));
    const rooms = lower.filter(
      (r) => Math.abs(r.elevationFeet - elevation) < 0.5,
    );
    if (rooms.length === 0) continue;
    lowerOpeningFeatures.push({
      type: "Feature",
      properties: { upperKey: upper.key },
      geometry: polygon(openings),
    });
    const lowerLevelIds = [...new Set(rooms.map((r) => r.levelId))];
    const cacheKey = `${upper.building}:${lowerLevelIds.join(",")}`;
    let lowerDisplay = lowerBlockCache.get(cacheKey);
    if (!lowerDisplay) {
      // The lower geometry has its own apertures but we render just this storey.
      lowerDisplay = projectDisplayGeometry(
        data,
        lowerLevelIds,
        upper.building,
        "",
        showPillars,
        false,
        showPassThroughPlaces,
        showVestibuleDoors,
      );
      lowerBlockCache.set(cacheKey, lowerDisplay);
    }
    const depthMetres =
      (elevation - upper.elevationFeet) * data.alignment.verticalMetresPerFoot;
    const clipFeature = (
      feature: FeatureCollection<MultiPolygon>["features"][number],
      kind: string,
      height: number,
    ) => {
      // Geographic clipping retains exactly the same prepared footprint as 2D.
      try {
        const apertures = openings.map((opening) =>
          opening.map((ring) => ring.map((p) => geographicPoint(data, p))),
        );
        const clipped = polygonClipping.intersection(
          feature.geometry.coordinates as Rings[],
          apertures,
        );
        if (clipped.length === 0) return;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            kind,
            upperKey: upper.key,
            levelId: Number(
              feature.properties?.levelId ??
                rooms.find((r) => r.key === feature.properties?.key)?.levelId,
            ),
            surfaceId: rooms.find((r) => r.key === feature.properties?.key)
              ?.surfaceId,
            baseMetres: depthMetres,
            heightMetres: height,
          },
          geometry: { type: "MultiPolygon" as const, coordinates: clipped },
        };
      } catch {
        return;
      }
    };
    const keysBelow = new Set(rooms.map((room) => room.key));
    for (const room of rooms) {
      const feature = (
        isDisplayPassage(room) ? lowerDisplay.areas : lowerDisplay.roomBlocks
      ).features.find((f) => f.properties?.key === room.key);
      if (!feature) continue;
      const clipped = clipFeature(
        feature,
        isDisplayPassage(room) ? "floor" : "room",
        isDisplayPassage(room) ? 0 : ROOM_BLOCK_HEIGHT_METRES,
      );
      if (clipped) lowerFeatures.push(clipped);
    }
    if (keysBelow.size > 0)
      for (const wall of lowerDisplay.exposedWalls.features) {
        const clipped = clipFeature(wall, "wall", EXPOSED_WALL_HEIGHT_METRES);
        if (clipped) lowerWallFeatures.push(clipped);
      }
  }
  const byNode = new Map(data.nodes.map((n) => [n.id, n]));
  const labels: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: records.flatMap((r) => {
      const node = r.arrivalNodeId ? byNode.get(r.arrivalNodeId) : undefined;
      if (
        !node ||
        !r.walkable ||
        (!showPassThroughPlaces && isPassThroughPlace(r)) ||
        (isDisplayPassage(r) &&
          !projectPlaceMetadata(data, r.key)?.landmark &&
          !(showPassThroughPlaces && isPassThroughPlace(r)))
      )
        return [];
      return [
        {
          type: "Feature" as const,
          properties: {
            key: r.key,
            minZoom: isDisplayPassage(r) ? 18 : ROOM_DETAIL_ZOOM,
            maxZoom: isDisplayPassage(r) ? ROOM_DETAIL_ZOOM : 24,
            passage: isDisplayPassage(r),
            landmark: projectPlaceMetadata(data, r.key)?.landmark ?? false,
            category: projectPlaceCategory(data, r),
            priority: projectPlaceMetadata(data, r.key)?.landmark ? 0 : 1,
            heightMetres: isDisplayPassage(r)
              ? 0.03
              : ROOM_BLOCK_HEIGHT_METRES + 0.03,
            name: r.number
              ? `${r.number}\n${projectPlaceDisplayName(data, r)}`
              : projectPlaceDisplayName(data, r),
          },
          geometry: {
            type: "Point" as const,
            coordinates: geographicPoint(data, node.pointFeet),
          },
        },
      ];
    }),
  };
  const lowerRooms: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: lowerFeatures,
  };
  return {
    areas,
    walls,
    roomBlocks,
    exposedWalls,
    doorFootprints,
    doorMarkers,
    records,
    uncutSurfaces,
    lowerRooms,
    lowerWalls: {
      type: "FeatureCollection" as const,
      features: lowerWallFeatures,
    },
    lowerOpenings: {
      type: "FeatureCollection" as const,
      features: lowerOpeningFeatures,
    },
    labels,
  };
}
