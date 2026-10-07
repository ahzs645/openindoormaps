import test from "node:test";
import assert from "node:assert/strict";
import office from "../fixtures/unbc-office-10-1040-display.json";
import classroom from "../fixtures/unbc-classroom-08-161-display.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { displayDoorwayClosures } from "../../app/indoor-project/display-doorway-closures";
import { wallFaceRoomFloorMasks } from "../../app/indoor-project/wall-face-floor-masks";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
import { wallJunctionPatches } from "../../app/indoor-project/wall-junctions";

const walls = (gap: number): IndoorDataset["walls"] =>
  [0, 10 + gap].map((y, i) => ({
    levelId: 311,
    nativeElementId: i + 1,
    kind: "wall",
    approximate: false,
    ringsFeet: [
      [
        [0, y],
        [0.5, y],
        [0.5, y + 10],
        [0, y + 10],
      ],
    ],
  }));
test("10-1040 has a four-foot native jamb opening, so five- and six-foot limits produce identical room floors", () => {
  const data = structuredClone(office) as unknown as IndoorDataset,
    before = JSON.stringify(data),
    key = data.records[0].key;
  const five = wallFaceRoomFloorMasks(data, data.records, 5),
    six = wallFaceRoomFloorMasks(data, data.records, 6);
  assert.deepEqual(five.get(key), six.get(key));
  const opening = five.assumedOpenings
    ?.get(key)
    ?.find(
      (o) => o.wallIds.includes(1_501_330) && o.wallIds.includes(1_501_327),
    );
  assert.ok(opening);
  assert.ok(Math.abs(opening.widthFeet - 4) < 0.001);
  assert.ok(five.displayEnclosures?.has(key));
  assert.ok(
    !wallFaceRoomFloorMasks(data, data.records, 3).displayEnclosures?.has(key),
  );
  assert.notDeepEqual(
    wallFaceRoomFloorMasks(data, data.records, 3).get(key),
    five.get(key),
  );
  assert.equal(JSON.stringify(data), before);
});
test("doorway-closed Office display uses the standard room volume height without changing routing", () => {
  const data = structuredClone(office) as unknown as IndoorDataset;
  const before = JSON.stringify(data);
  const record = data.records[0];
  const options = {
    review: false,
    simplifyGeometry: true,
    showPillars: false,
    showPassThroughPlaces: false,
    showVestibuleDoors: false,
    showStructures: false,
  };
  for (const relativeHeights of [false, true]) {
    const prepared = prepareFloor(data, [record.levelId], "all", {
      ...options,
      relativeHeights,
    });
    const block = prepared.assumedRoomBlocks.features.find(
      (f) => f.properties?.key === record.key,
    )!;
    assert.ok(block);
    assert.equal(
      block.properties?.boundarySource,
      "assumed-native-wall-enclosure",
    );
    assert.equal(block.properties?.displayOnly, true);
    assert.ok(
      Math.abs(
        Number(block.properties?.height) -
          Number(block.properties?.base ?? 0) -
          0.6,
      ) < 1e-8,
    );
    assert.ok(
      Number(
        prepared.presentation.display.labels.features[0].properties
          ?.heightMetres,
      ) >= 0.63,
    );
  }
  assert.equal(
    prepareFloor(data, [record.levelId], "all", { ...options, review: true })
      .assumedRoomBlocks.features.length,
    0,
  );
  assert.equal(JSON.stringify(data), before);
});
test("a five-and-a-half-foot aligned gap is closed only by the six-foot limit", () => {
  assert.equal(displayDoorwayClosures(walls(5.5), 5).length, 0);
  const six = displayDoorwayClosures(walls(5.5), 6);
  assert.equal(six.length, 1);
  assert.equal(six[0].widthFeet, 5.5);
  assert.equal(displayDoorwayClosures(walls(6.01), 6).length, 0);
});
test("a tiny native jamb closes against a long aligned wall, but two short posts cannot invent a doorway", () => {
  const ws = walls(4);
  ws[1].ringsFeet[0][2][1] = 14.6;
  ws[1].ringsFeet[0][3][1] = 14.6;
  const closures = displayDoorwayClosures(ws);
  assert.equal(closures.length, 1);
  assert.equal(closures[0].widthFeet, 4);
  ws[0].ringsFeet[0][2][1] = 0.6;
  ws[0].ringsFeet[0][3][1] = 0.6;
  assert.equal(displayDoorwayClosures(ws).length, 0);
});
test("room corner assumptions do not widen the physical renderer's numerical cleanup", () => {
  const ws = walls(4);
  ws[1].ringsFeet = [
    [
      [0, 10.25],
      [10, 10.25],
      [10, 10.75],
      [0, 10.75],
    ],
  ];
  const before = JSON.stringify(ws);
  assert.equal(wallJunctionPatches(ws).length, 0);
  assert.ok(wallJunctionPatches(ws, 0.3).length > 0);
  ws[1].ringsFeet[0].forEach((p) => (p[1] += 0.1));
  assert.equal(wallJunctionPatches(ws, 0.3).length, 0);
  ws[1].ringsFeet[0].forEach((p) => (p[1] -= 0.1));
  assert.equal(JSON.stringify(ws), before);
});
test("08-161 uses its enclosed native wall interior at both limits, without changing navigation or source outlines", () => {
  const data = structuredClone(classroom) as unknown as IndoorDataset;
  const before = JSON.stringify(data);
  const room = data.records.find((r) => r.number === "08-161")!;
  const five = wallFaceRoomFloorMasks(data, data.records, 5);
  const six = wallFaceRoomFloorMasks(data, data.records, 6);
  assert.ok(five.displayEnclosures?.has(room.key));
  assert.ok(five.cornerContinuations?.has(room.key));
  assert.deepEqual(five.get(room.key), six.get(room.key));
  assert.deepEqual(
    five.assumedOpenings
      ?.get(room.key)
      ?.map((o) => Math.round(o.widthFeet * 100) / 100),
    [4.75, 3.5],
  );
  assert.notDeepEqual(five.get(room.key), room.ringsFeet);
  const prepared = prepareFloor(data, [room.levelId], "all", {
    review: false,
    simplifyGeometry: false,
    showPillars: false,
    showPassThroughPlaces: false,
    showVestibuleDoors: false,
    showStructures: false,
    relativeHeights: false,
  });
  const block = prepared.assumedRoomBlocks.features.find(
    (f) => f.properties?.key === room.key,
  );
  assert.ok(block);
  assert.equal(block.properties?.displayOnly, true);
  assert.equal(
    block.properties?.boundarySource,
    "assumed-native-wall-enclosure",
  );
  assert.equal(block.properties?.displayCornerContinuation.maximumFeet, 0.3);
  assert.equal(
    Number(block.properties?.height) - Number(block.properties?.base ?? 0),
    0.6,
  );
  assert.equal(JSON.stringify(data), before);
});
test("restricted and passage areas remain flat even when native faces can bound a volume", () => {
  for (const name of ["staff", "Vestibule", "Corridor", "Rotunda"]) {
    const data = structuredClone(office) as unknown as IndoorDataset;
    if (name === "staff") data.records[0].access = "staff";
    else data.records[0].name = name;
    assert.equal(wallFaceRoomFloorMasks(data, data.records).size, 0);
  }
});
test("misaligned, skewed, approximate and different-floor wall ends cannot supply an assumed doorway", () => {
  for (const kind of ["offset", "skew", "approximate", "level"] as const) {
    const ws = walls(4);
    if (kind === "offset") ws[1].ringsFeet[0].forEach((p) => (p[0] += 0.2));
    if (kind === "skew") ws[1].ringsFeet[0][1][1] += 0.25;
    if (kind === "approximate") ws[1].approximate = true;
    if (kind === "level") ws[1].levelId = 694;
    assert.equal(displayDoorwayClosures(ws).length, 0, kind);
  }
});
