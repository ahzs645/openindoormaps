import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { zipSync, unzipSync, strToU8 } from "fflate";
import {
  readIndoorProject,
  attachPreparedDisplayArchiveToPackage,
  exportIndoorProject,
} from "../../app/indoor-project/package";
import {
  editorVisitorDataset,
  setFloorDisplayName,
} from "../../app/indoor-project/map-edits";
import { geographicPoint } from "../../app/indoor-project/routing";
import { floorMemoryCostBytes } from "../../app/indoor-project/floor-memory-cost";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { FloorPreparationOptions } from "../../app/indoor-project/prepared-floor";
import {
  encodeNativeExactTopology,
  nativeRationalPoint,
} from "../../app/indoor-project/native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "../../app/indoor-project/native-rational-overlay";
import {
  encodePreparedDisplayAsset,
  preparedDisplayDatasetSha256,
  type PreparedDisplayPayload,
} from "../../app/indoor-project/prepared-display-assets";
import {
  readPreparedDisplayArchive,
  serializePreparedDisplayArchive,
  preparedDisplayChunkPath,
  PREPARED_DISPLAY_INDEX_PATH,
  preparedDisplayArchiveEntryLimit,
} from "../../app/indoor-project/prepared-display-archive";
import {
  registerPreparedDisplayArchive,
  preparedDisplayAssetRequest,
  preparedDisplayOptions,
  type PreparedDisplayArchive,
} from "../../app/indoor-project/prepared-display-registry";
import { loadPreparedDisplayAsset } from "../../app/indoor-project/prepared-display-loader";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const fc = () => ({ type: "FeatureCollection", features: [] });
const options: FloorPreparationOptions = {
  review: false,
  simplifyGeometry: false,
  relativeHeights: false,
  showPillars: true,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
  showStructures: false,
  showDoorwayRecesses: false,
};
function fixture() {
  const ringsA: [number, number][][] = [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
      ],
    ],
    ringsB: [number, number][][] = [
      [
        [5, 0],
        [5.5, 0],
        [5.5, 0.5],
        [5, 0.5],
      ],
    ];
  const topology = encodeNativeExactTopology(
    {
      sourceModelSha256: "d".repeat(64),
      sourceGeometryKey: "e".repeat(64),
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    [
      { id: "face-a", parts: [ringsA.map((r) => r.map(nativeRationalPoint))] },
      { id: "face-b", parts: [ringsB.map((r) => r.map(nativeRationalPoint))] },
    ],
  );
  const region = (
    id: string,
    exactFaceId: string,
    ringsFeet: [number, number][][],
    areaSquareFeet: number,
  ) => ({
    id,
    exactFaceId,
    ringsFeet,
    displayPartsFeet: [ringsFeet],
    roomKeys: [],
    nativeFloorIds: [123],
    nativeDoorIds: [],
    areaSquareFeet,
    exposedFloorEdgeFeet: 0,
    levelId: 311,
  });
  const regions = [
    region("region-a", "face-a", ringsA, 15),
    region("region-b", "face-b", ringsB, 0.25),
  ];
  const data = {
    format: "reviter-indoor",
    version: 1,
    source: { modelSha256: "d".repeat(64) },
    records: [{ key: "preserved-room", name: "Office" }],
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
      rmsMetres: 0,
      referenceCount: 1,
    },
    nativeIndoorEnvelopes: { version: 1 },
    nativeMaterialSections: { version: 1 },
    nativeExploreMapping: {
      format: "openindoormaps-native-explore-mapping",
      version: 3,
      sourceModelSha256: "d".repeat(64),
      datasetGeometrySha256: "e".repeat(64),
      mappingSha256: "f".repeat(64),
      levels: [
        {
          levelId: 311,
          exactTopology: topology,
          regions: structuredClone(regions),
          boundaries: [],
          warningCount: 0,
        },
      ],
      unavailableLevelIds: [],
    },
  } as unknown as IndoorDataset;
  const paint = (r: (typeof regions)[number]) => ({
    type: "Feature",
    properties: {
      nativeRegionId: r.id,
      levelId: 311,
      placeCount: 0,
      color: "#e9edef",
      roomKeys: [],
      circulation: false,
      restricted: false,
    },
    geometry: {
      type: "Polygon",
      coordinates: r.ringsFeet.map((ring) =>
        [...ring, ring[0]].map((point) => geographicPoint(data, point)),
      ),
    },
  });
  const drawing = { type: "FeatureCollection", features: regions.map(paint) };
  const payload = {
    nativeFaces: {
      levelIds: [311],
      regions: regions.map((region) => ({
        ...region,
        visitorPartsFeet: region.displayPartsFeet,
      })),
      exactTopologies: [
        { levelId: 311, geometrySha256: "e".repeat(64), topology },
      ],
      fills: drawing,
      walls: fc(),
      overview: drawing,
      outlines: drawing,
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
      positiveRenderResidual: {
        coordinates: [{ x: ["1", "3"], y: ["1", "7"] }],
        unchangedIEEEAnchorsFeet: [
          [0, 0],
          [4, 4],
        ],
      },
    },
  } as unknown as PreparedDisplayPayload;
  return { data, payload, topology };
}
function archive(
  data: IndoorDataset,
  payload: PreparedDisplayPayload,
  variant = options,
): PreparedDisplayArchive {
  const asset = encodePreparedDisplayAsset(payload, {
    version: 1,
    datasetSha256: preparedDisplayDatasetSha256(data),
    enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    levelIds: [311],
    building: "all",
    windowMode: data.windowDisplay?.mode ?? "none",
    options: preparedDisplayOptions(data, variant),
  });
  return {
    version: 1,
    descriptors: [asset.descriptor],
    blobs: Object.fromEntries(asset.blobs),
  };
}
const request = (value: PreparedDisplayArchive) => ({
  descriptor: value.descriptors[0],
  blobs: value.blobs,
});
function rebindIndex(
  files: Record<string, Uint8Array>,
  entry: { path: string; bytes: number; sha256: string },
  index: unknown,
) {
  const bytes = new TextEncoder().encode(JSON.stringify(index));
  files[PREPARED_DISPLAY_INDEX_PATH] = bytes;
  entry.bytes = bytes.length;
  entry.sha256 = sha(bytes);
}

