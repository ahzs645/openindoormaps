import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "fflate";
import type { FeatureCollection } from "geojson";
import { preparedDeliveryFixture } from "../fixtures/prepared-delivery-small";
import {
  decodeProgressiveFloor,
  progressiveManifestRevision,
  progressiveSha256,
  type ProgressivePresentationContext,
} from "../../app/indoor-project/progressive-delivery";
import { projectPublishedVisitorPlan } from "../../app/indoor-project/published-visitor-plan-projection";
import {
  loadPublishedVisitorPlan,
  type PublishedVisitorPlanReceipt,
  type PublishedVisitorPlan,
} from "../../app/indoor-project/published-visitor-plan";
import { PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256 } from "../../app/indoor-project/published-visitor-plan-runtime-binding";
import { MemoryVisitorDeliveryCache } from "../../app/indoor-project/visitor-delivery-cache";
import {
  encodePublishedVisitorPlanDelta,
  restorePublishedVisitorPlanDelta,
} from "../../app/indoor-project/published-visitor-plan-delta";
import { preparedDisplayBindingSha256 } from "../../app/indoor-project/prepared-display-assets";
const empty = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});
async function fixture() {
  const f = preparedDeliveryFixture(),
    scope = f.manifest.scopes[0],
    display = structuredClone(
      await decodeProgressiveFloor(
        f.manifest,
        scope,
        async (id) => f.logical.get(id)!,
      ),
    );
  const prepared = display.preparedFloor,
    presentation = prepared.presentation;
  Object.assign(presentation, {
    visitorWalls: empty(),
    nativeWindows: empty(),
    overviewLabels: empty(),
  });
  Object.assign(presentation.display, {
    records: [],
    roomBlocks: empty(),
    doorFootprints: empty(),
    labels: empty(),
  });
  const context = {
    visitorLabels: empty(),
    connectorMarkers: empty(),
    portals: empty(),
  } as ProgressivePresentationContext;
  const plan = projectPublishedVisitorPlan(
    f.manifest,
    scope,
    display,
    context,
    {
      nativeIndoorEnvelopes: false,
      nativeMaterialSections: false,
      windowMode: "simplified",
    },
  );
  const pack = (value: PublishedVisitorPlan = plan) => {
    const logical = new TextEncoder().encode(JSON.stringify(value)),
      stored = gzipSync(logical);
    const receipt: PublishedVisitorPlanReceipt = {
      id: "synthetic-drawing-only",
      revisionSha256: f.manifest.revisionSha256,
      engineSha256: plan.engineSha256,
      datasetSha256: plan.datasetSha256,
      scopeId: scope.id,
      bindingSha256: plan.bindingSha256,
      pooledJsonSha256: plan.pooledJsonSha256,
      runtimeSha256: PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256,
      logicalSha256: progressiveSha256(logical),
      logicalBytes: logical.length,
      compressedSha256: progressiveSha256(stored),
      compressedBytes: stored.length,
      url: "/plan.gz",
    };
    return { logical, stored, receipt };
  };
  return { ...f, scope, display, context, plan, pack, ...pack() };
}
const manifestUrl = "https://maps.example.test/data/unbc/manifest.json";
test(
  "viewing can finish while persistence is stalled; a verified offline hit never rewrites",
  { timeout: 3000 },
  async () => {
    const f = await fixture(),
      memory = new MemoryVisitorDeliveryCache();
    let release!: () => void,
      writes = 0;
    const pendingWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cache = {
      getAsset: (key: string) => memory.getAsset(key),
      putAsset: async (key: string, bytes: Uint8Array) => {
        writes++;
        await pendingWrite;
        await memory.putAsset(key, bytes);
      },
    };
    try {
      const actual = await loadPublishedVisitorPlan(
        f.manifest,
        f.scope,
        {
          manifestUrl,
          cache,
          deferCacheWrite: true,
          fetch: async () => new Response(f.stored),
        },
        [f.receipt],
      );
      assert.deepEqual(actual, f.plan);
      assert.equal(writes, 1);
      assert.equal(
        await memory.getAsset(f.receipt.compressedSha256),
        undefined,
      );
    } finally {
      release();
    }
    await pendingWrite;
    assert.deepEqual(
      await loadPublishedVisitorPlan(
        f.manifest,
        f.scope,
        {
          manifestUrl,
          cache,
          offline: true,
          fetch: async () => assert.fail("offline fetch"),
        },
        [f.receipt],
      ),
      f.plan,
    );
    assert.equal(writes, 1, "Verified cache read must not recompress/rewrite");
  },
);
test(
  "explicit-save default waits for persistence before returning",
  { timeout: 3000 },
  async () => {
    const f = await fixture(),
      memory = new MemoryVisitorDeliveryCache();
    let release!: () => void,
      entered!: () => void,
      returned = false;
    const pendingWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writeStarted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const result = loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      {
        manifestUrl,
        cache: {
          getAsset: (key: string) => memory.getAsset(key),
          putAsset: async (key: string, bytes: Uint8Array) => {
            entered();
            await pendingWrite;
            await memory.putAsset(key, bytes);
          },
        },
        fetch: async () => new Response(f.stored),
      },
      [f.receipt],
    ).then((plan) => {
      returned = true;
      return plan;
    });
    try {
      await writeStarted;
      assert.equal(returned, false);
    } finally {
      release();
    }
    assert.deepEqual(await result, f.plan);
    assert(await memory.getAsset(f.receipt.compressedSha256));
  },
);
test("unlisted or stale engine/runtime/scope/whole-source plans never request a carrier", async () => {
  const f = await fixture(),
    options = {
      manifestUrl,
      fetch: async () => assert.fail("unlisted fetch"),
      cache: new MemoryVisitorDeliveryCache(),
    };
  assert.equal(
    await loadPublishedVisitorPlan(f.manifest, f.scope, options),
    undefined,
  );
  for (const patch of [
    { engineSha256: "0".repeat(64) },
    { runtimeSha256: "0".repeat(64) },
    { datasetSha256: "0".repeat(64) },
    { pooledJsonSha256: "0".repeat(64) },
    { scopeId: "other" },
  ])
    assert.equal(
      await loadPublishedVisitorPlan(f.manifest, f.scope, options, [
        { ...f.receipt, ...patch },
      ]),
      undefined,
    );
});
test("checked gzip and HTTP-inflated logical carriers both survive a real offline cache readback", async () => {
  for (const kind of ["gzip", "logical"]) {
    const f = await fixture(),
      cache = new MemoryVisitorDeliveryCache();
    const actual = await loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      {
        manifestUrl,
        cache,
        fetch: async () => new Response(kind === "gzip" ? f.stored : f.logical),
      },
      [f.receipt],
    );
    assert.deepEqual(actual, f.plan);
    assert(
      await cache.getAsset(
        kind === "gzip" ? f.receipt.compressedSha256 : f.receipt.logicalSha256,
      ),
    );
    assert.deepEqual(
      await loadPublishedVisitorPlan(
        f.manifest,
        f.scope,
        {
          manifestUrl,
          cache,
          offline: true,
          fetch: async () => assert.fail("offline fetch"),
        },
        [f.receipt],
      ),
      f.plan,
    );
  }
});
test("missing optional plans preserve fallback; corrupt saved bytes require a verified replacement", async () => {
  const f = await fixture(),
    cache = new MemoryVisitorDeliveryCache();
  assert.equal(
    await loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      {
        manifestUrl,
        cache,
        fetch: async () => new Response(null, { status: 404 }),
      },
      [f.receipt],
    ),
    undefined,
  );
  await cache.putAsset(f.receipt.compressedSha256, new Uint8Array([1, 2, 3]));
  assert.deepEqual(
    await loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      { manifestUrl, cache, fetch: async () => new Response(f.stored) },
      [f.receipt],
    ),
    f.plan,
  );
  await cache.putAsset(f.receipt.compressedSha256, new Uint8Array([4, 5, 6]));
  await assert.rejects(
    loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      { manifestUrl, cache, offline: true },
      [f.receipt],
    ),
    /checksum/,
  );
  await assert.rejects(
    loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      {
        manifestUrl,
        cache: new MemoryVisitorDeliveryCache(),
        fetch: async () => new Response(new Uint8Array([1, 2, 3])),
      },
      [f.receipt],
    ),
    /checksum/,
  );
});

