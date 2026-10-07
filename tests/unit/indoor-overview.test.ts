import test from "node:test";
import assert from "node:assert/strict";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import desk from "../fixtures/unbc-library-services-desk-display.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  buildingOverviewGeometry,
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
  WALL_DETAIL_START,
  WALL_DETAIL_END,
  zoomFade,
} from "../../app/indoor-project/zoom-presentation";
import {
  HALLWAY_COLOR,
  OVERVIEW_SOLID_COLOR,
} from "../../app/indoor-project/display-passages";
import { geographicPoint } from "../../app/indoor-project/routing";

const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
test("overview joins wall-width room seams while retaining courtyards and separate buildings", () => {
  const data = structuredClone(desk) as unknown as IndoorDataset;
  const record = data.records[0];
  data.records = [
    {
      ...record,
      key: "left",
      building: "A",
      circulation: false,
      ringsFeet: [rect(0, 0, 10, 20)],
    },
    {
      ...record,
      key: "right",
      building: "A",
      circulation: false,
      ringsFeet: [rect(11, 0, 10, 20)],
    },
    {
      ...record,
      key: "courtyard",
      building: "A",
      circulation: false,
      ringsFeet: [rect(0, 30, 100, 100), rect(20, 50, 60, 60)],
    },
    {
      ...record,
      key: "small-opening",
      building: "A",
      circulation: false,
      ringsFeet: [rect(150, 0, 30, 30), rect(160, 10, 6, 6)],
    },
    {
      ...record,
      key: "other",
      building: "B",
      circulation: false,
      ringsFeet: [rect(23, 0, 10, 20)],
    },
  ];
  const before = JSON.stringify(data);
  const result = buildingOverviewGeometry(data, data.records);
  const a = result.features.find(
    (feature) => feature.properties?.building === "A",
  )!;
  const b = result.features.find(
    (feature) => feature.properties?.building === "B",
  )!;
  assert.ok(a && b);
  assert.ok(
    booleanPointInPolygon(geographicPoint(data, [10.5, 10]), a),
    "one-foot wall seam becomes continuous overview area",
  );
  assert.equal(
    booleanPointInPolygon(geographicPoint(data, [50, 80]), a),
    false,
    "real courtyard remains open",
  );
  assert.ok(
    booleanPointInPolygon(geographicPoint(data, [163, 13]), a),
    "entrance-sized aperture disappears from the campus illustration",
  );
  assert.equal(
    booleanPointInPolygon(geographicPoint(data, [25, 10]), a),
    false,
    "adjacent building is not swallowed",
  );
  assert.equal(
    booleanPointInPolygon(geographicPoint(data, [10, 10]), b),
    false,
  );
  assert.equal(
    JSON.stringify(data),
    before,
    "detailed rooms and graph stay intact",
  );
});

test("overview distinguishes public circulation from restricted and non-walkable areas without altering access", () => {
  const data = structuredClone(desk) as unknown as IndoorDataset;
  const base = data.records[0];
  data.records = [
    {
      ...base,
      key: "hall",
      name: "Hallway",
      building: "A",
      walkable: true,
      access: "public",
      circulation: true,
      ringsFeet: [rect(0, 0, 40, 10)],
    },
    // This narrow island tests the buffer closing: a restricted patch must not
    // become green when the broad walkway's illustration smooths its edges.
    {
      ...base,
      key: "restricted",
      name: "Staff corridor",
      building: "A",
      walkable: true,
      access: "staff",
      circulation: true,
      ringsFeet: [rect(15, 0, 4, 10)],
    },
    {
      ...base,
      key: "shaft",
      name: "Lift shaft",
      building: "A",
      walkable: false,
      access: "public",
      circulation: true,
      ringsFeet: [rect(25, 0, 4, 10)],
    },
  ];
  const before = JSON.stringify(data);
  const result = buildingOverviewGeometry(data, data.records);
  const walkway = result.features.find((f) => f.properties?.circulation)!;
  const solid = result.features.find((f) => !f.properties?.circulation)!;
  assert.equal(walkway.properties?.color, HALLWAY_COLOR);
  assert.equal(solid.properties?.color, OVERVIEW_SOLID_COLOR);
  assert.ok(booleanPointInPolygon(geographicPoint(data, [5, 5]), walkway));
  assert.equal(
    booleanPointInPolygon(geographicPoint(data, [17, 5]), walkway),
    false,
  );
  assert.equal(
    booleanPointInPolygon(geographicPoint(data, [27, 5]), walkway),
    false,
  );
  assert.equal(JSON.stringify(data), before);
});

test("room tints arrive before walls and overview backing stays solid during their transition", () => {
  const tintMidpoint = (ROOM_DETAIL_START + ROOM_DETAIL_END) / 2;
  assert.ok(zoomFade(tintMidpoint, ROOM_DETAIL_START, ROOM_DETAIL_END) > 0);
  assert.equal(zoomFade(tintMidpoint, WALL_DETAIL_START, WALL_DETAIL_END), 0);
  assert.equal(
    zoomFade(ROOM_DETAIL_END, WALL_DETAIL_START, WALL_DETAIL_END),
    0,
  );
  assert.equal(
    zoomFade(WALL_DETAIL_END, WALL_DETAIL_START, WALL_DETAIL_END),
    1,
  );
});

test("overview smoothing retains small verified slab openings and reviewed exterior masks", () => {
  const data = structuredClone(desk) as unknown as IndoorDataset;
  const base = data.records[0];
  data.records = [
    {
      ...base,
      building: "A",
      name: "Hallway",
      circulation: true,
      walkable: true,
      access: "public",
      ringsFeet: [rect(0, 0, 40, 10)],
      properties: {
        ...base.properties,
        floorOpeningsFeet: [rect(10, 2, 2, 2)],
      },
    },
  ];
  data.indoorExclusions = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    areas: [
      {
        id: "outdoors",
        levelId: base.levelId,
        elevationFeet: 0,
        label: "Exterior",
        nativeFloorIds: [],
        partsFeet: [[rect(20, 0, 10, 10)]],
      },
    ],
  };
  const result = buildingOverviewGeometry(data, data.records);
  for (const feature of result.features) {
    assert.equal(
      booleanPointInPolygon(geographicPoint(data, [11, 3]), feature),
      false,
      "small true floor opening remains clear",
    );
    assert.equal(
      booleanPointInPolygon(geographicPoint(data, [25, 5]), feature),
      false,
      "exterior is not painted as an indoor area",
    );
  }
  assert.ok(
    result.features.some((feature) =>
      booleanPointInPolygon(geographicPoint(data, [5, 5]), feature),
    ),
  );
});
