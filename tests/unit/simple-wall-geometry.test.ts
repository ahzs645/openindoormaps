import test from "node:test";
import type { Feature, MultiPolygon } from "geojson";
import assert from "node:assert/strict";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import fixture from "../fixtures/unbc-agora-wall-posts.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  compactWallDetails,
  simpleWallGeometry,
  simpleRoomGeometry,
} from "../../app/indoor-project/simple-wall-geometry";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
import { geographicPoint } from "../../app/indoor-project/routing";

test("Agora wall-built posts disappear while adjoining straight wall and source data survive", () => {
  const data = structuredClone(fixture) as unknown as IndoorDataset;
  const before = JSON.stringify(data);
  const display = projectDisplayGeometry(data, [311], "07");
  const masks = compactWallDetails(data, display.records);
  assert.ok(masks.length >= 5);
  const simple = simpleWallGeometry(data, display.exposedWalls, masks);
  const contains = (
    features: typeof simple.features,
    point: [number, number],
  ) =>
    features.some((f) =>
      booleanPointInPolygon(geographicPoint(data, point), f),
    );
  assert.ok(
    contains(display.exposedWalls.features, [0.9, 354.5]),
    "original boxed wall detail is present",
  );
  assert.equal(
    contains(simple.features, [0.9, 354.5]),
    false,
    "projection is removed",
  );
  assert.ok(
    contains(simple.features, [-0.37, 354.5]),
    "thin wall continues through the former boxed post",
  );
  assert.equal(JSON.stringify(data), before);
});

test("room edges flatten locally at posts without filling courtyard openings", () => {
  const data = structuredClone(fixture) as unknown as IndoorDataset;
  const outer: [number, number][] = [
    [-10, 0],
    [0, 0],
    [0, 4],
    [1, 4],
    [1, 6],
    [0, 6],
    [0, 10],
    [-10, 10],
    [-10, 0],
  ];
  const courtyard: [number, number][] = [
    [-9, 1],
    [-2, 1],
    [-2, 9],
    [-9, 9],
    [-9, 1],
  ];
  data.records = [{ ...data.records[0], key: "test-room", circulation: false }];
  const collection = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { key: "test-room" },
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: [
            [outer, courtyard].map((r) =>
              r.map((p) => geographicPoint(data, p)),
            ),
          ],
        },
      },
    ],
  };
  const before = JSON.stringify(data);
  const mask = {
    levelId: data.records[0].levelId,
    box: [-1.5, 3.5, 1.5, 6.5],
    ring: [
      [-1.5, 3.5],
      [1.5, 3.5],
      [1.5, 6.5],
      [-1.5, 6.5],
      [-1.5, 3.5],
    ] as [number, number][],
  };
  const contains = (
    features: Feature<MultiPolygon>[],
    point: [number, number],
  ) =>
    features.some((f) =>
      booleanPointInPolygon(geographicPoint(data, point), f),
    );
  const simple = simpleRoomGeometry(data, collection, [mask]);
  assert.ok(contains(collection.features, [0.5, 5]));
  assert.equal(
    contains(simple.features, [0.5, 5]),
    false,
    "protrusion is flattened",
  );
  assert.ok(
    contains(simple.features, [-0.5, 5]),
    "room reaches the straight edge",
  );
  assert.equal(
    contains(simple.features, [-5, 5]),
    false,
    "courtyard stays open",
  );
  assert.ok(
    contains(simple.features, [-0.5, 1]),
    "unrelated room geometry stays intact",
  );
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(
    simpleRoomGeometry(data, collection, []),
    collection,
    "detailed geometry remains recoverable",
  );
});

test("door footprints and labelled room arrivals protect compact wall details", () => {
  const data = structuredClone(fixture) as unknown as IndoorDataset;
  const records = data.records;
  const original = compactWallDetails(data, records);
  const first = original[0],
    point: [number, number] = [
      (first.box[0] + first.box[2]) / 2,
      (first.box[1] + first.box[3]) / 2,
    ];
  data.doors = [
    ...(data.doors ?? []),
    {
      id: "door",
      levelId: 311,
      nativeElementId: 1,
      pointFeet: [point[0] + 5, point[1]],
      footprintFeet: [
        [point[0], point[1]],
        [point[0] + 5, point[1]],
        [point[0] + 5, point[1] + 0.1],
        [point[0], point[1] + 0.1],
      ],
      roomKeys: [],
      state: "connected",
    },
  ];
  assert.ok(compactWallDetails(data, records).length < original.length);
  data.doors.pop();
  data.nodes.push({
    ...data.nodes[0],
    id: "protected",
    kind: "arrival",
    levelId: 311,
    pointFeet: [...point, 0],
  });
  assert.ok(compactWallDetails(data, records).length < original.length);
});
