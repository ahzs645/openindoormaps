import { overviewConnectorSurfaces } from "../../scripts/indoor/overview-connector-surfaces";
import type { PreparedDisplayPayload } from "../../app/indoor-project/prepared-display-assets";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  nativeRampPlanDrawing,
  rampPlanBuffers,
  nativeRampPlanLayer,
} from "../../app/indoor-project/ramp-plan";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";

function fixture() {
  const data = progressiveRoutingFixture();
  data.rampDisplay = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    ramps: [
      {
        nativeElementId: 7,
        levelIds: [311],
        buildings: ["04"],
        circulation: true,
        anchorPointFeet: [0, 0, 0],
        trianglesFeet: [
          [
            [0, 0, 0],
            [3, 0, 1],
            [0, 1, 0],
          ],
          [
            [0, 2, 0],
            [3, 2, 1],
            [0, 3, 0],
          ],
        ],
      },
      {
        nativeElementId: 8,
        levelIds: [694],
        buildings: ["05"],
        anchorPointFeet: [0, 0, 0],
        trianglesFeet: [
          [
            [10, 0, 0],
            [11, 0, 0],
            [10, 1, 0],
          ],
        ],
      },
    ],
  };
  return data;
}
test("2D ramps retain only original source triangles and leave the space between them empty", () => {
  const data = fixture(),
    before = JSON.stringify(data),
    drawing = nativeRampPlanDrawing(data, [311], "04");
  assert.equal(drawing.features.length, 2);
  const mesh = rampPlanBuffers(drawing, data.alignment.originGeographic);
  assert.equal(mesh.positions.length, 18);
  const green = new THREE.Color("#bdd5c9");
  assert(Math.abs(mesh.colors[0] - green.r) < 1e-6);
  assert.equal(drawing.features[0].properties?.nativeElementId, 7);
  for (let i = 2; i < mesh.positions.length; i += 3)
    assert.equal(mesh.positions[i], 0);
  // Two disjoint original triangles remain two triangles; no hull or rectangle
  // spans the missing central strip. Source Z/rise arrays remain untouched.
  assert.notDeepEqual(
    drawing.features[0].geometry.coordinates,
    drawing.features[1].geometry.coordinates,
  );
  assert.equal(JSON.stringify(data), before);
  const layer = nativeRampPlanLayer(drawing, data.alignment.originGeographic);
  assert.equal(layer.renderingMode, "2d");
  layer.onRemove?.(undefined as never, undefined as never);
});
test("ramp plans require source identity and respect building and native-floor scope", () => {
  const data = fixture();
  assert.equal(nativeRampPlanDrawing(data, [311], "05").features.length, 0);
  assert.equal(nativeRampPlanDrawing(data, [694], "05").features.length, 1);
  assert.equal(
    nativeRampPlanDrawing(data, [311, 694], "all").features.length,
    3,
  );
  data.rampDisplay!.sourceModelSha256 = "stale";
  assert.equal(
    nativeRampPlanDrawing(data, [311, 694], "all").features.length,
    0,
  );
});
test("vertical faces do not become floor paint and invalid source triangles refuse", () => {
  const data = fixture();
  data.rampDisplay!.ramps[0].trianglesFeet = [
    [
      [0, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
    ],
  ];
  assert.equal(nativeRampPlanDrawing(data, [311], "all").features.length, 0);
  data.rampDisplay!.ramps[0].trianglesFeet = [
    [
      [0, 0, 0],
      [1, 0, NaN],
      [0, 1, 0],
    ],
  ];
  assert.throws(
    () => nativeRampPlanDrawing(data, [311], "all"),
    /invalid source triangle/,
  );
});

test("overview stair paint preserves original holes and excludes overhead surfaces without changing navigation", () => {
  const data = fixture();
  const original = JSON.stringify(data);
  const geometry = {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
        [1, 1],
      ],
    ],
  };
  const source = {
    type: "Feature" as const,
    geometry,
    properties: {
      id: "source-stair:5",
      stairElementId: 5,
      runElementId: 6,
      surfaceKind: "tread",
      levelId: 311,
      color: "#bdd5c9",
      overhead: false,
    },
  };
  const payload = {
    preparedFloor: {
      nativeStairs: {
        type: "FeatureCollection",
        features: [
          source,
          { ...source, properties: { ...source.properties, overhead: true } },
        ],
      },
    },
  } as unknown as PreparedDisplayPayload;
  const plan = overviewConnectorSurfaces(data, payload, [311], "04");
  assert.equal(plan.features.length, 3);
  assert.equal(plan.features[0].geometry, geometry);
  assert.equal(
    (plan.features[0].geometry as typeof geometry).coordinates[1],
    geometry.coordinates[1],
  );
  assert.deepEqual(plan.features[0].properties?.roomKeys, []);
  assert.equal(plan.features[0].properties?.stairElementId, 5);
  assert.equal(
    plan.features[0].properties?.connectorPlan,
    "original-prepared-stair",
  );
  assert.equal(JSON.stringify(data), original);
});
