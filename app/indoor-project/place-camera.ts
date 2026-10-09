import type {
  FitBoundsOptions,
  LngLatBoundsLike,
  Map,
  PaddingOptions,
} from "maplibre-gl";

type Rect = Pick<
  DOMRect,
  "left" | "right" | "top" | "bottom" | "width" | "height"
>;
const overlaps = (a: Rect, b?: Rect) =>
  !!b &&
  b.width > 0 &&
  b.height > 0 &&
  b.right > a.left &&
  b.left < a.right &&
  b.bottom > a.top &&
  b.top < a.bottom;

/** Reserve the actual selected-place card, with a usable canvas even on a
 * short phone. Measurements happen after the new selection has rendered. */
export function projectPlaceCameraPadding(
  map: Rect,
  panel?: Rect,
  nativeStatus?: Rect,
): Required<PaddingOptions> {
  const mobile = map.width < 768;
  const desired = mobile
    ? {
        top: overlaps(map, nativeStatus)
          ? Math.max(80, nativeStatus!.bottom - map.top + 24)
          : 80,
        bottom: overlaps(map, panel) ? map.bottom - panel!.top + 24 : 240,
        left: 30,
        right: 30,
      }
    : {
        top: 80,
        bottom: 60,
        left: overlaps(map, panel)
          ? Math.max(48, panel!.right - map.left + 24)
          : 48,
        right: 60,
      };
  const vertical = Math.min(
    1,
    Math.max(0, map.height - Math.min(100, map.height / 2)) /
      (desired.top + desired.bottom),
  );
  const horizontal = Math.min(
    1,
    Math.max(0, map.width - Math.min(100, map.width / 2)) /
      (desired.left + desired.right),
  );
  return {
    top: desired.top * vertical,
    bottom: desired.bottom * vertical,
    left: desired.left * horizontal,
    right: desired.right * horizontal,
  };
}

/** MapLibre includes its persistent camera padding *in addition* to fitBounds
 * padding. A previous connector/desktop focus can leave no room on a phone.
 * Clear that padding before the scoped place fit; this is camera state only. */
export function fitProjectPlaceBounds(
  map: Pick<
    Map,
    "getContainer" | "stop" | "resize" | "setPadding" | "fitBounds"
  >,
  bounds: LngLatBoundsLike,
  options: Omit<FitBoundsOptions, "padding">,
) {
  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const panel = container.ownerDocument
    .querySelector('[data-testid="project-navigation"]')
    ?.getBoundingClientRect();
  const nativeStatus = container.ownerDocument
    .querySelector(".project-native-explore-status")
    ?.getBoundingClientRect();
  map.stop();
  map.resize();
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.fitBounds(bounds, {
    ...options,
    padding: projectPlaceCameraPadding(rect, panel, nativeStatus),
  });
}
