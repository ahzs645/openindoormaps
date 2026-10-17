import test from "node:test";
import assert from "node:assert/strict";
import { nativeDoorFloorBlockers } from "../../app/indoor-project/native-door-floor-support";
import { nativeDoorFloorBlockers as compilerBlockers } from "../../../reviter/lib/reviter/native-door-floor-support";
import { validatedSourceDoorProof } from "../../app/indoor-project/routing-apertures";
import { routingDoorApertures as compilerApertures } from "../../../reviter/lib/reviter/routing-apertures";
import type { IndoorDataset } from "../../app/indoor-project/contract";
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
  const model = "a".repeat(64),
    source = "b".repeat(64),
    section = "Drawing";
  return {
    source: { modelSha256: model },
    nativeIndoorEnvelopes: {},
    records: ["a", "b"].map((key) => ({
      key,
      levelId: 1,
      properties: { dwg: { sha256: source, sectionId: section } },
    })),
    nodes: [
      { id: "from", roomKey: "a", levelId: 1, pointFeet: [4, 5, 0] },
      { id: "to", roomKey: "b", levelId: 1, pointFeet: [6, 5, 0] },
    ],
    doors: [],
    edges: [
      {
        id: "source-door",
        from: "from",
        to: "to",
        kind: "door",
        enabled: true,
        accessible: "unknown",
        roomKeys: ["a", "b"],
        pointsFeet: [
          [4, 5, 0],
          [6, 5, 0],
        ],
        sourceDoorProof: {
          version: 1,
          sourceModelSha256: model,
          sourceSha256: source,
          sectionId: section,
          registrationErrorFeet: 0,
          levelId: 1,
          elevationFeet: 0,
          nativeFloorElementIds: [10],
          wallSegmentIndices: [1, 2],
          doorSymbolCollection: "wallSegments",
          doorSymbolSegmentIndices: [3, 4],
          apertureFeet: rect(4.5, 3.5, 5.5, 6.5),
          walkingStripWidthFeet: 2,
        },
      },
    ],
    walkingSupport: {
      version: 1,
      sourceModelSha256: model,
      floors: [
        {
          nativeElementId: 10,
          elevationFeet: 0,
          ringsFeet: [rect(0, 0, 10, 10)],
        },
      ],
    },
  } as unknown as IndoorDataset;
}
test("registered source doorway retains its independent identity and passes full original slab coverage without a fabricated native door", () => {
  const data = fixture(),
    before = JSON.stringify(data);
  assert.ok(validatedSourceDoorProof(data, data.edges[0]!));
  assert.equal(compilerApertures(data).length, 1);
  assert.deepEqual([...nativeDoorFloorBlockers(data)], []);
  assert.deepEqual(nativeDoorFloorBlockers(data), compilerBlockers(data));
  assert.equal(JSON.stringify(data), before);
  assert.equal(data.doors!.length, 0);
  assert.equal(data.edges[0]!.nativeElementId, undefined);
  assert.equal(data.edges[0]!.accessible, "unknown");
});
test("source doorway still refuses a positive floor hole even when its centerline and both terminal nodes are supported", () => {
  const data = fixture();
  data.walkingSupport!.floors[0]!.ringsFeet.push(
    rect(4.9, 3.6, 4.900000001, 4.0),
  );
  assert.deepEqual([...nativeDoorFloorBlockers(data)], ["source-door"]);
  assert.deepEqual(nativeDoorFloorBlockers(data), compilerBlockers(data));
});
test("malformed or mismatched source-door proofs cannot obtain native floor support", () => {
  for (const mutate of [
    (d: IndoorDataset) => {
      d.edges[0]!.sourceDoorProof!.sourceModelSha256 = "c".repeat(64);
    },
    (d: IndoorDataset) => {
      d.edges[0]!.sourceDoorProof!.walkingStripWidthFeet = 1.9;
    },
    (d: IndoorDataset) => {
      d.edges[0]!.sourceDoorProof!.nativeFloorElementIds = [999];
    },
    (d: IndoorDataset) => {
      d.records[0]!.properties.dwg = {
        sha256: "c".repeat(64),
        sectionId: "Drawing",
      };
    },
  ]) {
    const data = fixture();
    mutate(data);
    assert.deepEqual([...nativeDoorFloorBlockers(data)], ["source-door"]);
    assert.deepEqual(nativeDoorFloorBlockers(data), compilerBlockers(data));
  }
});
