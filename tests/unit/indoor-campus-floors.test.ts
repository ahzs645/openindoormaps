import test from "node:test";
import assert from "node:assert/strict";
import { combineProjectFloors } from "../../app/indoor-project/campus-floors";
import type { IndoorProject } from "../../app/indoor-project/package";

function fixture() {
  return {
    rooms: {
      campusStoreys: [
        {
          id: "campus-floor-1",
          name: "Campus Floor 1",
          levelIds: [1, 11],
          evidence: "user-reported",
        },
      ],
    },
    dataset: {
      floors: [
        {
          id: "storey:1+11",
          name: "Campus Floor 1",
          levelIds: [1, 11],
          elevationFeet: 0,
        },
        { id: "storey:3", name: "Floor 3", levelIds: [3], elevationFeet: 24 },
        {
          id: "storey:35",
          name: "Floor 3.5",
          levelIds: [35],
          elevationFeet: 30,
        },
      ],
      nativeLevels: [
        { id: 1, elevationFeet: 0 },
        { id: 11, elevationFeet: 1 },
        { id: 3, elevationFeet: 24 },
        { id: 35, elevationFeet: 30 },
      ],
      records: [{ levelId: 3 }, { levelId: 35 }],
      nodes: [],
      edges: [],
      walls: [],
    },
    files: {},
    scene: new Uint8Array([1, 2]),
  } as unknown as IndoorProject;
}
test("grouping shares one visitor selection and preserves all native geometry and graph references", () => {
  const source = fixture(),
    before = JSON.stringify(source);
  const next = combineProjectFloors(
    source,
    ["storey:35", "storey:3"],
    " Campus Floor 3 ",
  );
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(next.dataset.floors[1], {
    id: "storey:3+35",
    name: "Campus Floor 3",
    levelIds: [3, 35],
    elevationFeet: 24,
  });
  assert.equal(next.dataset.floors.length, 2);
  for (const key of [
    "records",
    "nodes",
    "edges",
    "walls",
    "nativeLevels",
  ] as const)
    assert.equal(next.dataset[key], source.dataset[key]);
  assert.equal(next.files, source.files);
  assert.equal(next.scene, source.scene);
  assert.deepEqual(
    next.rooms.campusStoreys?.[0],
    source.rooms.campusStoreys?.[0],
  );
  assert.deepEqual(next.rooms.campusStoreys?.[1].levelIds, [3, 35]);
});
test("combining an existing group replaces its review without overlapping memberships", () => {
  const first = combineProjectFloors(
    fixture(),
    ["storey:3", "storey:35"],
    "Campus Floor 3",
  );
  const next = combineProjectFloors(
    first,
    ["storey:1+11", "storey:3+35"],
    "Combined",
  );
  assert.equal(next.rooms.campusStoreys?.length, 1);
  assert.deepEqual(next.rooms.campusStoreys?.[0].levelIds, [1, 11, 3, 35]);
});
test("invalid grouping cannot silently discard a floor", () => {
  for (const ids of [
    ["storey:3"],
    ["storey:3", "missing"],
    ["storey:3", "storey:3"],
  ])
    assert.throws(() => combineProjectFloors(fixture(), ids, "Combined"));
  assert.throws(() =>
    combineProjectFloors(fixture(), ["storey:3", "storey:35"], " "),
  );
});
