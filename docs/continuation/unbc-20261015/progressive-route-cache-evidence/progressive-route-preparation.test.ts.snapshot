import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { gzipSync } from "fflate";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import { prepareProgressiveRouteCalculator } from "../../app/indoor-project/progressive-route-preparation";
import { createVerifiedProgressiveRouteCalculator } from "../../app/indoor-project/progressive-route-validation";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { progressiveSha256 } from "../../app/indoor-project/progressive-delivery";
import { MemoryVisitorDeliveryCache } from "../../app/indoor-project/visitor-delivery-cache";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "../../app/indoor-project/native-rational-overlay";
import type {
  PublishedRouteCells,
  PublishedRouteCellReceipt,
} from "../../app/indoor-project/published-route-cells";

/** Fully validated tiny legacy fixture, not UNBC source approval. Its zero-cell
 * native index has no physical permission to manufacture; ordinary routing
 * still uses its actual source edge. Only this unit invokes a fixture policy. */
function fixture() {
  const data = progressiveRoutingFixture();
  data.circulationGeometry = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: "complete-synthetic-cache-transport",
    cells: [],
    exactTopology: encodeNativeExactTopology(
      {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: "complete-synthetic-cache-transport",
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      [],
    ),
  };
  validateIndoorDataset(data);
  const datasetSha256 = preparedDisplayDatasetSha256(data);
  const wire: PublishedRouteCells = {
    format: "openindoormaps-published-route-cells-v1",
    version: 1,
    datasetSha256,
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    source: data.source,
    originalTopologySha256:
      data.circulationGeometry.exactTopology!.geometrySha256,
    inventory: [],
    topology: encodeNativeExactTopology(
      {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: datasetSha256,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      [],
    ),
  };
  const pack = (value = wire) => {
    const logical = new TextEncoder().encode(JSON.stringify(value));
    const stored = gzipSync(logical);
    const receipt: PublishedRouteCellReceipt = {
      id: "validated-synthetic-transport-only",
      datasetSha256,
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      source: structuredClone(data.source),
      logicalSha256: progressiveSha256(logical),
      logicalBytes: logical.length,
      compressedSha256: progressiveSha256(stored),
      compressedBytes: stored.length,
      url: "/checked-cache.gz",
    };
    return {
      receipt,
      logical,
      stored,
      policy: {
        receipts: [receipt],
        engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      },
    };
  };
  return { data, wire, pack, ...pack() };
}
const baseUrl = "https://maps.invalid/data/unbc/manifest.json";
function compareProfiles(
  data: ReturnType<typeof progressiveRoutingFixture>,
  calculate: ReturnType<typeof createVerifiedProgressiveRouteCalculator>,
) {
  const normal = createVerifiedProgressiveRouteCalculator(
    structuredClone(data),
  );
  for (const mode of ["public", "accessible"] as const)
    assert.deepEqual(calculate("0", "1", mode), normal("0", "1", mode));
}

test("exact publication carrier is decoded and retained without changing either route profile", async () => {
  const f = fixture();
  const before = JSON.stringify(f.data);
  const cache = new MemoryVisitorDeliveryCache();
  const urls: string[] = [];
  const calculate = await prepareProgressiveRouteCalculator(
    f.data,
    {
      baseUrl,
      cache,
      fetch: async (url) => {
        urls.push(String(url));
        return new Response(f.stored);
      },
    },
    f.policy,
  );
  assert.deepEqual(urls, ["https://maps.invalid/checked-cache.gz"]);
  assert.deepEqual(await cache.getAsset(f.receipt.compressedSha256), f.stored);
  compareProfiles(f.data, calculate);
  assert.equal(JSON.stringify(f.data), before);
});

test("offline verified carrier is usable, while HTTP-decoded logical bytes are not stored as compressed bytes", async () => {
  const f = fixture();
  const cached = new MemoryVisitorDeliveryCache();
  await cached.putAsset(f.receipt.compressedSha256, f.stored);
  const offline = await prepareProgressiveRouteCalculator(
    f.data,
    {
      baseUrl,
      offline: true,
      cache: cached,
      fetch: async () => assert.fail("offline fetch"),
    },
    f.policy,
  );
  compareProfiles(f.data, offline);
  const empty = new MemoryVisitorDeliveryCache();
  const decoded = await prepareProgressiveRouteCalculator(
    structuredClone(f.data),
    { baseUrl, cache: empty, fetch: async () => new Response(f.logical) },
    f.policy,
  );
  compareProfiles(f.data, decoded);
  assert.equal(await empty.getAsset(f.receipt.compressedSha256), undefined);
});

test("no compiled publication match performs full validation without requesting an optional cache", async () => {
  const data = progressiveRoutingFixture();
  const io = {
    baseUrl,
    cache: {
      getAsset: async () => assert.fail("ineligible cache read"),
      putAsset: async () => assert.fail("ineligible cache write"),
    },
    fetch: async () => assert.fail("ineligible cache fetch"),
  };
  compareProfiles(data, await prepareProgressiveRouteCalculator(data, io));
  data.records.push(structuredClone(data.records[0]));
  await assert.rejects(
    prepareProgressiveRouteCalculator(data, io),
    /Invalid indoor area/,
  );
});

test("different engine, source, or whole dataset cannot select a historical receipt", async () => {
  for (const mutation of ["engine", "source", "dataset"] as const) {
    const f = fixture();
    if (mutation === "engine") f.receipt.engineSha256 = "0".repeat(64);
    if (mutation === "source") f.receipt.source.roomsSha256 = "0".repeat(64);
    if (mutation === "dataset") f.data.edges[0].enabled = false;
    const calculate = await prepareProgressiveRouteCalculator(
      f.data,
      {
        baseUrl,
        cache: {
          getAsset: async () => assert.fail("stale cache read"),
          putAsset: async () => assert.fail("stale cache write"),
        },
        fetch: async () => assert.fail("stale cache fetch"),
      },
      f.policy,
    );
    compareProfiles(f.data, calculate);
  }
});

test("missing optional caches use ordinary full validation, including on offline/cache-storage failure", async () => {
  for (const kind of ["404", "network", "offline", "storage"] as const) {
    const f = fixture();
    let reads = 0;
    const calculate = await prepareProgressiveRouteCalculator(
      f.data,
      {
        baseUrl,
        offline: kind === "offline",
        cache: {
          getAsset: async () => {
            if (kind === "storage") throw Error("unavailable storage");
            return undefined;
          },
          putAsset: async () => assert.fail("missing cache write"),
        },
        fetch: async () => {
          reads++;
          if (kind === "network") throw Error("unavailable network");
          return new Response(null, { status: 404 });
        },
      },
      f.policy,
    );
    assert.equal(reads, kind === "offline" ? 0 : 1);
    compareProfiles(f.data, calculate);
  }
});

test("a matching receipt without its carrier cannot replace full structural validation", async () => {
  const f = fixture();
  f.data.records.push(structuredClone(f.data.records[0]));
  // Test-only declared policy: even a lookup match cannot authorize malformed
  // source when the checked carrier is missing. No publisher pin is changed.
  f.receipt.datasetSha256 = preparedDisplayDatasetSha256(f.data);
  let reads = 0;
  let requests = 0;
  await assert.rejects(
    prepareProgressiveRouteCalculator(
      f.data,
      {
        baseUrl,
        cache: {
          getAsset: async () => {
            reads++;
            return undefined;
          },
          putAsset: async () => assert.fail("missing carrier write"),
        },
        fetch: async () => {
          requests++;
          return new Response(null, { status: 404 });
        },
      },
      f.policy,
    ),
    /Invalid indoor area/,
  );
  assert.equal(reads, 1);
  assert.equal(requests, 1);
});

test("a declared present corrupt carrier refuses instead of falling back to normal calculation", async () => {
  for (const location of ["network", "stored", "empty", "oversize"] as const) {
    const f = fixture();
    const corrupt = f.stored.slice();
    corrupt[0] ^= 1;
    const cache = new MemoryVisitorDeliveryCache();
    if (location === "stored")
      await cache.putAsset(f.receipt.compressedSha256, corrupt);
    await assert.rejects(
      prepareProgressiveRouteCalculator(
        f.data,
        {
          baseUrl,
          cache,
          fetch: async () => {
            if (location === "stored")
              assert.fail("corrupt stored authority must refuse");
            return new Response(
              location === "empty"
                ? new Uint8Array()
                : location === "oversize"
                  ? new Uint8Array(
                      Math.max(
                        f.receipt.compressedBytes,
                        f.receipt.logicalBytes,
                      ) + 1,
                    )
                  : corrupt,
            );
          },
        },
        f.policy,
      ),
      /checksum|checked size/,
    );
  }
});

test("rehashed carrier still cannot change its original topology or introduce an unlisted native face", async () => {
  const f = fixture();
  for (const wire of [
    { ...f.wire, originalTopologySha256: "0".repeat(64) },
    {
      ...f.wire,
      inventory: [{ id: "invented", faceId: "invented", empty: true }],
    },
  ]) {
    const packed = f.pack(wire);
    await assert.rejects(
      prepareProgressiveRouteCalculator(
        f.data,
        {
          baseUrl,
          cache: new MemoryVisitorDeliveryCache(),
          fetch: async () => new Response(packed.stored),
        },
        packed.policy,
      ),
      /snapshot|inventory/,
    );
  }
});

test("worker constructor supplies only real downloaded data and delivery options, never a remote publication policy", () => {
  const source = ts.createSourceFile(
    "progressive-route.worker.ts",
    readFileSync(
      new URL(
        "../../app/indoor-project/progressive-route.worker.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
  );
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "prepareProgressiveRouteCalculator"
    )
      calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].arguments.length, 2);
  assert.equal(calls[0].arguments[0].getText(source), "nextData");
  assert.match(source.text, /nextData = await client\.loadRouting\(\)/);
});