test("production archive roundtrip retains complete exact source, tiny positive region, hole, residual and anchors", async () => {
  const { data, payload } = fixture(),
    a = archive(data, payload),
    encoded = serializePreparedDisplayArchive(a),
    restored = readPreparedDisplayArchive(encoded.entry, encoded.files)!;
  assert.deepEqual(restored, a);
  registerPreparedDisplayArchive(data, restored);
  const selected = preparedDisplayAssetRequest(data, [311], "all", options)!;
  assert(selected);
  const decoded = await loadPreparedDisplayAsset(
    data,
    [311],
    "all",
    selected,
    options,
  );
  assert.equal(JSON.stringify(decoded), JSON.stringify(payload));
  assert(Object.isFrozen(decoded));
  assert.equal(decoded!.nativeFaces.regions.length, 2);
  assert.equal(decoded!.nativeFaces.regions[1].areaSquareFeet, 0.25);
  assert.deepEqual(
    data.nativeExploreMapping?.levels[0].exactTopology,
    payload.nativeFaces.exactTopologies![0].topology,
  );
});
test("archive missing/corrupt index/chunk fails, legacy absence remains compatible", () => {
  assert.equal(readPreparedDisplayArchive(undefined, {}), undefined);
  for (const mode of [
    "missing-index",
    "bad-index",
    "missing-chunk",
    "bad-chunk",
  ]) {
    const { data, payload } = fixture(),
      { entry, files } = serializePreparedDisplayArchive(
        archive(data, payload),
      ),
      path = Object.keys(files).find((k) => k.endsWith(".bin"))!;
    if (mode === "missing-index") delete files[entry.path];
    if (mode === "bad-index")
      files[entry.path] = new TextEncoder().encode("{}");
    if (mode === "missing-chunk") delete files[path];
    if (mode === "bad-chunk") {
      files[path] = files[path].slice();
      files[path][0] ^= 1;
    }
    assert.throws(
      () => readPreparedDisplayArchive(entry, files),
      /Damaged prepared display/,
    );
  }
});
test("archive orphan/unlisted/duplicate scope binding and descriptor-byte disagreement fail", () => {
  const { data, payload } = fixture();
  for (const mode of ["orphan", "unlisted", "duplicate", "bytes"]) {
    const { entry, files } = serializePreparedDisplayArchive(
      archive(data, payload),
    );
    if (mode === "orphan")
      files[preparedDisplayChunkPath("a".repeat(64))] = new Uint8Array([1]);
    if (mode === "unlisted") {
      assert.throws(
        () => readPreparedDisplayArchive(undefined, files),
        /Unlisted/,
      );
      continue;
    }
    if (mode === "duplicate" || mode === "bytes") {
      const index = JSON.parse(new TextDecoder().decode(files[entry.path]));
      if (mode === "duplicate")
        index.descriptors.push(structuredClone(index.descriptors[0]));
      else index.descriptors[0].chunks[0].storedBytes++;
      rebindIndex(files, entry, index);
    }
    assert.throws(
      () => readPreparedDisplayArchive(entry, files),
      /Unlisted|Duplicate|Damaged/,
    );
  }
  assert.equal(
    preparedDisplayArchiveEntryLimit("viewer/display/../bad.bin"),
    undefined,
  );
  assert.equal(
    preparedDisplayArchiveEntryLimit(preparedDisplayChunkPath("a".repeat(64))),
    16 * 1024 * 1024,
  );
});
test("registry lookup matches scalar options/window/scope and carries only selected chunk references", () => {
  const { data, payload } = fixture(),
    a = archive(data, payload);
  a.blobs["unused"] = new Uint8Array([1]);
  registerPreparedDisplayArchive(data, a);
  const selected = preparedDisplayAssetRequest(data, [311], "all", options)!;
  assert(selected);
  assert(!("unused" in selected.blobs));
  assert.equal(
    selected.blobs[selected.descriptor.chunks[0].sha256],
    a.blobs[selected.descriptor.chunks[0].sha256],
  );
  assert.equal(
    preparedDisplayAssetRequest(data, [694], "all", options),
    undefined,
  );
  assert.equal(
    preparedDisplayAssetRequest(data, [311], "B10", options),
    undefined,
  );
  assert.equal(
    preparedDisplayAssetRequest(data, [311], "all", {
      ...options,
      showPillars: false,
    }),
    undefined,
  );
  assert.equal(
    preparedDisplayAssetRequest(data, [311], "all", {
      ...options,
      review: true,
    }),
    undefined,
  );
  assert.equal(
    preparedDisplayAssetRequest(data, [311], "all", {
      ...options,
      relativeHeights: true,
    })?.descriptor,
    selected.descriptor,
  );
  const windowVariant = {
    ...data,
    windowDisplay: { mode: "simplified" },
  } as IndoorDataset;
  registerPreparedDisplayArchive(windowVariant, a);
  assert.equal(
    preparedDisplayAssetRequest(windowVariant, [311], "all", options),
    undefined,
  );
  assert.equal(
    preparedDisplayAssetRequest({ ...data }, [311], "all", options),
    undefined,
  );
  registerPreparedDisplayArchive(data, undefined);
  assert.equal(
    preparedDisplayAssetRequest(data, [311], "all", options),
    undefined,
  );
});
test("custom nativeFaces comparison invalidates registry asset even with otherwise matching options", () => {
  const { data, payload } = fixture();
  registerPreparedDisplayArchive(data, archive(data, payload));
  assert.equal(
    preparedDisplayAssetRequest(data, [311], "all", {
      ...options,
      nativeFaces: payload.nativeFaces,
    }),
    undefined,
  );
});
test("worker loader rejects stale runtime engine/data/scope/options/window before using cache", async () => {
  const { data, payload } = fixture(),
    a = archive(data, payload),
    r = request(a);
  assert(await loadPreparedDisplayAsset(data, [311], "all", r, options));
  const other = {
    ...data,
    records: [{ key: "preserved-room", name: "Changed" }],
  } as IndoorDataset;
  assert.equal(
    await loadPreparedDisplayAsset(other, [311], "all", r, options),
    undefined,
  );
  assert.equal(
    await loadPreparedDisplayAsset(data, [694], "all", r, options),
    undefined,
  );
  assert.equal(
    await loadPreparedDisplayAsset(data, [311], "B10", r, options),
    undefined,
  );
  assert.equal(
    await loadPreparedDisplayAsset(data, [311], "all", r, {
      ...options,
      showPillars: false,
    }),
    undefined,
  );
  assert.equal(
    await loadPreparedDisplayAsset(data, [311], "all", undefined, options),
    undefined,
  );
  const stale = structuredClone(r);
  stale.descriptor.binding.enginePreparationSha256 = "a".repeat(64);
  assert.equal(
    await loadPreparedDisplayAsset(data, [311], "all", stale, options),
    undefined,
  );
  const variant = {
    ...data,
    windowDisplay: { mode: "simplified" },
  } as IndoorDataset;
  assert.equal(
    await loadPreparedDisplayAsset(variant, [311], "all", r, options),
    undefined,
  );
});
test("native-face reuse may ignore floor-only options while floor-loader binds actual options", async () => {
  const { data, payload } = fixture(),
    r = request(
      archive(data, payload, {
        ...options,
        showStructures: true,
        review: true,
      }),
    );
  assert(await loadPreparedDisplayAsset(data, [311], "all", r));
  assert.equal(
    await loadPreparedDisplayAsset(data, [311], "all", r, options),
    undefined,
  );
});
test("matching worker cache damage throws explicitly instead of silent derive fallback", async () => {
  const { data, payload } = fixture(),
    r = request(archive(data, payload));
  delete r.blobs[r.descriptor.chunks[0].sha256];
  await assert.rejects(
    loadPreparedDisplayAsset(data, [311], "all", r, options),
    /missing\/corrupt/,
  );
});
test("published v3 cached region completeness rejects dropping even tiny positive source face", async () => {
  const { data, payload } = fixture();
  payload.nativeFaces.regions.pop();
  await assert.rejects(
    loadPreparedDisplayAsset(
      data,
      [311],
      "all",
      request(archive(data, payload)),
      options,
    ),
    /omitted a positive source face/,
  );
});
test("published v3 exact source identity rejects rehashed geometry and wrong face association", async () => {
  const { data, payload } = fixture();
  payload.nativeFaces.regions[1].exactFaceId = "face-a";
  await assert.rejects(
    loadPreparedDisplayAsset(
      data,
      [311],
      "all",
      request(archive(data, payload)),
      options,
    ),
    /source identity/,
  );
  const second = fixture();
  second.payload.nativeFaces.exactTopologies![0].topology =
    encodeNativeExactTopology(
      {
        sourceModelSha256: "a".repeat(64),
        sourceGeometryKey: "e".repeat(64),
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      [
        {
          id: "face-a",
          parts: [
            [
              [
                nativeRationalPoint([0, 0]),
                nativeRationalPoint([4, 0]),
                nativeRationalPoint([4, 4]),
                nativeRationalPoint([0, 4]),
              ],
            ],
          ],
        },
        {
          id: "face-b",
          parts: [
            [
              [
                nativeRationalPoint([5, 0]),
                nativeRationalPoint([5.5, 0]),
                nativeRationalPoint([5.5, 0.5]),
                nativeRationalPoint([5, 0.5]),
              ],
            ],
          ],
        },
      ],
    );
  await assert.rejects(
    loadPreparedDisplayAsset(
      second.data,
      [311],
      "all",
      request(archive(second.data, second.payload)),
      options,
    ),
    /differs from the current native mapping/,
  );
});
test("published v3 missing or foreign complete scope is an explicit carrier error", async () => {
  const { data, payload } = fixture();
  payload.nativeFaces.regions = [];
  payload.nativeFaces.exactTopologies = [];
  await assert.rejects(
    loadPreparedDisplayAsset(
      data,
      [311],
      "all",
      request(archive(data, payload)),
      options,
    ),
    /complete exact scope/,
  );
  const second = fixture();
  second.data.nativeExploreMapping!.levels = [];
  await assert.rejects(
    loadPreparedDisplayAsset(
      second.data,
      [311],
      "all",
      request(archive(second.data, second.payload)),
      options,
    ),
    /current native mapping|complete exact scope|missing/,
  );
});
test("published v3 may not silently accept source regions without exact face IDs", async () => {
  const { data, payload } = fixture();
  delete data.nativeExploreMapping!.levels[0].regions[1].exactFaceId;
  delete payload.nativeFaces.regions[1].exactFaceId;
  await assert.rejects(
    loadPreparedDisplayAsset(
      data,
      [311],
      "all",
      request(archive(data, payload)),
      options,
    ),
    /exact|source identity/,
  );
});
test("in-place dataset edit after successful cache load cannot reuse stale fingerprint", async () => {
  const { data, payload } = fixture(),
    r = request(archive(data, payload));
  assert(await loadPreparedDisplayAsset(data, [311], "all", r, options));
  data.records[0].name = "Changed in place";
  assert.equal(
    await loadPreparedDisplayAsset(data, [311], "all", r, options),
    undefined,
  );
});

// The package fixture is a valid legacy source master; the separate v3 fixtures
// above exercise strict topology completeness. Cache attachment certifies only
// container preservation and binding, never the fixture's physical geometry.
function tinySourceMaster() {
  const model = strToU8("immutable source model"),
    rooms = strToU8(
      JSON.stringify({
        format: "reviter-room-annotations",
        version: 1,
        coordinateSystem: "revit-model-feet",
        model: { fileName: "fixture.rvt" },
        annotations: [],
        custom: { retained: true },
        georeference: {
          points: [
            {
              modelFeet: [0, 0],
              geographic: { longitude: -122, latitude: 53 },
            },
          ],
        },
      }),
    ),
    gis = strToU8(
      JSON.stringify({
        points: [
          { modelFeet: [0, 0], geographic: { longitude: -122, latitude: 53 } },
        ],
      }),
    );
  const data: IndoorDataset = {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    source: {
      modelFileName: "fixture.rvt",
      modelSha256: sha(model),
      roomsSha256: sha(rooms),
    },
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
    floors: [{ id: "first", name: "First", levelIds: [311], elevationFeet: 0 }],
    nativeLevels: [{ id: 311, name: "First", elevationFeet: 0 }],
    records: [],
    nodes: [],
    edges: [],
    walls: [],
    issues: [],
    report: {
      recordCount: 0,
      routableArrivals: 0,
      components: 0,
      largestComponentArrivals: 0,
      unmatchedDoors: 0,
      cellSizeFeet: 0.6,
      omittedSourceLabels: 0,
    },
  };
  const indoor = strToU8(JSON.stringify(data));
  const entry = (path: string, bytes: Uint8Array) => ({
    path,
    bytes: bytes.length,
    sha256: sha(bytes),
  });
  return zipSync({
    "manifest.json": strToU8(
      JSON.stringify({
        format: "reviter-project",
        version: 2,
        createdAt: "2026-10-08",
        model: {
          ...entry("model/fixture.rvt", model),
          fileName: "fixture.rvt",
          lastModified: 1,
        },
        floors: entry("floors/rooms.json", rooms),
        georeference: entry("gis/reference-points.json", gis),
        indoor: entry("viewer/indoor.json", indoor),
      }),
    ),
    "model/fixture.rvt": model,
    "floors/rooms.json": rooms,
    "gis/reference-points.json": gis,
    "viewer/indoor.json": indoor,
  });
}

test("actual source package attach/read preserves every original entry and complete pooled payload", async () => {
  const bytes = tinySourceMaster(),
    original = unzipSync(bytes),
    project = await readIndoorProject(bytes);
  const { payload } = fixture(),
    data = editorVisitorDataset(project),
    a = archive(data, payload);
  const attached = await attachPreparedDisplayArchiveToPackage(bytes, a),
    files = unzipSync(attached);
  for (const [path, value] of Object.entries(original))
    if (path !== "manifest.json") assert.deepEqual(files[path], value, path);
  const reopened = await readIndoorProject(attached);
  assert.deepEqual(reopened.preparedDisplay, a);
  assert.deepEqual(reopened.dataset, project.dataset);
  const decoded = await loadPreparedDisplayAsset(
    editorVisitorDataset(reopened),
    [311],
    "all",
    request(reopened.preparedDisplay!),
    options,
  );
  assert.equal(JSON.stringify(decoded), JSON.stringify(payload));
  assert.equal(decoded!.nativeFaces.regions[1].areaSquareFeet, 0.25);
  assert.deepEqual(decoded!.preparedFloor, payload.preparedFloor);
});

test("package attachment rejects stale binding and edited source export discards stale display assets", async () => {
  const bytes = tinySourceMaster(),
    project = await readIndoorProject(bytes),
    { payload } = fixture();
  const a = archive(editorVisitorDataset(project), payload),
    stale = structuredClone(a);
  stale.descriptors[0].binding.datasetSha256 = "0".repeat(64);
  await assert.rejects(
    attachPreparedDisplayArchiveToPackage(bytes, stale),
    /do not match/,
  );
  const attached = await attachPreparedDisplayArchiveToPackage(bytes, a),
    reopened = await readIndoorProject(attached);
  const changed = setFloorDisplayName(reopened, "first", "Renamed Floor");
  assert.equal(
    await loadPreparedDisplayAsset(
      editorVisitorDataset(changed),
      [311],
      "all",
      request(a),
      options,
    ),
    undefined,
  );
  const exported = await exportIndoorProject(changed),
    restored = await readIndoorProject(exported),
    files = unzipSync(exported);
  assert.equal(restored.preparedDisplay, undefined);
  assert.equal(restored.manifest.preparedDisplay, undefined);
  assert.equal(
    Object.keys(files).some((path) => path.startsWith("viewer/display/")),
    false,
  );
  assert.deepEqual(
    files["model/fixture.rvt"],
    reopened.files["model/fixture.rvt"],
  );
  assert.deepEqual(
    files["gis/reference-points.json"],
    reopened.files["gis/reference-points.json"],
  );
  assert.deepEqual(restored.dataset, {
    ...reopened.dataset,
    source: {
      ...reopened.dataset.source,
      roomsSha256: sha(files["floors/rooms.json"]),
    },
  });
  assert.equal(editorVisitorDataset(restored).floors[0].name, "Renamed Floor");
});

async function actualWorkerCacheHit(module: "floor" | "native") {
  const { data, payload } = fixture(),
    a = archive(data, payload);
  const globals = globalThis as unknown as {
    onmessage?: (event: { data: unknown }) => unknown;
    postMessage?: (message: unknown) => void;
  };
  const previousMessage = Object.getOwnPropertyDescriptor(
      globalThis,
      "onmessage",
    ),
    previousPost = Object.getOwnPropertyDescriptor(globalThis, "postMessage");
  const responses: unknown[] = [];
  let resolveResponse!: (value: Record<string, unknown>) => void;
  const received = new Promise<Record<string, unknown>>((resolve) => {
    resolveResponse = resolve;
  });
  try {
    globals.postMessage = (message) => {
      responses.push(message);
      resolveResponse(message as Record<string, unknown>);
    };
    if (module === "floor")
      await import("../../app/indoor-project/floor-presentation.worker");
    else await import("../../app/indoor-project/native-explore.worker");
    assert.equal(typeof globals.onmessage, "function");
    await globals.onmessage!({
      data: {
        requestId: 42,
        data,
        levelIds: [311],
        building: "all",
        options,
        preparedDisplay: request(a),
      },
    });
    const response = await received;
    assert.equal(response.error, undefined);
    assert.equal(
      responses.length,
      1,
      "cache hit must return one complete response, not a partial derivation",
    );
    const expected =
      module === "floor" ? payload.preparedFloor : payload.nativeFaces;
    assert.deepEqual(
      module === "floor" ? response.value : response.result,
      expected,
    );
    assert.equal(
      response.memoryCostBytes,
      floorMemoryCostBytes(
        module === "floor"
          ? { value: response.value, nativeFaces: response.nativeFaces }
          : response.result,
      ),
    );
    if (module === "floor")
      assert.deepEqual(response.nativeFaces, payload.nativeFaces);
    assert(
      Number.isFinite(response.memoryCostBytes) &&
        Number(response.memoryCostBytes) > 0,
    );
    if (module === "floor") assert.equal(response.requestId, 42);
    else assert.equal(response.complete, true);
  } finally {
    if (previousMessage)
      Object.defineProperty(globalThis, "onmessage", previousMessage);
    else delete globals.onmessage;
    if (previousPost)
      Object.defineProperty(globalThis, "postMessage", previousPost);
    else delete globals.postMessage;
  }
}
test("actual floor worker bound cache branch returns complete floor and finite retained memory cost", () =>
  actualWorkerCacheHit("floor"));
test("actual native worker bound cache branch returns complete walls, exact carrier and positive region", () =>
  actualWorkerCacheHit("native"));
