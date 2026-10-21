import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "fflate";
import {
  encodePreparedDisplayAsset,
  type PreparedDisplayPayload,
} from "../../app/indoor-project/prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import {
  progressiveManifestRevision,
  progressiveSha256,
  type ProgressiveAsset,
  type ProgressiveManifest,
  type ProgressiveScope,
} from "../../app/indoor-project/progressive-delivery";
import { ProgressiveVisitorClient } from "../../app/indoor-project/progressive-visitor-client";
import { MemoryVisitorDeliveryCache } from "../../app/indoor-project/visitor-delivery-cache";
import { progressiveRepresentations } from "../../scripts/indoor/export-progressive-viewer";
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const fc = () => ({ type: "FeatureCollection", features: [] });
const url = "https://maps.example.test/campus/manifest.json";
function fixture() {
  const files = new Map<string, Uint8Array>();
  const assets: Record<string, ProgressiveAsset> = {};
  const source = {
    modelFileName: "model.rvt",
    modelSha256: "a".repeat(64),
    roomsSha256: "b".repeat(64),
  };
  const add = (kind: ProgressiveAsset["kind"], value: Uint8Array) => {
    const hash = progressiveSha256(value),
      id = `${kind}:${hash}`;
    assets[id] = {
      id,
      kind,
      logicalSha256: hash,
      logicalBytes: value.length,
      mediaType: "application/json",
      dependencies: [],
      representations: progressiveRepresentations(
        value,
        "application/json",
      ).map((r) => {
        const sha256 = progressiveSha256(r.bytes),
          path = `assets/${sha256}.${r.extension}`;
        files.set(new URL(path, url).href, r.bytes);
        return { encoding: r.encoding, path, sha256, bytes: r.bytes.length };
      }),
    };
    return id;
  };
  const shellAssetId = add(
    "shell",
    raw({
      version: 1,
      format: "openindoormaps-visitor-shell-v1",
      source,
      alignment: {
        originFeet: [0, 0, 0],
        originGeographic: [-122, 53],
        projectionLatitude: 53,
        rotationRadians: 0,
        horizontalMetresPerFoot: 0.3048,
        verticalMetresPerFoot: 0.3048,
        rmsMetres: 0,
        referenceCount: 2,
      },
      report: {
        recordCount: 0,
        routableArrivals: 0,
        components: 0,
        largestComponentArrivals: 0,
        unmatchedDoors: 0,
        cellSizeFeet: 0.6,
        omittedSourceLabels: 0,
      },
      buildings: [],
      floors: [],
      nativeLevels: [],
      records: [],
      display: {
        nativeIndoorEnvelopes: false,
        nativeMaterialSections: false,
        windowMode: null,
      },
    }),
  );
  const routeAssetId = add(
    "routing",
    raw({
      format: "reviter-indoor",
      version: 1,
      source,
      originalExact: [Number.MIN_VALUE, 0.1, "123456789123456789/97"],
    }),
  );
  const scopes: ProgressiveScope[] = [311, 400_176].map((level) => {
    const binding = {
      version: 1 as const,
      datasetSha256: "c".repeat(64),
      enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      levelIds: [level],
      building: "all",
      windowMode: "simplified",
      options: { review: false },
    };
    const payload = {
      nativeFaces: {
        levelIds: [level],
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
        nativeIEEE: [Number.MIN_VALUE, 0.1],
      },
    } as unknown as PreparedDisplayPayload;
    const encoded = encodePreparedDisplayAsset(payload, binding);
    const overviewAssetId = add(
      "overview",
      raw({
        version: 1,
        format: "openindoormaps-visitor-overview-v1",
        binding,
        geometry: fc(),
        floor: fc(),
        ground: fc(),
        labels: fc(),
      }),
    );
    const contextAssetId = add(
      "presentation-context",
      raw({
        version: 1,
        format: "openindoormaps-visitor-presentation-context-v1",
        binding,
        connectorMarkers: fc(),
        relativeConnectorMarkers: fc(),
        visitorLabels: fc(),
        extrusionWalls: fc(),
        floorDatumFeet: 0,
        rampEdges: [],
        rampNodes: [],
        portals: fc(),
        stairSelectionKeys: {},
      }),
    );
    const chunkAssetIds = encoded.descriptor.chunks.map((chunk) => {
      const id = add(
        "prepared-chunk",
        gunzipSync(encoded.blobs.get(chunk.sha256)!),
      );
      const gzip = assets[id].representations.find(
        (r) => r.encoding === "gzip",
      )!;
      chunk.sha256 = gzip.sha256;
      chunk.storedBytes = gzip.bytes;
      return id;
    });
    return {
      id: String(level),
      label: `Floor ${level}`,
      levelIds: [level],
      building: "all",
      overviewAssetId,
      contextAssetId,
      display: { descriptor: encoded.descriptor, chunkAssetIds },
    };
  });
  const body = {
    version: 1 as const,
    format: "openindoormaps-progressive-v1" as const,
    provenance: {
      packageSha256: "d".repeat(64),
      datasetSha256: "c".repeat(64),
      source,
      enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      publication: "visitor" as const,
    },
    shellAssetId,
    routeAssetId,
    defaultScopeId: scopes[0].id,
    scopes,
    unavailableScopes: [],
    assets,
  };
  const manifest: ProgressiveManifest = {
    ...body,
    revisionSha256: progressiveManifestRevision(body),
  };
  files.set(url, raw(manifest));
  const requests: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const key = String(input);
    requests.push(key);
    const bytes = files.get(key);
    return new Response(bytes?.slice().buffer, { status: bytes ? 200 : 404 });
  }) as typeof fetch;
  return {
    manifest,
    files,
    fetcher,
    requests,
    cache: new MemoryVisitorDeliveryCache(),
  };
}
const assetPath = (
  m: ProgressiveManifest,
  id: string,
  encoding: "gzip" | "br" = "gzip",
) =>
  new URL(
    m.assets[id].representations.find((r) => r.encoding === encoding)!.path,
    url,
  ).href;

