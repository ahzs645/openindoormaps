import assert from "node:assert/strict";
import test from "node:test";
import * as runtimeZones from "../../app/indoor-project/native-access-zones";
import * as runtimeJoins from "../../app/indoor-project/native-slab-join-closures";
import * as runtimeLinks from "../../app/indoor-project/reviewed-circulation-links";
import { nativeRecordOnPhysicalLevel } from "../../app/indoor-project/native-physical-level-records";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import { nativeRationalAreaCompare } from "../../app/indoor-project/native-exact-planar-topology";
import * as compilerZones from "../../../reviter/lib/reviter/native-access-zones.ts";
import * as compilerJoins from "../../../reviter/lib/reviter/native-slab-join-closures.ts";
import * as compilerLinks from "../../../reviter/lib/reviter/reviewed-circulation-links.ts";

type P = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const SHA = "a".repeat(64);
const record = (key: string, ring: P[], access = "unknown") => ({
  key,
  levelId: 1,
  elevationFeet: 0,
  walkable: true,
  access,
  stair: false,
  ringsFeet: [ring],
  properties: {},
});
const zones = (members: string[]) => ({
  version: 1 as const,
  sourceModelSha256: SHA,
  zones: [
    {
      id: "z",
      levelId: 1,
      elevationFeet: 0,
      access: "staff" as const,
      memberRoomKeys: members,
      partsFeet: [[rect(20, 0, 40, 10)]],
      decision: { source: "d.json", id: "Q", summary: "staff halls" },
    },
  ],
});

test("runtime access-zone binding is the compiler's binding", () => {
  for (const members of [["s1", "s2"], ["s1"], ["h"]]) {
    const data = {
      source: { modelSha256: SHA },
      nativeLevels: [{ id: 1, elevationFeet: 0 }],
      records: [
        record("h", rect(0, 0, 20, 10)),
        record("s1", rect(20, 0, 30, 10), "staff"),
        record("s2", rect(30, 0, 40, 10), "staff"),
      ],
      nativeAccessZones: zones(members),
    };
    const a = runtimeZones.nativeAccessZoneBinding(data as never);
    const b = compilerZones.nativeAccessZoneBinding(data as never);
    assert.deepEqual(
      a.zones.map((z) => z.zone.id),
      b.zones.map((z) => z.zone.id),
    );
    assert.deepEqual(a.issues, b.issues);
  }
  assert.throws(
    () =>
      runtimeZones.validateNativeAccessZones(
        {
          ...zones(["s1"]),
          sourceModelSha256: "b".repeat(64),
        },
        SHA,
      ),
    /Invalid reviewed native access zones/,
  );
});
test("runtime slab-join closures equal the compiler's exact closures", () => {
  const hair = 10 + 2 * 2 ** -49;
  const floors = [[rect(0, 0, 10, 10)], [rect(hair, 0, 20, 10)]];
  const envelope = [[rect(-1, -1, 21, 11)]];
  const a = runtimeJoins.nativeWalkingFloorsWithSlabJoins(floors, envelope);
  const b = compilerJoins.nativeWalkingFloorsWithSlabJoins(floors, envelope);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(nativeRationalAreaCompare(a, b as never), 0);
});
test("reviewed link shape validation is identical in both repositories", () => {
  const link = {
    id: "l",
    fromNodeId: "a",
    toNodeId: "b",
    pointsFeet: [
      [0, 0, 0],
      [1, 0, 0],
    ] as [number, number, number][],
    decision: { source: "d", id: "q", summary: "s" },
  };
  for (const value of [
    { version: 1, sourceModelSha256: SHA, links: [link] },
    { version: 1, sourceModelSha256: SHA, links: [{ ...link, toNodeId: "a" }] },
    {
      version: 1,
      sourceModelSha256: SHA,
      links: [{ ...link, pointsFeet: [[0, 0, 0]] }],
    },
  ]) {
    let runtime = true,
      compiler = true;
    try {
      runtimeLinks.validateReviewedCirculationLinks(value, SHA);
    } catch {
      runtime = false;
    }
    try {
      compilerLinks.validateReviewedCirculationLinks(value, SHA);
    } catch {
      compiler = false;
    }
    assert.equal(runtime, compiler);
  }
  assert.equal(
    runtimeLinks.reviewedCirculationLinkEdgeId(link),
    compilerLinks.reviewedCirculationLinkEdgeId(link),
  );
});
test("a door on a native level may name rooms labelled on that physical level only", () => {
  const data = {
    nativeLevels: [
      { id: 1, elevationFeet: 0 },
      { id: 2, elevationFeet: 3.28 },
    ],
    records: [
      { ...record("raised", rect(10, 0, 20, 10)), elevationFeet: 3.28 },
      record("ground", rect(0, 0, 10, 10)),
    ],
    walkingSupport: {
      floors: [
        {
          nativeElementId: 5,
          elevationFeet: 0,
          ringsFeet: [rect(0, 0, 10, 10)],
        },
        {
          nativeElementId: 6,
          elevationFeet: 3.28,
          ringsFeet: [rect(10, 0, 20, 10)],
        },
      ],
    },
    nativePhysicalLevels: {
      levels: [
        { nativeLevelId: 1, elevationFeet: 0, nativeFloorElementIds: [5] },
        { nativeLevelId: 2, elevationFeet: 3.28, nativeFloorElementIds: [6] },
      ],
    },
  };
  assert.equal(
    nativeRecordOnPhysicalLevel(data as never, data.records[0] as never, 2),
    true,
  );
  assert.equal(
    nativeRecordOnPhysicalLevel(data as never, data.records[1] as never, 2),
    false,
  );
  assert.equal(
    nativeRecordOnPhysicalLevel(data as never, data.records[1] as never, 1),
    true,
  );
});
test("dataset validation refuses an access-zone or reviewed-link field that is malformed", () => {
  assert.throws(
    () =>
      validateIndoorDataset({
        nativeAccessZones: { version: 2 },
        source: { modelSha256: SHA },
      }),
    /Invalid reviewed native access zones/,
  );
  assert.throws(
    () =>
      validateIndoorDataset({
        reviewedCirculationLinks: {
          version: 1,
          sourceModelSha256: SHA,
          links: [{}],
        },
        source: { modelSha256: SHA },
      }),
    /Invalid reviewed circulation links/,
  );
});
