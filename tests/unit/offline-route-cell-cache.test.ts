import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { gunzipSync, gzipSync } from "fflate";
import {
  encodePreparedDisplayAsset,
  type PreparedDisplayPayload,
} from "../../app/indoor-project/prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import {
  progressiveManifestRevision,
  progressiveSha256,
  validateProgressiveManifest,
  verifyProgressiveAssetBytes,
  type ProgressiveAsset,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";
import {
  offlineRouteCellReceipt,
  saveOfflineRouteCellCache,
  verifyOfflineRouteCellCache,
} from "../../app/indoor-project/offline-route-cell-cache";
import { MemoryVisitorDeliveryCache } from "../../app/indoor-project/visitor-delivery-cache";
import type { PublishedRouteCellReceipt } from "../../app/indoor-project/published-route-cells";

const raw = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const baseUrl = "https://maps.example.test/data/campus/manifest.json";

/** Transport-only fixture: none of its bytes assert valid physical routes.
 * The worker's independent complete-data decoder remains mandatory. */
function fixture() {
  const source = {
    modelFileName: "test.rvt",
    modelSha256: "a".repeat(64),
    roomsSha256: "b".repeat(64),
  };
  const binding = {
    version: 1 as const,
    datasetSha256: "c".repeat(64),
    enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    levelIds: [1],
    building: "all",
    windowMode: "simplified",
    options: { review: false },
  };
  const fc = () => ({ type: "FeatureCollection", features: [] });
  const encoded = encodePreparedDisplayAsset(
    {
      nativeFaces: {
        levelIds: [1],
        regions: [],
        fills: fc(),
        walls: fc(),
        overview: fc(),
        outlines: fc(),
        partitions: fc(),
        warnings: [],
        warningCount: 0,
      },
      preparedFloor: {
        presentation: { display: {} },
        nativeStairKeys: [],
        stairSurroundKeys: [],
        assumedRoomBlocks: fc(),
        selectionAreas: fc(),
        physicalGround: fc(),
        nativeStairs: fc(),
        stairCutAreas: fc(),
        stairCutRooms: fc(),
      },
    } as unknown as PreparedDisplayPayload,
    binding,
  );
  const assets: Record<string, ProgressiveAsset> = {};
  const logicalAssets = new Map<string, Uint8Array>();
  const add = (
    kind: ProgressiveAsset["kind"],
    bytes: Uint8Array,
    stored = gzipSync(bytes),
  ) => {
    const logicalSha256 = progressiveSha256(bytes),
      compressedSha256 = progressiveSha256(stored),
      id = `${kind}:${logicalSha256}`;
    assets[id] = {
      id,
      kind,
      logicalSha256,
      logicalBytes: bytes.length,
      mediaType: "application/json",
      dependencies: [],
      representations: [
        {
          encoding: "gzip",
          path: `assets/${compressedSha256}.gz`,
          sha256: compressedSha256,
          bytes: stored.length,
        },
      ],
    };
    logicalAssets.set(id, bytes);
    return id;
  };
  const routeAssetId = add(
    "routing",
    raw({ source, originalRoutingBytes: true }),
  );
  const shellAssetId = add("shell", raw({ shell: true }));
  const overviewAssetId = add("overview", raw({ overview: true }));
  const contextAssetId = add("presentation-context", raw({ context: true }));
  const chunkAssetIds = encoded.descriptor.chunks.map((chunk) => {
    const stored = encoded.blobs.get(chunk.sha256)!;
    return add("prepared-chunk", gunzipSync(stored), stored);
  });
  const body = {
    version: 1 as const,
    format: "openindoormaps-progressive-v1" as const,
    provenance: {
      packageSha256: "d".repeat(64),
      datasetSha256: binding.datasetSha256,
      source,
      enginePreparationSha256: binding.enginePreparationSha256,
      publication: "visitor" as const,
    },
    shellAssetId,
    routeAssetId,
    defaultScopeId: "main",
    unavailableScopes: [],
    assets,
    scopes: [
      {
        id: "main",
        label: "Main",
        levelIds: [1],
        building: "all",
        overviewAssetId,
        contextAssetId,
        display: { descriptor: encoded.descriptor, chunkAssetIds },
      },
    ],
  };
  const manifest: ProgressiveManifest = {
    ...body,
    revisionSha256: progressiveManifestRevision(body),
  };
  const logical = raw({ transportOnly: true, originalSource: source });
  const stored = gzipSync(logical, { level: 9, mtime: 0 });
  const receipt: PublishedRouteCellReceipt = {
    id: "synthetic-inert-transport",
    source,
    datasetSha256: assets[routeAssetId].logicalSha256,
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    logicalSha256: progressiveSha256(logical),
    logicalBytes: logical.length,
    compressedSha256: progressiveSha256(stored),
    compressedBytes: stored.length,
    url: "/checked-directions.json.gz",
  };
  const policy = {
    receipts: [receipt],
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  };
  const cache = new MemoryVisitorDeliveryCache();
  const options = {
    baseUrl,
    cache,
    fetch: (async () => new Response(stored.slice().buffer)) as typeof fetch,
  };
  return {
    manifest,
    receipt,
    logical,
    stored,
    policy,
    cache,
    options,
    logicalAssets,
  };
}

