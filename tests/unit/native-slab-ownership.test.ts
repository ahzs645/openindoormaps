import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import {
  nativeSlabFloorOwners,
  nativeSlabFloorOwner,
} from "../../app/indoor-project/native-slab-ownership";
import { nativeExplorePlaces } from "../../app/indoor-project/native-explore";
const rect = (x = 0, y = 0, w = 10, h = 10): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function data() {
  const d = fixture();
  const r = {
    ...d.records[0],
    key: "offset-room",
    elevationFeet: 3,
    ringsFeet: [rect()],
    arrivalNodeId: undefined,
  };
  d.records = [r];
  d.nativeLevels = [
    { id: 1, name: "Floor 1", elevationFeet: 0 },
    { id: 2, name: "Offset", elevationFeet: 3 },
  ];
  d.floors = [
    { id: "one", name: "Floor 1", levelIds: [1, 2], elevationFeet: 0 },
  ];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [{ nativeElementId: 100, elevationFeet: 3, ringsFeet: [rect()] }],
  };
  d.presentation!.rooms = [
    {
      roomKey: r.key,
      levelId: 1,
      sourceGeometryKey: JSON.stringify([r.levelId, r.ringsFeet]),
      interiorRingsFeet: r.ringsFeet,
      blockPartsFeet: [r.ringsFeet],
      boundarySource: "native-wall-enclosure",
      boundaryEvidence: "Test native walls",
      boundaryElementIds: [200],
      sourceCoverage: 1,
      cellCoverage: 1,
    },
  ];
  return d;
}
test("same-campus actual native slab recovers an unclaimed offset room without edits", () => {
  const d = data(),
    before = JSON.stringify(d);
  assert.equal(
    nativeSlabFloorOwner(nativeSlabFloorOwners(d), 2, [rect()]),
    "offset-room",
  );
  assert.equal(
    nativeSlabFloorOwner(nativeSlabFloorOwners(d), 1, [rect()]),
    undefined,
  );
  assert.equal(JSON.stringify(d), before);
});
test("another campus floor cannot inherit an offset room", () => {
  const d = data();
  d.floors = [
    { id: "one", name: "Floor 1", levelIds: [1], elevationFeet: 0 },
    { id: "two", name: "Floor 2", levelIds: [2], elevationFeet: 3 },
  ];
  assert.deepEqual(nativeSlabFloorOwners(d), []);
});
test("source model and current native enclosure must match", () => {
  for (const stale of ["floor", "prepared", "geometry", "source-contour"]) {
    const d = data();
    if (stale === "floor") d.walkingSupport!.sourceModelSha256 = "c".repeat(64);
    if (stale === "prepared")
      d.presentation!.sourceModelSha256 = "c".repeat(64);
    if (stale === "geometry")
      d.presentation!.rooms[0].sourceGeometryKey = "stale";
    if (stale === "source-contour")
      d.presentation!.rooms[0].boundarySource =
        "registered-source-wall-enclosure";
    assert.deepEqual(nativeSlabFloorOwners(d), [], stale);
  }
});
test("missing slab and real floor holes are never filled", () => {
  const d = data();
  d.walkingSupport!.floors[0].ringsFeet = [rect(), rect(3, 3, 1, 1)];
  assert.deepEqual(nativeSlabFloorOwners(d), []);
  const q = data();
  q.walkingSupport!.floors = [];
  assert.deepEqual(nativeSlabFloorOwners(q), []);
});
test("current level, staircase and circulation are not reassigned", () => {
  for (const kind of ["same", "stairs", "corridor"]) {
    const d = data();
    if (kind === "same") d.records[0].elevationFeet = 0;
    if (kind === "stairs") d.records[0].stair = true;
    if (kind === "corridor") d.records[0].circulation = true;
    assert.deepEqual(nativeSlabFloorOwners(d), [], kind);
  }
});
test("one large native face cannot acquire a small room identity", () => {
  const d = data();
  d.walkingSupport!.floors[0].ringsFeet = [rect(-1, -1, 40, 40)];
  assert.equal(
    nativeSlabFloorOwner(nativeSlabFloorOwners(d), 2, [rect(0, 0, 20, 20)]),
    undefined,
  );
});
test("competing physical-surface identities remain unresolved", () => {
  const d = data();
  d.records.push({
    ...d.records[0],
    key: "competitor",
    ringsFeet: [rect(1, 1, 2, 2)],
  });
  assert.equal(
    nativeSlabFloorOwner(nativeSlabFloorOwners(d), 2, [rect()]),
    undefined,
  );
});
test("arrival point must lie on the proposed native face", () => {
  const d = data();
  d.records[0].arrivalNodeId = "outside-arrival";
  d.nodes = [
    {
      id: "outside-arrival",
      pointFeet: [30, 30, 3],
      roomKey: d.records[0].key,
      levelId: 1,
      building: "01",
      surfaceId: "test",
      geographic: [0, 0],
      kind: "arrival",
    },
  ];
  assert.deepEqual(nativeSlabFloorOwners(d), []);
});
test("different physical elevations and ambiguous same-height native levels stay unowned", () => {
  const d = data();
  d.nativeLevels[1].elevationFeet = 4;
  assert.deepEqual(nativeSlabFloorOwners(d), []);
  const q = data();
  q.nativeLevels.push({ id: 3, name: "Alias", elevationFeet: 3 });
  q.floors[0].levelIds.push(3);
  assert.deepEqual(nativeSlabFloorOwners(q), []);
});
test("offset presentation identity remains discoverable at its physical native face", () => {
  const d = data(),
    r = d.records[0];
  const region = {
    id: "face",
    levelId: 2,
    roomKeys: [r.key],
    ringsFeet: [rect()],
    displayPartsFeet: [[rect()]],
    areaSquareFeet: 100,
    exposedFloorEdgeFeet: 0,
    nativeFloorIds: [100],
    nativeDoorIds: [],
    slabRoomKey: r.key,
  };
  assert.deepEqual(
    nativeExplorePlaces(d, region).map((r) => r.key),
    [r.key],
  );
  assert.equal(d.records[0].levelId, 1);
});
