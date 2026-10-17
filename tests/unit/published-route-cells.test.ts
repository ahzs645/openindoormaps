import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "fflate";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";
import { progressiveSha256 } from "../../app/indoor-project/progressive-delivery";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import {
  publishedRouteCellReceipt,
  decodePublishedRouteCells,
  createPublishedRouteCalculator,
  type PublishedRouteCells,
  type PublishedRouteCellReceipt,
} from "../../app/indoor-project/published-route-cells";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
function fixture() {
  const data = progressiveRoutingFixture();
  data.circulationGeometry = {
    exactTopology: { geometrySha256: "c".repeat(64) },
    cells: [{ id: "cell", exactFaceId: "original-face" }],
  } as typeof data.circulationGeometry;
  const datasetSha256 = preparedDisplayDatasetSha256(data);
  const parts = nativeRationalOverlay("union", [
    [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      [
        [0.5, 0.5],
        [0.5, 1],
        [1, 1],
        [1, 0.5],
      ],
    ],
  ]);
  const wire: PublishedRouteCells = {
    format: "openindoormaps-published-route-cells-v1",
    version: 1,
    datasetSha256,
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    source: data.source,
    originalTopologySha256: "c".repeat(64),
    inventory: [{ id: "cell", faceId: "original-face", empty: false }],
    topology: encodeNativeExactTopology(
      {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: datasetSha256,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      [{ id: "cell", parts }],
    ),
  };
  const pack = (value = wire) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value)),
      stored = gzipSync(bytes);
    const receipt: PublishedRouteCellReceipt = {
      id: "fixture",
      datasetSha256,
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      source: data.source,
      logicalSha256: progressiveSha256(bytes),
      logicalBytes: bytes.length,
      compressedSha256: progressiveSha256(stored),
      compressedBytes: stored.length,
      url: "/test.gz",
    };
    return { receipt, stored, bytes };
  };
  return { data, wire, parts, pack, ...pack() };
}
test("only exact dataset and validator matches admit publisher geometry results", () => {
  const f = fixture(),
    policy = {
      receipts: [f.receipt],
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    };
  assert.equal(publishedRouteCellReceipt(f.data, policy), f.receipt);
  assert.equal(publishedRouteCellReceipt(f.data), undefined);
  assert.equal(
    publishedRouteCellReceipt(f.data, {
      ...policy,
      engineSha256: "0".repeat(64),
    }),
    undefined,
  );
  f.data.edges[0].enabled = false;
  assert.equal(publishedRouteCellReceipt(f.data, policy), undefined);
});
test("verified physical cells retain exact rationals and holes; corrupt and mismatched inventories fail", () => {
  const f = fixture();
  const decoded = decodePublishedRouteCells(f.data, f.receipt, f.stored);
  const fractions = (p: typeof f.parts) =>
    p.map((part) =>
      part.map((ring) =>
        ring.map((point) => point.map((q) => [String(q.n), String(q.d)])),
      ),
    );
  assert.deepEqual(fractions(decoded.get("cell")!), fractions(f.parts));
  assert.equal(decoded.get("cell")![0].length, 2);
  assert.deepEqual(
    fractions(
      decodePublishedRouteCells(f.data, f.receipt, f.bytes).get("cell")!,
    ),
    fractions(f.parts),
  );
  const corrupted = f.stored.slice();
  corrupted[3] ^= 1;
  assert.throws(
    () => decodePublishedRouteCells(f.data, f.receipt, corrupted),
    /checksum/,
  );
  for (const patch of [
    { originalTopologySha256: "0".repeat(64) },
    { inventory: [{ id: "cell", faceId: "changed", empty: false }] },
    { inventory: [...f.wire.inventory, ...f.wire.inventory] },
  ]) {
    const p = f.pack({ ...f.wire, ...patch });
    assert.throws(
      () => decodePublishedRouteCells(f.data, p.receipt, p.stored),
      /snapshot|inventory/,
    );
  }
});
test("incomplete profile policies cannot be seeded into a route session", () => {
  const f = fixture();
  const p = f.pack({ ...f.wire, policies: { public: [], accessible: [] } });
  assert.throws(
    () => decodePublishedRouteCells(f.data, p.receipt, p.stored),
    /complete link policies/,
  );
});
test("graph guards reject stale bindings, unknown cells, duplicate rows and invalid anchors", () => {
  const f = fixture();
  f.data.circulationGeometry!.sourceGeometryKey = "geometry";
  const guards = {
    circulationBinding: "geometry",
    cellIds: ["cell"],
    blockedEdgeIds: [],
    access: [["cell", true]] as [string, boolean][],
    anchors: [],
  };
  const valid = f.pack({ ...f.wire, guards });
  assert.equal(
    decodePublishedRouteCells(f.data, valid.receipt, valid.stored).size,
    1,
  );
  for (const patch of [
    { circulationBinding: "stale" },
    { cellIds: ["unknown"] },
    { blockedEdgeIds: ["unknown"] },
    {
      access: [
        ["cell", true],
        ["cell", false],
      ],
    },
    {
      anchors: [["unknown|unknown", { edgeId: "unknown", nodeId: "unknown" }]],
    },
  ]) {
    const p = f.pack({
      ...f.wire,
      guards: { ...guards, ...patch },
    } as PublishedRouteCells);
    assert.throws(
      () => decodePublishedRouteCells(f.data, p.receipt, p.stored),
      /guards|anchors/,
    );
  }
});
test("the published session retains original public and step-free route behavior on ordinary inputs", () => {
  const data = progressiveRoutingFixture(),
    normal = createWorkerRouteCalculator(structuredClone(data)),
    published = createPublishedRouteCalculator(
      structuredClone(data),
      new Map(),
    );
  for (const mode of ["public", "accessible"] as const)
    assert.deepEqual(
      published(data.records[0].key, data.records[1].key, mode),
      normal(data.records[0].key, data.records[1].key, mode),
    );
});