function gzipOnlyPartsFixture() {
  const f = fixture();
  for (const asset of Object.values(f.manifest.assets))
    asset.representations = asset.representations.filter(
      (r) => r.encoding === "gzip",
    );
  const representation =
    f.manifest.assets[f.manifest.routeAssetId].representations[0];
  const stored = f.files.get(new URL(representation.path, url).href)!;
  const middle = Math.floor(stored.length / 2);
  representation.parts = [stored.slice(0, middle), stored.slice(middle)].map(
    (bytes) => {
      const sha256 = progressiveSha256(bytes),
        path = `assets/${sha256}.part`;
      f.files.set(new URL(path, url).href, bytes);
      return { path, sha256, bytes: bytes.length };
    },
  );
  f.files.delete(new URL(representation.path, url).href);
  const resign = () => {
    f.manifest.revisionSha256 = progressiveManifestRevision(f.manifest);
    f.files.set(url, raw(f.manifest));
  };
  resign();
  return { ...f, representation, resign };
}

class TransportCache extends MemoryVisitorDeliveryCache {
  gzipWrites: { hash: string; gzip: Uint8Array; logicalBytes: number }[] = [];
  logicalWrites: string[] = [];
  override async putAsset(hash: string, bytes: Uint8Array) {
    this.logicalWrites.push(hash);
    await super.putAsset(hash, bytes);
  }
  async putGzipAsset(hash: string, gzip: Uint8Array, logicalBytes: number) {
    const owned = new Uint8Array(gzip);
    this.gzipWrites.push({ hash, gzip: owned, logicalBytes });
    // An untrusted/custom cache must not mutate the client's private binding.
    gzip.fill(0);
    await Promise.resolve();
    const logical = gunzipSync(owned);
    assert.equal(logical.length, logicalBytes);
    await super.putAsset(hash, logical);
  }
}

