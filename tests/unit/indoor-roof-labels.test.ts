import test from "node:test";
import assert from "node:assert/strict";
import {
  projectRoofLabel,
  roofLabelCollides,
} from "../../app/indoor-project/roof-label-layer";
import maplibregl from "maplibre-gl";
const { MercatorCoordinate } = maplibregl;
import {
  labelVisibleAtZoom,
  labelOpacityAtZoom,
  zoomFade,
  ROOM_DETAIL_ZOOM,
  buildingOverviewLabels,
} from "../../app/indoor-project/zoom-presentation";
import desk from "../fixtures/unbc-library-services-desk-display.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";

test("campus labels hand over to room detail without retaining corridor labels", () => {
  assert.equal(labelVisibleAtZoom(17.5, 0, ROOM_DETAIL_ZOOM), true);
  assert.equal(labelVisibleAtZoom(18, 0, ROOM_DETAIL_ZOOM), false);
  assert.equal(labelVisibleAtZoom(17.5), false);
  assert.equal(labelVisibleAtZoom(18), true);
  assert.equal(labelVisibleAtZoom(21, 18, ROOM_DETAIL_ZOOM), false);
});

test("overview labels group only the displayed buildings and preserve native arrivals", () => {
  const data = structuredClone(desk) as unknown as IndoorDataset;
  data.visitor = {
    version: 1,
    buildings: { "05": { name: "Library" } },
    places: {},
  };
  const records = data.records.filter(
    (r) => r.building === "05" && r.levelId === 311,
  );
  assert.ok(records.length);
  const before = JSON.stringify(data);
  const labels = buildingOverviewLabels(data, records);
  assert.equal(labels.features.length, 1);
  assert.equal(labels.features[0].properties?.name, "Library");
  assert.equal(labels.features[0].properties?.maxZoom, ROOM_DETAIL_ZOOM);
  assert.equal(buildingOverviewLabels(data, []).features.length, 0);
  assert.equal(JSON.stringify(data), before);
});

test("roof labels retain camera projection while lifting only the presentation anchor above room roof", () => {
  const coord = MercatorCoordinate.fromLngLat([-123, 49]);
  // Synthetic pitched camera: altitude affects y and all points retain w=1.
  const scale = 1000;
  const matrix = [
    scale,
    0,
    0,
    0,
    0,
    scale,
    0,
    0,
    0,
    100_000,
    0,
    0,
    -coord.x * scale,
    -coord.y * scale,
    0,
    1,
  ];
  const ground = projectRoofLabel(matrix, -123, 49, 0, 1000, 700)!;
  const roof = projectRoofLabel(matrix, -123, 49, 0.63, 1000, 700)!;
  assert.equal(ground.x, 500);
  assert.equal(ground.y, 350);
  assert.equal(roof.x, ground.x);
  assert.ok(
    roof.y < ground.y,
    "roof anchor follows positive altitude, rather than hiding inside block",
  );
  assert.equal(
    projectRoofLabel(
      matrix.map((value, i) => (i === 15 ? -1 : value)),
      -123,
      49,
      0.63,
      1000,
      700,
    ),
    undefined,
    "behind-camera labels are culled",
  );
});

test("billboard collision culling preserves accepted landmark and reserved map controls", () => {
  const landmark = { left: 100, top: 100, right: 200, bottom: 140 };
  const controls = { left: 700, top: 0, right: 1000, bottom: 100 };
  assert.equal(
    roofLabelCollides({ left: 120, top: 110, right: 160, bottom: 140 }, [
      landmark,
      controls,
    ]),
    true,
  );
  assert.equal(
    roofLabelCollides({ left: 720, top: 20, right: 800, bottom: 80 }, [
      landmark,
      controls,
    ]),
    true,
  );
  assert.equal(
    roofLabelCollides({ left: 250, top: 150, right: 350, bottom: 200 }, [
      landmark,
      controls,
    ]),
    false,
  );
});

test("zoom detail fades continuously and reversibly instead of switching at one zoom", () => {
  for (const zoom of [17.5, 17.75, 18, 18.25, 18.5, 18.25, 18, 17.75, 17.5]) {
    const room = labelOpacityAtZoom(zoom),
      building = labelOpacityAtZoom(zoom, 0, ROOM_DETAIL_ZOOM);
    assert.equal(room, zoom - 17.5);
    assert.equal(building, 18.5 - zoom);
    assert.equal(room + building, 1);
  }
  assert.equal(zoomFade(10, 17.5, 18.5), 0);
  assert.equal(zoomFade(25, 17.5, 18.5), 1);
});
