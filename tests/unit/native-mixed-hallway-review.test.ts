import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../fixtures/native-area-project";
import {
  nativeMixedHallwayFeatures,
  nativeMixedHallwayIssues,
} from "../../app/indoor-project/native-mixed-hallway-review";
import type { NativeExploreResult } from "../../app/indoor-project/native-explore";

function sample() {
  const data = fixture();
  data.records = [
    {
      ...data.records[0],
      key: "hall",
      name: "Corridor",
      circulation: true,
      walkable: true,
      access: "public",
    },
    {
      ...data.records[1],
      key: "office",
      name: "Office",
      circulation: false,
      walkable: true,
      access: "staff",
    },
  ];
  const base = {
    id: "mixed",
    levelId: data.nativeLevels[0].id,
    ringsFeet: data.records[0].ringsFeet,
    displayPartsFeet: [data.records[0].ringsFeet],
    roomKeys: ["hall", "office", "office", "missing"],
    nativeFloorIds: [],
    nativeDoorIds: [],
    areaSquareFeet: 10,
    exposedFloorEdgeFeet: 0,
  };
  const feature = {
    type: "Feature" as const,
    properties: { nativeRegionId: "mixed", circulation: false },
    geometry: {
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
    },
  };
  const result: NativeExploreResult = {
    regions: [base],
    fills: { type: "FeatureCollection", features: [feature] },
    overview: { type: "FeatureCollection", features: [feature] },
    outlines: { type: "FeatureCollection", features: [feature] },
    partitions: { type: "FeatureCollection", features: [] },
    warnings: [],
    warningCount: 0,
    levelIds: [base.levelId],
  };
  return { data, result, feature };
}
test("only visible mixed non-green circulation faces are review issues", () => {
  const { data, result, feature } = sample();
  const before = JSON.stringify({ data, result });
  const issues = nativeMixedHallwayIssues(data, result);
  assert.equal(issues.length, 1);
  assert.deepEqual(
    issues[0].hallways.map((r) => r.key),
    ["hall"],
  );
  assert.deepEqual(
    issues[0].otherPlaces.map((r) => r.key),
    ["office"],
  );
  assert.equal(issues[0].staffCount, 1);
  assert.equal(JSON.stringify({ data, result }), before);
  result.overview.features = [
    { ...feature, properties: { ...feature.properties, circulation: true } },
  ];
  assert.deepEqual(nativeMixedHallwayIssues(data, result), []);
  result.overview.features = [];
  assert.deepEqual(nativeMixedHallwayIssues(data, result), []);
});
test("a lone hallway or only staff/room labels is outside the mixed review scope", () => {
  const { data, result } = sample();
  for (const keys of [["hall"], ["office"], ["missing"], []]) {
    result.regions[0].roomKeys = keys;
    assert.deepEqual(nativeMixedHallwayIssues(data, result), []);
  }
});
test("overlay reuses native drawing and perimeter objects with holes, and clears without mutation", () => {
  const { result, feature } = sample();
  const collection = nativeMixedHallwayFeatures(result, ["mixed"]);
  assert.equal(collection.features[0], feature);
  assert.equal(collection.features[0].geometry.coordinates.length, 2);
  assert.equal(
    nativeMixedHallwayFeatures(result, ["mixed"], "outlines").features[0],
    result.outlines.features[0],
  );
  assert.deepEqual(nativeMixedHallwayFeatures(result, []).features, []);
  assert.deepEqual(
    nativeMixedHallwayFeatures(undefined, ["mixed"]).features,
    [],
  );
  assert.equal(result.overview.features.length, 1);
});
