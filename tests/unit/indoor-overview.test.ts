import test from "node:test";
import assert from "node:assert/strict";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import desk from "../fixtures/unbc-library-services-desk-display.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { buildingOverviewGeometry } from "../../app/indoor-project/zoom-presentation";
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
