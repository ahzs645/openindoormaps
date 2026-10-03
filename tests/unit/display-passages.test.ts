import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  projectDisplayGeometry,
  roomDisplayColor,
  EXPOSED_WALL_HEIGHT_METRES,
  ROOM_BLOCK_HEIGHT_METRES,
} from "../../app/indoor-project/display-geometry";
import {
  isDisplayPassage,
  isHallway,
  HALLWAY_COLOR,
  RESTRICTED_AREA_COLOR,
  vestibuleDoorIds,
} from "../../app/indoor-project/display-passages";
const fixture = (): IndoorDataset =>
  JSON.parse(
    readFileSync(
      new URL("../fixtures/unbc-pass-through-display.json", import.meta.url),
      "utf8",
    ),
  );

test("staff corridor 07-113A is a tinted passage rather than a room block without changing access or routing", () => {
  const data = fixture(),
    before = JSON.stringify(data);
  const room = data.records.find((r) => r.number === "07-113A")!;
  assert.equal(room.circulation, false);
  assert.equal(room.access, "staff");
  assert.equal(isHallway(room), true);
  const shown = projectDisplayGeometry(data, [room.levelId], "all");
  const floor = shown.areas.features.find(
    (f) => f.properties?.key === room.key,
  )!;
  assert.equal(floor.properties?.circulation, true);
  assert.equal(floor.properties?.color, RESTRICTED_AREA_COLOR);
  assert.equal(
    shown.roomBlocks.features.some((f) => f.properties?.key === room.key),
    false,
  );
  assert.equal(
    shown.labels.features.some((f) => f.properties?.key === room.key),
    false,
  );
  assert.equal(JSON.stringify(data), before);
});

test("restricted rooms stay flat with access colour through selection without changing source or routes", () => {
  const data = fixture();
  const corridor = data.records.find((r) => r.number === "07-113A")!;
  const room = { ...corridor, key: "restricted-room", name: "Staff office" };
  data.records.push(room);
  data.visitor = {
    version: 1,
    buildings: {},
    places: {
      [corridor.key]: { color: "#00ff00" },
      [room.key]: { color: "#00ff00" },
    },
  };
  const before = JSON.stringify(data);
  for (const selected of ["", corridor.key, room.key]) {
    const shown = projectDisplayGeometry(data, [room.levelId], "all", selected);
    for (const area of [corridor, room]) {
      const surface = shown.areas.features.find(
        (f) => f.properties?.key === area.key,
      )!;
      assert.equal(surface.properties?.color, RESTRICTED_AREA_COLOR);
      assert.equal(surface.properties?.access, "staff");
      assert.equal(surface.properties?.circulation, true);
      assert.equal(
        shown.roomBlocks.features.some((f) => f.properties?.key === area.key),
        false,
      );
    }
    assert.ok(
      shown.roomBlocks.features.some(
        (f) =>
          f.properties?.key ===
          data.records.find((r) => r.number === "07-165")!.key,
      ),
    );
  }
  assert.equal(JSON.stringify(data), before);
});

test("an unverified entrance does not classify public or unknown access as restricted", () => {
  const room = fixture().records.find((r) => r.number === "07-113A")!;
  for (const access of ["public", "unknown"] as const) {
    const publicRoom = { ...room, access, arrivalNodeId: undefined };
    assert.equal(roomDisplayColor(publicRoom, false), HALLWAY_COLOR);
    assert.equal(roomDisplayColor(publicRoom, true), "#ffe09d");
  }
});

test("UNBC rotunda and vestibule remain open floors without changing source or routing", () => {
  const data = fixture(),
    before = JSON.stringify(data);
  const vestibule = data.records.find((r) => r.number === "04-122")!,
    rotunda = data.records.find((r) => r.number === "04-124")!;
  assert.equal(rotunda.circulation, false);
  const shown = projectDisplayGeometry(data, [311], "all");
  for (const room of [vestibule, rotunda]) {
    assert.equal(isDisplayPassage(room), true);
    assert.equal(
      shown.areas.features.find((f) => f.properties?.key === room.key)
        ?.properties?.circulation,
      true,
    );
    assert.equal(
      shown.roomBlocks.features.some((f) => f.properties?.key === room.key),
      false,
    );
    assert.equal(
      shown.labels.features.some((f) => f.properties?.key === room.key),
      false,
    );
  }
  assert.equal(
    shown.roomBlocks.features.some(
      (f) =>
        f.properties?.key ===
        data.records.find((r) => r.number === "07-165")!.key,
    ),
    true,
  );
  assert.equal(JSON.stringify(data), before);
  // Separate top surfaces after vector-tile quantization. The source wall
  // geometry itself still stays exactly where the model placed it.
  assert.ok(EXPOSED_WALL_HEIGHT_METRES > ROOM_BLOCK_HEIGHT_METRES);
});

