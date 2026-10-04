import {
  sourceStairAnchor,
  sourceStairEdges,
  sourceStairId,
  sourceStairKind,
} from "./source-stairs";
import { floorHeightDatum } from "./relative-heights";
import type { FeatureCollection, Point } from "geojson";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import type { SourceConnectorReview } from "./connector-review";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { geographicPoint } from "./routing";
export type ConnectorKind = "stairs" | "ramp" | "elevator" | "escalator";
const connectorSvgs: Record<ConnectorKind, string> = {
  stairs: '<path d="M5 19h5v-5h5V9h5V4"/>',
  ramp: '<path d="M4 19h16M4 16L20 6M15 6h5v5"/>',
  elevator:
    '<rect x="5" y="6" width="14" height="16" rx="2"/><path d="M9 16v3m6-3v3M8 3l2-2 2 2m0 1V1m2 2 2 2 2-2m-2-2v4"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
  escalator: '<path d="M3 18h5L17 7h4v4h-3L9 22H3zM7 9V5m8 0v4"/>',
};
export const connectorSvg = (kind: ConnectorKind) => connectorSvgs[kind];
/** A display anchor is never an arrival or authorization to route. In particular
 * disconnected source stairs still get an icon, with their review state intact. */
export function stairDisplayPoint(
  data: IndoorDataset,
  room: IndoorRecord,
): [number, number] {
  const node = data.nodes.find((n) => n.id === room.arrivalNodeId);
  if (node) return [node.pointFeet[0], node.pointFeet[1]];
  const flight =
    data.stairDisplay?.sourceModelSha256 === data.source.modelSha256
      ? data.stairDisplay.flights.find(
          (f) =>
            f.roomKey === room.key &&
            f.sourceGeometryKey ===
              JSON.stringify([
                room.levelId,
                room.elevationFeet,
                room.ringsFeet,
              ]),
        )
      : undefined;
  const tread = flight?.treads
    .slice()
    .sort(
      (a, b) =>
        Math.abs(a.elevationFeet - room.elevationFeet) -
        Math.abs(b.elevationFeet - room.elevationFeet),
    )[0];
  if (tread) {
    const centre: [number, number] = [0, 0];
    for (const p of tread.ringFeet) {
      centre[0] += p[0] / tread.ringFeet.length;
      centre[1] += p[1] / tread.ringFeet.length;
    }
    if (
      pointInPolygon(centre, {
        type: "Polygon",
        coordinates: [[...tread.ringFeet, tread.ringFeet[0]]],
      })
    )
      return centre;
    return tread.ringFeet[0];
  }
  const ring = room.ringsFeet[0],
    polygon = {
      type: "Polygon" as const,
      coordinates: room.ringsFeet.map((ring) => [...ring, ring[0]]),
    };
  const xs = ring.map((p) => p[0]),
    ys = ring.map((p) => p[1]);
  const box = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
  // Concave source stairs do not necessarily contain the bounding-box centre.
  const inside = (p: number[]) => pointInPolygon(p, polygon);
  const centre: [number, number] = [
    (box[0] + box[2]) / 2,
    (box[1] + box[3]) / 2,
  ];
  if (inside(centre)) return centre;
  let best = ring[0],
    clearance = -1;
  for (let x = 1; x < 12; x++)
    for (let y = 1; y < 12; y++) {
      const p: [number, number] = [
        box[0] + ((box[2] - box[0]) * x) / 12,
        box[1] + ((box[3] - box[1]) * y) / 12,
      ];
      if (!inside(p)) continue;
      const distance = Math.min(
        ...room.ringsFeet.flatMap((r) =>
          r.map((a, i) => {
            const b = r[(i + 1) % r.length],
              dx = b[0] - a[0],
              dy = b[1] - a[1];
            const t = Math.max(
              0,
              Math.min(
                1,
                ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) /
                  (dx * dx + dy * dy || 1),
              ),
            );
            return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
          }),
        ),
      );
      if (distance > clearance) {
        best = p;
        clearance = distance;
      }
    }
  return best;
}
export function projectConnectorMarkers(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  review?: SourceConnectorReview,
  _relativeHeights = false,
): FeatureCollection<Point> {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const source =
    data.stairDisplay?.sourceModelSha256 === data.source.modelSha256
      ? data.stairDisplay.sourceFlights?.filter(
          (s) =>
            s.levelIds.some((id) => levelIds.includes(id)) &&
            (building === "all" || s.buildings.includes(building)),
        )
      : undefined;
  const sourceIds = new Set(source?.map((s) => s.stairElementId));
  const sourceRooms = new Set(
    data.stairDisplay?.flights
      .filter((f) => sourceIds.has(f.stairElementId))
      .map((f) => f.roomKey),
  );
  const nativeFlights =
    data.stairDisplay?.sourceModelSha256 === data.source.modelSha256
      ? data.stairDisplay.flights.filter((f) => {
          const r = data.records.find((r) => r.key === f.roomKey);
          return (
            r?.walkable &&
            levelIds.includes(r.levelId) &&
            (building === "all" || r.building === building) &&
            f.sourceGeometryKey ===
              JSON.stringify([r.levelId, r.elevationFeet, r.ringsFeet])
          );
        })
      : [];
  const multipleFlights = new Set(
    nativeFlights
      .filter(
        (f) =>
          nativeFlights.filter((other) => other.roomKey === f.roomKey).length >
          1,
      )
      .map((f) => f.roomKey),
  );
  const features: FeatureCollection<Point>["features"] = data.records
    .filter(
      (r) =>
        r.stair &&
        !sourceRooms.has(r.key) &&
        !multipleFlights.has(r.key) &&
        levelIds.includes(r.levelId) &&
        (building === "all" || r.building === building),
    )
    .map((r) => ({
      type: "Feature",
      properties: {
        key: r.key,
        kind: "stairs",
        name: `Stairs · ${r.number || r.name}`,
        heightMetres: r.circulation ? 0.04 : 0.64,
        elevationFeet: r.elevationFeet,
        review: !r.arrivalNodeId,
      },
      geometry: {
        type: "Point",
        coordinates: geographicPoint(data, stairDisplayPoint(data, r)),
      },
    }));
  for (const f of nativeFlights) {
    if (sourceIds.has(f.stairElementId)) continue;
    if (!f.displayOnly && !multipleFlights.has(f.roomKey)) continue;
    // Native display for a routed local staircase shares that connection's icon.
    if (
      f.displayOnly &&
      data.edges.some(
        (edge) =>
          edge.nativeElementId === f.stairElementId &&
          edge.kind === "local-steps" &&
          [edge.from, edge.to].some((id) => {
            const node = nodes.get(id);
            return (
              node &&
              levelIds.includes(node.levelId) &&
              (building === "all" || node.building === building)
            );
          }),
      )
    )
      continue;
    const r = data.records.find((r) => r.key === f.roomKey);
    if (
      !r?.walkable ||
      !levelIds.includes(r.levelId) ||
      (building !== "all" && r.building !== building) ||
      f.sourceGeometryKey !==
        JSON.stringify([r.levelId, r.elevationFeet, r.ringsFeet])
    )
      continue;
    const t = [...f.treads].sort(
      (a, b) =>
        Math.abs(a.elevationFeet - f.floorElevationFeet) -
        Math.abs(b.elevationFeet - f.floorElevationFeet),
    )[0];
    if (!t) continue;
    const p: [number, number] = [0, 0];
    for (const point of t.ringFeet) {
      p[0] += point[0] / t.ringFeet.length;
      p[1] += point[1] / t.ringFeet.length;
    }
    features.push({
      type: "Feature",
      properties: {
        key: r.key,
        kind: "stairs",
        stairElementId: f.stairElementId,
        name: f.displayOnly
          ? `Stairs · native flight #${f.stairElementId}`
          : `Stairs · ${r.number || r.name} · native flight #${f.stairElementId}`,
        heightMetres: Math.max(
          0.04,
          (t.elevationFeet - f.floorElevationFeet) * 0.3048,
        ),
        elevationFeet: t.elevationFeet,
        review: !!f.displayOnly || !r.arrivalNodeId,
      },
      geometry: { type: "Point", coordinates: geographicPoint(data, p) },
    });
  }
  for (const stair of source ?? []) {
    const p = sourceStairAnchor(data, stair, levelIds),
      edge = sourceStairEdges(data, stair).find((e) => e.enabled);
    features.push({
      type: "Feature",
      properties: {
        id: sourceStairId(stair.stairElementId),
        nativeElementId: stair.stairElementId,
        stairElementId: stair.stairElementId,
        kind: "stairs",
        name: `${sourceStairKind(stair)} · source #${stair.stairElementId}`,
        heightMetres: 0.65,
        elevationFeet: p[2],
        review: !edge,
      },
      geometry: { type: "Point", coordinates: geographicPoint(data, p) },
    });
  }
  const seen = new Set<string>();
  for (const edge of data.edges.filter((e) =>
    ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(e.kind),
  )) {
    if (edge.nativeElementId && sourceIds.has(edge.nativeElementId)) continue;
    // A local rise has one marker on a combined campus floor. Prefer its lower
    // real endpoint; separate floor/building views still get their own endpoint.
    const local = edge.kind === "local-steps" || edge.kind === "ramp";
    const endpoints = [edge.from, edge.to];
    if (local)
      endpoints.sort(
        (a, b) => nodes.get(a)!.pointFeet[2] - nodes.get(b)!.pointFeet[2],
      );
    for (const id of endpoints) {
      const n = nodes.get(id);
      if (
        !n ||
        !levelIds.includes(n.levelId) ||
        (building !== "all" && n.building !== building)
      )
        continue;
      if (
        edge.kind === "stairs" &&
        data.records.some((r) => r.key === n.roomKey && r.stair)
      )
        continue;
      const floor =
        local && data.floors.find((f) => f.levelIds.includes(n.levelId));
      const token = `${edge.connectorId ?? edge.nativeElementId ?? edge.id}:${floor ? floor.id : n.levelId}`;
      if (seen.has(token)) continue;
      seen.add(token);
      const kind = edge.kind === "local-steps" ? "stairs" : edge.kind;
      const other = nodes.get(id === edge.from ? edge.to : edge.from)!;
      const direction = other.pointFeet[2] > n.pointFeet[2] ? "up" : "down";
      let name = "Stairs";
      if (local)
        name = `${edge.kind === "ramp" ? "Ramp" : "Steps"} ${direction} · local level change`;
      else if (kind === "elevator") name = "Elevator";
      else if (kind === "escalator") name = "Escalator";
      const ramp =
        edge.kind === "ramp" &&
        data.rampDisplay?.ramps.find((r) => r.edgeId === edge.id);
      const point =
        ramp && levelIds.includes(other.levelId)
          ? ramp.anchorPointFeet
          : n.pointFeet;
      features.push({
        type: "Feature",
        properties: {
          id: edge.id,
          nativeElementId: edge.nativeElementId,
          kind,
          name,
          heightMetres: 0.65,
          elevationFeet: point[2],
          review: !edge.enabled,
        },
        geometry: {
          type: "Point",
          coordinates: geographicPoint(data, point),
        },
      });
    }
  }
  for (const connector of review?.connectors ?? []) {
    if (data.connectors?.some((c) => c.id === connector.id)) continue;
    for (const e of connector.entrances) {
      const r = data.records.find(
        (r) => r.key === e.roomKey && r.levelId === e.levelId,
      );
      if (
        !r ||
        !levelIds.includes(e.levelId) ||
        (building !== "all" && r.building !== building)
      )
        continue;
      features.push({
        type: "Feature",
        properties: {
          key: r.key,
          kind: connector.kind,
          name: `${connector.id} · awaiting validation`,
          heightMetres: r.circulation ? 0.04 : 0.64,
          elevationFeet: r.elevationFeet,
          review: true,
        },
        geometry: {
          type: "Point",
          coordinates: geographicPoint(data, e.pointFeet),
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** The source scene uses a shared native datum, unlike the flattened room
 * presentation. Project icons onto the actual served surface in that scene. */
export function sourceModelConnectorMarkers(
  data: IndoorDataset,
  markers: FeatureCollection<Point>,
  levelIds: number[],
): FeatureCollection<Point> {
  const datum = floorHeightDatum(data, levelIds);
  return {
    ...markers,
    features: markers.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        heightMetres:
          (Number(f.properties?.elevationFeet) - datum) *
            data.alignment.verticalMetresPerFoot +
          0.15,
      },
    })),
  };
}
