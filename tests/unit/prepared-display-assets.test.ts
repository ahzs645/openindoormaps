import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  decodePreparedDisplayAsset,
  encodePreparedDisplayAsset,
  preparedDisplayBindingSha256,
  preparedDisplayDatasetSha256,
  PREPARED_DISPLAY_ASSET_LIMITS,
  validatePreparedDisplayAssetDescriptor,
  type PreparedDisplayAssetBinding,
  type PreparedDisplayPayload,
} from "../../app/indoor-project/prepared-display-assets";
const binding: PreparedDisplayAssetBinding = {
  version: 1,
  datasetSha256: "a".repeat(64),
  enginePreparationSha256: "b".repeat(64),
  levelIds: [311, 694],
  building: "all",
  windowMode: "default",
  options: { review: false, relativeHeights: true, showStructures: false },
};
const part = {
  nativeOwnerId: 311,
  rings: Array.from({ length: 120 }, (_, i) => [i / 7, i / 11]),
  exactTopology: {
    rationalNumerators: ["1234567890123456789", "-9"],
    residuals: [[0, 1, 2, 3]],
    holes: [[1, 2, 3, 4]],
  },
  unchangedIEEEAnchorsFeet: [
    [0.1, 0.2],
    [Number.MIN_VALUE, 1],
  ],
};
const fc = () => ({ type: "FeatureCollection", features: [] });
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
    features: [part, part],
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
    faces: [part, part],
    positiveResidual: [part],
    label: "unicode😀",
  },
} as unknown as PreparedDisplayPayload;
const asset = () => encodePreparedDisplayAsset(payload, binding);
const load = (x: ReturnType<typeof asset>, expected = binding) =>
  decodePreparedDisplayAsset(x.descriptor, expected, (hash) =>
    x.blobs.get(hash),
  );
