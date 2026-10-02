import type { FeatureCollection, Point } from "geojson";
import type { IndoorRecord } from "./contract";
import { ROOM_DETAIL_ZOOM } from "./zoom-presentation";
import { DEFAULT_LABEL_SETTINGS, type LabelSettings } from "./label-settings";

/** Room geometry and labels deliberately reveal at different scales. Search and
 * selected destinations retain their full names even while ordinary labels wait. */
export function visitorRoomLabels(
  labels: FeatureCollection<Point>,
  records: IndoorRecord[],
  selected: string,
  settings: LabelSettings = DEFAULT_LABEL_SETTINGS,
): FeatureCollection<Point> {
  const byKey = new Map(records.map((r) => [r.key, r]));
  return {
    ...labels,
    features: labels.features
      .filter((f) => !f.properties?.passage)
      .map((feature) => {
        const properties = feature.properties ?? {},
          room = byKey.get(String(properties.key));
        if (!room) return feature;
        const chosen = room.key === selected;
        const landmark = !!properties.landmark;
        const publicDestination =
          /washroom|toilet|restroom|\bwc\b|coffee|caf[eé]|library services|reception|first aid|chaplain|lecture theatre|seminar|meeting room/i.test(
            room.name,
          );
        const service =
          /storage|closet|mech|janitor|sprinkler|utility|elect|receiving/i.test(
            room.name,
          );
        const minZoom = chosen
          ? ROOM_DETAIL_ZOOM
          : landmark
            ? Math.max(ROOM_DETAIL_ZOOM, settings.roomZoom - 1.5)
            : publicDestination
              ? Math.max(ROOM_DETAIL_ZOOM, settings.roomZoom - 1)
              : service
                ? Math.max(ROOM_DETAIL_ZOOM, settings.roomZoom + 1)
                : Math.max(ROOM_DETAIL_ZOOM, settings.roomZoom);
        const fullNameZoom =
          chosen || landmark || publicDestination ? 0 : settings.fullNameZoom;
        return {
          ...feature,
          properties: {
            ...properties,
            minZoom,
            maxZoom: 99,
            fullNameZoom,
            compactName: room.number || properties.name,
            priority: chosen
              ? -2
              : landmark
                ? 0
                : publicDestination
                  ? 1
                  : service
                    ? 3
                    : 2,
            selected: chosen,
          },
        };
      }),
  };
}

/** Larger breathing room while the map is still showing whole departments. */
export const visitorLabelPadding = (
  zoom: number,
  settings: LabelSettings = DEFAULT_LABEL_SETTINGS,
) =>
  Math.max(
    4,
    settings.spacing - Math.max(0, zoom - (settings.roomZoom - 2)) * 4,
  );

export const visitorLabelBudget = (
  width: number,
  height: number,
  zoom: number,
  settings: LabelSettings,
) =>
  Math.max(
    6,
    Math.floor(
      (width * height) /
        (((zoom < settings.roomZoom ? 14_000 : 7000) * settings.spacing) / 18),
    ),
  );

export function visitorLabelPaddingExpression(
  settings: LabelSettings,
): unknown[] {
  const stops: number[] = [];
  for (let z = 17; z <= 24; z += 0.5) stops.push(z);
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...stops.flatMap((z) => [z, visitorLabelPadding(z, settings)]),
  ];
}

/** MapLibre permits camera zoom only as the input of a top-level interpolation.
 * At each stop, feature-specific thresholds produce the same fade as 3D labels. */
export function visitorLabelOpacityExpression(): unknown[] {
  const stops: number[] = [];
  for (let z = 17; z <= 24; z += 0.5) stops.push(z);
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...stops.flatMap((z) => [
      z,
      [
        "min",
        ["max", 0, ["min", 1, ["-", z + 0.5, ["get", "minZoom"]]]],
        ["max", 0, ["min", 1, ["-", ["get", "maxZoom"], z - 0.5]]],
      ],
    ]),
  ];
}

/** Invisible symbols must also release their collision space in the 2D map. */
export function visitorLabelTextExpression(): unknown[] {
  const atZoom = (z: number) => [
    "case",
    [
      "all",
      [">=", z, ["-", ["get", "minZoom"], 0.5]],
      ["<", z, ["+", ["get", "maxZoom"], 0.5]],
    ],
    [
      "case",
      [">=", z, ["coalesce", ["get", "fullNameZoom"], 0]],
      ["get", "name"],
      ["coalesce", ["get", "compactName"], ["get", "name"]],
    ],
    "",
  ];
  const stops: number[] = [];
  for (let z = 17; z <= 24; z += 0.5) stops.push(z);
  return [
    "step",
    ["zoom"],
    atZoom(16),
    ...stops.flatMap((z) => [z, atZoom(z)]),
  ];
}