test("vestibule visibility hides only markers; physical door apertures and walls remain", () => {
  const data = fixture(),
    ids = vestibuleDoorIds(data);
  assert.ok(ids.size > 0);
  const hidden = projectDisplayGeometry(data, [311], "all");
  const shown = projectDisplayGeometry(
    data,
    [311],
    "all",
    "",
    false,
    true,
    true,
    true,
  );
  assert.equal(
    hidden.doorMarkers.features.some((f) => ids.has(String(f.properties?.id))),
    false,
  );
  assert.ok(
    shown.doorMarkers.features.some((f) => ids.has(String(f.properties?.id))),
  );
  assert.equal(
    shown.doorMarkers.features.length - hidden.doorMarkers.features.length,
    ids.size,
  );
  assert.deepEqual(hidden.exposedWalls, shown.exposedWalls);
  assert.deepEqual(hidden.roomBlocks, shown.roomBlocks);
  assert.ok(
    shown.labels.features.some(
      (f) =>
        f.properties?.key ===
        data.records.find((r) => r.number === "04-122")!.key,
    ),
  );
});

test("a source vestibule with a missing circulation flag never becomes a room block", () => {
  const data = fixture();
  const room = data.records.find((r) => r.number === "04-122")!;
  room.circulation = false;
  assert.equal(
    projectDisplayGeometry(data, [311], "all").roomBlocks.features.some(
      (f) => f.properties?.key === room.key,
    ),
    false,
  );
  assert.equal(room.circulation, false);
});

test("bounds-only native wall 948595 remains reviewable without a room-sized visitor extrusion", async () => {
  const { visitorWallGeometry } = await import(
    "../../app/indoor-project/visitor-wall-geometry"
  );
  const data = fixture(),
    before = JSON.stringify(data.nodes);
  data.walls.find((w) => w.nativeElementId === 948_595)!.approximate = true;
  const display = projectDisplayGeometry(data, [311], "all");
  const envelope = display.exposedWalls.features.find(
    (f) => f.properties?.nativeElementId === 948_595,
  );
  assert.equal(envelope?.properties?.approximate, true);
  const visitor = visitorWallGeometry(
    data,
    display.exposedWalls,
    display.records,
  );
  assert.equal(
    visitor.features.some((f) => f.properties?.nativeElementId === 948_595),
    false,
  );
  assert.equal(JSON.stringify(data.nodes), before);
  assert.equal(
    data.walls.find((w) => w.nativeElementId === 948_595)!.ringsFeet[0].length,
    4,
  );
});

test("local display recovery cannot override a compiler-rejected native enclosure", async () => {
  const { wallRoomBoundaries } = await import(
    "../../app/indoor-project/wall-room-boundaries"
  );
  const data = fixture();
  data.presentation = undefined;
  const recovered = wallRoomBoundaries(data, data.records);
  assert.ok(
    recovered.size > 0,
    "fixture must include a locally recoverable room",
  );
  const [key] = recovered.keys();
  const record = data.records.find((r) => r.key === key)!;
  data.presentation = {
    version: 1,
    generator: "reviter/native-room-presentation-2",
    sourceModelSha256: data.source.modelSha256,
    junctionToleranceFeet: 0.08,
    rooms: [],
    diagnostics: [
      {
        roomKey: key,
        levelId: record.levelId,
        code: "multiple-room-labels",
        message: "Two labels share this native cell.",
      },
    ],
  };
  assert.equal(wallRoomBoundaries(data, data.records).has(key), false);
  const shown = projectDisplayGeometry(data, [record.levelId], "all");
  assert.equal(
    shown.areas.features.find((f) => f.properties?.key === key)?.properties
      ?.boundarySource,
    "source-footprint",
  );
  data.presentation.sourceModelSha256 = "foreign-model";
  assert.equal(wallRoomBoundaries(data, data.records).has(key), true);
});
