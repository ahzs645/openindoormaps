import type { FeatureCollection, LineString } from "geojson";
import type { IndoorDataset } from "./contract";
import { isDisplayPassage } from "./display-passages";
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
  const doorNodes = new Set(
    data.edges
      .filter((e) => {
        if (!e.enabled || (e.kind !== "door" && e.kind !== "opening"))
          return false;
        const owners = [e.from, e.to].map((id) => {
          const node = nodes.get(id);
          return node && rooms.get(node.roomKey);
        });
        // These are room-entry branches. A door/opening joining two passage
        // areas (including a vestibule without the circulation flag) is an
        // internal threshold, not a destination-door spur. Keep its original
        // graph and physical crossing; only omit its optional display branch.
        return !owners.every((r) => r && isDisplayPassage(r));
      })
      .flatMap((e) => [e.from, e.to]),
  );
  const segments = new Map<string, number>();
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
    const points = guide.pointsFeet;
    const [start, end] = guide.hallwayJoins ?? [0, points.length - 1];
    for (let i = 1; i < points.length; i++) {
      const role = i <= start || i > end ? "approach" : "hallway";
      // Only show saved branches to real door/opening endpoints. An arrival,
      // lift or held staircase is not a new doorway connection.
      if (
        role === "approach" &&
        !doorNodes.has(i <= start ? edge.from : edge.to)
      )
        continue;
      const a = points[i - 1],
        b = points[i];
      if (a.every((v, k) => v === b[k])) continue;
      const key = JSON.stringify([
        edge.nativeCellId,
        [JSON.stringify(a), JSON.stringify(b)].sort(),
      ]);
      const previous = segments.get(key);
      if (
        previous !== undefined &&
        (result.features[previous].properties?.role === "hallway" ||
          role === "approach")
      )
        continue;
      const feature: FeatureCollection<LineString>["features"][number] = {
        type: "Feature",
        properties: { edgeId: edge.id, nativeCellId: edge.nativeCellId, role },
        geometry: {
          type: "LineString",
          coordinates: [geographicPoint(data, a), geographicPoint(data, b)],
        },
      };
      if (previous === undefined) {
        segments.set(key, result.features.length);
        result.features.push(feature);
      } else result.features[previous] = feature;
    }
  }
  return result;
}
