import type { FeatureCollection, LineString } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import {
  preparedWalkingGuides,
  type PreparedRouting,
} from "./prepared-routing";

/** Display only. Run in the floor worker so checking the full guide binding
 * never hashes the source on the UI thread. These planar guides do not claim
 * public access, headroom or step-free qualification; directions recheck those.
 */
export function hallwayPathView(
  data: IndoorDataset,
  levels: number[],
  building: string,
): FeatureCollection<LineString> {
  const result: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: [],
  };
  const usable = preparedWalkingGuides(data);
  const guides =
    (data as IndoorDataset & { preparedRouting?: PreparedRouting })
      .preparedRouting?.guides ?? [];
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const rooms = new Map(data.records.map((r) => [r.key, r]));
  const segments = new Set<string>();
  for (const guide of guides) {
    const edge = edges.get(guide.edgeId);
    if (
      !edge?.enabled ||
      edge.kind !== "walk" ||
      guide.kind !== "shared-corridor" ||
      !usable.has(edge.id)
    )
      continue;
    const owners = [edge.from, edge.to]
      .map((id) => nodes.get(id))
      .map((n) => n && rooms.get(n.roomKey));
    if (
      !owners.every(
        (r) =>
          r?.circulation &&
          r.walkable &&
          r.access !== "staff" &&
          levels.includes(r.levelId) &&
          (building === "all" || r.building === building),
      )
    )
      continue;
    const points = guide.hallwayJoins
      ? guide.pointsFeet.slice(guide.hallwayJoins[0], guide.hallwayJoins[1] + 1)
      : guide.pointsFeet;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (a.every((v, k) => v === b[k])) continue;
      const key = JSON.stringify([
        edge.nativeCellId,
        [JSON.stringify(a), JSON.stringify(b)].sort(),
      ]);
      if (segments.has(key)) continue;
      segments.add(key);
      result.features.push({
        type: "Feature",
        properties: { edgeId: edge.id, nativeCellId: edge.nativeCellId },
        geometry: {
          type: "LineString",
          coordinates: [geographicPoint(data, a), geographicPoint(data, b)],
        },
      });
    }
  }
  return result;
}
