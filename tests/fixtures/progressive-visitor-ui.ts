import { gzipSync, gunzipSync } from "fflate";
import { fixture } from "./native-area-project";
import {
  encodePreparedDisplayAsset,
  type PreparedDisplayPayload,
} from "../../app/indoor-project/prepared-display-assets";
import {
  progressiveSha256,
  progressiveManifestRevision,
  type ProgressiveAsset,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";

/** Search/form fixture only. It is not physical or UNBC route approval. */
export function progressiveVisitorUiFixture(base: string) {
  const data = fixture();
  data.records[0].arrivalNodeId = "office-arrival";
  data.records[1].arrivalNodeId = "corridor-arrival";
  data.records[2].arrivalNodeId = "staff-arrival";
  // Two distinct rooms deliberately share a label to exercise identity selection.
  data.records[1].name = "Office";
  data.records[1].circulation = false;
  const files = new Map<string, Uint8Array>();
  const assets: Record<string, ProgressiveAsset> = {};
  const raw = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value));
  const add = (kind: ProgressiveAsset["kind"], bytes: Uint8Array) => {
    const logicalSha256 = progressiveSha256(bytes);
    const id = `${kind}:${logicalSha256}`;
    const stored = gzipSync(bytes, { mtime: 0 });
    const sha256 = progressiveSha256(stored);
    const path = `assets/${sha256}.gz`;
    files.set(new URL(path, base).href, stored);
    assets[id] = {
      id,
      kind,
      logicalSha256,
      logicalBytes: bytes.length,
      mediaType: "application/json",
      dependencies: [],
      representations: [
        { encoding: "gzip", path, sha256, bytes: stored.length },
      ],
    };
    return id;
  };
  const binding = {
    version: 1 as const,
    datasetSha256: "c".repeat(64),
    enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    levelIds: [1],
    building: "all",
    windowMode: "simplified",
    options: {},
  };
  const empty = { type: "FeatureCollection", features: [] };
  // Detail never opens in these overview-only control tests.
  const encoded = encodePreparedDisplayAsset(
    {
      nativeFaces: {
        levelIds: [1],
        regions: [],
        warnings: [],
        warningCount: 0,
        fills: empty,
        walls: empty,
        overview: empty,
        outlines: empty,
        partitions: empty,
      },
      preparedFloor: {
        presentation: { display: {} },
        nativeStairKeys: [],
        stairSurroundKeys: [],
        assumedRoomBlocks: empty,
        selectionAreas: empty,
        physicalGround: empty,
        nativeStairs: empty,
        stairCutAreas: empty,
        stairCutRooms: empty,
      },
    } as unknown as PreparedDisplayPayload,
    binding,
  );
  const chunkAssetIds = encoded.descriptor.chunks.map((chunk) => {
    const id = add(
      "prepared-chunk",
      gunzipSync(encoded.blobs.get(chunk.sha256)!),
    );
    const stored = assets[id].representations[0];
    chunk.sha256 = stored.sha256;
    chunk.storedBytes = stored.bytes;
    return id;
  });
  const geometry = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { roomKeys: [], color: "#8d9395" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-122.0003, 52.9999],
              [-121.9997, 52.9999],
              [-121.9997, 53.0001],
              [-122.0003, 53.0001],
              [-122.0003, 52.9999],
            ],
          ],
        },
      },
    ],
  };
  const shellAssetId = add(
    "shell",
    raw({
      version: 1,
      format: "openindoormaps-visitor-shell-v1",
      source: data.source,
      alignment: data.alignment,
      report: data.report,
      buildings: ["01"],
      floors: data.floors,
      nativeLevels: data.nativeLevels,
      records: data.records.map((record) => ({
        ...record,
        geographic: [-122, 53],
      })),
      display: {
        nativeIndoorEnvelopes: false,
        nativeMaterialSections: false,
        windowMode: null,
      },
    }),
  );
  const overviewAssetId = add(
    "overview",
    raw({
      version: 1,
      format: "openindoormaps-visitor-overview-v1",
      binding,
      geometry,
      floor: empty,
      ground: empty,
      labels: empty,
    }),
  );
  const contextAssetId = add("presentation-context", raw({ unused: true }));
  const routeAssetId = add("routing", raw(data));
  const body = {
    version: 1 as const,
    format: "openindoormaps-progressive-v1" as const,
    provenance: {
      packageSha256: "d".repeat(64),
      datasetSha256: binding.datasetSha256,
      source: data.source,
      enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      publication: "visitor" as const,
    },
    shellAssetId,
    routeAssetId,
    defaultScopeId: "first",
    scopes: [
      {
        id: "first",
        label: "Floor 1",
        building: "all",
        levelIds: [1],
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
  files.set(base, raw(manifest));
  return { files, manifest };
}
