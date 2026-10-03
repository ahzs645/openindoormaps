import pc from "polygon-clipping";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { geographicPoint } from "./routing";
import { nativeEditPoint } from "./map-edits";
import { unresolvedRoomBoundaryKeys } from "./boundary-evidence";

type Point = [number, number];
type Rings = Point[][];
type Parts = Rings[];
export type RoomGeneralization = {
  key: string;
  status: "rectangle" | "retained";
  reason: string;
  sourceVertices: number;
  displayVertices: number;
  partsFeet: Parts;
};
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const open = (r: Point[]) =>
  distance(r[0], r.at(-1)!) < 1e-7 ? r.slice(0, -1) : r;
const area = (parts: Parts) =>
  parts.reduce(
    (sum, rings) =>
      sum +
      rings.reduce((s, r, i) => {
        const o = r[0];
        return (
          s +
          ((i ? -1 : 1) *
            Math.abs(
              r.reduce((v, p, j) => {
                const q = r[(j + 1) % r.length];
                return (
                  v +
                  (p[0] - o[0]) * (q[1] - o[1]) -
                  (q[0] - o[0]) * (p[1] - o[1])
                );
              }, 0),
            )) /
            2
        );
      }, 0),
    0,
  );
const bounds = (parts: Parts) => {
  const p = parts.flatMap((rings) => rings.flat());
  return [
    Math.min(...p.map((p) => p[0])),
    Math.min(...p.map((p) => p[1])),
    Math.max(...p.map((p) => p[0])),
    Math.max(...p.map((p) => p[1])),
  ];
};
const overlap = (a: number[], b: number[]) =>
  a[0] <= b[2] + 1e-5 &&
  a[2] + 1e-5 >= b[0] &&
  a[1] <= b[3] + 1e-5 &&
  a[3] + 1e-5 >= b[1];
const pointSegmentDistance = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
};
const boundaryDistance = (p: Point, parts: Parts) =>
  Math.min(
    ...parts.flatMap((rings) =>
      rings.flatMap((r) =>
        r.map((a, i) => pointSegmentDistance(p, a, r[(i + 1) % r.length])),
      ),
    ),
  );
const insideRing = (p: Point, ring: Point[]) => {
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
const inside = (p: Point, parts: Parts) =>
  parts.some(
    (r) => insideRing(p, r[0]) && !r.slice(1).some((h) => insideRing(p, h)),
  );
const vertexCount = (parts: Parts) =>
  parts.reduce(
    (s, r) => s + r.reduce((n, ring) => n + open(ring).length, 0),
    0,
  );
const median = (items: { value: number; weight: number }[]) => {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  let weight = 0;
  const half = sorted.reduce((s, p) => s + p.weight, 0) / 2;
  for (const item of sorted) {
    weight += item.weight;
    if (weight >= half) return item.value;
  }
  return sorted.at(-1)!.value;
};

/** Fit measured long wall faces, rather than an axis-aligned bounding box.
 * Short pillar recesses cannot expand the fitted envelope. Real L/U rooms,
 * diagonal/curved rooms and source holes retain their meaningful shape. */
function rectangle(room: IndoorRecord, data: IndoorDataset): Parts | undefined {
  const ring = open(room.ringsFeet[0]);
  const edges = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    return {
      a,
      b,
      length: distance(a, b),
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
    };
  });
  const long = edges.filter((e) => e.length >= 3);
  if (long.length === 0) return;
  const reference = [...long].sort((a, b) => b.length - a.length)[0].angle;
  const aligned = long.filter(
    (e) => Math.abs(Math.sin(2 * (e.angle - reference))) < 0.035,
  );
  if (
    aligned.reduce((s, e) => s + e.length, 0) /
      long.reduce((s, e) => s + e.length, 0) <
    0.85
  )
    return;
  const cx = aligned.reduce((s, e) => s + e.length * Math.cos(4 * e.angle), 0);
  const cy = aligned.reduce((s, e) => s + e.length * Math.sin(4 * e.angle), 0);
  const angle = Math.atan2(cy, cx) / 4;
  const c = Math.cos(angle),
    s = Math.sin(angle),
    origin = ring[0];
  const rotate = (p: Point): Point => [
    (p[0] - origin[0]) * c + (p[1] - origin[1]) * s,
    -(p[0] - origin[0]) * s + (p[1] - origin[1]) * c,
  ];
  const restore = (p: Point): Point => [
    origin[0] + p[0] * c - p[1] * s,
    origin[1] + p[0] * s + p[1] * c,
  ];
  const rotated = ring.map(rotate),
    box = bounds([[rotated]]),
    values: number[] = [];
  for (const axis of [0, 1]) {
    const lines = edges.flatMap((e) => {
      const a = rotate(e.a),
        b = rotate(e.b);
      return e.length >= 3 && Math.abs(a[axis] - b[axis]) <= e.length * 0.015
        ? [{ value: (a[axis] + b[axis]) / 2, weight: e.length }]
        : [];
    });
    for (const side of [0, 1]) {
      const extent = box[axis + (side ? 2 : 0)];
      const near = lines.filter((e) => Math.abs(e.value - extent) <= 3);
      if (near.length === 0) return;
      values[axis + (side ? 2 : 0)] = median(near);
    }
  }
  // A connected doorway may sit in a shallow recess. Include its measured
  // portal and in-room landing before fitting; never move the connection.
  const anchors = [
    ...(data.doors ?? [])
      .filter(
        (d) => d.levelId === room.levelId && d.roomKeys.includes(room.key),
      )
      .map((d) => d.pointFeet),
    ...data.nodes
      .filter((n) => n.roomKey === room.key && n.kind !== "arrival")
      .map((n) => [n.pointFeet[0], n.pointFeet[1]] as Point),
  ];
  for (const p of anchors.map(rotate))
    for (const axis of [0, 1]) {
      values[axis] = Math.min(values[axis], p[axis]);
      values[axis + 2] = Math.max(values[axis + 2], p[axis]);
    }
  if (values[2] - values[0] < 3 || values[3] - values[1] < 3) return;
  const outer: Point[] = [
    [values[0], values[1]],
    [values[2], values[1]],
    [values[2], values[3]],
    [values[0], values[3]],
  ].map((p) => restore(p as Point));
  // Holes remain exact, including courtyards and floor openings. No new box is
  // allowed to cut a hole into a boundary or silently fill a native opening.
  const candidate: Parts = [[outer, ...room.ringsFeet.slice(1)]];
  if (
    room.ringsFeet
      .slice(1)
      .some((h) =>
        open(h).some(
          (p) => !insideRing(p, outer) || boundaryDistance(p, [[outer]]) < 0.05,
        ),
      )
  )
    return;
  const source: Parts = [room.ringsFeet];
  const changed = area(pc.xor(source, candidate));
  if (changed / area(source) > 0.12) return;
  if (ring.some((p) => boundaryDistance(p, [[outer]]) > 6)) return;
  if (outer.some((p) => boundaryDistance(p, [[ring]]) > 3)) return;
  if (vertexCount(candidate) >= vertexCount(source)) return;
  return candidate;
}