test("unreadable saved carriers refuse offline, recover through checked network bytes, and never save corrupt replacements", async () => {
  const f = await fixture();
  const writes: Uint8Array[] = [];
  const cache = {
    getAsset: async () => {
      throw new Error("Damaged offline map record.");
    },
    putAsset: async (_: string, bytes: Uint8Array) => {
      writes.push(bytes);
    },
  };
  await assert.rejects(
    loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      {
        manifestUrl,
        cache,
        offline: true,
        fetch: async () => assert.fail("offline fetch"),
      },
      [f.receipt],
    ),
    /saved floor could not be read/,
  );
  assert.equal(writes.length, 0);
  assert.deepEqual(
    await loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      { manifestUrl, cache, fetch: async () => new Response(f.stored) },
      [f.receipt],
    ),
    f.plan,
  );
  assert.deepEqual(writes, [f.stored]);
  writes.length = 0;
  await assert.rejects(
    loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      {
        manifestUrl,
        cache,
        fetch: async () => new Response(new Uint8Array([1, 2, 3])),
      },
      [f.receipt],
    ),
    /checksum/,
  );
  assert.equal(writes.length, 0);
});
test("rehashed wrong-floor headers, incomplete layers and malformed native owner inventory refuse", async () => {
  const f = await fixture();
  for (const patch of [
    { scopeId: "other" },
    { levelIds: [123] },
    { layers: {} },
    {
      native: {
        fills: empty(),
        overview: empty(),
        outlines: empty(),
        partitions: empty(),
        walls: empty(),
        regions: [{ id: "native-owner", levelId: 999, roomKeys: ["a"] }],
      },
    },
  ]) {
    const p = f.pack({ ...f.plan, ...patch } as PublishedVisitorPlan);
    await assert.rejects(
      loadPublishedVisitorPlan(
        f.manifest,
        f.scope,
        {
          manifestUrl,
          cache: new MemoryVisitorDeliveryCache(),
          fetch: async () => new Response(p.stored),
        },
        [p.receipt],
      ),
      /checked floor/,
    );
  }
});
test("native plan preserves every active ring/hole/owner; only currently transparent generic drawings are omitted", async () => {
  const f = await fixture(),
    p = f.display.preparedFloor,
    regionId = "source-region",
    geometry = {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [2, 1],
          [1, 1],
        ],
      ],
    };
  const feature = {
    type: "Feature" as const,
    id: "original-face",
    geometry,
    properties: {
      nativeRegionId: regionId,
      color: "#abc",
      circulation: false,
      restricted: true,
      nativeDisplayExactParts: ["source-only"],
      access: "staff",
    },
  };
  f.display.nativeFaces.regions = [
    {
      id: regionId,
      levelId: f.scope.levelIds[0],
      roomKeys: ["shared-a", "shared-b"],
    },
  ] as typeof f.display.nativeFaces.regions;
  for (const key of ["fills", "overview", "outlines", "walls"] as const)
    f.display.nativeFaces[key] = {
      type: "FeatureCollection",
      features: [feature],
    };
  p.presentation.display.records = [
    { key: "hidden", levelId: f.scope.levelIds[0] },
  ] as typeof p.presentation.display.records;
  p.physicalGround = {
    type: "FeatureCollection",
    features: [
      { ...feature, properties: { key: "hidden", access: "staff" } },
      {
        ...feature,
        id: "fallback",
        properties: { key: "retained", levelId: 999, access: "unknown" },
      },
    ],
  };
  p.presentation.visitorWalls = {
    type: "FeatureCollection",
    features: [
      {
        ...feature,
        geometry: { type: "MultiPolygon", coordinates: [geometry.coordinates] },
      },
    ],
  };
  const before = JSON.stringify(f.display),
    plan = projectPublishedVisitorPlan(
      f.manifest,
      f.scope,
      f.display,
      f.context,
      {
        nativeIndoorEnvelopes: true,
        nativeMaterialSections: true,
        windowMode: "native",
      },
    );
  assert.equal(plan.layers.areas.features.length, 1);
  assert.equal(plan.layers.areas.features[0].id, "fallback");
  assert.equal(plan.layers.walls.features.length, 0);
  assert.deepEqual(plan.native!.regions, [
    {
      id: regionId,
      levelId: f.scope.levelIds[0],
      roomKeys: ["shared-a", "shared-b"],
    },
  ]);
  for (const key of ["fills", "overview", "outlines", "walls"] as const) {
    assert.equal(plan.native![key].features[0].geometry, geometry);
    assert.deepEqual(plan.native![key].features[0].geometry, geometry);
    assert.deepEqual(plan.native![key].features[0].properties, {
      nativeRegionId: regionId,
      color: "#abc",
      circulation: false,
      restricted: true,
    });
  }
  assert.equal(JSON.stringify(f.display), before);
});