test("checked multipart gzip is saved unchanged without logical recompression and reopens offline", async () => {
  const f = gzipOnlyPartsFixture(),
    cache = new TransportCache();
  const client = ProgressiveVisitorClient.fromManifest(url, f.manifest, {
    cache,
    fetch: f.fetcher,
  });
  const route = await client.loadRouting();
  const asset = f.manifest.assets[f.manifest.routeAssetId];
  assert.equal(cache.logicalWrites.length, 0);
  assert.equal(cache.gzipWrites.length, 1);
  assert.equal(
    progressiveSha256(cache.gzipWrites[0].gzip),
    f.representation.sha256,
  );
  assert.equal(cache.gzipWrites[0].logicalBytes, asset.logicalBytes);
  f.files.clear();
  const offline = ProgressiveVisitorClient.fromManifest(url, f.manifest, {
    cache,
    offline: true,
    fetch: f.fetcher,
  });
  assert.deepEqual(await offline.loadRouting(), route);
});

test("transport bindings stay private across custom-cache mutation and explicit offline readback", async () => {
  const f = gzipOnlyPartsFixture(),
    cache = new TransportCache();
  const client = ProgressiveVisitorClient.fromManifest(url, f.manifest, {
    cache,
    fetch: f.fetcher,
  });
  const result = await client.downloadOffline();
  assert.equal(result.complete, true);
  const hash = f.manifest.assets[f.manifest.routeAssetId].logicalSha256;
  const writes = cache.gzipWrites.filter((entry) => entry.hash === hash);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].gzip, writes[1].gzip);
});

test("auto-decoded HTTP gzip retains logical storage fallback instead of treating JSON as gzip", async () => {
  const f = gzipOnlyPartsFixture(),
    cache = new TransportCache();
  const asset = f.manifest.assets[f.manifest.routeAssetId];
  delete f.representation.parts;
  f.resign();
  const logical = raw({
    format: "reviter-indoor",
    version: 1,
    source: f.manifest.provenance.source,
    originalExact: [Number.MIN_VALUE, 0.1, "123456789123456789/97"],
  });
  const client = ProgressiveVisitorClient.fromManifest(url, f.manifest, {
    cache,
    fetch: (async () =>
      new Response(logical.slice().buffer, {
        headers: { "Content-Encoding": "gzip" },
      })) as typeof fetch,
  });
  await client.loadRouting();
  assert.equal(cache.gzipWrites.length, 0);
  assert.deepEqual(cache.logicalWrites, [asset.logicalSha256]);
});

test("failed logical checksum, corrupt or truncated gzip and cancellation cannot seed retained transport", async () => {
  for (const mode of ["logical", "gzip", "truncated", "abort"] as const) {
    const f = gzipOnlyPartsFixture(),
      cache = new TransportCache();
    const controller = new AbortController();
    const client = ProgressiveVisitorClient.fromManifest(url, f.manifest, {
      cache,
      fetch: (async (input, init) => {
        if (mode === "abort") controller.abort();
        return f.fetcher(input, init);
      }) as typeof fetch,
    });
    if (mode === "logical")
      f.manifest.assets[f.manifest.routeAssetId].logicalSha256 = "f".repeat(64);
    if (mode === "gzip" || mode === "truncated") {
      const joined = new Uint8Array(f.representation.bytes);
      let offset = 0;
      for (const part of f.representation.parts!) {
        const bytes = f.files.get(new URL(part.path, url).href)!;
        joined.set(bytes, offset);
        offset += bytes.length;
      }
      const broken = mode === "gzip" ? joined.fill(7) : joined.slice(0, -8);
      delete f.representation.parts;
      f.representation.sha256 = progressiveSha256(broken);
      f.representation.bytes = broken.length;
      f.files.set(new URL(f.representation.path, url).href, broken);
    }
    await assert.rejects(client.loadRouting(controller.signal));
    assert.equal(cache.gzipWrites.length, 0);
    let complete = false;
    await assert.rejects(
      client.downloadOffline((progress) => {
        complete ||= progress.complete;
      }, controller.signal),
    );
    assert.equal(complete, false);
  }
});

