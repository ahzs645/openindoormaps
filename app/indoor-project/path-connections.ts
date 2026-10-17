import type { FeatureCollection, LineString, Point } from "geojson";
import type { IndoorDataset, IndoorEdge } from "./contract";
import { isDisplayPassage } from "./display-passages";
import { geographicPoint } from "./routing";

/** Original saved connection geometry for inspection, not new route authority.
 * Held stairs stay held; no endpoints are joined by XY proximity. */
export function pathConnections(
  data: IndoorDataset,
  levels: number[],
  building: string,
): FeatureCollection<LineString | Point> {
  const result: FeatureCollection<LineString | Point> = {
    type: "FeatureCollection",
    features: [],
  };
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const rooms = new Map(data.records.map((r) => [r.key, r]));
  const markers = new Map<
    string,
    {
      point: NonNullable<ReturnType<typeof nodes.get>>;
      edgeIds: string[];
      targets: Set<string>;
      role: string;
      kind: IndoorEdge["kind"];
    }
  >();
  const vertical = new Set<IndoorEdge["kind"]>([
    "stairs",
    "local-steps",
    "ramp",
    "elevator",
    "escalator",
  ]);
  const label = (kind: IndoorEdge["kind"]) =>
    kind === "elevator"
      ? "Lift"
      : kind === "ramp"
        ? "Ramp"
        : kind === "escalator"
          ? "Escalator"
          : "Stairs";
  const floor = (levelId: number) =>
    data.floors.find((f) => f.levelIds.includes(levelId))?.name ??
    data.nativeLevels.find((l) => l.id === levelId)?.name ??
    String(levelId);
  const inScope = (n: NonNullable<ReturnType<typeof nodes.get>>) =>
    levels.includes(n.levelId) &&
    (building === "all" || n.building === building);
  for (const edge of data.edges) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b || ![a, b].some(inScope)) continue;
    const owners = [a, b].map((n) => rooms.get(n.roomKey));
    if (!owners.every((r) => r?.walkable && r.access !== "staff")) continue;
    const held = !edge.enabled && edge.kind === "stairs";
    if (!edge.enabled && !held) continue;
    const transition = vertical.has(edge.kind);
    const passage =
      ["door", "opening"].includes(edge.kind) &&
      owners.every((r) => r && isDisplayPassage(r));
    const buildings = a.building !== b.building;
    if (!transition && !passage && !buildings) continue;
    const role = held
      ? "held"
      : transition || buildings
        ? "transition"
        : "passage";
    const properties = {
      edgeId: edge.id,
      role,
      kind: edge.kind,
      enabled: edge.enabled,
      direction: edge.direction ?? "both",
      fromLevelId: a.levelId,
      toLevelId: b.levelId,
      nativeElementId: edge.nativeElementId,
      fromBuilding: a.building,
      toBuilding: b.building,
    };
    const coordinates = edge.pointsFeet.map((p) => geographicPoint(data, p));
    if (
      coordinates.length >= 2 &&
      coordinates.some(
        (p) => p[0] !== coordinates[0][0] || p[1] !== coordinates[0][1],
      )
    )
      result.features.push({
        type: "Feature",
        properties,
        geometry: { type: "LineString", coordinates },
      });
    if (!transition) continue;
    for (const [own, other] of [
      [a, b],
      [b, a],
    ]) {
      if (!inScope(own)) continue;
      const key = `${role}:${edge.kind}:${own.id}`;
      const marker = markers.get(key) ?? {
        point: own,
        edgeIds: [],
        targets: new Set<string>(),
        role,
        kind: edge.kind,
      };
      marker.edgeIds.push(edge.id);
      marker.targets.add(floor(other.levelId));
      markers.set(key, marker);
    }
  }
  for (const marker of markers.values())
    result.features.push({
      type: "Feature",
      properties: {
        role: marker.role,
        kind: marker.kind,
        enabled: marker.role !== "held",
        nodeId: marker.point.id,
        edgeIds: marker.edgeIds,
        toFloors: [...marker.targets].sort(),
        label:
          marker.role === "held"
            ? "Held stairs"
            : `${label(marker.kind)} · ${[...marker.targets].sort().join(", ")}`,
      },
      geometry: {
        type: "Point",
        coordinates: geographicPoint(data, marker.point.pointFeet),
      },
    });
  return result;
}
