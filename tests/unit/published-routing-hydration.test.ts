import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "fflate";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";
import { progressiveSha256 } from "../../app/indoor-project/progressive-delivery";
import {
  encodeNativeExactTopology,
  createNativeExactTopologyIndex,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import {
  hydratePublishedTopology,
  hydratePublishedMaterials,
  materialWire,
} from "../../app/indoor-project/published-routing-hydration";
import {
  publishedRouteCellReceipt,
  decodePublishedRouteCells,
  type PublishedRouteCells,
  type PublishedRouteCellReceipt,
} from "../../app/indoor-project/published-route-cells";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { PUBLISHED_ROUTE_RUNTIME_SHA256 } from "../../app/indoor-project/published-route-runtime-binding";
import { prepareProgressiveRouteCalculator } from "../../app/indoor-project/progressive-route-preparation";
import { MemoryVisitorDeliveryCache } from "../../app/indoor-project/visitor-delivery-cache";
import { createVerifiedProgressiveRouteCalculator } from "../../app/indoor-project/progressive-route-validation";
import { publishedRouteRuntimeBinding } from "../../scripts/indoor/published-route-runtime-binding";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material";
import { assertExactRoutingIndexParity } from "../../scripts/indoor/exact-routing-index-proof";
function fixture() {
  const data = progressiveRoutingFixture(),
    sourceGeometryKey = "synthetic-hydration-only";
  const original = encodeNativeExactTopology(
    {
      sourceModelSha256: data.source.modelSha256,
      sourceGeometryKey,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    [],
  );
  data.circulationGeometry = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey,
    cells: [],
    exactTopology: original,
  };
  const datasetSha256 = preparedDisplayDatasetSha256(data);
  const wire: PublishedRouteCells = {
    format: "openindoormaps-published-route-cells-v1",
    version: 1,
    datasetSha256,
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    source: data.source,
    originalTopologySha256: original.geometrySha256,
    inventory: [],
    topology: encodeNativeExactTopology(
      { ...original, sourceGeometryKey: datasetSha256 },
      [],
    ),
    guards: {
      cellIds: [],
      blockedEdgeIds: [],
      access: [],
      circulationBinding: sourceGeometryKey,
    },
    hydration: {
      version: 1,
      runtimeSha256: PUBLISHED_ROUTE_RUNTIME_SHA256,
      policySnapshot: "native-circulation-sha256-v1:" + "a".repeat(64),
      materials: [],
    },
  };
  const pack = (value = wire) => {
    const logical = new TextEncoder().encode(JSON.stringify(value)),
      stored = gzipSync(logical);
    const receipt: PublishedRouteCellReceipt = {
      id: "synthetic-no-native-geometry-authority",
      datasetSha256,
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      source: structuredClone(data.source),
      logicalSha256: progressiveSha256(logical),
      logicalBytes: logical.length,
      compressedSha256: progressiveSha256(stored),
      compressedBytes: stored.length,
      url: "/synthetic.gz",
      runtimeSha256: PUBLISHED_ROUTE_RUNTIME_SHA256,
    };
    return {
      stored,
      receipt,
      policy: {
        receipts: [receipt],
        engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      },
    };
  };
  return { data, wire, pack, ...pack() };
}
test("runtime closure covers actual route, material and topology consumers independently of display binding", () => {
  const binding = publishedRouteRuntimeBinding(process.cwd()),
    names = new Set(binding.modules.map(([name]) => name));
  assert.equal(binding.sha256, PUBLISHED_ROUTE_RUNTIME_SHA256);
  for (const name of [
    "published-route-cells.ts",
    "published-routing-hydration.ts",
    "routing-cache.ts",
    "route-calculation.ts",
    "native-exact-planar-topology.ts",
    "native-routing-material.ts",
    "native-circulation.ts",
    "routing-graph.ts",
    "progressive-route.worker.ts",
  ])
    assert(names.has("app/indoor-project/" + name), name);
  assert(!names.has("app/indoor-project/published-route-cell-receipts.ts"));
  assert(!names.has("app/indoor-project/published-route-runtime-binding.ts"));
});
test("direct decoder callers cannot assert hydration admission; stale runtime and changed dataset miss", () => {
  const f = fixture();
  assert.throws(
    () => decodePublishedRouteCells(f.data, f.receipt, f.stored),
    /admission/,
  );
  assert.equal(
    publishedRouteCellReceipt(f.data, { ...f.policy, receipts: [] }),
    undefined,
  );
  assert.equal(
    publishedRouteCellReceipt(f.data, {
      ...f.policy,
      receipts: [{ ...f.receipt, runtimeSha256: "0".repeat(64) }],
    }),
    undefined,
  );
  f.data.edges[0].enabled = false;
  assert.equal(publishedRouteCellReceipt(f.data, f.policy), undefined);
  assert.throws(
    () => decodePublishedRouteCells(f.data, f.receipt, f.stored),
    /admission/,
  );
});
test("custom matching policies cannot confer the compiled-only hydration capability", () => {
  const f = fixture();
  assert.equal(publishedRouteCellReceipt(f.data, f.policy), f.receipt);
  assert.throws(
    () => decodePublishedRouteCells(f.data, f.receipt, f.stored),
    /admission/,
  );
  const corrupt = f.stored.slice();
  corrupt[0] ^= 1;
  assert.throws(
    () => decodePublishedRouteCells(f.data, f.receipt, corrupt),
    /checksum/,
  );
  for (const receipts of [[{ ...f.receipt }], Object.freeze([f.receipt])]) {
    assert(publishedRouteCellReceipt(f.data, { ...f.policy, receipts }));
    assert.throws(
      () => decodePublishedRouteCells(f.data, f.receipt, f.stored),
      /admission/,
    );
  }
});
test("missing v2 carrier uses complete ordinary validation; corrupt present carrier fails", async () => {
  const f = fixture(),
    baseUrl = "https://example.test/manifest.json";
  const missing = await prepareProgressiveRouteCalculator(
    f.data,
    {
      baseUrl,
      cache: new MemoryVisitorDeliveryCache(),
      fetch: async () => new Response(null, { status: 404 }),
    },
    f.policy,
  );
  const normal = createVerifiedProgressiveRouteCalculator(
    structuredClone(f.data),
  );
  for (const mode of ["public", "accessible"] as const)
    assert.deepEqual(missing("0", "1", mode), normal("0", "1", mode));
  const corrupt = f.stored.slice();
  corrupt[0] ^= 1;
  await assert.rejects(
    prepareProgressiveRouteCalculator(
      f.data,
      {
        baseUrl,
        cache: new MemoryVisitorDeliveryCache(),
        fetch: async () => new Response(corrupt),
      },
      f.policy,
    ),
    /checksum/,
  );
  f.data.records.push(structuredClone(f.data.records[0]));
  f.receipt.datasetSha256 = preparedDisplayDatasetSha256(f.data);
  await assert.rejects(
    prepareProgressiveRouteCalculator(
      f.data,
      {
        baseUrl,
        cache: new MemoryVisitorDeliveryCache(),
        fetch: async () => new Response(null, { status: 404 }),
      },
      f.policy,
    ),
    /Invalid indoor area/,
  );
});
test("hydrated exact parts preserve normal canonical rationals, holes, identities and immutability", () => {
  const binding = {
    sourceModelSha256: "a".repeat(64),
    sourceGeometryKey: "source",
    kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  };
  const parts = nativeRationalOverlay("union", [
    [
      [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ],
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
      ],
    ],
  ]);
  const wire = encodeNativeExactTopology(binding, [
    { id: "original-owner", parts },
  ]);
  const ordinary = createNativeExactTopologyIndex(wire, binding),
    hydrated = hydratePublishedTopology(wire);
  assert.throws(
    () => JSON.stringify(ordinary.parts("original-owner")),
    /never implicit IEEE serialization/,
  );
  assert.equal(assertExactRoutingIndexParity(ordinary, hydrated), 1);
  assert.deepEqual(hydrated.ids(), ordinary.ids());
  assert.deepEqual(hydrated.binding, ordinary.binding);
  assert.equal(hydrated.geometrySha256, ordinary.geometrySha256);
  assert.deepEqual(
    hydrated.parts("original-owner"),
    ordinary.parts("original-owner"),
  );
  assert(Object.isFrozen(hydrated.parts("original-owner")![0][0][0][0]));
  const bad = structuredClone(wire);
  bad.faces[0].parts[0][0][0] = 999_999;
  assert.throws(() => hydratePublishedTopology(bad), /indices/);
});
test("unlisted material heights retain ordinary source validation without dropping campus coverage", () => {
  const data = progressiveRoutingFixture(),
    ordinary = createNativeRoutingMaterialQuery(data);
  const first = ordinary(0),
    hydrated = hydratePublishedMaterials(data, [
      { z: 0, cut: 0.1, value: materialWire(first) },
    ]);
  assert.deepEqual(hydrated(0), first);
  assert.deepEqual(
    hydrated(14.435_695_538_057_743),
    ordinary(14.435_695_538_057_743),
  );
  const wire = materialWire(first);
  wire.known = [Number.NaN];
  assert.throws(
    () => hydratePublishedMaterials(data, [{ z: 0, cut: 0.1, value: wire }]),
    /material snapshot/,
  );
});

test("compiled receipt carrier identities and nested source bindings are immutable", async () => {
  const { PUBLISHED_ROUTE_CELL_RECEIPTS } = await import(
    "../../app/indoor-project/published-route-cell-receipts"
  );
  assert(Object.isFrozen(PUBLISHED_ROUTE_CELL_RECEIPTS));
  for (const receipt of PUBLISHED_ROUTE_CELL_RECEIPTS) {
    assert(Object.isFrozen(receipt));
    assert(Object.isFrozen(receipt.source));
    const original = receipt.compressedSha256;
    assert.throws(() => {
      receipt.compressedSha256 = "f".repeat(64);
    }, TypeError);
    assert.equal(receipt.compressedSha256, original);
    const model = receipt.source.modelSha256;
    assert.throws(() => {
      receipt.source.modelSha256 = "f".repeat(64);
    }, TypeError);
    assert.equal(receipt.source.modelSha256, model);
  }
});