test("mutated returned logical bytes cannot change a privately retained original gzip during explicit save", async () => {
  const f = gzipOnlyPartsFixture(),
    cache = new TransportCache();
  const client = ProgressiveVisitorClient.fromManifest(url, f.manifest, {
    cache,
    fetch: f.fetcher,
  });
  const routeId = f.manifest.routeAssetId;
  const returned = await client.readAsset(routeId);
  const original = returned.slice();
  returned.fill(0);
  const readAsset = client.readAsset.bind(client);
  client.readAsset = async (id, signal) =>
    id === routeId ? returned : readAsset(id, signal);
  const progress = await client.downloadOffline();
  assert.equal(progress.complete, true);
  const hash = f.manifest.assets[routeId].logicalSha256;
  assert.deepEqual(await cache.getAsset(hash), original);
  for (const saved of cache.gzipWrites.filter((entry) => entry.hash === hash))
    assert.deepEqual(gunzipSync(saved.gzip), original);
});

test("metadata mutation during fetch cannot relabel retained gzip or bypass the private source parser", async () => {
  const f = gzipOnlyPartsFixture(),
    cache = new TransportCache();
  const asset = f.manifest.assets[f.manifest.routeAssetId];
  const original = asset.logicalSha256;
  const client = ProgressiveVisitorClient.fromManifest(url, f.manifest, {
    cache,
    fetch: (async (input, init) => {
      asset.logicalSha256 = "f".repeat(64);
      return f.fetcher(input, init);
    }) as typeof fetch,
  });
  await assert.rejects(client.loadRouting(), /source checksum/);
  assert.deepEqual(
    cache.gzipWrites.map((entry) => entry.hash),
    [original],
  );
  assert.equal(await cache.getAsset("f".repeat(64)), undefined);
});

test("raw gzip storage failure remains visible and explicit offline download cannot claim completion", async () => {
  const f = gzipOnlyPartsFixture();
  class FullCache extends TransportCache {
    override async putGzipAsset() {
      throw new DOMException("Storage full", "QuotaExceededError");
    }
  }
  const cache = new FullCache(),
    errors: unknown[] = [];
  const client = ProgressiveVisitorClient.fromManifest(url, f.manifest, {
    cache,
    fetch: f.fetcher,
    onStorageError: (error) => errors.push(error),
  });
  assert.equal((await client.loadRouting()).format, "reviter-indoor");
  assert.equal(errors.length, 1);
  let complete = false;
  await assert.rejects(
    client.downloadOffline((progress) => {
      complete ||= progress.complete;
    }),
    /Storage full/,
  );
  assert.equal(complete, false);
});

test("gzip-only startup stays small and checked routing parts remain lazy and available offline", async () => {
  const f = gzipOnlyPartsFixture();
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  assert.equal(
    f.requests.some((path) => path.endsWith(".br") || path.endsWith(".part")),
    false,
  );
  const route = await client.loadRouting();
  assert.deepEqual(
    (route as unknown as { originalExact: unknown }).originalExact,
    [Number.MIN_VALUE, 0.1, "123456789123456789/97"],
  );
  assert.equal(f.requests.filter((path) => path.endsWith(".part")).length, 2);
  await client.downloadOffline();
  f.files.clear();
  const offline = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
    offline: true,
  });
  assert.deepEqual(await offline.loadRouting(), route);
});

test("routing part fetch refuses missing, truncated, corrupt and reordered complete streams", async () => {
  for (const mode of [
    "missing",
    "truncated",
    "corrupt",
    "reordered",
  ] as const) {
    const f = gzipOnlyPartsFixture();
    const partUrl = new URL(f.representation.parts![0].path, url).href;
    const bytes = f.files.get(partUrl)!;
    if (mode === "missing") f.files.delete(partUrl);
    if (mode === "truncated") f.files.set(partUrl, bytes.slice(1));
    if (mode === "corrupt") {
      const changed = bytes.slice();
      changed[0] ^= 1;
      f.files.set(partUrl, changed);
    }
    if (mode === "reordered") {
      f.representation.parts!.reverse();
      f.resign();
    }
    const client = await ProgressiveVisitorClient.open(url, {
      cache: f.cache,
      fetch: f.fetcher,
    });
    await assert.rejects(
      client.loadRouting(),
      /routing part request failed|failed its checksum/,
    );
  }
});

