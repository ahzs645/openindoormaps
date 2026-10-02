import type { FeatureCollection, Point, Polygon, MultiPolygon } from "geojson";
import buffer from "@turf/buffer";
import { isDisplayPassage } from "./display-passages";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { geographicPoint } from "./routing";
import { projectBuildingName } from "./visitor-metadata";

/** Campus context hands over to individual rooms at the same zoom in 2D/3D. */
export const ROOM_DETAIL_ZOOM = 18;
export const ROOM_DETAIL_START = ROOM_DETAIL_ZOOM - 0.5;
export const ROOM_DETAIL_END = ROOM_DETAIL_ZOOM + 0.5;
/** Continuous zoom progress works identically when zooming in or out. */
export const zoomFade = (zoom: number, start: number, end: number) =>
  Math.max(0, Math.min(1, (zoom - start) / (end - start)));
export function labelOpacityAtZoom(
  zoom: number,
  minimum = ROOM_DETAIL_ZOOM,
  maximum = Infinity,
) {
  const incoming =
    minimum === 0 ? 1 : zoomFade(zoom, minimum - 0.5, minimum + 0.5);
  const outgoing = Number.isFinite(maximum)
    ? 1 - zoomFade(zoom, maximum - 0.5, maximum + 0.5)
    : 1;
  return Math.min(incoming, outgoing);
}
export const labelVisibleAtZoom = (
  zoom: number,
  minimum = ROOM_DETAIL_ZOOM,
  maximum = Infinity,
) => zoom >= minimum && zoom < maximum;

/** Overview-only morphological closing joins wall-width seams between room
 * footprints. Separate buildings and large courtyards remain separate. This
 * simplified illustration never supplies a room boundary or routing surface. */
export function buildingOverviewGeometry(
  data: IndoorDataset,
  records: IndoorRecord[],
): FeatureCollection<Polygon | MultiPolygon> {
  const features: FeatureCollection<Polygon | MultiPolygon>["features"] = [];
  for (const building of new Set(records.map((room) => room.building))) {
    const rooms = records.filter((room) => room.building === building);
    for (const circulation of [false, true]) {
      const chosen = circulation ? rooms.filter(isDisplayPassage) : rooms;
      if (chosen.length === 0) continue;
      const source: MultiPolygon = {
        type: "MultiPolygon",
        coordinates: chosen.map((room) =>
          room.ringsFeet.map((ring) =>
            [...ring, ring[0]].map((point) => geographicPoint(data, point)),
          ),
        ),
      };
      try {
        const radius = 0.61; // two feet; less than a pixel at campus overview scale
        const expanded = buffer(source, radius, { units: "meters", steps: 1 });
        const closed =
          expanded && buffer(expanded, -radius, { units: "meters", steps: 1 });
        if (!closed) continue;
        features.push({
          ...closed,
          properties: {
            building,
            circulation,
            color: circulation ? "#bfd1cd" : "#8d9395",
          },
        });
      } catch {
        // Malformed geometry stays available in the detailed source view.
        // Never replace a failed outline with a broad bounding rectangle.
      }
    }
  }
  return { type: "FeatureCollection", features };
}

/** One building label replaces hundreds of room labels in the campus overview.
 * Anchor to an existing arrival on this level; never move source/navigation data. */
export function buildingOverviewLabels(
  data: IndoorDataset,
  records: IndoorRecord[],
): FeatureCollection<Point> {
  const byNode = new Map(data.nodes.map((node) => [node.id, node]));
  return {
    type: "FeatureCollection",
    features: [...new Set(records.map((room) => room.building))].flatMap(
      (building) => {
        const rooms = records.filter((room) => room.building === building);
        const points = rooms.flatMap((room) => room.ringsFeet[0]);
        if (points.length === 0) return [];
        const center = [
          (Math.min(...points.map((p) => p[0])) +
            Math.max(...points.map((p) => p[0]))) /
            2,
          (Math.min(...points.map((p) => p[1])) +
            Math.max(...points.map((p) => p[1]))) /
            2,
        ];
        const arrivals = rooms.flatMap((room) => {
          const node = room.arrivalNodeId && byNode.get(room.arrivalNodeId);
          return node ? [node.pointFeet] : [];
        });
        const anchor =
          arrivals.sort(
            (a, b) =>
              Math.hypot(a[0] - center[0], a[1] - center[1]) -
              Math.hypot(b[0] - center[0], b[1] - center[1]),
          )[0] ?? points[0];
        return [
          {
            type: "Feature" as const,
            properties: {
              key: `building:${building}`,
              name: projectBuildingName(data, building),
              landmark: true,
              priority: -1,
              heightMetres: 0.03,
              minZoom: 0,
              maxZoom: ROOM_DETAIL_ZOOM,
            },
            geometry: {
              type: "Point" as const,
              coordinates: geographicPoint(data, anchor),
            },
          },
        ];
      },
    ),
  };
}
