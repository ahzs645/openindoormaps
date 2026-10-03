import test from "node:test";
import assert from "node:assert/strict";
import pc from "polygon-clipping";
import pointInPolygon from "@turf/boolean-point-in-polygon";
import office from "../fixtures/unbc-office-10-1040-display.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { geographicPoint } from "../../app/indoor-project/routing";
import {
  wallFaceRoomFloorMasks,
  wallFaceFloorSurfaces,
} from "../../app/indoor-project/wall-face-floor-masks";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
import { nativeDoorDisplayAperture } from "../../app/indoor-project/circulation-thresholds";

const fixture = () => structuredClone(office) as unknown as IndoorDataset;
const rect = (x: number, y: number, size: number): [number, number][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];
const corners: [number, number][] = [
  [74, 780.6],
  [77, 779],
  [77, 800.25],
];
test("actual 10-1040 tint follows the native wall faces and corners without promoting its open enclosure", () => {
  const data = fixture(),
    room = data.records[0],
    before = JSON.stringify(data);
  const mask = wallFaceRoomFloorMasks(data, data.records).get(room.key);
  assert.ok(mask);
  for (const p of corners)
    assert.ok(
      pointInPolygon(p, {
        type: "Polygon",
        coordinates: mask.map((r) => [...r, r[0]]),
      }),
      `Missing native face at ${p}`,
    );
  assert.equal(JSON.stringify(data), before);
  assert.equal(data.presentation!.rooms.length, 0);
  assert.ok(data.presentation!.diagnostics.some((d) => d.roomKey === room.key));
});
test("hallway source-mask gaps are removed, with doors and other native levels retained", () => {
  const data = fixture(),
    room = data.records[0],
    corridor = {
      ...room,
      key: "hallway",
      circulation: true,
      ringsFeet: [rect(60, 775, 32)],
    };
  data.records.push(corridor);
  const parts = pc.difference(corridor.ringsFeet, room.ringsFeet);
  const areas: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { key: corridor.key, circulation: true },
        geometry: {
          type: "MultiPolygon",
          coordinates: parts.map((rings) =>
            rings.map((r) => r.map((p) => geographicPoint(data, p))),
          ),
        },
      },
    ],
  };
  const before = JSON.stringify(data),
    shown = wallFaceFloorSurfaces(data, data.records, areas);
  for (const p of corners) {
    const geo = geographicPoint(data, p);
    assert.ok(pointInPolygon(geo, areas.features[0]));
    assert.ok(
      !pointInPolygon(geo, shown.features[0]),
      `Blue gap survives at ${p}`,
    );
  }
  assert.equal(JSON.stringify(data), before);
  const door = data.doors!.find((d) => d.nativeElementId === 2_177_664)!;
  assert.ok(
    pointInPolygon(geographicPoint(data, door.pointFeet), shown.features[0]),
    "doorway stays blue",
  );
  const other = structuredClone(data);
  other.records[1].levelId = 311;
  assert.deepEqual(wallFaceFloorSurfaces(other, other.records, areas), areas);
});
test("unverified source, missing floor and neighbouring room claims cannot authorize an expansion", () => {
  for (const kind of ["stale", "no-floor", "other-room"] as const) {
    const data = fixture();
    if (kind === "stale")
      data.walkingSupport!.sourceModelSha256 = "other-model";
    if (kind === "no-floor") data.walkingSupport!.floors = [];
    if (kind === "other-room")
      data.records.push({
        ...data.records[0],
        key: "other-room",
        ringsFeet: [rect(76.5, 778.5, 1)],
      });
    assert.equal(
      wallFaceRoomFloorMasks(data, data.records).has(data.records[0].key),
      false,
      kind,
    );
  }
});
test("review retains the original outline, while visitor selection follows the corrected flat mask", () => {
  const data = fixture(),
    room = data.records[0],
    options = {
      review: false,
      simplifyGeometry: true,
      showPillars: false,
      showPassThroughPlaces: false,
      showVestibuleDoors: false,
      showStructures: false,
    };
  const shown = prepareFloor(data, [room.levelId], "all", options);
  const selection = shown.selectionAreas.features.find(
    (f) => f.properties?.key === room.key,
  )!;
  assert.equal(
    selection.properties?.floorMaskSource,
    "assumed-native-wall-enclosure",
  );
  for (const p of corners)
    assert.ok(pointInPolygon(geographicPoint(data, p), selection));
  assert.equal(shown.presentation.display.roomBlocks.features.length, 0);
  const review = prepareFloor(data, [room.levelId], "all", {
    ...options,
    review: true,
  });
  assert.deepEqual(review.selectionAreas, review.presentation.display.areas);
});
test("native slab openings cannot be filled by a wall-face tint mask", () => {
  const data = fixture(),
    room = data.records[0];
  for (const floor of data.walkingSupport!.floors) {
    const parts = pc.difference(floor.partsFeet ?? [floor.ringsFeet], [
      rect(73.75, 780.35, 0.5),
    ]);
    floor.partsFeet = parts;
    floor.ringsFeet = parts[0];
  }
  const before = JSON.stringify(data);
  assert.equal(wallFaceRoomFloorMasks(data, data.records).has(room.key), false);
  assert.equal(JSON.stringify(data), before);
});
test("native doorway closes the visual floor edge without the open-door cutter biting into the room", () => {
  const data = fixture(),
    room = data.records[0],
    before = JSON.stringify(data);
  const door = data.doors!.find((d) => d.nativeElementId === 2_177_664)!;
  const p: [number, number] = [
    door.pointFeet[0] + door.normalFeet![0],
    door.pointFeet[1] + door.normalFeet![1],
  ];
  const aperture = nativeDoorDisplayAperture(door);
  assert.ok(
    pointInPolygon(p, {
      type: "Polygon",
      coordinates: [[...aperture, aperture[0]]],
    }),
    "sample is in the former enlarged display cutter",
  );
  const mask = wallFaceRoomFloorMasks(data, data.records).get(room.key)!;
  assert.ok(
    pointInPolygon(p, { type: "Polygon", coordinates: mask }),
    "room floor continues to the closed threshold",
  );
  const wall = data.walls.find((w) => w.nativeElementId === 1_501_577)!;
  assert.equal(
    pc.intersection(mask, wall.ringsFeet).length,
    0,
    "floor does not overlap native wall material",
  );
  assert.equal(
    JSON.stringify(data),
    before,
    "door, access and routing remain unchanged",
  );
});
