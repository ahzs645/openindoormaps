import { brotliCompressSync } from "node:zlib";
import { gzipSync, gunzipSync } from "fflate";
import {
  encodePreparedDisplayAsset,
  type PreparedDisplayPayload,
} from "../../app/indoor-project/prepared-display-assets";
import {
  progressiveManifestRevision,
  progressiveSha256,
  type ProgressiveManifest,
  type ProgressiveAsset,
} from "../../app/indoor-project/progressive-delivery";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
const progressiveRepresentations = (
  bytes: Uint8Array,
  _type?: string,
  _identity?: boolean,
) => [
  {
    encoding: "gzip" as const,
    bytes: gzipSync(bytes, { level: 6, mtime: 0 }),
    extension: "gz",
  },
  {
    encoding: "br" as const,
    bytes: new Uint8Array(brotliCompressSync(bytes)),
    extension: "br",
  },
];
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
    presentation: { display: {}, retained, overviewGeometry: fc() },
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
export function preparedDeliveryFixture(includeIdentity = false) {
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