test("plan projection preserves named and unresolved connector display anchors without creating route data", async () => {
  const f = await fixture();
  const markers: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-122.803_412, 53.890_123] },
        properties: {
          key: "original-lift-room",
          kind: "elevator",
          name: "Elevator · original lift",
          heightMetres: 0.64,
          elevationFeet: 14.435_695_538_057_743,
          review: false,
          enabled: true,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-122.803_899, 53.890_987] },
        properties: {
          id: "original-source-stair",
          kind: "stairs",
          name: "Staircase · source #1270216",
          stairElementId: 1_270_216,
          heightMetres: 0.04,
          review: true,
          enabled: false,
        },
      },
    ],
  };
  f.context.connectorMarkers = markers as typeof f.context.connectorMarkers;
  const before = JSON.stringify({ display: f.display, context: f.context });
  const plan = projectPublishedVisitorPlan(
    f.manifest,
    f.scope,
    f.display,
    f.context,
    f.plan.display,
  );
  assert.deepEqual(plan.layers.connectors, markers);
  for (const [i, marker] of markers.features.entries()) {
    assert.equal(plan.layers.connectors.features[i].geometry, marker.geometry);
    assert.equal(
      plan.layers.connectors.features[i].properties,
      marker.properties,
    );
  }
  assert.equal(
    JSON.stringify({ display: f.display, context: f.context }),
    before,
  );
  assert.equal(Object.hasOwn(plan, "nodes"), false);
  assert.equal(Object.hasOwn(plan, "edges"), false);
});

