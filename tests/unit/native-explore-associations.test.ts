import assert from "node:assert/strict";
import test from "node:test";
import { associateNativeRooms } from "../../app/indoor-project/native-explore-associations";
import { floorDisplayName } from "../../app/indoor-project/floor-display-name";
import { project, gapProject } from "../fixtures/native-area-project";
import type { NativeAreaRegion } from "../../app/indoor-project/native-area-review";
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
const region = (
  id: string,
  x: number,
  keys: string[] = [],
): NativeAreaRegion => ({
  id,
  ringsFeet: [rect(x, 0, 10, 10)],
  roomKeys: keys,
  nativeFloorIds: [],
  nativeDoorIds: [],
  displayPartsFeet: [],
  areaSquareFeet: 100,
  exposedFloorEdgeFeet: 0,
});
test("majority overlap supersedes a wrong label seed without changing geometry or record identity", async () => {
  const p = await project();
  const rooms = p.dataset.records.slice(0, 1);
  rooms[0].ringsFeet = [rect(8, 1, 8, 8)];
  const regions = [region("left", 0, [rooms[0].key]), region("right", 10)];
  const before = JSON.stringify([regions, rooms]);
  const result = associateNativeRooms(regions, rooms);
  assert.deepEqual(result[0].roomKeys, []);
  assert.deepEqual(result[1].roomKeys, [rooms[0].key]);
  assert.equal(result[1].associations[0].coverage, 0.75);
  assert.equal(JSON.stringify([regions, rooms]), before);
});
test("several majority matches remain several identities in one shared enclosure", async () => {
  const p = await project();
  const rooms = p.dataset.records.slice(0, 2);
  rooms.forEach((r, i) => (r.ringsFeet = [rect(1 + i * 4, 1, 3, 3)]));
  const result = associateNativeRooms([region("shared", 0)], rooms);
  assert.equal(result.length, 1);
  assert.deepEqual(
    result[0].roomKeys,
    rooms.map((r) => r.key),
  );
  assert.ok(
    result[0].associations.every((a) => a.method === "majority-overlap"),
  );
});
test("ties and real polygon holes cannot acquire a majority name", async () => {
  const p = await project();
  const rooms = p.dataset.records.slice(0, 1);
  rooms[0].ringsFeet = [rect(8, 1, 4, 8)];
  const tie = associateNativeRooms(
    [region("left", 0), region("right", 10)],
    rooms,
  );
  assert.ok(tie.every((r) => !r.roomKeys.length));
  rooms[0].ringsFeet = [rect(2, 2, 2, 2)];
  const hole = region("hole", 0);
  hole.ringsFeet.push(rect(1, 1, 4, 4));
  assert.equal(associateNativeRooms([hole], rooms)[0].roomKeys.length, 0);
});
test("floor names have consistent numbering and a basement without replacing custom names", () => {
  assert.deepEqual(
    [
      "Floor 0",
      "Campus Floor 1",
      "Floor 2",
      "Campus Floor 3",
      "Floor 4",
      "Mezzanine",
    ].map(floorDisplayName),
    ["Basement", "Floor 1", "Floor 2", "Floor 3", "Floor 4", "Mezzanine"],
  );
});

test("matched label positions stay inside native overlap and outside real holes", async () => {
  const p = await project(),
    rooms = p.dataset.records.slice(0, 1);
  rooms[0].ringsFeet = [rect(1, 1, 8, 8)];
  const r = region("courtyard", 0);
  r.ringsFeet.push(rect(4, 4, 2, 2));
  const result = associateNativeRooms([r], rooms)[0];
  const point = result.associations[0].labelPointFeet!;
  const { pointInNativeArea } = await import(
    "../../app/indoor-project/native-area-review"
  );
  assert.equal(pointInNativeArea(point, r.ringsFeet), true);
  assert.equal(pointInNativeArea(point, rooms[0].ringsFeet), true);
});

test("a four-enclosure patch comparison gives four colors while the connected before remains one", async () => {
  const { coloredComparisonRegions } = await import(
    "../../app/indoor-project/patch-comparison-colors"
  );
  const after = ["07-145", "07-148", "07-148A", "07-148B"].map((key, i) =>
    region(key, i * 10, [key]),
  );
  const before = region(
    "shared",
    0,
    after.flatMap((r) => r.roomKeys),
  );
  const comparison = {
    currentRegions: [before],
    updatedRegions: after,
    patches: [],
    warnings: [],
  };
  assert.equal(coloredComparisonRegions(comparison, false).length, 1);
  assert.equal(
    new Set(coloredComparisonRegions(comparison, true).map((r) => r.color))
      .size,
    4,
  );
});

test("native destinations search curated names while retaining source identity", async () => {
  const p = await project(),
    r = p.dataset.records[0];
  p.dataset.visitor = {
    version: 1,
    buildings: {},
    places: {
      [r.key]: { displayName: "Student wellness office", color: "#123456" },
    },
  };
  const { filterNativeExplorePlaces } = await import(
    "../../app/indoor-project/native-explore"
  );
  assert.deepEqual(
    filterNativeExplorePlaces([r], "wellness", p.dataset).map((r) => r.key),
    [r.key],
  );
  assert.equal(p.dataset.records[0].name, r.name);
});

test("native fill colors follow room types independently of custom outline colors", async () => {
  const p = await project(),
    r = p.dataset.records[0];
  const { nativeExploreRegionColor } = await import(
    "../../app/indoor-project/native-explore"
  );
  const { roomDisplayColor } = await import(
    "../../app/indoor-project/display-geometry"
  );
  for (const name of ["Office", "Washroom", "Classroom", "Library", "Stair"]) {
    const record = {
      ...r,
      name,
      stair: name === "Stair",
      circulation: false,
      access: "unknown" as const,
      walkable: true,
    };
    assert.equal(
      nativeExploreRegionColor([record]),
      roomDisplayColor(record, false),
    );
  }
  assert.equal(
    nativeExploreRegionColor([
      { ...r, name: "Washroom" },
      { ...r, name: "Office" },
    ]),
    "#e9edef",
  );
});

test("publication saves triangles and invalidates changed identity anchors",async()=>{
 const p=await gapProject();
 const room=p.dataset.records[0];
 p.dataset.nodes=[{id:'anchor',roomKey:room.key,levelId:1,building:room.building,surfaceId:room.surfaceId,pointFeet:[5,5,0],geographic:[-122,53],kind:'arrival'}];
 room.arrivalNodeId='anchor';
 const {compileNativeExploreMapping,nativeExploreDatasetGeometrySha256,validatePublishedNativeExploreMapping}=await import('../../app/indoor-project/native-explore-mapping');
 p.dataset.nativeExploreMapping=await compileNativeExploreMapping(p.dataset,await nativeExploreDatasetGeometrySha256(p.dataset));
 assert.equal(p.dataset.nativeExploreMapping.version,2);
 assert.ok(p.dataset.nativeExploreMapping.levels.length);
 assert.ok(p.dataset.nativeExploreMapping.levels.every(l=>l.regions.every(r=>r.displayPartsFeet?.length)));
 await validatePublishedNativeExploreMapping(p.dataset);
 p.dataset.nodes[0].pointFeet[0]+=.1;
 await assert.rejects(validatePublishedNativeExploreMapping(p.dataset),/stale source geometry/);
});
