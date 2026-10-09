import assert from "node:assert/strict";
import test from "node:test";
import { nativeDoorFloorBlockers } from "../../app/indoor-project/native-door-floor-support";
import { nativeDoorFloorBlockers as sourceBlockers } from "../../../reviter/lib/reviter/native-door-floor-support";
import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
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
  return {
    source: { modelSha256: "model" },
    nativeIndoorEnvelopes: {},
    records: ["left", "right"].map((key) => ({
      key,
      walkable: true,
      access: "public",
      circulation: true,
      properties: { floorOpeningsFeet: [rect(4, 1, 6, 3)] },
    })),
    nodes: [
      { id: "left", roomKey: "left", pointFeet: [4.5, 2, 0] },
      { id: "right", roomKey: "right", pointFeet: [5.5, 2, 0] },
    ],
    doors: [
      {
        id: "door",
        nativeElementId: 10,
        state: "connected",
        footprintFeet: rect(4, 1, 6, 3),
      },
    ],
    edges: [
      {
        id: "door",
        nativeElementId: 10,
        kind: "door",
        from: "left",
        to: "right",
        enabled: true,
        accessible: "yes",
        roomKeys: ["left", "right"],
        pointsFeet: [
          [4.5, 2, 0],
          [5.5, 2, 0],
        ],
      },
    ],
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
test("complete measured native threshold ignores old metadata holes and keeps source/runtime parity", () => {
  const d = fixture(),
    before = JSON.stringify(d);
  assert.equal(nativeDoorFloorBlockers(d).size, 0);
  assert.deepEqual(nativeDoorFloorBlockers(d), sourceBlockers(d));
  assert.equal(JSON.stringify(d), before);
});
test("an arbitrarily thin true source void through a threshold is blocked while original enabled door identity stays intact", () => {
  const d = fixture(),
    edgeBefore = JSON.stringify(d.edges);
  d.walkingSupport!.floors[0].partsFeet![0].push(
    rect(5 - 1e-8, 1.1, 5 + 1e-8, 2.9),
  );
  assert.deepEqual([...nativeDoorFloorBlockers(d)], ["door"]);
  assert.deepEqual(nativeDoorFloorBlockers(d), sourceBlockers(d));
  assert.equal(JSON.stringify(d.edges), edgeBefore);
  delete d.nativeIndoorEnvelopes;
  assert.equal(
    nativeDoorFloorBlockers(d).size,
    0,
    "legacy archives preserve prior policy",
  );
});
test("another original slab must cover the whole physical threshold, rather than just the node or centerline", () => {
  const d = fixture();
  d.walkingSupport!.floors[0].partsFeet![0].push(rect(4.8, 1.2, 5.2, 2.8));
  d.walkingSupport!.floors.push({
    nativeElementId: 2,
    elevationFeet: 0,
    ringsFeet: [rect(4.8, 1.8, 5.2, 2.2)],
    partsFeet: [[rect(4.8, 1.8, 5.2, 2.2)]],
  });
  assert.ok(nativeDoorFloorBlockers(d).has("door"));
  d.walkingSupport!.floors[1].partsFeet = [[rect(4.8, 1.2, 5.2, 2.8)]];
  assert.equal(nativeDoorFloorBlockers(d).size, 0);
});
test("source-supported physical identities cannot form graph links across actual unsupported threshold material", () => {
  const d = fixture();
  // A complete descriptor is unnecessary for this direct policy guard fixture:
  // remove the placeholder while preparing the legacy graph, then make a strict
  // source snapshot with no prepared-cell fallback and an actual floor hole.
  delete d.nativeIndoorEnvelopes;
  assert.ok(projectRoutingGraph(d, "public").adjacency.get("left")?.length);
  d.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: "a".repeat(64),
    geometrySha256: "b".repeat(64),
    levels: [],
  } as never;
  d.source.modelSha256 = "a".repeat(64);
  d.walkingSupport!.sourceModelSha256 = d.source.modelSha256;
  d.walkingSupport!.floors[0].partsFeet![0].push(rect(4.8, 1.2, 5.2, 2.8));
  // projectLinkPolicy is also used for implied physical-door dependencies on
  // saved walking branches. Verify that policy without fabricating a native map.
  const records = new Map(d.records.map((r) => [r.key, r]));
  return import("../../app/indoor-project/route-policy").then(
    ({ projectLinkPolicy }) => {
      const policy = projectLinkPolicy(
        records,
        d.edges[0],
        [],
        true,
        "public",
        d.source.modelSha256,
        d,
        new Set(),
        new Set(),
      );
      assert.ok(policy.blockers.some((b) => b.kind === "native-floor-hole"));
      assert.equal(d.edges[0].enabled, true);
    },
  );
});
test("original opposing finite native slab contacts survive double-precision sweep residue without changing source points", async () => {
  const fs = await import("node:fs"),
    r = JSON.parse(
      fs.readFileSync(
        new URL(
          "../fixtures/native-door-floor-support/analytical-contact.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    d = fixture();
  d.source = r.source;
  d.doors = [r.door];
  d.edges = [r.edge];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: r.source.modelSha256,
    floors: r.floors,
  };
  const before = JSON.stringify(d);
  assert.equal(nativeDoorFloorBlockers(d).size, 0);
  assert.deepEqual(nativeDoorFloorBlockers(d), sourceBlockers(d));
  assert.equal(JSON.stringify(d), before);
});
test("a distinct narrow finite native slab gap is not a numerical contact or an area waiver", () => {
  const d = fixture();
  d.walkingSupport!.floors = [
    {
      nativeElementId: 1,
      elevationFeet: 0,
      ringsFeet: [rect(0, 0, 5 - 1e-9, 10)],
    },
    {
      nativeElementId: 2,
      elevationFeet: 0,
      ringsFeet: [rect(5 + 1e-9, 0, 10, 10)],
    },
  ];
  assert.ok(nativeDoorFloorBlockers(d).has("door"));
  assert.deepEqual(nativeDoorFloorBlockers(d), sourceBlockers(d));
});
test("a genuine original hole next to an outer contact remains unsupported", () => {
  const d = fixture();
  d.walkingSupport!.floors[0].partsFeet![0].push(
    rect(4.5, 1.5, 4.5 + 1e-10, 2.5),
  );
  assert.ok(nativeDoorFloorBlockers(d).has("door"));
});
test("three original Floor2 sweep failures replay through exact independent boolean without losing holes or source coordinates", async () => {
  const fs = await import("node:fs"),
    rows = JSON.parse(
      fs.readFileSync(
        new URL(
          "../fixtures/native-door-floor-support/exact-overlay-replay.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  for (const r of rows) {
    const d = fixture();
    d.source = r.source;
    d.doors = [r.door];
    d.edges = [r.edge];
    d.walkingSupport = {
      version: 1,
      sourceModelSha256: r.source.modelSha256,
      floors: r.floors,
    };
    const before = JSON.stringify(d);
    assert.equal(nativeDoorFloorBlockers(d).size, 0, r.door.id);
    assert.deepEqual(nativeDoorFloorBlockers(d), sourceBlockers(d));
    assert.equal(JSON.stringify(d), before);
  }
});
test("independent exact boolean fallback retains a thin floor hole and a separate narrow support gap", async () => {
  const { exactNativeDoorFloorDifference } = await import(
      "../../app/indoor-project/native-door-exact-overlay"
    ),
    { exactNativeDoorFloorDifference: source } = await import(
      "../../../reviter/lib/reviter/native-door-exact-overlay"
    );
  const threshold = [rect(4, 1, 6, 3)];
  for (const floors of [
    [[rect(0, 0, 10, 10), rect(5 - 1e-10, 1.2, 5 + 1e-10, 2.8)]],
    [[rect(0, 0, 5 - 1e-10, 10)], [rect(5 + 1e-10, 0, 10, 10)]],
  ]) {
    const outside = exactNativeDoorFloorDifference(threshold, floors);
    assert.ok(outside.length);
    assert.deepEqual(outside, source(threshold, floors));
  }
});
