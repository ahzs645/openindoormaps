import assert from "node:assert/strict";
import test from "node:test";
import type { LngLat, PaddingOptions } from "maplibre-gl";
import {
  fitProjectPlaceBounds,
  projectPlaceCameraPadding,
} from "../../app/indoor-project/place-camera";

// Exercise the installed renderer's real projection calculation without
// typechecking its unpublished WebGL internals using our application's config.
const { LngLatBounds } = (await import(
  new URL(
    "../../node_modules/maplibre-gl/src/geo/lng_lat_bounds.ts",
    import.meta.url,
  ).href
)) as { LngLatBounds: typeof import("maplibre-gl").LngLatBounds };
type Camera = { center: LngLat; zoom: number; bearing: number };
const { cameraForBoxAndBearing } = (await import(
  new URL(
    "../../node_modules/maplibre-gl/src/geo/projection/camera_helper.ts",
    import.meta.url,
  ).href
)) as {
  cameraForBoxAndBearing: (
    options: { maxZoom: number; offset: [number, number] },
    padding: Required<PaddingOptions>,
    bounds: import("maplibre-gl").LngLatBounds,
    bearing: number,
    transform: {
      width: number;
      height: number;
      padding: Required<PaddingOptions>;
      worldSize: number;
      scale: number;
    },
  ) => Camera | undefined;
};
const { projectToWorldCoordinates } = (await import(
  new URL(
    "../../node_modules/maplibre-gl/src/geo/projection/mercator_utils.ts",
    import.meta.url,
  ).href
)) as {
  projectToWorldCoordinates: (
    worldSize: number,
    location: LngLat,
  ) => { x: number; y: number };
};

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test("native phone search clears retained desktop padding and frames the selected place above its actual card", () => {
  const viewport = rect(0, 0, 390, 844);
  const panel = rect(10, 410.516, 370, 421.484);
  const status = rect(8, 160, 300, 37.39);
  const padding = projectPlaceCameraPadding(viewport, panel, status);
  const transform = {
    width: viewport.width,
    height: viewport.height,
    padding: { left: 440, right: 60, top: 90, bottom: 60 },
    worldSize: 512 * 2 ** 19,
    scale: 2 ** 19,
  };
  const bounds = new LngLatBounds([-122.8123, 53.8943], [-122.8122, 53.8944]);
  const calculate = () =>
    cameraForBoxAndBearing(
      { maxZoom: 21, offset: [0, 0] },
      padding,
      bounds,
      0,
      transform,
    );
  const warn = console.warn;
  try {
    console.warn = () => {};
    assert.equal(
      calculate(),
      undefined,
      "real MapLibre calculation reproduces the retained-padding mobile failure",
    );
  } finally {
    console.warn = warn;
  }
  const calls: string[] = [];
  const observed: { camera?: Camera } = {};
  const map = {
    getContainer: () => ({
      getBoundingClientRect: () => viewport,
      ownerDocument: {
        querySelector: () => ({ getBoundingClientRect: () => panel }),
      },
      querySelector: () => ({ getBoundingClientRect: () => status }),
    }),
    stop: () => calls.push("stop"),
    resize: () => calls.push("resize"),
    setPadding: (value: typeof transform.padding) => {
      calls.push("padding");
      transform.padding = value;
    },
    fitBounds: (requested: unknown, options: { padding: typeof padding }) => {
      calls.push("fit");
      assert.equal(requested, bounds);
      assert.deepEqual(options.padding, padding);
      observed.camera = calculate();
    },
  };
  fitProjectPlaceBounds(
    map as unknown as Parameters<typeof fitProjectPlaceBounds>[0],
    bounds,
    { maxZoom: 21, duration: 650 },
  );
  assert.deepEqual(calls, ["stop", "resize", "padding", "fit"]);
  const camera = observed.camera;
  assert.ok(camera, "same real MapLibre bounds now produce a camera");
  assert.ok(Number.isFinite(camera.zoom));
  const worldSize = 512 * 2 ** camera.zoom;
  const target = projectToWorldCoordinates(worldSize, bounds.getCenter());
  const center = projectToWorldCoordinates(worldSize, camera.center);
  const x = target.x - center.x + viewport.width / 2;
  const y = target.y - center.y + viewport.height / 2;
  assert(x > padding.left && x < viewport.width - padding.right);
  assert(y > padding.top && y < viewport.height - padding.bottom);
  assert(y < panel.top - 24, "room is visible above the selected mobile sheet");
});

test("place padding preserves a usable canvas on small phones and constrained desktop widths", () => {
  for (const viewport of [
    rect(0, 0, 200, 300),
    rect(0, 0, 390, 844),
    rect(0, 0, 768, 400),
  ]) {
    const padding = projectPlaceCameraPadding(
      viewport,
      rect(0, 0, viewport.width, viewport.height),
      rect(0, 0, 100, viewport.height),
    );
    assert(
      viewport.width - padding.left - padding.right >=
        Math.min(100, viewport.width / 2) - 1e-8,
    );
    assert(
      viewport.height - padding.top - padding.bottom >=
        Math.min(100, viewport.height / 2) - 1e-8,
    );
    assert(Object.values(padding).every((v) => Number.isFinite(v) && v >= 0));
  }
});
