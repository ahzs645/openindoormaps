import type { FeatureCollection, LineString } from "geojson";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { isDisplayPassage } from "./display-passages";
import { geographicPoint } from "./routing";
import {
  preparedWalkingGuides,
  type PreparedRouting,
} from "./prepared-routing";
import {
  uniquePathDisplaySegments,
  type PathDisplaySegment,
} from "./path-display-segments";

export const isPathArea = (r: IndoorRecord) =>
  isDisplayPassage(r) || r.stair || r.properties.generatedLanding === true;

/** Display only. Run in the floor worker so checking the full guide binding
 * never hashes the source on the UI thread. These planar guides do not claim
 * public access, headroom or step-free qualification; directions recheck those.
 */
export function hallwayPathView(
  data: IndoorDataset,
  levels: number[],
  building: string,
  options: { includeSourceFeet?: boolean } = {},
): FeatureCollection<LineString> {
  const result: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: [],
  };
  const usable = preparedWalkingGuides(data);
  const guides = new Map(
    (
      (data as IndoorDataset & { preparedRouting?: PreparedRouting })
        .preparedRouting?.guides ?? []
    )
      .filter((g) => g.kind === "shared-corridor" && usable.has(g.edgeId))
      .map((g) => [g.edgeId, g]),
  );
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
        // graph and physical crossing; display its branch as solid passage.
        return !owners.every((r) => r && isDisplayPassage(r));
      })
      .flatMap((e) => [e.from, e.to]),
  );
  const passageNodes = new Set(
    data.edges
      .filter(
        (e) =>
          e.enabled &&
          ["door", "opening"].includes(e.kind) &&
          [e.from, e.to].every((id) => {
            const node = nodes.get(id),
              owner = node && rooms.get(node.roomKey);
            return owner && isDisplayPassage(owner);
          }),
      )
      .flatMap((e) => [e.from, e.to]),
  );
  // Existing vertical stops use solid approaches, never room-door dots. Held
  // stairs are not promoted and keep their separate optional held inspection.
  for (const edge of data.edges)
    if (
      edge.enabled &&
      ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
        edge.kind,
      )
    )
      for (const id of [edge.from, edge.to]) passageNodes.add(id);
  const walkDegree = new Map<string, Set<string>>();
  for (const edge of data.edges) {
    if (!edge.enabled || edge.kind !== "walk") continue;
    if (
      ![edge.from, edge.to].every((id) => {
        const n = nodes.get(id),
          r = n && rooms.get(n.roomKey);
        return r?.walkable && r.access !== "staff" && isPathArea(r);
      })
    )
      continue;
    for (const [a, b] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      const other = walkDegree.get(a) ?? new Set<string>();
      other.add(b);
      walkDegree.set(a, other);
    }
  }
  for (const [id, other] of walkDegree)
    if (other.size > 1) passageNodes.add(id);
  const segments: PathDisplaySegment[] = [];
  for (const edge of edges.values()) {
    if (
      !edge?.enabled ||
      edge.kind !== "walk" ||
      edge.roomKeys.some((k) => {
        const r = rooms.get(k);
        return !r?.walkable || r.access === "staff";
      })
    )
      continue;
    const owners = [edge.from, edge.to]
      .map((id) => nodes.get(id))
      .map((n) => n && rooms.get(n.roomKey));
    if (
      !owners.every(
        (r) =>
          r &&
          isPathArea(r) &&
          r.walkable &&
          r.access !== "staff" &&
          levels.includes(r.levelId) &&
          (building === "all" || r.building === building),
      )
    )
      continue;
    const guide = guides.get(edge.id);
    const points = guide?.pointsFeet ?? edge.pointsFeet;
    if (points.length < 2) continue;
    const [start, end] = guide?.hallwayJoins ?? [0, points.length - 1];
    for (let i = 1; i < points.length; i++) {
      const endpoint = i <= start ? edge.from : edge.to;
      const role = guide
        ? i <= start || i > end
          ? passageNodes.has(endpoint)
            ? "passage"
            : "approach"
          : "hallway"
        : "fallback";
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
      segments.push({
        scope: JSON.stringify([edge.nativeCellId ?? edge.id, a[2], b[2]]),
        pointsFeet: [a, b],
        edgeId: edge.id,
        edgeIds: [edge.id],
        nativeCellId: edge.nativeCellId,
        role,
        source: guide ? "shared-guide" : "saved-walk",
      });
    }
  }
  for (const segment of uniquePathDisplaySegments(segments)) {
    const { pointsFeet, scope: _, ...properties } = segment;
    result.features.push({
      type: "Feature",
      properties: {
        ...properties,
        ...(options.includeSourceFeet ? { pointsFeet } : {}),
      },
      geometry: {
        type: "LineString",
        coordinates: pointsFeet.map((p) => geographicPoint(data, p)),
      },
    });
  }
  return result;
}