test("cold startup fetches only manifest, search and selected overview; exact floor and routing stay lazy", async () => {
  const f = fixture();
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  assert.deepEqual(
    new Set(f.requests),
    new Set([
      url,
      assetPath(f.manifest, f.manifest.shellAssetId),
      assetPath(f.manifest, f.manifest.shellAssetId, "br"),
      assetPath(f.manifest, f.manifest.scopes[0].overviewAssetId),
    ]),
  );
  const floor = await client.selectScope(f.manifest.scopes[1].id, {
    detail: true,
  });
  assert.equal(floor.scope.id, f.manifest.scopes[1].id);
  assert.ok(floor.display && floor.context);
  assert.ok(
    !f.requests.includes(assetPath(f.manifest, f.manifest.routeAssetId)),
  );
  const route = (await client.loadRouting()) as unknown as {
    originalExact: unknown[];
  };
  assert.deepEqual(route.originalExact, [
    Number.MIN_VALUE,
    0.1,
    "123456789123456789/97",
  ]);
});
test("verified cache reuses identical content across revisions and repairs corrupt cache bytes", async () => {
  const f = fixture();
  await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  f.requests.length = 0;
  f.manifest.provenance.packageSha256 = "f".repeat(64);
  f.manifest.revisionSha256 = progressiveManifestRevision(f.manifest);
  f.files.set(url, raw(f.manifest));
  await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  assert.deepEqual(f.requests, [
    url,
    assetPath(f.manifest, f.manifest.shellAssetId, "br"),
  ]);
  await f.cache.putAsset(
    f.manifest.assets[f.manifest.shellAssetId].logicalSha256,
    raw({ corrupt: true }),
  );
  f.requests.length = 0;
  await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  assert.ok(
    f.requests.includes(assetPath(f.manifest, f.manifest.shellAssetId)),
  );
});
test("corrupt network data and oversized response streams fail before partial display", async () => {
  const f = fixture();
  const path = assetPath(f.manifest, f.manifest.shellAssetId);
  f.files.set(path, new Uint8Array(f.files.get(path)!.length).fill(9));
  await assert.rejects(
    ProgressiveVisitorClient.open(url, { cache: f.cache, fetch: f.fetcher }),
    /checksum/,
  );
  f.files.set(path, new Uint8Array(1024 * 1024));
  await assert.rejects(
    ProgressiveVisitorClient.open(url, {
      cache: new MemoryVisitorDeliveryCache(),
      fetch: f.fetcher,
    }),
    /byte limit/,
  );
});
test("static raw Brotli and unsupported HTTP Brotli fall back to explicit gzip; automatically decoded HTTP Brotli passes logical checksum", async () => {
  for (const status of [200, 404, 406, 415]) {
    const f = fixture();
    const request = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith(".br") && status !== 200
        ? new Response(null, { status })
        : f.fetcher(input, init)) as typeof fetch;
    await ProgressiveVisitorClient.open(url, {
      cache: f.cache,
      fetch: request,
      preferHttpBrotli: true,
    });
    assert.ok(f.requests.some((path) => path.endsWith(".gz")));
  }
  const f = fixture();
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith(".br")) {
      const asset = Object.values(f.manifest.assets).find(
        (a) => assetPath(f.manifest, a.id, "br") === String(input),
      )!;
      return new Response(
        gunzipSync(
          f.files.get(assetPath(f.manifest, asset.id))!,
        ).slice().buffer,
        { headers: { "Content-Encoding": "br" } },
      );
    }
    return f.fetcher(input, init);
  }) as typeof fetch;
  await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: request,
    preferHttpBrotli: true,
  });
  assert.deepEqual(f.requests, [url]);
});
test("obsolete floor replies are cancelled and can never replace a newer scope", async () => {
  const f = fixture();
  const slowPath = assetPath(f.manifest, f.manifest.scopes[0].contextAssetId);
  let release!: () => void;
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === slowPath) await slow;
    return f.fetcher(input, init);
  }) as typeof fetch;
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: request,
  });
  const old = client.selectScope(f.manifest.scopes[0].id, { detail: true });
  const rejected = assert.rejects(
    old,
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  const current = await client.selectScope(f.manifest.scopes[1].id, {
    detail: true,
  });
  release();
  await rejected;
  assert.equal(current.scope.id, f.manifest.scopes[1].id);
});
test("interrupted offline downloads resume, verify all assets and reopen every floor plus routing without network", async () => {
  const f = fixture();
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  const controller = new AbortController();
  await assert.rejects(
    client.downloadOffline((p) => {
      if (p.completedAssets === 3) controller.abort();
    }, controller.signal),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  f.requests.length = 0;
  const finished = await client.downloadOffline();
  assert.equal(finished.complete, true);
  assert.ok(f.requests.length < Object.keys(f.manifest.assets).length);
  const offline = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: (async () => {
      throw new Error("Network must not run");
    }) as typeof fetch,
    offline: true,
  });
  for (const scope of f.manifest.scopes)
    assert.ok((await offline.selectScope(scope.id, { detail: true })).display);
  assert.equal(
    (await offline.loadRouting()).source.modelSha256,
    f.manifest.provenance.source.modelSha256,
  );
});
test("eviction during download and quota failure cannot report a complete offline map", async () => {
  const f = fixture();
  class EvictingCache extends MemoryVisitorDeliveryCache {
    last?: string;
    override async putAsset(hash: string, bytes: Uint8Array) {
      if (this.last && this.last !== hash) await this.deleteAsset(this.last);
      this.last = hash;
      return super.putAsset(hash, bytes);
    }
  }
  const client = await ProgressiveVisitorClient.open(url, {
    cache: new EvictingCache(),
    fetch: f.fetcher,
  });
  let complete = false;
  await assert.rejects(
    client.downloadOffline((p) => {
      complete ||= p.complete;
    }),
    /retain the complete map/,
  );
  assert.equal(complete, false);
  const broken = new MemoryVisitorDeliveryCache();
  broken.putAsset = async () => {
    throw new DOMException("Storage full", "QuotaExceededError");
  };
  const online = await ProgressiveVisitorClient.open(url, {
    cache: broken,
    fetch: f.fetcher,
  });
  assert.equal(online.shell.format, "openindoormaps-visitor-shell-v1");
  await assert.rejects(online.downloadOffline(), /Storage full/);
});
test("bounded parsed-floor LRU releases old graphs", async () => {
  const f = fixture();
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
    maximumRetainedFloors: 1,
    maximumRetainedFloorBytes: 1024 * 1024,
  });
  for (const scope of f.manifest.scopes)
    await client.selectScope(scope.id, { detail: true });
  assert.equal(client.memoryStatistics().entries, 1);
  client.close();
  assert.equal(client.memoryStatistics().entries, 0);
  await assert.rejects(
    client.selectScope(f.manifest.scopes[0].id),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
});

