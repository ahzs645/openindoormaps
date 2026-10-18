import type { FeatureCollection, Point } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";
import type { IndoorRecord } from "./contract";
import { DEFAULT_LABEL_SETTINGS } from "./label-settings";
import { ROOM_DETAIL_ZOOM } from "./zoom-presentation";
import {
  visitorRoomLabels,
  visitorLabelOpacityExpression,
  visitorLabelTextExpression,
} from "./visitor-labels";

/** The active ordinary 2D label pipeline, with no selected place. The plan
 * retains source label coordinates; only presentation metadata is prepared. */
export function publishedVisitorPlanLabels(
  raw: FeatureCollection<Point>,
  records: IndoorRecord[],
  overview: FeatureCollection<Point>,
  base: FeatureCollection<Point>,
): FeatureCollection<Point> {
  return {
    ...base,
    features: [
      ...overview.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          maxZoom: DEFAULT_LABEL_SETTINGS.roomZoom - 1,
        },
      })),
      ...visitorRoomLabels(raw, records, "", DEFAULT_LABEL_SETTINGS).features,
    ],
  };
}

/** Reproduce visitorRoomLabels(..., selected)'s four selected metadata
 * overrides in expressions. Selection never reuploads the whole floor or
 * changes the admitted neutral label collection. */
export function publishedVisitorPlanLabelStyle(selected: string) {
  const chosen: ExpressionSpecification = ["==", ["get", "key"], selected];
  const overrides: Record<string, number> = {
    minZoom: ROOM_DETAIL_ZOOM,
    maxZoom: 99,
    fullNameZoom: 0,
  };
  const replace = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    if (
      value.length === 2 &&
      value[0] === "get" &&
      typeof value[1] === "string" &&
      value[1] in overrides
    )
      return [
        "case",
        chosen,
        overrides[value[1]],
        value[1] === "fullNameZoom" ? ["coalesce", value, 0] : value,
      ];
    return value.map(replace);
  };
  return {
    textField: replace(visitorLabelTextExpression()) as ExpressionSpecification,
    textOpacity: replace(
      visitorLabelOpacityExpression(),
    ) as ExpressionSpecification,
    sortKey: [
      "case",
      chosen,
      -2,
      ["coalesce", ["get", "priority"], 2],
    ] as ExpressionSpecification,
  };
}