/** Conservative first pass of cartographic regularization, in native feet.
 * Neighbour checks use the whole floor, not just currently rendered rooms.
 * Conflict checks are simultaneous and key/order independent. Every door,
 * opening endpoint, source hole and near-coplanar native slab hole is protected.
 * This result is illustration only; records, walls, doors and graph stay exact. */
export function generalizeRooms(
  data: IndoorDataset,
): Map<string, RoomGeneralization> {
  const prepared =
    data.presentation?.sourceModelSha256 === data.source.modelSha256
      ? new Map(data.presentation.rooms.map((r) => [r.roomKey, r]))
      : new Map();
  const records = data.records.map((r) => {
    const p = prepared.get(r.key);
    return p?.sourceGeometryKey === JSON.stringify([r.levelId, r.ringsFeet])
      ? { ...r, ringsFeet: p.interiorRingsFeet }
      : r;
  });
  const proposals = new Map<string, Parts>();
  const source = new Map(records.map((r) => [r.key, [r.ringsFeet] as Parts]));
  const boxes = new Map(
    records.map((r) => [r.key, bounds(source.get(r.key)!)]),
  );
  const results = new Map<string, RoomGeneralization>();
  const unresolved = unresolvedRoomBoundaryKeys(data);
  for (const room of records) {
    let reason = "essential-shape";
    let candidate: Parts | undefined;
    if (room.circulation || room.stair || !room.walkable)
      reason = "circulation-stair-or-void";
    else if (unresolved.has(room.key)) reason = "unresolved-native-boundary";
    else
      try {
        candidate = rectangle(room, data);
      } catch {
        reason = "invalid-contour";
      }
    if (candidate) proposals.set(room.key, candidate);
    results.set(room.key, {
      key: room.key,
      status: "retained",
      reason,
      sourceVertices: vertexCount(source.get(room.key)!),
      displayVertices: vertexCount(source.get(room.key)!),
      partsFeet: source.get(room.key)!,
    });
  }
  const reject = new Map<string, string>();
  for (const room of records) {
    const candidate = proposals.get(room.key);
    if (!candidate) continue;
    try {
      const original = source.get(room.key)!;
      const added = pc.difference(candidate, original) as Parts;
      const extent = bounds(candidate);
      const originalBox = boxes.get(room.key)!;
      const comparisonBounds = extent.map((v, i) =>
        i < 2 ? Math.min(v, originalBox[i]) : Math.max(v, originalBox[i]),
      );
      for (const other of records) {
        if (
          room.key === other.key ||
          room.levelId !== other.levelId ||
          Math.abs(room.elevationFeet - other.elevationFeet) > 0.5 ||
          !overlap(
            comparisonBounds,
            proposals.has(other.key)
              ? bounds([
                  ...source.get(other.key)!,
                  ...proposals.get(other.key)!,
                ])
              : boxes.get(other.key)!,
          )
        )
          continue;
        if (area(pc.intersection(added, source.get(other.key)!)) > 1e-4) {
          reject.set(room.key, "neighbour-or-corridor");
          break;
        }
        const otherSource = source.get(other.key)!;
        const newContact = (
          left: Parts,
          right: Parts,
          originalLeft: Parts,
          originalRight: Parts,
        ) =>
          left
            .flatMap((r) =>
              r.flatMap((ring) =>
                ring.flatMap((p, i) => [
                  p,
                  [
                    (p[0] + ring[(i + 1) % ring.length][0]) / 2,
                    (p[1] + ring[(i + 1) % ring.length][1]) / 2,
                  ] as Point,
                ]),
              ),
            )
            .some(
              (p) =>
                boundaryDistance(p, right) < 1e-5 &&
                boundaryDistance(p, originalLeft) > 0.05,
            ) ||
          right
            .flatMap((r) =>
              r.flatMap((ring) =>
                ring.flatMap((p, i) => [
                  p,
                  [
                    (p[0] + ring[(i + 1) % ring.length][0]) / 2,
                    (p[1] + ring[(i + 1) % ring.length][1]) / 2,
                  ] as Point,
                ]),
              ),
            )
            .some(
              (p) =>
                boundaryDistance(p, left) < 1e-5 &&
                boundaryDistance(p, originalLeft) > 0.05 &&
                boundaryDistance(p, originalRight) < 1e-5,
            );
        if (newContact(candidate, otherSource, original, otherSource))
          reject.set(room.key, "new-neighbour-contact");
        const otherCandidate = proposals.get(other.key);
        if (
          otherCandidate &&
          area(
            pc.difference(
              pc.intersection(candidate, otherCandidate),
              pc.intersection(original, source.get(other.key)!),
            ),
          ) > 1e-4
        ) {
          reject.set(room.key, "competing-neighbours");
          reject.set(other.key, "competing-neighbours");
        }
        if (
          otherCandidate &&
          newContact(candidate, otherCandidate, original, otherSource)
        ) {
          reject.set(room.key, "new-neighbour-contact");
          reject.set(other.key, "new-neighbour-contact");
        }
        // Keep any truly shared source edge in place. Walls of nonzero thickness
        // stay separated rather than collapsing a physical gap into a seam.
        for (const ring of room.ringsFeet)
          for (const [i, a] of ring.entries()) {
            const b = ring[(i + 1) % ring.length];
            if (distance(a, b) < 1) continue;
            const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            if (
              [a, mid, b].every(
                (p) => boundaryDistance(p, source.get(other.key)!) < 1e-5,
              ) &&
              [a, mid, b].some((p) => boundaryDistance(p, candidate) > 0.01)
            )
              reject.set(room.key, "shared-boundary");
          }
      }
      if (
        data.circulationGeometry?.sourceModelSha256 === data.source.modelSha256
      ) {
        for (const cell of data.circulationGeometry.cells) {
          if (
            cell.levelIds.includes(room.levelId) &&
            Math.abs(cell.elevationFeet - room.elevationFeet) < 0.5 &&
            overlap(extent, bounds([cell.ringsFeet])) &&
            area(pc.intersection(candidate, cell.ringsFeet)) > 1e-4
          )
            reject.set(room.key, "native-circulation");
        }
      }
      for (const slab of data.walkingSupport?.sourceModelSha256 ===
      data.source.modelSha256
        ? data.walkingSupport.floors
        : []) {
        if (Math.abs(slab.elevationFeet - room.elevationFeet) > 0.5) continue;
        for (const part of slab.partsFeet ?? [slab.ringsFeet])
          for (const hole of part.slice(1)) {
            if (
              overlap(extent, bounds([[hole]])) &&
              area(pc.intersection(candidate, [hole])) > 1e-4
            )
              reject.set(room.key, "native-floor-opening");
          }
      }
      const routingRoom = data.records.find((r) => r.key === room.key)!;
      if (
        routingRoom.ringsFeet
          .slice(1)
          .some((hole) => area(pc.intersection(candidate, [hole])) > 1e-4)
      )
        reject.set(room.key, "source-opening");
      for (const door of data.doors ?? []) {
        if (door.levelId !== room.levelId || !door.roomKeys.includes(room.key))
          continue;
        if (
          boundaryDistance(door.pointFeet, candidate) >
          Math.max(0.75, boundaryDistance(door.pointFeet, original) + 0.05)
        )
          reject.set(room.key, "door-position");
      }
      for (const node of data.nodes.filter((n) => n.roomKey === room.key)) {
        const p: Point = [node.pointFeet[0], node.pointFeet[1]];
        if (
          !inside(p, candidate) &&
          boundaryDistance(p, candidate) > 0.05 &&
          (inside(p, original) || boundaryDistance(p, original) < 0.05)
        )
          reject.set(room.key, "connection-anchor");
      }
    } catch {
      reject.set(room.key, "geometry-check-failed");
    }
  }
  for (const [key, partsFeet] of proposals) {
    const result = results.get(key)!;
    if (reject.has(key)) result.reason = reject.get(key)!;
    else {
      result.status = "rectangle";
      result.reason = "long-wall-fit";
      result.partsFeet = partsFeet;
      result.displayVertices = vertexCount(partsFeet);
    }
  }
  return results;
}
const cache = new WeakMap<IndoorDataset, ReturnType<typeof generalizeRooms>>();
function cachedRooms(data: IndoorDataset) {
  let rooms = cache.get(data);
  if (!rooms) {
    rooms = generalizeRooms(data);
    cache.set(data, rooms);
  }
  return rooms;
}
export function generalizedRoomGeometry(
  data: IndoorDataset,
  collection: FeatureCollection<MultiPolygon>,
): FeatureCollection<MultiPolygon> {
  const rooms = cachedRooms(data);
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const room = rooms.get(String(feature.properties?.key));
      if (
        room?.status !== "rectangle" ||
        feature.properties?.circulation === true
      )
        return feature;
      return {
        ...feature,
        properties: { ...feature.properties, cartographicShape: "rectangle" },
        geometry: {
          type: "MultiPolygon",
          coordinates: room.partsFeet.map((part) =>
            part.map((ring) =>
              [...open(ring), ring[0]].map((p) => geographicPoint(data, p)),
            ),
          ),
        },
      };
    }),
  };
}