/** Execute the three actual class methods with the same real transport helper
 * bound to a synthetic publisher policy. This does not alter production pins
 * or qualify a fixture as navigable. No browser/UI claim comes from this test. */
function actualOfflineMethods(f: ReturnType<typeof fixture>) {
  const source = ts.createSourceFile(
    "progressive-visitor-client.ts",
    readFileSync(
      new URL(
        "../../app/indoor-project/progressive-visitor-client.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    ts.ScriptTarget.ESNext,
    true,
  );
  const declaration = source.statements.find(
    (node) =>
      ts.isClassDeclaration(node) &&
      node.name?.text === "ProgressiveVisitorClient",
  ) as ts.ClassDeclaration;
  const names = new Set([
    "downloadOffline",
    "verifyOfflineInventory",
    "verifySavedManifest",
    // Offline saving stores each asset through the actual private writer.
    "putAsset",
  ]);
  const methods = declaration.members.filter(
    (node) =>
      ts.isMethodDeclaration(node) &&
      node.name &&
      names.has(node.name.getText(source)),
  );
  assert.equal(methods.length, 4);
  const js = ts.transpileModule(
    `class ActualOfflineMethods { #retainedGzip = new WeakMap(); ${methods.map((node) => node.getText(source)).join("\n")} }`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  const Actual = new Function(
    "aborted",
    "VisitorDeliveryError",
    "verifyProgressiveAssetBytes",
    "saveOfflineRouteCellCache",
    "verifyOfflineRouteCellCache",
    "json",
    "MANIFEST_LIMIT",
    "validateProgressiveManifest",
    `${js}; return ActualOfflineMethods;`,
  )(
    (signal?: AbortSignal) => signal?.throwIfAborted(),
    class extends Error {
      constructor(_code: string, message: string) {
        super(message);
      }
    },
    verifyProgressiveAssetBytes,
    (
      manifest: ProgressiveManifest,
      options: Parameters<typeof saveOfflineRouteCellCache>[1],
    ) => saveOfflineRouteCellCache(manifest, options, f.policy),
    (
      manifest: ProgressiveManifest,
      cache: MemoryVisitorDeliveryCache,
      signal?: AbortSignal,
    ) => verifyOfflineRouteCellCache(manifest, cache, signal, f.policy),
    (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)),
    2 * 1024 * 1024,
    // The actual class keeps this validator as an imported binding too.
    validateProgressiveManifest,
  );
  return Object.assign(new Actual(), {
    manifest: f.manifest,
    manifestUrl: baseUrl,
    cache: f.cache,
    options: { fetch: f.options.fetch },
    readAsset: async (id: string) => f.logicalAssets.get(id)!.slice(),
  }) as {
    downloadOffline(
      progress?: (value: {
        complete: boolean;
        directionsCache?: string;
      }) => void,
      signal?: AbortSignal,
    ): Promise<{ complete: boolean; directionsCache?: string }>;
    verifyOfflineInventory(): Promise<void>;
  };
}

test("actual offline methods keep the checked carrier and recheck joint retention after app writes", async () => {
  const f = fixture(),
    client = actualOfflineMethods(f);
  const completed = await client.downloadOffline();
  assert.equal(completed.complete, true);
  assert.equal(completed.directionsCache, "saved");
  for (const asset of Object.values(f.manifest.assets))
    assert.deepEqual(
      await f.cache.getAsset(asset.logicalSha256),
      f.logicalAssets.get(asset.id),
    );
  assert.deepEqual(
    await f.cache.getAsset(f.receipt.compressedSha256),
    f.stored,
  );
  await client.verifyOfflineInventory();
  // Simulate storage evicting directions while the app shell is being saved.
  await f.cache.deleteAsset(f.receipt.compressedSha256);
  await assert.rejects(
    client.verifyOfflineInventory(),
    /did not retain.*directions/,
  );
});

test("actual offline method refuses completion if saving directions evicts a map asset", async () => {
  const f = fixture();
  const original = f.cache.putAsset.bind(f.cache);
  f.cache.putAsset = async (key, bytes) => {
    await original(key, bytes);
    if (key === f.receipt.compressedSha256)
      await f.cache.deleteAsset(
        f.manifest.assets[f.manifest.shellAssetId].logicalSha256,
      );
  };
  let complete = false;
  await assert.rejects(
    actualOfflineMethods(f).downloadOffline((progress) => {
      complete ||= progress.complete;
    }),
    /retain the complete map/,
  );
  assert.equal(complete, false);
});

test("actual offline method rejects cancellation during final manifest write or readback", async () => {
  for (const phase of ["write", "readback"]) {
    const f = fixture();
    const controller = new AbortController();
    const putManifest = f.cache.putManifest.bind(f.cache);
    const getManifest = f.cache.getManifest.bind(f.cache);
    f.cache.putManifest = async (key, bytes) => {
      await putManifest(key, bytes);
      if (phase === "write") controller.abort();
    };
    f.cache.getManifest = async (key) => {
      const saved = await getManifest(key);
      if (phase === "readback") controller.abort();
      return saved;
    };
    let complete = false;
    await assert.rejects(
      actualOfflineMethods(f).downloadOffline((progress) => {
        complete ||= progress.complete;
      }, controller.signal),
      { name: "AbortError" },
    );
    assert.equal(complete, false);
  }
});

test("explicit offline save retains both verified hashes and reuses exact bytes without network", async () => {
  const f = fixture();
  let request: RequestInit | undefined;
  const controller = new AbortController();
  const saved = await saveOfflineRouteCellCache(
    f.manifest,
    {
      ...f.options,
      signal: controller.signal,
      fetch: (async (url, options) => {
        assert.equal(
          String(url),
          "https://maps.example.test/checked-directions.json.gz",
        );
        request = options;
        return new Response(f.stored.slice().buffer);
      }) as typeof fetch,
    },
    f.policy,
  );
  assert.equal(saved, f.receipt);
  assert.equal(request?.signal, controller.signal);
  assert.deepEqual(
    await f.cache.getAsset(f.receipt.compressedSha256),
    f.stored,
  );
  assert.equal(
    await verifyOfflineRouteCellCache(f.manifest, f.cache, undefined, f.policy),
    f.receipt,
  );
  await saveOfflineRouteCellCache(
    f.manifest,
    {
      ...f.options,
      offline: true,
      fetch: (async () => {
        throw new Error("unexpected network");
      }) as typeof fetch,
    },
    f.policy,
  );
});

test("exact HTTP-decoded bytes reconstruct only the publisher's checked deterministic carrier", async () => {
  const f = fixture();
  await saveOfflineRouteCellCache(
    f.manifest,
    {
      ...f.options,
      fetch: (async () =>
        new Response(f.logical.slice().buffer)) as typeof fetch,
    },
    f.policy,
  );
  assert.deepEqual(
    await f.cache.getAsset(f.receipt.compressedSha256),
    f.stored,
  );
});

test("source, current engine and routing logical hash must all match the compiled receipt", async () => {
  const f = fixture();
  for (const receipt of [
    {
      ...f.receipt,
      source: { ...f.receipt.source, modelSha256: "e".repeat(64) },
    },
    {
      ...f.receipt,
      source: { ...f.receipt.source, roomsSha256: "e".repeat(64) },
    },
    {
      ...f.receipt,
      source: { ...f.receipt.source, modelFileName: "another.rvt" },
    },
    { ...f.receipt, engineSha256: "e".repeat(64) },
    { ...f.receipt, datasetSha256: "e".repeat(64) },
  ]) {
    const policy = { ...f.policy, receipts: [receipt] };
    assert.equal(offlineRouteCellReceipt(f.manifest, policy), undefined);
    assert.equal(
      await saveOfflineRouteCellCache(
        f.manifest,
        {
          ...f.options,
          fetch: (async () => {
            throw new Error("unexpected network");
          }) as typeof fetch,
        },
        policy,
      ),
      undefined,
    );
  }
  assert.equal(
    offlineRouteCellReceipt(f.manifest, {
      ...f.policy,
      engineSha256: "f".repeat(64),
    }),
    undefined,
  );
});

test("compressed corruption, changed logical checksum and expansion beyond the bound refuse", async () => {
  const f = fixture();
  const broken = f.stored.slice();
  broken[0] ^= 1;
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      {
        ...f.options,
        fetch: (async () => new Response(broken.buffer)) as typeof fetch,
      },
      f.policy,
    ),
    /checksum/,
  );
  for (const receipt of [
    { ...f.receipt, logicalSha256: "e".repeat(64) },
    { ...f.receipt, logicalBytes: f.logical.length - 2 },
  ])
    await assert.rejects(
      saveOfflineRouteCellCache(f.manifest, f.options, {
        ...f.policy,
        receipts: [receipt],
      }),
      /logical checksum/,
    );
  await f.cache.putAsset(f.receipt.compressedSha256, broken);
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      {
        ...f.options,
        fetch: (async () => {
          throw new Error("corruption must not become a miss");
        }) as typeof fetch,
      },
      f.policy,
    ),
    /checksum/,
  );
});