test("partial preview cannot claim a complete offline map", async () => {
  const f = fixture();
  f.manifest.unavailableScopes = [[99]];
  f.manifest.revisionSha256 = progressiveManifestRevision(f.manifest);
  f.files.set(url, raw(f.manifest));
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  await assert.rejects(client.downloadOffline(), /publication is partial/);
});

test("automatic Brotli negotiation uses a body-free HEAD and propagates the verified host preference", async () => {
  for (const properHttpEncoding of [false, true]) {
    const f = fixture();
    const calls: { url: string; method: string }[] = [];
    const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input),
        method = init?.method ?? "GET";
      calls.push({ url: path, method });
      if (method === "HEAD")
        return new Response(null, {
          headers: properHttpEncoding ? { "Content-Encoding": "br" } : {},
        });
      if (path.endsWith(".br") && properHttpEncoding) {
        const asset = Object.values(f.manifest.assets).find(
          (asset) => assetPath(f.manifest, asset.id, "br") === path,
        )!;
        return new Response(
          gunzipSync(
            f.files.get(assetPath(f.manifest, asset.id))!,
          ).slice().buffer,
        );
      }
      return f.fetcher(input, init);
    }) as typeof fetch;
    const client = await ProgressiveVisitorClient.open(url, {
      cache: f.cache,
      fetch: request,
    });
    assert.equal(calls.filter((call) => call.method === "HEAD").length, 1);
    assert.equal(client.httpBrotliEnabled, properHttpEncoding);
    const assetGets = calls.filter(
      (call) => call.method === "GET" && call.url !== url,
    );
    assert.ok(
      assetGets.every((call) =>
        call.url.endsWith(properHttpEncoding ? ".br" : ".gz"),
      ),
    );
    await client.loadRouting();
    assert.equal(
      calls.at(-1)!.url,
      assetPath(
        f.manifest,
        f.manifest.routeAssetId,
        properHttpEncoding ? "br" : "gzip",
      ),
    );
  }
});

