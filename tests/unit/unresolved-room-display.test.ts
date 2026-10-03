import test from "node:test";
import assert from "node:assert/strict";
import office from "../fixtures/unbc-office-10-1040-display.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
import { unresolvedRoomBoundaryKeys } from "../../app/indoor-project/boundary-evidence";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import { relativeHeightGeometry } from "../../app/indoor-project/relative-heights";
import { nativeFloorGround } from "../../app/indoor-project/native-floor-ground";
const fixture = () => structuredClone(office) as unknown as IndoorDataset;
const options = {
  review: false,
  simplifyGeometry: true,
  showPillars: false,
  showStructures: false,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
};
test("actual unclosed office 10-1040 keeps walls and selection but has no invented raised room boundary", () => {
  const data = fixture(),
    r = data.records[0],
    before = JSON.stringify(data);
  assert.ok(unresolvedRoomBoundaryKeys(data).has(r.key));
  const display = projectDisplayGeometry(data, [r.levelId], "all", r.key);
  assert.equal(display.roomBlocks.features.length, 0);
  assert.ok(display.exposedWalls.features.length > 0);
  assert.equal(
    display.areas.features[0].properties?.boundaryReviewRequired,
    true,
  );
  assert.equal(display.labels.features[0].properties?.heightMetres, 0.03);
  const visitor = prepareFloor(data, [r.levelId], "all", options);
  assert.ok(
    visitor.physicalGround.features.some(
      (f) => f.properties?.nativeFloorId === 1_501_009,
    ),
  );
  assert.ok(
    !visitor.physicalGround.features.some((f) => f.properties?.key === r.key),
  );
  assert.ok(
    visitor.presentation.display.areas.features.some(
      (f) => f.properties?.key === r.key,
    ),
  );
  const review = prepareFloor(data, [r.levelId], "all", {
    ...options,
    review: true,
  });
  assert.ok(
    review.physicalGround.features.some((f) => f.properties?.key === r.key),
  );
  assert.equal(JSON.stringify(data), before);
});
test("a stale or absent compiler rejection does not flatten legacy rooms", () => {
  for (const kind of ["stale", "absent"] as const) {
    const data = fixture();
    if (kind === "stale") data.presentation!.sourceModelSha256 = "foreign";
    else data.presentation = undefined;
    assert.equal(unresolvedRoomBoundaryKeys(data).size, 0);
    assert.ok(
      projectDisplayGeometry(data, [data.records[0].levelId], "all").roomBlocks
        .features.length > 0,
    );
  }
});
test("native slab fallback retains measured relative floor height", () => {
  const data = fixture(),
    r = data.records[0];
  data.records.push({
    ...r,
    key: "lower-datum",
    levelId: 311,
    elevationFeet: 0,
  });
  const prepared = prepareFloor(data, [r.levelId, 311], "all", {
    ...options,
    relativeHeights: true,
  });
  const slab = prepared.physicalGround.features.find(
    (f) => f.properties?.nativeFloorId === 1_501_009,
  )!;
  assert.ok(slab);
  assert.ok(
    Math.abs(
      Number(slab.properties?.base) -
        r.elevationFeet * data.alignment.verticalMetresPerFoot,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      Number(slab.properties?.floorTop) - Number(slab.properties?.base) - 0.005,
    ) < 1e-9,
  );
});
test("native slab ground keeps holes and disconnected parts and ignores other storeys or foreign models", () => {
  const data = fixture(),
    r = data.records[0];
  const ring = (x: number, y: number): [number, number][] => [
    [x, y],
    [x + 10, y],
    [x + 10, y + 10],
    [x, y + 10],
  ];
  const slab = data.walkingSupport!.floors[0];
  slab.ringsFeet = [ring(0, 0), ring(2, 2)];
  slab.partsFeet = [[ring(0, 0), ring(2, 2)], [ring(20, 20)]];
  const shown = nativeFloorGround(data, [r.levelId], "all");
  assert.equal(shown.length, 1);
  assert.equal(shown[0].geometry.coordinates.length, 2);
  assert.equal(shown[0].geometry.coordinates[0].length, 2);
  const surface = relativeHeightGeometry(
    data,
    [r.levelId],
    {
      type: "FeatureCollection",
      features: shown,
    },
    "floor",
  ).features[0];
  assert.equal(
    Number(surface.properties?.floorTop) - Number(surface.properties?.base),
    0.005,
  );
  slab.elevationFeet += 10;
  assert.equal(nativeFloorGround(data, [r.levelId], "all").length, 0);
  slab.elevationFeet -= 10;
  data.walkingSupport!.sourceModelSha256 = "foreign";
  assert.equal(nativeFloorGround(data, [r.levelId], "all").length, 0);
});

test("certified mesh display boundaries require matching cut, floor and owner proof when imported", async () => {
  const data = fixture(),
    r = data.records[0];
  data.doors = [];
  data.presentation!.rooms = [
    {
      roomKey: r.key,
      levelId: r.levelId,
      sourceGeometryKey: JSON.stringify([r.levelId, r.ringsFeet]),
      interiorRingsFeet: r.ringsFeet,
      blockPartsFeet: [r.ringsFeet],
      boundarySource: "native-mesh-wall-enclosure",
      boundaryElementIds: [1_501_413],
      sourceCoverage: 1,
      cellCoverage: 1,
      meshProof: {
        cutElevationFeet: r.elevationFeet + 4,
        precisionFeet: 0.0001,
        nativeFloorCoveredSquareFeet: 100,
        nativeElementIds: [1_501_413],
      },
    },
  ];
  validateIndoorDataset(data);
  for (const kind of [
    "absent",
    "cut",
    "precision",
    "floor",
    "owner",
    "duplicate",
  ] as const) {
    const wrong = structuredClone(data),
      room = wrong.presentation!.rooms[0],
      proof = room.meshProof!;
    if (kind === "absent") room.meshProof = undefined;
    if (kind === "cut") proof.cutElevationFeet += 1;
    if (kind === "precision") proof.precisionFeet = 1;
    if (kind === "floor") proof.nativeFloorCoveredSquareFeet = 0;
    if (kind === "owner") proof.nativeElementIds = [999];
    if (kind === "duplicate") proof.nativeElementIds = [1_501_413, 1_501_413];
    assert.throws(
      () => validateIndoorDataset(wrong),
      /prepared room boundary/,
      kind,
    );
  }
});