test("missing declared carrier fails offline, on HTTP failure and on bounded oversized response", async () => {
  const f = fixture();
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      { ...f.options, offline: true },
      f.policy,
    ),
    /not been downloaded/,
  );
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      {
        ...f.options,
        fetch: (async () =>
          new Response(null, { status: 404 })) as typeof fetch,
      },
      f.policy,
    ),
    /404/,
  );
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      {
        ...f.options,
        fetch: (async () =>
          new Response(
            new Uint8Array(f.logical.length + f.stored.length + 1),
          )) as typeof fetch,
      },
      f.policy,
    ),
    /checked size/,
  );
});

test("dropped writes, storage failures and later eviction cannot report retained directions", async () => {
  const f = fixture();
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      {
        ...f.options,
        cache: { getAsset: async () => {}, putAsset: async () => {} },
      },
      f.policy,
    ),
    /did not retain/,
  );
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      {
        ...f.options,
        cache: {
          getAsset: async () => {},
          putAsset: async () => {
            throw new Error("Storage full");
          },
        },
      },
      f.policy,
    ),
    /Storage full/,
  );
  await saveOfflineRouteCellCache(f.manifest, f.options, f.policy);
  await f.cache.deleteAsset(f.receipt.compressedSha256);
  await assert.rejects(
    verifyOfflineRouteCellCache(f.manifest, f.cache, undefined, f.policy),
    /did not retain/,
  );
});

test("cancellation before fetch or during storage prevents checked completion", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      { ...f.options, signal: controller.signal },
      f.policy,
    ),
    { name: "AbortError" },
  );
  const pending = new AbortController();
  await assert.rejects(
    saveOfflineRouteCellCache(
      f.manifest,
      {
        ...f.options,
        signal: pending.signal,
        cache: {
          getAsset: f.cache.getAsset.bind(f.cache),
          putAsset: async (key, bytes) => {
            await f.cache.putAsset(key, bytes);
            pending.abort();
          },
        },
      },
      f.policy,
    ),
    { name: "AbortError" },
  );
});
