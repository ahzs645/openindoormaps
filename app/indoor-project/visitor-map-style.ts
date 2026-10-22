import type { ExpressionSpecification } from "maplibre-gl";

/** Paint only. Keep source category colours, identities and exact rings in the
 * prepared data; review and custom venue palettes remain available unchanged. */
export const VISITOR_ROOM_FILL = "#edf0ec";
export const VISITOR_WALL_FILL = "#dce1dc";
export const VISITOR_BOUNDARY = "#bec7c0";
export const VISITOR_ROUTE = "#087fb5";

const quietRoomColors = ["#b8d5a5", "#eee7d5", "#f5f5f4", "#e9edef"];

/** Quiet the default room categories without hiding restricted, circulation,
 * selected-destination or explicitly authored custom colours. */
export function visitorRoomPaintColor(source: string) {
  return quietRoomColors.includes(source) ? VISITOR_ROOM_FILL : source;
}

export const visitorRoomPaintExpression: ExpressionSpecification = [
  "match",
  ["get", "color"],
  quietRoomColors,
  VISITOR_ROOM_FILL,
  ["coalesce", ["get", "color"], VISITOR_ROOM_FILL],
];

/** Boundaries stay quiet at building scale and become readable close up.
 * These stroke widths never replace or expand the physical surface. */
export const visitorBoundaryWidth: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  18.5,
  0.35,
  21,
  0.8,
];
