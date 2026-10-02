import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import IndoorDirections from "../app/indoor-directions/directions/main";
import { hospitalFollowPadding } from "../app/utils/hospital-follow-padding";

const routes = JSON.parse(
  readFileSync("app/data/bc-hospital/indoor-routes.geojson", "utf8"),
);
const pois = JSON.parse(
  readFileSync("app/data/bc-hospital/pois.geojson", "utf8"),
).features;
let displayed: GeoJSON.FeatureCollection;
const noop = () => {};
const map = new Proxy(
  {},
  {
    get: (_, key) => {
      if (key === "getSource")
        return () => ({
          setData: (data: GeoJSON.FeatureCollection) => {
            displayed = data;
          },
        });
      if (key === "getStyle") return () => ({ layers: [] });
      if (key === "getCanvas") return () => ({ style: {} });
      return noop;
    },
  },
) as maplibregl.Map;
const engine = new IndoorDirections(map);
engine.loadMapData(routes);
engine.setPathfindingOptions({ accessibleOnly: true });
let checked = 0;
for (const [from, to] of [
  [300, 258],
  [1877, 260],
  [260, 1877],
]) {
  const start = pois.find(
    (poi: GeoJSON.Feature) => Number(poi.id ?? poi.properties?.id) === from,
  );
  const finish = pois.find(
    (poi: GeoJSON.Feature) => Number(poi.id ?? poi.properties?.id) === to,
  );
  assert.ok(start && finish);
  engine.setWaypoints(
    [start.geometry.coordinates, finish.geometry.coordinates],
    [start.properties.floor, finish.properties.floor],
  );
  assert.ok(engine.routeInstructions.length);
  for (const [index, step] of engine.routeInstructions.entries()) {
    const view = engine.setInstructionFocus(index, true);
    assert.ok(view?.coordinates.length, step.message);
    assert.equal(view.level, step.toLevel);
    const floorCoordinates = new Set(
      engine.routelinesCoordinates[0]
        .filter((line) => line.properties?.level_id === view.level)
        .flatMap((line) => line.geometry.coordinates)
        .map((coordinate) => JSON.stringify(coordinate)),
    );
    for (const coordinate of view.coordinates)
      assert.ok(
        floorCoordinates.has(JSON.stringify(coordinate)),
        `Wrong-floor geometry: ${step.message}`,
      );
    const marker = displayed!.features.find(
      (feature) => feature.properties?.type === "STEP_FOCUS",
    );
    assert.deepEqual(marker?.geometry, {
      type: "Point",
      coordinates:
        step.type === "floor-change" ? step.arrivalPosition : step.position,
    });
    if (step.type === "floor-change") {
      assert.ok(
        view.coordinates.length > 1,
        "Ride must frame the arrival route, not only its shaft",
      );
      assert.ok(
        !displayed!.features.some(
          (feature) => feature.properties?.type === "INSTRUCTION",
        ),
      );
    } else if (step.distanceMeters >= 3) {
      assert.ok(
        displayed!.features.some(
          (feature) => feature.properties?.type === "INSTRUCTION",
        ),
        step.message,
      );
    }
    checked++;
  }
  engine.clearInstructionFocus();
  assert.ok(
    !displayed!.features.some((feature) =>
      ["INSTRUCTION", "STEP_FOCUS"].includes(feature.properties?.type),
    ),
  );
}

for (const [width, height, top, floorTop] of [
  [390, 844, 144, 615],
  [320, 568, 165, 330],
]) {
  const container = {
    getBoundingClientRect: () => ({
      width,
      height,
      left: 0,
      top: 0,
      bottom: height,
    }),
    ownerDocument: {},
    querySelector: (selector: string) => ({
      getBoundingClientRect: () =>
        selector.includes("Current direction")
          ? { height: top, bottom: top }
          : { height: 40, top: floorTop },
    }),
  } as unknown as HTMLElement;
  const padding = hospitalFollowPadding(container);
  const visibleTop = padding.top ?? 0;
  const visibleBottom = height - (padding.bottom ?? 0);
  assert.ok(visibleTop >= top && visibleBottom <= floorTop);
  assert.ok(visibleBottom - visibleTop >= 100);
}
engine.clear();
assert.equal(engine.setInstructionFocus(0, true), null);
console.log(
  `PASS: ${checked} forward/reverse hospital instruction sections stay on the correct floor; connector arrival context, focus cleanup and mobile card clearance.`,
);