async function deltaFixture() {
  const f = await fixture(),
    baseScope = structuredClone(f.scope);
  baseScope.id = "full-base";
  baseScope.display.descriptor.binding.options = { fixtureBase: true };
  baseScope.display.descriptor.bindingSha256 = preparedDisplayBindingSha256(
    baseScope.display.descriptor.binding,
  );
  f.manifest.scopes.push(baseScope);
  f.manifest.revisionSha256 = progressiveManifestRevision(f.manifest);
  const shape = {
    type: "Feature" as const,
    id: "shared-native-face",
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [2, 1],
          [1, 1],
        ],
      ],
    },
    properties: { nativeRegionId: "native-a", restricted: true, color: "#abc" },
  };
  const plan = structuredClone(f.plan);
  plan.revisionSha256 = f.manifest.revisionSha256;
  plan.layers.doors.features = [shape, { ...shape, id: "different" }];
  plan.layers.connectors.features = [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-122.803_412, 53.890_123] },
      properties: {
        key: "lift",
        kind: "elevator",
        name: "Elevator",
        review: true,
      },
    },
  ];
  const base = structuredClone(plan);
  base.scopeId = baseScope.id;
  base.bindingSha256 = baseScope.display.descriptor.bindingSha256;
  base.layers.doors.features.reverse();
  const pack = (p: PublishedVisitorPlan) => {
    const logical = new TextEncoder().encode(JSON.stringify(p)),
      stored = gzipSync(logical);
    const receipt: PublishedVisitorPlanReceipt = {
      ...f.receipt,
      revisionSha256: p.revisionSha256,
      scopeId: p.scopeId,
      bindingSha256: p.bindingSha256,
      logicalBytes: logical.length,
      logicalSha256: progressiveSha256(logical),
      compressedBytes: stored.length,
      compressedSha256: progressiveSha256(stored),
      url: "/" + p.scopeId + ".gz",
    };
    return { logical, stored, receipt };
  };
  const target = pack(plan),
    full = pack(base),
    wire = encodePublishedVisitorPlanDelta(
      plan,
      base,
      full.receipt.logicalSha256,
    ),
    logical = new TextEncoder().encode(JSON.stringify(wire)),
    stored = gzipSync(logical);
  const receipt: PublishedVisitorPlanReceipt = {
    ...target.receipt,
    compressedBytes: stored.length,
    compressedSha256: progressiveSha256(stored),
    delta: {
      baseScopeId: base.scopeId,
      baseLogicalSha256: full.receipt.logicalSha256,
      logicalBytes: logical.length,
      logicalSha256: progressiveSha256(logical),
    },
  };
  return { ...f, plan, base, wire, logical, stored, receipt, full, target };
}
test("ordered feature sharing retains exact JSON bytes, holes and source owners; wrong references refuse", async () => {
  const f = await deltaFixture();
  assert.deepEqual(f.wire.value.layers.doors.features, [
    { ref: 1 },
    { ref: 0 },
  ]);
  assert.deepEqual(f.wire.value.layers.connectors.features, [{ ref: 0 }]);
  const restored = restorePublishedVisitorPlanDelta(
    f.wire,
    f.base,
    f.full.receipt.logicalSha256,
  );
  assert.equal(JSON.stringify(restored), JSON.stringify(f.plan));
  assert.equal(
    restored.layers.doors.features[0],
    f.base.layers.doors.features[1],
  );
  for (const ref of [-1, 0.5, Number.MAX_SAFE_INTEGER]) {
    const corrupt = structuredClone(f.wire);
    corrupt.value.layers.doors.features[0] = { ref };
    assert.throws(
      () =>
        restorePublishedVisitorPlanDelta(
          corrupt,
          f.base,
          f.full.receipt.logicalSha256,
        ),
      /outside its base/,
    );
  }
  assert.throws(
    () => restorePublishedVisitorPlanDelta(f.wire, f.base, "f".repeat(64)),
    /checked base/,
  );
  assert.throws(
    () =>
      restorePublishedVisitorPlanDelta(
        f.wire,
        { ...f.base, revisionSha256: "f".repeat(64) },
        f.full.receipt.logicalSha256,
      ),
    /checked base/,
  );
});
test("shared plans require both checked carriers, survive gzip/inflated offline reads, and reject rehashed wrong output", async () => {
  for (const inflated of [false, true]) {
    const f = await deltaFixture(),
      cache = new MemoryVisitorDeliveryCache(),
      receipts = [f.receipt, f.full.receipt];
    const fetch = async (input: RequestInfo | URL) =>
      new Response(
        String(input).endsWith(f.full.receipt.url)
          ? inflated
            ? f.full.logical
            : f.full.stored
          : inflated
            ? f.logical
            : f.stored,
      );
    assert.deepEqual(
      await loadPublishedVisitorPlan(
        f.manifest,
        f.scope,
        { manifestUrl, cache, fetch },
        receipts,
      ),
      f.plan,
    );
    assert.deepEqual(
      await loadPublishedVisitorPlan(
        f.manifest,
        f.scope,
        {
          manifestUrl,
          cache,
          offline: true,
          fetch: async () => assert.fail("offline fetch"),
        },
        receipts,
      ),
      f.plan,
    );
    const bad = structuredClone(f.wire);
    bad.value.layers.doors.features.reverse();
    const logical = new TextEncoder().encode(JSON.stringify(bad)),
      stored = gzipSync(logical);
    const rehashed = {
      ...f.receipt,
      compressedBytes: stored.length,
      compressedSha256: progressiveSha256(stored),
      delta: {
        ...f.receipt.delta!,
        logicalBytes: logical.length,
        logicalSha256: progressiveSha256(logical),
      },
    };
    await assert.rejects(
      loadPublishedVisitorPlan(
        f.manifest,
        f.scope,
        {
          manifestUrl,
          cache: new MemoryVisitorDeliveryCache(),
          fetch: async (input) =>
            new Response(
              String(input).endsWith(f.full.receipt.url)
                ? f.full.stored
                : stored,
            ),
        },
        [rehashed, f.full.receipt],
      ),
      /reconstructed.*checksum/,
    );
  }
});
test("missing, cyclic, stale or corrupt shared bases cannot produce a floor", async () => {
  const f = await deltaFixture();
  for (const receipts of [
    [f.receipt],
    [f.receipt, { ...f.full.receipt, delta: f.receipt.delta }],
    [f.receipt, { ...f.full.receipt, logicalSha256: "f".repeat(64) }],
  ])
    await assert.rejects(
      loadPublishedVisitorPlan(
        f.manifest,
        f.scope,
        {
          manifestUrl,
          cache: new MemoryVisitorDeliveryCache(),
          fetch: async () => new Response(f.stored),
        },
        receipts,
      ),
      /checked full base/,
    );
  await assert.rejects(
    loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      {
        manifestUrl,
        cache: new MemoryVisitorDeliveryCache(),
        fetch: async (input) =>
          new Response(
            String(input).endsWith(f.full.receipt.url)
              ? new Uint8Array([1, 2, 3])
              : f.stored,
          ),
      },
      [f.receipt, f.full.receipt],
    ),
    /checksum/,
  );
  const cache = new MemoryVisitorDeliveryCache();
  await cache.putAsset(f.receipt.compressedSha256, f.stored);
  await assert.rejects(
    loadPublishedVisitorPlan(
      f.manifest,
      f.scope,
      { manifestUrl, cache, offline: true },
      [f.receipt, f.full.receipt],
    ),
    /base is unavailable/,
  );
});

test("native feature sharing preserves header order, holes and the complete shared-owner inventory", async () => {
  const f = await deltaFixture();
  const drawing: FeatureCollection = {
    type: "FeatureCollection",
    features: [f.plan.layers.doors.features[0]],
  };
  const plan: PublishedVisitorPlan = {
    native: {
      regions: [
        {
          id: "native-a",
          levelId: f.scope.levelIds[0],
          roomKeys: ["shared-a", "shared-b"],
        },
      ],
      fills: drawing,
      overview: drawing,
      outlines: drawing,
      partitions: empty(),
      walls: drawing,
    },
    ...f.plan,
  };
  const base = { ...plan, scopeId: f.base.scopeId };
  const digest = progressiveSha256(
    new TextEncoder().encode(JSON.stringify(base)),
  );
  const before = JSON.stringify(plan),
    wire = encodePublishedVisitorPlanDelta(plan, base, digest),
    restored = restorePublishedVisitorPlanDelta(wire, base, digest);
  assert.equal(JSON.stringify(restored), before);
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(restored.native!.regions, plan.native!.regions);
  assert.equal(
    restored.native!.fills.features[0].geometry,
    base.native!.fills.features[0].geometry,
  );
});
