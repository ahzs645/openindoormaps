import assert from "node:assert/strict";
import test from "node:test";
import pc from "polygon-clipping";
import { frameFixture } from "./native-derived-frame-returns.test";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material";
import { createNativeRoutingMaterialQuery as sourceMaterial } from "../../../reviter/lib/reviter/native-routing-material";
import { createNativeDoorApproachQuery } from "../../app/indoor-project/native-door-approach";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

test("routing material keeps the independently bound finite sill at the ankle cut only, with compiler parity", async () => {
  const data = await frameFixture();
  const before = JSON.stringify(data);
  const runtime = createNativeRoutingMaterialQuery(data);
  const source = sourceMaterial(data);
  for (const cut of [-0.01, 0, 0.1, 0.2, 4]) {
    assert.deepEqual(runtime(0, cut), source(0, cut));
    assert.equal(
      runtime(0, cut).derivedParts?.length,
      cut >= 0 && cut < 0.2 ? 1 : 0,
    );
    assert.equal(
      runtime(0, cut),
      runtime(0, cut),
      "one immutable calculation reuses each exact cut",
    );
  }
  assert.deepEqual(
    runtime(0).derivedParts,
    data.nativeDerivedFrameReturns.rows[0].partsFeet,
  );
  assert.equal(
    JSON.stringify(data),
    before,
    "source material, body metadata and floor holes are never rewritten",
  );
});

test("an enabled doorway's own original host exemption cannot erase a finite derived return from its half-threshold", async () => {
  const fixture = await frameFixture();
  const envelope = {
    version: 1 as const,
    sourceModelSha256: fixture.source.modelSha256,
    geometrySha256: "",
    levels: [
      {
        levelId: 10,
        elevationFeet: 0,
        partsFeet: fixture.walkingSupport.floors[0].partsFeet,
        sourceElementIds: [1, 2, 3],
        cutElevationsFeet: [0.1, 4],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  envelope.geometrySha256 = await nativeIndoorEnvelopeHash(envelope);
  const data = {
    ...fixture,
    nativeIndoorEnvelopes: envelope,
    walkingSupport: { ...fixture.walkingSupport, version: 1 },
    records: ["left", "right"].map((key) => ({
      key,
      levelId: 10,
      elevationFeet: 0,
      circulation: true,
      walkable: true,
      access: "unknown",
      properties: {},
    })),
    walls: [],
    nodes: [
      {
        id: "left-portal",
        roomKey: "left",
        levelId: 10,
        pointFeet: [1.05, -0.1, 0],
      },
      {
        id: "right-portal",
        roomKey: "right",
        levelId: 10,
        pointFeet: [1.05, 0.1, 0],
      },
      {
        id: "left-arrival",
        roomKey: "left",
        levelId: 10,
        pointFeet: [1.05, -1, 0],
      },
      {
        id: "right-arrival",
        roomKey: "right",
        levelId: 10,
        pointFeet: [1.05, 1, 0],
      },
    ],
    doors: [
      {
        id: "physical-door",
        nativeElementId: 20,
        hostWallNativeElementId: 1,
        levelId: 10,
        state: "connected",
        pointFeet: [1.05, 0],
        normalFeet: [0, 1],
        footprintFeet: rect(1.01, -0.2, 1.09, 0.2),
        roomKeys: ["left", "right"],
      },
    ],
    edges: [
      {
        id: "physical-door",
        nativeElementId: 20,
        from: "left-portal",
        to: "right-portal",
        kind: "door",
        enabled: true,
        accessible: "unknown",
        roomKeys: ["left", "right"],
        pointsFeet: [
          [1.05, -0.1, 0],
          [1.05, 0.1, 0],
        ],
      },
      {
        id: "left-walk",
        from: "left-arrival",
        to: "left-portal",
        kind: "walk",
        roomKeys: ["left"],
        pointsFeet: [
          [1.05, -1, 0],
          [1.05, -0.1, 0],
        ],
      },
      {
        id: "right-walk",
        from: "right-portal",
        to: "right-arrival",
        kind: "walk",
        roomKeys: ["right"],
        pointsFeet: [
          [1.05, 0.1, 0],
          [1.05, 1, 0],
        ],
      },
    ],
  } as unknown as IndoorDataset;
  const before = JSON.stringify(data),
    query = createNativeDoorApproachQuery(data);
  assert.ok(
    query(data.edges[1]).length > 0,
    "the clear owned threshold half retains actual floor support",
  );
  assert.deepEqual(
    query(data.edges[2]),
    [],
    "the return occupies the opposite half, despite the original host exemption",
  );
  const originalOnly = structuredClone(data);
  delete originalOnly.nativeDerivedFrameReturns;
  assert.ok(
    createNativeDoorApproachQuery(originalOnly)(originalOnly.edges[2]).length >
      0,
    "the introduced finite material is the specific reason this threshold half is blocked",
  );
  assert.equal(
    pc.intersection(
      query(data.edges[1]).map((p) => p.rings),
      fixture.nativeDerivedFrameReturns.rows[0].partsFeet,
    ).length,
    0,
  );
  assert.equal(
    JSON.stringify(data),
    before,
    "unknown access, original enabled portal and coordinates remain unchanged",
  );
});