const digest = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const alteredPool = (mutate: (pool: any) => void) => {
  const value = asset();
  // Tests rewrite a legitimate independently-checksummed wire container, so
  // backwards-reference/expanded-size validation is exercised beyond transport.
  return import("fflate").then(({ gunzipSync }) => {
    const raw = JSON.parse(
      new TextDecoder().decode(gunzipSync([...value.blobs.values()][0])),
    );
    mutate(raw);
    const bytes = new TextEncoder().encode(JSON.stringify(raw)),
      stored = gzipSync(bytes),
      hash = digest(stored);
    value.descriptor.chunks = [
      {
        sha256: hash,
        storedBytes: stored.length,
        expandedBytes: bytes.length,
        expandedSha256: digest(bytes),
      },
    ];
    value.descriptor.pooledJsonBytes = bytes.length;
    value.descriptor.pooledJsonSha256 = digest(bytes);
    value.descriptor.poolEntries = raw.pool.length;
    return { descriptor: value.descriptor, blobs: new Map([[hash, stored]]) };
  });
};
test("lossless shared immutable graph retains full exact authority, anchors and positive residuals", async () => {
  const x = asset(),
    decoded = await load(x);
  assert.equal(JSON.stringify(decoded), JSON.stringify(payload));
  assert.equal(decoded.preparedFloor, Object.freeze(decoded.preparedFloor));
  const value = decoded as any;
  assert.equal(value.nativeFaces.features[0], value.preparedFloor.faces[0]);
  assert.throws(() => value.preparedFloor.faces[0].rings.push([9, 9]));
  assert.ok(x.descriptor.logicalJsonBytes > x.descriptor.pooledJsonBytes);
});
test("streamed dataset checksum exactly matches JSON.stringify including escapes/undefined/scalars", () => {
  const data = {
    text: '😀\n"'.repeat(17000),
    omitted: undefined,
    array: [undefined, Infinity, -0, true, null],
    sparse: new Array(3),
    tiny: Number.MIN_VALUE,
  };
  assert.equal(
    preparedDisplayDatasetSha256(data),
    digest(new TextEncoder().encode(JSON.stringify(data))),
  );
});
test("actual dataset, runtime engine, options, scope and window variants invalidate asset", async () => {
  for (const expected of [
    { ...binding, datasetSha256: "c".repeat(64) },
    { ...binding, enginePreparationSha256: "c".repeat(64) },
    { ...binding, options: { ...binding.options, review: true } },
    { ...binding, levelIds: [694, 311] },
    { ...binding, building: "B01" },
    { ...binding, windowMode: "solid" },
  ])
    await assert.rejects(load(asset(), expected), /stale/);
  assert.equal(
    preparedDisplayBindingSha256(binding),
    preparedDisplayBindingSha256({
      ...binding,
      options: { showStructures: false, relativeHeights: true, review: false },
    }),
  );
});
test("missing/corrupt chunk and selfdeclared engine binding cannot pass", async () => {
  const x = asset();
  await assert.rejects(
    decodePreparedDisplayAsset(x.descriptor, binding, () => undefined),
    /missing\/corrupt/,
  );
  const bytes = [...x.blobs.values()][0].slice();
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(
    decodePreparedDisplayAsset(x.descriptor, binding, () => bytes),
    /missing\/corrupt/,
  );
  x.descriptor.binding.enginePreparationSha256 = "c".repeat(64);
  x.descriptor.bindingSha256 = preparedDisplayBindingSha256(
    x.descriptor.binding,
  );
  await assert.rejects(load(x), /stale/);
});
test("gzip expansion bounded before parse and underdeclared bytes rejected", async () => {
  const x = asset();
  x.descriptor.chunks[0].expandedBytes--;
  x.descriptor.pooledJsonBytes--;
  await assert.rejects(load(x), /expansion overflow/);
});
test("declared aggregate and per-entry wire/stored limits are checked before loading", async () => {
  const x = asset();
  let requested = false;
  await assert.rejects(
    decodePreparedDisplayAsset(
      x.descriptor,
      binding,
      () => {
        requested = true;
        return undefined;
      },
      { ...PREPARED_DISPLAY_ASSET_LIMITS, aggregatePooledBytes: 1 },
    ),
    /bounds/,
  );
  assert.equal(requested, false);
  assert.throws(
    () =>
      encodePreparedDisplayAsset(payload, binding, {
        ...PREPARED_DISPLAY_ASSET_LIMITS,
        storedChunkBytes: 1,
      }),
    /chunk/,
  );
});
test("forward/cyclic/out-of-range references rejected even with rehashed transport", async () => {
  for (const id of [0, 999999]) {
    const x = await alteredPool((p) => {
      p.pool[0] = { __preparedDisplaySubtreeReference: id };
    });
    await assert.rejects(load(x), /backward/);
  }
});
test("rehashed exponential DAG rejected before graph restoration", async () => {
  const x = await alteredPool((p) => {
    p.pool = [[0, 1, 2, 3]];
    for (let i = 1; i < 30; i++)
      p.pool.push(
        Array.from({ length: 4 }, () => ({
          __preparedDisplaySubtreeReference: i - 1,
        })),
      );
    p.value = { __preparedDisplaySubtreeReference: 29 };
  });
  await assert.rejects(load(x), /expansion limit/);
});
test("logical byte/hash declarations are independently replayed", async () => {
  const x = await alteredPool((p) => {
    p.value.modified = true;
  });
  await assert.rejects(load(x), /logical byte count/);
  const y = asset();
  y.descriptor.logicalJsonSha256 = "c".repeat(64);
  await assert.rejects(load(y), /pool\/descriptor/);
});
test("node/depth/count limits and cyclic input do not fabricate assets", async () => {
  assert.throws(
    () =>
      encodePreparedDisplayAsset(payload, binding, {
        ...PREPARED_DISPLAY_ASSET_LIMITS,
        nodes: 2,
      }),
    /node\/depth/,
  );
  assert.throws(
    () =>
      encodePreparedDisplayAsset(payload, binding, {
        ...PREPARED_DISPLAY_ASSET_LIMITS,
        depth: 1,
      }),
    /node\/depth/,
  );
  const x = asset();
  await assert.rejects(
    decodePreparedDisplayAsset(
      x.descriptor,
      binding,
      (hash) => x.blobs.get(hash),
      { ...PREPARED_DISPLAY_ASSET_LIMITS, poolEntries: 0 },
    ),
    /bounds/,
  );
  const cyclic: any = structuredClone(payload);
  cyclic.preparedFloor.self = cyclic;
  assert.throws(() => encodePreparedDisplayAsset(cyclic, binding), /cyclic/);
});
test("multi-chunk async loader preserves ordering and complete payload", async () => {
  const x = encodePreparedDisplayAsset(payload, binding, {
    ...PREPARED_DISPLAY_ASSET_LIMITS,
    expandedChunkBytes: 800,
  });
  assert.ok(x.descriptor.chunks.length > 1);
  assert.equal(
    JSON.stringify(
      await decodePreparedDisplayAsset(x.descriptor, binding, async (hash) =>
        x.blobs.get(hash),
      ),
    ),
    JSON.stringify(payload),
  );
  const swapped = {
    ...x.descriptor,
    chunks: [...x.descriptor.chunks].reverse(),
  };
  await assert.rejects(
    decodePreparedDisplayAsset(swapped, binding, (hash) => x.blobs.get(hash)),
    /pooled checksum/,
  );
});

test("missing fills/walls/presentation or exact face authority cannot become an asset", () => {
  for (const key of ["fills", "walls", "partitions"]) {
    const bad: any = structuredClone(payload);
    delete bad.nativeFaces[key];
    assert.throws(
      () => encodePreparedDisplayAsset(bad, binding),
      /missing native/,
    );
  }
  const bad: any = structuredClone(payload);
  bad.nativeFaces.regions = [
    {
      id: "face",
      exactFaceId: "missing",
      levelId: 311,
      ringsFeet: [],
      displayPartsFeet: [],
      roomKeys: [],
      nativeFloorIds: [],
      nativeDoorIds: [],
      areaSquareFeet: 1,
    },
  ];
  assert.throws(
    () => encodePreparedDisplayAsset(bad, binding),
    /authority identity/,
  );
  const other: any = structuredClone(payload);
  delete other.preparedFloor.physicalGround;
  assert.throws(
    () => encodePreparedDisplayAsset(other, binding),
    /missing prepared/,
  );
});

test("header-only package validation bounds null chunks and malformed binding without inflate", () => {
  const x = asset();
  validatePreparedDisplayAssetDescriptor(x.descriptor);
  for (const d of [
    null,
    { ...x.descriptor, binding: null },
    { ...x.descriptor, chunks: [null] },
    { ...x.descriptor, chunks: [] },
    { ...x.descriptor, poolEntries: 200001 },
  ])
    assert.throws(() => validatePreparedDisplayAssetDescriptor(d));
});