test("offline completion rejects a silently dropped manifest and subsequent manifest loss", async () => {
  const f = fixture();
  class DroppedManifestCache extends MemoryVisitorDeliveryCache {
    override async putManifest() {}
  }
  const client = await ProgressiveVisitorClient.open(url, {
    cache: new DroppedManifestCache(),
    fetch: f.fetcher,
  });
  let complete = false;
  await assert.rejects(
    client.downloadOffline((progress) => {
      complete ||= progress.complete;
    }),
    /offline manifest/,
  );
  assert.equal(complete, false);
  const good = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  const finished = await good.downloadOffline();
  assert.equal(finished.directionsCache, "unavailable");
  assert.equal(finished.directionsCacheBytes, undefined);
  const missing = new Map<string, Uint8Array>();
  f.cache.getManifest = async (key) => missing.get(key);
  await assert.rejects(good.verifyOfflineInventory(), /offline manifest/);
});

test("missing verified presentation carriers fail the floor instead of silently dropping ramps or source portals", async () => {
  const f = fixture();
  const scope = f.manifest.scopes[0],
    asset = f.manifest.assets[scope.contextAssetId];
  const value = JSON.parse(
    new TextDecoder().decode(
      gunzipSync(f.files.get(assetPath(f.manifest, asset.id))!),
    ),
  );
  delete value.rampNodes;
  const broken = raw(value),
    hash = progressiveSha256(broken),
    id = `presentation-context:${hash}`;
  delete f.manifest.assets[asset.id];
  f.manifest.assets[id] = {
    ...asset,
    id,
    logicalSha256: hash,
    logicalBytes: broken.length,
    representations: progressiveRepresentations(broken, "application/json").map(
      (representation) => {
        const sha256 = progressiveSha256(representation.bytes),
          path = `assets/${sha256}.${representation.extension}`;
        f.files.set(new URL(path, url).href, representation.bytes);
        return {
          encoding: representation.encoding,
          path,
          sha256,
          bytes: representation.bytes.length,
        };
      },
    ),
  };
  scope.contextAssetId = id;
  f.manifest.revisionSha256 = progressiveManifestRevision(f.manifest);
  f.files.set(url, raw(f.manifest));
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  await assert.rejects(
    client.selectScope(scope.id, { detail: true }),
    /presentation context/,
  );
});

