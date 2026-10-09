import assert from "node:assert/strict";
import test from "node:test";
import { createNativePortalFloorVoidQuery } from "../../../reviter/lib/reviter/native-portal-floor-voids";
import {
  nativeRouteBlocker,
  type DirectoryRoom,
} from "../../../reviter/lib/reviter/room-directory";
import type { IndoorDataset } from "../../../reviter/lib/reviter/indoor-contract";
const rect = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
function fixture() {
  return {
    source: { modelSha256: "model" },
    nativeIndoorEnvelopes: {},
    walkingSupport: {
      version: 1,
      sourceModelSha256: "model",
      floors: [
        {
          nativeElementId: 1,
          elevationFeet: 0,
          ringsFeet: [rect(0, 0, 10, 10)],
          partsFeet: [[rect(0, 0, 10, 10)]],
        },
      ],
    },
  } as unknown as IndoorDataset;
}
const invented = [
  { holesFeet: [rect(4, 1, 6, 3)], floorOpeningsFeet: [rect(4, 5, 6, 7)] },
] as DirectoryRoom[];
const blocked = (holes: [number, number][][], y = 2) =>
  nativeRouteBlocker(
    { walls: [], columns: holes.map((polygon) => ({ polygon })) },
    [],
  )([3, y], [7, y]);
test("strict physical portals ignore invented old annotation holes while legacy comparison retains them", () => {
  const d = fixture(),
    before = JSON.stringify(d),
    query = createNativePortalFloorVoidQuery(d);
  assert.equal(blocked(query(0, invented)), false);
  assert.equal(blocked(query(0, invented), 6), false);
  assert.equal(
    query(0, invented),
    query(0, []),
    "one source plane is overlaid once per compilation",
  );
  assert.equal(JSON.stringify(d), before);
  delete d.nativeIndoorEnvelopes;
  assert.equal(blocked(createNativePortalFloorVoidQuery(d)(0, invented)), true);
});
test("a true native floor hole blocks a portal even when annotation outlines omit it", () => {
  const d = fixture();
  d.walkingSupport!.floors[0].partsFeet![0].push(rect(4, 1, 6, 3));
  assert.equal(blocked(createNativePortalFloorVoidQuery(d)(0, [])), true);
  assert.equal(blocked(createNativePortalFloorVoidQuery(d)(0, []), 6), false);
});
test("an independently supported overlapping slab covers only its actual part of a native floor hole", () => {
  const d = fixture();
  d.walkingSupport!.floors[0].partsFeet![0].push(rect(4, 1, 6, 3));
  d.walkingSupport!.floors.push({
    nativeElementId: 2,
    elevationFeet: 0,
    ringsFeet: [rect(4, 1, 6, 2.5)],
    partsFeet: [[rect(4, 1, 6, 2.5)]],
  });
  const holes = createNativePortalFloorVoidQuery(d)(0, []);
  assert.equal(blocked(holes, 2), false);
  assert.equal(blocked(holes, 2.75), true);
});
test("missing or stale exact floor evidence never silently approves doorway void classification", () => {
  for (const change of [
    (d: IndoorDataset) => {
      d.walkingSupport!.sourceModelSha256 = "stale";
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors = [];
    },
  ]) {
    const d = fixture();
    change(d);
    assert.throws(
      () => createNativePortalFloorVoidQuery(d)(0, []),
      /native floor support/,
    );
  }
});
