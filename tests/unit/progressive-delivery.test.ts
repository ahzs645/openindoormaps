import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import assert from "node:assert/strict";
import { brotliDecompressSync } from "node:zlib";
import { gunzipSync, unzipSync } from "fflate";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  symlink,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  encodePreparedDisplayAsset,
  preparedDisplayBindingSha256,
  type PreparedDisplayPayload,
} from "../../app/indoor-project/prepared-display-assets";
import {
  decodeProgressiveFloor,
  progressiveManifestRevision,
  progressiveSha256,
  validateProgressiveManifest,
  verifyProgressiveAssetBytes,
  type ProgressiveAsset,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import {
  progressiveRepresentations,
  progressiveRampContext,
  progressiveSelectionContext,
  writeProgressiveOfflineArchive,
  verifyProgressiveDeliveryDirectory,
  writeProgressiveRepresentation,
  verifyProgressiveReuseBinding,
} from "../../scripts/indoor/export-progressive-viewer";
import type { PublishedProjectReceipt } from "../../app/indoor-project/published-project";
import { readProgressiveRoutingParts } from "../../app/indoor-project/progressive-routing-parts";
import { randomBytes } from "node:crypto";
import { revisedOverviewManifest } from "../../scripts/indoor/reproject-progressive-overviews";
import { copyDeclaredProgressiveAssets } from "../../scripts/indoor/copy-progressive-assets";

const raw = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const fc = () => ({ type: "FeatureCollection", features: [] });
const source = {
  modelFileName: "source.rvt",
  modelSha256: "b".repeat(64),
  roomsSha256: "c".repeat(64),
};
const binding = {
  version: 1 as const,
  datasetSha256: "a".repeat(64),
  enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  levelIds: [311, 694],
  building: "all",
  windowMode: "simplified",
  options: { review: false },
};
const retained = {
  exactRationalNumerators: ["1234567890123456789", "-9"],
  IEEECoordinates: [
    [0.1, Number.MIN_VALUE],
    [4, 5],
  ],
  sourceDoorId: 123,
  accessible: "unknown",
  direction: "from-to",
  label: "階段😀",
};
const payload = {
  nativeFaces: {
    levelIds: binding.levelIds,
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
    presentation: { display: {}, retained },
    nativeStairKeys: [],
    stairSurroundKeys: [],
    assumedRoomBlocks: fc(),
    selectionAreas: fc(),
    physicalGround: fc(),
    nativeStairs: fc(),
    stairCutAreas: fc(),
    stairCutRooms: fc(),
  },
} as unknown as PreparedDisplayPayload;
function fixture(includeIdentity = false) {
  const encoded = encodePreparedDisplayAsset(payload, binding);
  const assets: Record<string, ProgressiveAsset> = {},
    logical = new Map<string, Uint8Array>();
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
        includeIdentity,
      ).map((r) => {
        const sha256 = progressiveSha256(r.bytes);
        return {
          encoding: r.encoding,
          path: `assets/${sha256}.${r.extension}`,
          sha256,
          bytes: r.bytes.length,
        };
      }),
    };
    logical.set(id, value);
    return id;
  };
  const shellAssetId = add("shell", raw({ shell: true })),
    routeAssetId = add("routing", raw({ route: true })),
    overviewAssetId = add("overview", raw({ overview: true })),
    contextAssetId = add("presentation-context", raw({ context: true }));
  const chunkAssetIds = encoded.descriptor.chunks.map((chunk) => {
    const id = add(
      "prepared-chunk",
      gunzipSync(encoded.blobs.get(chunk.sha256)!),
    );
    const gzip = assets[id].representations.find((r) => r.encoding === "gzip")!;
    chunk.sha256 = gzip.sha256;
    chunk.storedBytes = gzip.bytes;
    return id;
  });
  const body = {
    version: 1 as const,
    format: "openindoormaps-progressive-v1" as const,
    provenance: {
      packageSha256: "e".repeat(64),
      datasetSha256: binding.datasetSha256,
      source,
      enginePreparationSha256: binding.enginePreparationSha256,
      publication: "visitor" as const,
    },
    shellAssetId,
    routeAssetId,
    defaultScopeId: "main",
    scopes: [
      {
        id: "main",
        label: "Main",
        building: "all",
        levelIds: binding.levelIds,
        overviewAssetId,
        contextAssetId,
        display: { descriptor: encoded.descriptor, chunkAssetIds },
      },
    ],
    unavailableScopes: [],
    assets,
  };
  const manifest: ProgressiveManifest = {
    ...body,
    revisionSha256: progressiveManifestRevision(body),
  };
  return { manifest, logical };
}
const resign = (m: ProgressiveManifest) => {
  m.revisionSha256 = progressiveManifestRevision(m);
  return m;
};
test("display reuse copies only declared carriers and routing parts, excluding unrelated files and symlinks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "progressive-copy-"));
  const sourceDirectory = path.join(root, "source"),
    destination = path.join(root, "destination");
  try {
    const { manifest, logical } = fixture();
    await mkdir(path.join(sourceDirectory, "assets"), { recursive: true });
    for (const asset of Object.values(manifest.assets)) {
      const representations = progressiveRepresentations(
        logical.get(asset.id)!,
        asset.mediaType,
      );
      for (let i = 0; i < representations.length; i++)
        await writeFile(
          path.join(sourceDirectory, asset.representations[i].path),
          representations[i].bytes,
        );
    }
    const route = manifest.assets[manifest.routeAssetId].representations.find(
      (r) => r.encoding === "gzip",
    )!;
    const carrier = await readFile(path.join(sourceDirectory, route.path));
    route.parts = [];
    for (const bytes of [carrier.subarray(0, 8), carrier.subarray(8)]) {
      const sha256 = progressiveSha256(bytes),
        relative = `assets/${sha256}.part`;
      route.parts.push({ path: relative, sha256, bytes: bytes.length });
      await writeFile(path.join(sourceDirectory, relative), bytes);
    }
    resign(manifest);
    await writeFile(
      path.join(sourceDirectory, "assets/unlisted.bin"),
      "not in the map",
    );
    await symlink(
      path.join(sourceDirectory, "assets/unlisted.bin"),
      path.join(sourceDirectory, "assets/unlisted-link"),
    );
    const copied = await copyDeclaredProgressiveAssets(
      sourceDirectory,
      destination,
      manifest,
    );
    const names = await readdir(path.join(destination, "assets"));
    assert.equal(names.length, copied.files);
    assert(!names.includes("unlisted.bin"));
    assert(!names.includes("unlisted-link"));
    assert(
      !names.includes(path.basename(route.path)),
      "nominal unsplit route is not a declared stored file",
    );
    await verifyProgressiveDeliveryDirectory(destination, manifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("display reuse requires the compiled exact publication and rejects re-signed replacements", () => {
  const { manifest } = fixture();
  const receipt = {
    packageSha256: manifest.provenance.packageSha256,
    datasetSha256: manifest.provenance.datasetSha256,
    validatorSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    progressiveRevisionSha256: manifest.revisionSha256,
  } as PublishedProjectReceipt;
  const check = (
    m = manifest,
    r: PublishedProjectReceipt | undefined = receipt,
  ) =>
    verifyProgressiveReuseBinding(
      m,
      r,
      receipt.packageSha256,
      receipt.datasetSha256,
      source,
    );
  assert.doesNotThrow(() => check());
  assert.throws(
    () =>
      verifyProgressiveReuseBinding(
        manifest,
        undefined,
        receipt.packageSha256,
        receipt.datasetSha256,
        source,
      ),
    /compiled checked/,
  );
  for (const change of [
    { packageSha256: "0".repeat(64) },
    { datasetSha256: "0".repeat(64) },
    { validatorSha256: "0".repeat(64) },
    { progressiveRevisionSha256: "0".repeat(64) },
  ])
    assert.throws(
      () => check(manifest, { ...receipt, ...change }),
      /compiled checked/,
    );
  const changed = structuredClone(manifest);
  changed.scopes[0].label = "Remote replacement";
  resign(changed);
  assert.throws(() => check(changed), /compiled checked/);
  assert.throws(
    () =>
      verifyProgressiveReuseBinding(
        manifest,
        receipt,
        receipt.packageSha256,
        receipt.datasetSha256,
        { ...source, modelSha256: "0".repeat(64) },
      ),
    /compiled checked/,
  );
});
test("auxiliary floor projection preserves exact prepared/routing/context roots and truthful partial coverage", async () => {
  const { manifest, logical } = fixture();
  manifest.unavailableScopes = [[999]];
  resign(manifest);
  const before = structuredClone(manifest);
  const scope = manifest.scopes[0];
  const old = manifest.assets[scope.overviewAssetId];
  const rawOverview = raw({ projectedFloor: true });
  const logicalSha256 = progressiveSha256(rawOverview);
  const replacement: ProgressiveAsset = {
    ...old,
    id: `overview:${logicalSha256}`,
    logicalSha256,
    logicalBytes: rawOverview.length,
    representations: progressiveRepresentations(
      rawOverview,
      "application/json",
    ).map((r) => {
      const sha256 = progressiveSha256(r.bytes);
      return {
        encoding: r.encoding,
        path: `assets/${sha256}.${r.extension}`,
        sha256,
        bytes: r.bytes.length,
      };
    }),
  };
  const projection = {
    version: 1 as const,
    algorithmId: "prepared-exact-native-exclusion-overview-v1",
    algorithmSha256: "d".repeat(64),
    fromRevisionSha256: manifest.revisionSha256,
    proofSha256: "f".repeat(64),
    scopeInputs: { [scope.id]: old.logicalSha256 },
  };
  const corrected = revisedOverviewManifest(
    manifest,
    { [scope.id]: replacement },
    projection,
  );
  validateProgressiveManifest(corrected);
  assert.deepEqual(manifest, before);
  assert.deepEqual(corrected.provenance, before.provenance);
  assert.deepEqual(corrected.scopes[0].display, before.scopes[0].display);
  assert.deepEqual(corrected.unavailableScopes, [[999]]);
  for (const id of [
    manifest.shellAssetId,
    manifest.routeAssetId,
    scope.contextAssetId,
    ...scope.display.chunkAssetIds,
  ])
    assert.deepEqual(corrected.assets[id], manifest.assets[id]);
  assert.equal(corrected.assets[scope.overviewAssetId], undefined);
  assert.notEqual(corrected.revisionSha256, manifest.revisionSha256);
  assert.deepEqual(
    await decodeProgressiveFloor(
      corrected,
      corrected.scopes[0],
      async (id) => logical.get(id)!,
    ),
    payload,
  );
  assert.throws(() =>
    revisedOverviewManifest(
      manifest,
      { [scope.id]: replacement },
      { ...projection, fromRevisionSha256: "0".repeat(64) },
    ),
  );
  assert.throws(() =>
    revisedOverviewManifest(
      manifest,
      { [scope.id]: replacement },
      { ...projection, scopeInputs: { [scope.id]: "0".repeat(64) } },
    ),
  );
  assert.throws(() => revisedOverviewManifest(manifest, {}, projection));
  assert.throws(() =>
    revisedOverviewManifest(
      corrected,
      { [scope.id]: replacement },
      { ...projection, fromRevisionSha256: corrected.revisionSha256 },
    ),
  );
});
test("progressive floor replays the exact established prepared graph without full source authority", async () => {
  const { manifest, logical } = fixture();
  validateProgressiveManifest(manifest);
  const readIds: string[] = [];
  const restored = await decodeProgressiveFloor(
    manifest,
    manifest.scopes[0],
    async (id) => {
      readIds.push(id);
      return logical.get(id)!;
    },
  );
  assert.deepEqual(restored, payload);
  assert.ok(
    readIds.every((id) => manifest.assets[id].kind === "prepared-chunk"),
  );
  assert.ok(!readIds.includes(manifest.routeAssetId));
});
test("gzip and Brotli are deterministic explicit files with exact IEEE/rational/Unicode round trips", () => {
  const value = raw(retained),
    first = progressiveRepresentations(value, "application/json"),
    second = progressiveRepresentations(value, "application/json");
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  const gzip = first.find((r) => r.encoding === "gzip")!,
    br = first.find((r) => r.encoding === "br")!;
  assert.equal(gzip.bytes.slice(4, 8).some(Boolean), false);
  assert.deepEqual(gunzipSync(gzip.bytes), value);
  assert.deepEqual(new Uint8Array(brotliDecompressSync(br.bytes)), value);
});
test("corrupted decoded data and wrong source/scope/engine manifests fail closed", async () => {
  const { manifest, logical } = fixture();
  const id = manifest.scopes[0].display.chunkAssetIds[0],
    corrupt = logical.get(id)!.slice();
  corrupt[0] ^= 1;
  assert.throws(
    () => verifyProgressiveAssetBytes(manifest.assets[id], corrupt),
    /checksum/,
  );
  await assert.rejects(
    decodeProgressiveFloor(manifest, manifest.scopes[0], async () => corrupt),
    /checksum/,
  );
  for (const mutate of [
    (m: ProgressiveManifest) => {
      m.provenance.datasetSha256 = "1".repeat(64);
    },
    (m: ProgressiveManifest) => {
      m.provenance.enginePreparationSha256 = "2".repeat(64);
    },
    (m: ProgressiveManifest) => {
      m.scopes[0].levelIds = [999];
    },
  ]) {
    const changed = structuredClone(manifest);
    mutate(changed);
    assert.throws(
      () => validateProgressiveManifest(resign(changed)),
      /binding mismatch/,
    );
  }
  const changed = structuredClone(manifest.scopes[0]);
  changed.label = "Other revision";
  await assert.rejects(
    decodeProgressiveFloor(manifest, changed, async (key) => logical.get(key)!),
    /current manifest/,
  );
});
test("unsafe paths, missing roots, cycles and unreachable dependencies are rejected", () => {
  for (const mutate of [
    (m: ProgressiveManifest) => {
      m.assets[m.shellAssetId].representations[0].path = "../other-map.json";
    },
    (m: ProgressiveManifest) => {
      delete m.assets[m.routeAssetId];
    },
    (m: ProgressiveManifest) => {
      m.assets[m.shellAssetId].dependencies = [m.routeAssetId];
      m.assets[m.routeAssetId].dependencies = [m.shellAssetId];
    },
    (m: ProgressiveManifest) => {
      m.assets[m.shellAssetId].dependencies = ["shell:missing"];
    },
    (m: ProgressiveManifest) => {
      const extra = structuredClone(m.assets[m.shellAssetId]);
      extra.id = `shell:${"9".repeat(64)}`;
      extra.logicalSha256 = "9".repeat(64);
      const r = extra.representations.find((r) => r.encoding === "identity");
      if (r) {
        r.sha256 = extra.logicalSha256;
        r.path = `assets/${r.sha256}.json`;
      }
      m.assets[extra.id] = extra;
    },
  ]) {
    const { manifest } = fixture();
    mutate(manifest);
    assert.throws(() => validateProgressiveManifest(resign(manifest)));
  }
});
test("manifest revision and asset size limits cannot silently change", () => {
  const { manifest } = fixture();
  manifest.scopes[0].label = "Edited but not rebound";
  assert.throws(
    () => validateProgressiveManifest(manifest),
    /revision mismatch/,
  );
  const other = fixture().manifest;
  other.assets[other.routeAssetId].logicalBytes = 1024 * 1024 * 1024;
  assert.throws(
    () => validateProgressiveManifest(resign(other)),
    /asset descriptor/,
  );
});

for (const includeIdentity of [false, true])
  test(`complete offline ZIP and full readback verify ${includeIdentity ? "legacy three-representation" : "compressed-only"} assets`, async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "progressive-offline-"),
    );
    try {
      const { manifest, logical } = fixture(includeIdentity);
      await mkdir(path.join(directory, "assets"));
      await writeFile(
        path.join(directory, "manifest.json"),
        JSON.stringify(manifest),
      );
      for (const asset of Object.values(manifest.assets)) {
        const representations = progressiveRepresentations(
          logical.get(asset.id)!,
          asset.mediaType,
          includeIdentity,
        );
        for (let i = 0; i < representations.length; i++)
          await writeFile(
            path.join(directory, asset.representations[i].path),
            representations[i].bytes,
          );
      }
      const verified = await verifyProgressiveDeliveryDirectory(
        directory,
        manifest,
      );
      assert.equal(
        verified.representations,
        Object.keys(manifest.assets).length * (includeIdentity ? 3 : 2),
      );
      await writeProgressiveOfflineArchive(directory, manifest);
      const archive = unzipSync(
        new Uint8Array(
          await readFile(path.join(directory, "complete-map.offline.zip")),
        ),
      );
      assert.deepEqual(
        JSON.parse(new TextDecoder().decode(archive["manifest.json"])),
        manifest,
      );
      const inventory = JSON.parse(
        new TextDecoder().decode(archive["offline-inventory.json"]),
      );
      assert.equal(inventory.revisionSha256, manifest.revisionSha256);
      assert.equal(
        inventory.assets.length,
        Object.keys(manifest.assets).length,
      );
      for (const asset of Object.values(manifest.assets)) {
        const gzip = asset.representations.find((r) => r.encoding === "gzip")!;
        assert.equal(progressiveSha256(archive[gzip.path]), gzip.sha256);
        verifyProgressiveAssetBytes(asset, gunzipSync(archive[gzip.path]));
      }
      assert.equal(
        Object.keys(archive).length,
        Object.keys(manifest.assets).length + 2,
      );
      const stored = manifest.assets[
        manifest.shellAssetId
      ].representations.find((r) => r.encoding === "gzip")!;
      const corrupted = new Uint8Array(
        await readFile(path.join(directory, stored.path)),
      );
      corrupted[0] ^= 1;
      await writeFile(path.join(directory, stored.path), corrupted);
      await assert.rejects(
        verifyProgressiveDeliveryDirectory(directory, manifest),
        /checksum mismatch/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

test("self-consistent assets from an older preparation engine are rejected by the current renderer", () => {
  const { manifest } = fixture();
  manifest.provenance.enginePreparationSha256 = "2".repeat(64);
  const descriptor = manifest.scopes[0].display.descriptor;
  descriptor.binding.enginePreparationSha256 =
    manifest.provenance.enginePreparationSha256;
  descriptor.bindingSha256 = preparedDisplayBindingSha256(descriptor.binding);
  assert.throws(
    () => validateProgressiveManifest(resign(manifest)),
    /unsupported preparation engine/,
  );
});

test("progressive presentation retains original scoped ramp bodies, platforms, edge policy and endpoint nodes", () => {
  const ramp = {
    nativeElementId: 77,
    edgeId: "ramp-a",
    levelIds: [311],
    anchorPointFeet: [1, 2, 3],
    trianglesFeet: [
      [
        [0.1, 0, 5],
        [1, Number.MIN_VALUE, 6],
        [2, 2, 7],
      ],
    ],
    bodyTrianglesFeet: [
      [
        [0.1, 0, 4],
        [1, 0, 5],
        [2, 2, 6],
      ],
    ],
    platforms: [
      {
        nativeElementId: 99,
        trianglesFeet: [
          [
            [0, 0, 5],
            [1, 0, 5],
            [2, 2, 5],
          ],
        ],
      },
    ],
  };
  const edge = {
    id: "ramp-a",
    from: "a",
    to: "b",
    kind: "walk",
    enabled: false,
    accessible: "unknown",
    direction: "to-from",
    pointsFeet: [
      [0.1, 0, 5],
      [1, 1, 7],
    ],
    roomKeys: [],
  };
  const data = {
    source,
    nativeLevels: [{ id: 311, name: "1", elevationFeet: 5 }],
    records: [{ levelId: 311, elevationFeet: 5.5 }],
    edges: [edge, { ...edge, id: "other", from: "unrelated", to: "unrelated" }],
    nodes: [
      { id: "a", pointFeet: [0.1, Number.MIN_VALUE, 5] },
      { id: "b", pointFeet: [1, 1, 7] },
      { id: "unrelated" },
    ],
    rampDisplay: {
      version: 1,
      sourceModelSha256: source.modelSha256,
      ramps: [
        ramp,
        { ...ramp, nativeElementId: 88, edgeId: "other", levelIds: [999] },
      ],
    },
  } as unknown as IndoorDataset;
  const before = JSON.stringify(data),
    context = progressiveRampContext(data, [311]);
  assert.deepEqual(context.rampDisplay, { ...data.rampDisplay, ramps: [ramp] });
  assert.deepEqual(context.rampEdges, [edge]);
  assert.deepEqual(context.rampNodes, data.nodes.slice(0, 2));
  assert.equal(context.floorDatumFeet, 5.5);
  assert.equal(JSON.stringify(data), before);
});

test("progressive portals preserve existing disabled connector markers and source-bound stair selection", () => {
  const record = {
    key: "room-a",
    levelId: 311,
    elevationFeet: 5,
    ringsFeet: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    ],
  };
  const edge = {
    id: "lift",
    from: "a",
    to: "b",
    kind: "elevator",
    enabled: false,
    roomKeys: [record.key],
    pointsFeet: [
      [0, 0, 5],
      [1, 1, 9],
    ],
  };
  const doorMarker = {
    type: "Feature",
    properties: { nativeDoorId: 42 },
    geometry: { type: "Point", coordinates: [-123, 53] },
  };
  const data = {
    source,
    nativeLevels: [{ id: 311, elevationFeet: 5 }],
    records: [record],
    doors: [],
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-123, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    edges: [
      edge,
      {
        ...edge,
        id: "native-door",
        kind: "door",
        pointsFeet: [
          [0, 0, 5],
          [1, 1, 5],
        ],
      },
      { ...edge, id: "other-room", roomKeys: ["other"] },
    ],
    stairDisplay: {
      sourceModelSha256: source.modelSha256,
      flights: [
        {
          roomKey: record.key,
          stairElementId: 7,
          sourceGeometryKey: JSON.stringify([
            record.levelId,
            record.elevationFeet,
            record.ringsFeet,
          ]),
        },
        { roomKey: record.key, stairElementId: 8, sourceGeometryKey: "stale" },
      ],
    },
  } as unknown as IndoorDataset;
  const displayPayload = {
    preparedFloor: {
      presentation: {
        display: {
          records: [record],
          doorMarkers: { type: "FeatureCollection", features: [doorMarker] },
        },
      },
    },
  } as unknown as PreparedDisplayPayload;
  const before = JSON.stringify(data),
    projected = progressiveSelectionContext(data, displayPayload, [311]);
  assert.equal(projected.portals.features.length, 2);
  assert.deepEqual(projected.portals.features[0], doorMarker);
  assert.deepEqual(projected.portals.features[1].properties, {
    id: "lift",
    kind: "elevator",
    enabled: false,
  });
  assert.deepEqual(projected.stairSelectionKeys, {
    "room-a": ["source-stair:7"],
  });
  assert.equal(JSON.stringify(data), before);
});

test("compressed-only manifests retain exact prepared replay and both fallback codecs; legacy identity remains optional", async () => {
  for (const includeIdentity of [false, true]) {
    const { manifest, logical } = fixture(includeIdentity);
    validateProgressiveManifest(manifest);
    assert.ok(
      Object.values(manifest.assets).every(
        (asset) => asset.representations.length === (includeIdentity ? 3 : 2),
      ),
    );
    assert.deepEqual(
      await decodeProgressiveFloor(
        manifest,
        manifest.scopes[0],
        async (id) => logical.get(id)!,
      ),
      payload,
    );
  }
  for (const encoding of ["gzip", "br"] as const) {
    const { manifest } = fixture(true);
    manifest.assets[manifest.shellAssetId].representations = manifest.assets[
      manifest.shellAssetId
    ].representations.filter((r) => r.encoding !== encoding);
    if (encoding === "gzip")
      assert.throws(
        () => validateProgressiveManifest(resign(manifest)),
        /gzip representation is required/,
      );
    else validateProgressiveManifest(resign(manifest));
  }
});

test("oversized routing gzip uses bounded parts without changing one stored or logical byte", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "routing-parts-"));
  try {
    await mkdir(path.join(directory, "assets"));
    const raw = new Uint8Array(randomBytes(16 * 1024 * 1024 + 1024));
    const [gzip] = progressiveRepresentations(
      raw,
      "application/json",
      false,
      false,
    );
    assert.equal(gzip.encoding, "gzip");
    const representation = await writeProgressiveRepresentation(
      directory,
      "routing",
      gzip,
    );
    assert.equal(representation.parts?.length, 2);
    assert.ok(
      representation.parts!.every((part) => part.bytes <= 16 * 1024 * 1024),
    );
    await assert.rejects(readFile(path.join(directory, representation.path)), {
      code: "ENOENT",
    });
    const stored = await readProgressiveRoutingParts(
      representation,
      async (part) =>
        new Uint8Array(await readFile(path.join(directory, part.path))),
    );
    assert.deepEqual(stored, gzip.bytes);
    assert.deepEqual(gunzipSync(stored), raw);
    await assert.rejects(
      readProgressiveRoutingParts(
        { ...representation, parts: [...representation.parts!].reverse() },
        async (part) =>
          new Uint8Array(await readFile(path.join(directory, part.path))),
      ),
      /stream failed its checksum/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("routing parts refuse invalid paths, totals, counts and non-routing uses before download", () => {
  const make = () => {
    const { manifest } = fixture();
    const representation =
      manifest.assets[manifest.routeAssetId].representations[0];
    representation.parts = [
      {
        path: `assets/${"d".repeat(64)}.part`,
        sha256: "d".repeat(64),
        bytes: 1,
      },
      {
        path: `assets/${"e".repeat(64)}.part`,
        sha256: "e".repeat(64),
        bytes: representation.bytes - 1,
      },
    ];
    validateProgressiveManifest(resign(manifest));
    return { manifest, representation };
  };
  for (const mutate of [
    (r: ProgressiveAsset["representations"][number]) => {
      r.parts![0].path = "../other.part";
    },
    (r: ProgressiveAsset["representations"][number]) => {
      r.parts![0].bytes++;
    },
    (r: ProgressiveAsset["representations"][number]) => {
      r.parts!.pop();
    },
    (r: ProgressiveAsset["representations"][number]) => {
      r.parts![0].bytes = 16 * 1024 * 1024 + 1;
    },
  ]) {
    const { manifest, representation } = make();
    mutate(representation);
    assert.throws(
      () => validateProgressiveManifest(resign(manifest)),
      /routing parts/,
    );
  }
  const { manifest, representation } = make();
  manifest.assets[manifest.shellAssetId].representations[0].parts =
    representation.parts;
  assert.throws(
    () => validateProgressiveManifest(resign(manifest)),
    /routing parts/,
  );
});

test("the complete offline ZIP contains every real routing part and reconstructs exact stored and logical bytes", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "routing-parts-offline-"),
  );
  try {
    const { manifest, logical } = fixture(),
      routeBytes = raw({
        transportFixture: true,
        retained,
        payload: randomBytes(17 * 1024 * 1024).toString("base64"),
      }),
      logicalSha256 = progressiveSha256(routeBytes),
      id = `routing:${logicalSha256}`;
    delete manifest.assets[manifest.routeAssetId];
    manifest.routeAssetId = id;
    manifest.assets[id] = {
      id,
      kind: "routing",
      logicalSha256,
      logicalBytes: routeBytes.length,
      mediaType: "application/json",
      dependencies: [],
      representations: [],
    };
    logical.set(id, routeBytes);
    await mkdir(path.join(directory, "assets"));
    for (const asset of Object.values(manifest.assets)) {
      asset.representations = [];
      for (const representation of progressiveRepresentations(
        logical.get(asset.id)!,
        asset.mediaType,
        false,
        false,
      ))
        asset.representations.push(
          await writeProgressiveRepresentation(
            directory,
            asset.kind,
            representation,
          ),
        );
    }
    resign(manifest);
    validateProgressiveManifest(manifest);
    const routing = manifest.assets[id].representations[0]!;
    assert.equal(routing.encoding, "gzip");
    assert.equal(routing.parts!.length, 2);
    await writeFile(
      path.join(directory, "manifest.json"),
      JSON.stringify(manifest),
    );
    assert.equal(
      (await verifyProgressiveDeliveryDirectory(directory, manifest))
        .exactCodecRoundTrips,
      true,
    );
    await writeProgressiveOfflineArchive(directory, manifest);
    const archive = unzipSync(
        new Uint8Array(
          await readFile(path.join(directory, "complete-map.offline.zip")),
        ),
      ),
      inventory = JSON.parse(
        new TextDecoder().decode(archive["offline-inventory.json"]),
      ),
      expectedFiles = new Set([
        "manifest.json",
        "offline-inventory.json",
        ...Object.values(manifest.assets).flatMap((asset) => {
          const gzip = asset.representations.find(
            (row) => row.encoding === "gzip",
          )!;
          return gzip.parts ? gzip.parts.map((part) => part.path) : [gzip.path];
        }),
      ]);
    assert.deepEqual(new Set(Object.keys(archive)), expectedFiles);
    assert.deepEqual(
      JSON.parse(new TextDecoder().decode(archive["manifest.json"])),
      manifest,
    );
    assert.equal(
      archive[routing.path],
      undefined,
      "The virtual unchunked routing path must not enter the ZIP",
    );
    assert.deepEqual(
      inventory.assets.find((asset: { id: string }) => asset.id === id).parts,
      routing.parts,
    );
    for (const part of routing.parts!) {
      assert.equal(archive[part.path].length, part.bytes);
      assert.equal(progressiveSha256(archive[part.path]), part.sha256);
    }
    const stored = await readProgressiveRoutingParts(
      routing,
      async (part) => archive[part.path],
    );
    assert.equal(progressiveSha256(stored), routing.sha256);
    assert.equal(stored.length, routing.bytes);
    const restored = gunzipSync(stored);
    assert.deepEqual(restored, routeBytes);
    assert.equal(progressiveSha256(restored), logicalSha256);
    assert.deepEqual(
      JSON.parse(new TextDecoder().decode(restored)).retained,
      retained,
    );
    await rm(path.join(directory, routing.parts![0]!.path));
    await assert.rejects(
      verifyProgressiveDeliveryDirectory(directory, manifest),
      { code: "ENOENT" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