/** Conceal model wall/post details below a generalized roof in the illustration.
 * Outside walls keep their measured footprint and all routing barriers survive. */
export function generalizedRoomWalls(
  data: IndoorDataset,
  collection: FeatureCollection<MultiPolygon>,
): FeatureCollection<MultiPolygon> {
  const rooms = cachedRooms(data),
    records = new Map(data.records.map((r) => [r.key, r]));
  const roofs = [...rooms.values()]
    .filter((r) => r.status === "rectangle")
    .map((r) => ({
      record: records.get(r.key)!,
      parts: r.partsFeet,
      box: bounds(r.partsFeet),
    }));
  return {
    ...collection,
    features: collection.features.flatMap((f) => {
      const level = Number(f.properties?.levelId);
      const native: Parts = f.geometry.coordinates.map((part) =>
        part.map((ring) => ring.map((p) => nativeEditPoint(data, p as Point))),
      );
      const extent = bounds(native);
      const nearby = roofs.filter(
        (r) => r.record.levelId === level && overlap(extent, r.box),
      );
      if (nearby.length === 0) return [f];
      try {
        const cut = pc.difference(native, ...nearby.map((r) => r.parts));
        return cut.length > 0
          ? [
              {
                ...f,
                geometry: {
                  type: "MultiPolygon" as const,
                  coordinates: cut.map((p) =>
                    p.map((r) =>
                      r.map((point) => geographicPoint(data, point)),
                    ),
                  ),
                },
              },
            ]
          : [];
      } catch {
        return [f];
      }
    }),
  };
}

/** Keep existing connected doorway footprints visible above clean room roofs.
 * This is a thin marker at the measured threshold, not a moved/native door. */
export function generalizedRoomDoorways(
  data: IndoorDataset,
  collection: FeatureCollection<Polygon>,
  roofHeight: number,
): FeatureCollection<Polygon> {
  const rooms = cachedRooms(data),
    doors = new Map(data.doors?.map((d) => [d.id, d]));
  return {
    ...collection,
    features: collection.features.map((f) => {
      const door = doors.get(String(f.properties?.id));
      if (
        door?.state !== "connected" ||
        !door.roomKeys.some((k) => rooms.get(k)?.status === "rectangle")
      )
        return f;
      const floorBase = Number(f.properties?.base ?? 0);
      return {
        ...f,
        properties: {
          ...f.properties,
          displayDoorBase: roofHeight,
          displayDoorHeight: roofHeight + 0.01,
          base: floorBase + roofHeight,
          height: floorBase + roofHeight + 0.01,
        },
      };
    }),
  };
}