test("a rehashed routing projection still needs full structural authority validation", async () => {
  const { progressiveRoutingFixture } = await import(
    "../fixtures/progressive-routing"
  );
  const { createVerifiedProgressiveRouteCalculator } = await import(
    "../../app/indoor-project/progressive-route-validation"
  );
  const f = fixture(),
    data = progressiveRoutingFixture();
  data.source = f.manifest.provenance.source;
  data.records.push(structuredClone(data.records[0]));
  const bytes = raw(data),
    hash = progressiveSha256(bytes),
    id = `routing:${hash}`;
  const old = f.manifest.assets[f.manifest.routeAssetId];
  delete f.manifest.assets[old.id];
  f.manifest.assets[id] = {
    ...old,
    id,
    logicalSha256: hash,
    logicalBytes: bytes.length,
    representations: progressiveRepresentations(bytes, "application/json").map(
      (representation) => {
        const sha256 = progressiveSha256(representation.bytes),
          path = `assets/${sha256}.${representation.extension}`;
        f.files.set(new URL(path, url).href, representation.bytes);
        return {
          encoding: representation.encoding,
          path,
          sha256,
          bytes: representation.bytes.length,
        };
      },
    ),
  };
  f.manifest.routeAssetId = id;
  f.manifest.revisionSha256 = progressiveManifestRevision(f.manifest);
  f.files.set(url, raw(f.manifest));
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  const checkedTransport = await client.loadRouting();
  assert.equal(
    checkedTransport.source.modelSha256,
    f.manifest.provenance.source.modelSha256,
  );
  assert.throws(
    () => createVerifiedProgressiveRouteCalculator(checkedTransport),
    /Invalid indoor area/,
  );
});

test("a stalled optional Brotli HEAD is cancelled and cannot block a usable gzip map", async () => {
  const f = fixture();
  let probeCancelled = false;
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "HEAD")
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => {
            probeCancelled = true;
            reject(init.signal?.reason);
          },
          { once: true },
        );
      });
    return f.fetcher(input, init);
  }) as typeof fetch;
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: request,
  });
  assert.equal(probeCancelled, true);
  assert.equal(client.httpBrotliEnabled, false);
  assert.ok(f.requests.some((path) => path.endsWith(".gz")));
});

test("rehashed malformed search/overview assets are rejected before entering the renderer", async () => {
  for (const brokenField of [
    "alignment",
    "nativeLevels",
    "display",
    "records",
    "geometry",
  ] as const) {
    const f = fixture();
    const overview = brokenField === "geometry";
    const originalId = overview
      ? f.manifest.scopes[0].overviewAssetId
      : f.manifest.shellAssetId;
    const asset = f.manifest.assets[originalId];
    const value = JSON.parse(
      new TextDecoder().decode(
        gunzipSync(f.files.get(assetPath(f.manifest, originalId))!),
      ),
    );
    if (brokenField === "records")
      value.records = [{ key: "malformed", geographic: ["bad", 53] }];
    else delete value[brokenField];
    const bytes = raw(value),
      hash = progressiveSha256(bytes),
      id = `${asset.kind}:${hash}`;
    delete f.manifest.assets[originalId];
    f.manifest.assets[id] = {
      ...asset,
      id,
      logicalSha256: hash,
      logicalBytes: bytes.length,
      representations: progressiveRepresentations(
        bytes,
        "application/json",
      ).map((representation) => {
        const sha256 = progressiveSha256(representation.bytes),
          path = `assets/${sha256}.${representation.extension}`;
        f.files.set(new URL(path, url).href, representation.bytes);
        return {
          encoding: representation.encoding,
          path,
          sha256,
          bytes: representation.bytes.length,
        };
      }),
    };
    if (overview) f.manifest.scopes[0].overviewAssetId = id;
    else f.manifest.shellAssetId = id;
    f.manifest.revisionSha256 = progressiveManifestRevision(f.manifest);
    f.files.set(url, raw(f.manifest));
    await assert.rejects(
      ProgressiveVisitorClient.open(url, { cache: f.cache, fetch: f.fetcher }),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "VisitorDeliveryError" &&
        /search index|overview/.test(error.message),
      brokenField,
    );
  }
});

test("canonical manifests bind source values independently of JSON member order", async () => {
  const f = fixture(),
    source = f.manifest.provenance.source;
  f.manifest.provenance.source = {
    roomsSha256: source.roomsSha256,
    modelSha256: source.modelSha256,
    modelFileName: source.modelFileName,
  };
  assert.equal(
    progressiveManifestRevision(f.manifest),
    f.manifest.revisionSha256,
  );
  f.files.set(url, raw(f.manifest));
  const client = await ProgressiveVisitorClient.open(url, {
    cache: f.cache,
    fetch: f.fetcher,
  });
  const routing = await client.loadRouting();
  assert.equal(routing.source.modelSha256, source.modelSha256);
});
