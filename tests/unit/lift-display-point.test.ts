import assert from "node:assert/strict";
import test from "node:test";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import { fixture } from "../fixtures/native-area-project";
import {
  liftDisplayPoint,
  projectConnectorMarkers,
} from "../../app/indoor-project/connector-markers";
import { geographicPoint } from "../../app/indoor-project/routing";
import { validateIndoorExclusions } from "../../app/indoor-project/indoor-exclusions";
import { validateIndoorExclusions as compilerValidate } from "../../../reviter/lib/reviter/indoor-exclusions";
function shaftFixture() {
  const d = fixture();
  d.records = [];
  d.connectors = [
    {
      id: "lift",
      kind: "elevator",
      nativeElementId: 900,
      reviewedShaft: {
        pinId: "reviewed-shaft",
        pointFeet: [4, 4],
        wallElementIds: [900, 901, 902],
      },
      sourceModelSha256: d.source.modelSha256,
      evidence: "original shaft walls and served slab",
      accessible: "unknown",
      direction: "both",
      entrances: [
        { nodeId: "lower", roomKey: "lobby", levelId: 1 },
        { nodeId: "upper", roomKey: "lobby2", levelId: 2 },
      ],
    },
  ];
  d.nodes = [
    {
      id: "lower",
      roomKey: "lobby",
      levelId: 1,
      building: "01",
      surfaceId: "first",
      kind: "connector",
      pointFeet: [12, 4, 0],
      geographic: [0, 0],
    },
    {
      id: "upper",
      roomKey: "lobby2",
      levelId: 2,
      building: "01",
      surfaceId: "second",
      kind: "connector",
      pointFeet: [12, 4, 10],
      geographic: [0, 0],
    },
  ];
  d.edges = [
    {
      id: "lift-edge",
      from: "lower",
      to: "upper",
      kind: "elevator",
      connectorId: "lift",
      nativeElementId: 900,
      roomKeys: ["lobby", "lobby2"],
      enabled: true,
      lengthMetres: 3.048,
      pointsFeet: [
        [12, 4, 0],
        [12, 4, 10],
      ],
      evidence: "Original served shaft and measured lobby entrances",
      accessible: "unknown",
    },
  ];
  d.indoorExclusions = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    areas: [
      {
        id: "shaft-1",
        reason: "off-limits",
        connectorId: "lift",
        levelId: 1,
        elevationFeet: 0,
        label: "Lift shaft",
        nativeFloorIds: [100],
        partsFeet: [
          [
            [
              [0, 0],
              [8, 0],
              [8, 10],
              [0, 10],
            ],
          ],
        ],
      },
    ],
  };
  return d;
}
test("lift icon centers inside reviewed shaft while lobby routing nodes and portal IDs remain byte-identical", () => {
  const d = shaftFixture(),
    before = JSON.stringify(d);
  const point = liftDisplayPoint(d, "lift", 1, d.nodes[0].pointFeet);
  assert.deepEqual(point, [4, 5, 0]);
  const marker = projectConnectorMarkers(d, [1], "all").features.find(
    (f) => f.properties?.kind === "elevator",
  )!;
  assert.equal(marker.properties!.id, "lift-edge");
  assert.deepEqual(marker.geometry.coordinates, geographicPoint(d, point));
  assert.equal(JSON.stringify(d), before);
});
test("concave shaft or real inner opening uses a checked interior display point", () => {
  const d = shaftFixture();
  const rings: [number, number][][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
    ],
  ];
  d.connectors![0].reviewedShaft!.pointFeet = [1, 1];
  d.indoorExclusions!.areas[0].partsFeet = [rings];
  const point = liftDisplayPoint(d, "lift", 1, d.nodes[0].pointFeet);
  assert(
    pointInPolygon(point, {
      type: "Polygon",
      coordinates: rings.map((r) => [...r, r[0]]),
    }),
  );
  assert(
    !pointInPolygon(point, {
      type: "Polygon",
      coordinates: [[...rings[1], rings[1][0]]],
    }),
  );
});
test("stale or unserved lift cannot move its icon; legacy certified shaft reference remains display-only", () => {
  const d = shaftFixture(),
    entrance = d.nodes[0].pointFeet;
  assert.deepEqual(liftDisplayPoint(d, "lift", 99, entrance), entrance);
  d.connectors![0].sourceModelSha256 = "c".repeat(64);
  assert.deepEqual(liftDisplayPoint(d, "lift", 1, entrance), entrance);
  d.connectors![0].sourceModelSha256 = d.source.modelSha256;
  d.indoorExclusions!.sourceModelSha256 = "d".repeat(64);
  assert.deepEqual(liftDisplayPoint(d, "lift", 1, entrance), [4, 4, 0]);
});
test("shaft ownership metadata has app/compiler exclusion-schema parity", () => {
  const d = shaftFixture();
  for (const validate of [validateIndoorExclusions, compilerValidate]) {
    assert.doesNotThrow(() =>
      validate(d.indoorExclusions, d.source.modelSha256),
    );
    assert.throws(
      () =>
        validate(
          {
            ...d.indoorExclusions,
            areas: [{ ...d.indoorExclusions!.areas[0], reason: "outdoor" }],
          },
          d.source.modelSha256,
        ),
      /footprint/,
    );
    assert.throws(
      () =>
        validate(
          {
            ...d.indoorExclusions,
            areas: [{ ...d.indoorExclusions!.areas[0], connectorId: "" }],
          },
          d.source.modelSha256,
        ),
      /footprint/,
    );
  }
});
