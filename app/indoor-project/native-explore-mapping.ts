import { NATIVE_SELECTION_TOPOLOGY_VERSION } from "./native-selection-topology";
import { NATIVE_BARRIER_TOPOLOGY_VERSION } from "./native-barrier-topology";
import type { IndoorDataset } from "./contract";
import type { NativeAreaRegion } from "./native-area-review";
import {
  associateNativeRooms,
  type NativeRoomAssociation,
} from "./native-explore-associations";
import { nativeAreaDisplayParts } from "./native-area-display";
import { deriveNativeAreas } from "./native-area-review";

export type PublishedNativeExploreMapping = {
  format: "openindoormaps-native-explore-mapping";
  version: 1 | 2;
  sourceModelSha256: string;
  datasetGeometrySha256: string;
  mappingSha256: string;
  levels: {
    levelId: number;
    regions: (Omit<NativeAreaRegion, "displayPartsFeet"> & {
      displayPartsFeet?: NativeAreaRegion["displayPartsFeet"];
      associations?: NativeRoomAssociation[];
    })[];
    boundaries: {
      id: string;
      label: string;
      pointsFeet: [number, number][];
      closed: boolean;
    }[];
    warningCount: number;
  }[];
  unavailableLevelIds: number[];
};
async function sha(value: unknown) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
/** Geometry affecting the native trace, its labels and supported door ownership.
 * Display preferences and private authoring notes are deliberately absent. */
export async function nativeExploreDatasetGeometrySha256(
  data: IndoorDataset,
  version: 1 | 2 = 2,
) {
  return sha([
    `native-explore-published-geometry-v${version}`,
    data.source,
    data.alignment,
    data.nativeLevels,
    data.walkingSupport,
    ...(data.nativeIndoorEnvelopes ? [data.nativeIndoorEnvelopes] : []),
    ...(data.nativeMaterialSections ? [data.nativeMaterialSections] : []),
    data.walls,
    data.doors,
    data.records.map((r) => [
      r.key,
      r.levelId,
      r.building,
      r.ringsFeet,
      r.properties.floorOpeningsFeet,
    ]),
    data.circulationGeometry?.fixtures,
    data.indoorExclusions?.areas.map(({ notes: _, ...area }) => area),
    ...(version === 2
      ? [
          data.reviewedAreaPartitions?.partitions
            .filter((p) => p.status === "applied")
            .map(({ notes: _, ...p }) => p),
          data.nativeDoorBoundaryClosures,
          data.nativeWallPositionRepairs,
          data.selectionDoorThresholds,
          data.records.map((r) => [r.key, r.arrivalNodeId]),
          data.nodes.map((n) => [n.id, n.levelId, n.pointFeet]),
          NATIVE_SELECTION_TOPOLOGY_VERSION,
          NATIVE_BARRIER_TOPOLOGY_VERSION,
        ]
      : []),
    data.edges.map((e) => [
      e.id,
      e.kind,
      e.enabled,
      e.nativeElementId,
      e.roomKeys,
      e.pointsFeet,
    ]),
  ]);
}
export async function compileNativeExploreMapping(
  data: IndoorDataset,
  datasetGeometrySha256: string,
): Promise<PublishedNativeExploreMapping> {
  const levels: PublishedNativeExploreMapping["levels"] = [],
    unavailableLevelIds: number[] = [];
  for (const level of data.nativeLevels) {
    if (
      !data.walkingSupport?.floors.some(
        (f) => Math.abs(f.elevationFeet - level.elevationFeet) < 0.15,
      )
    ) {
      unavailableLevelIds.push(level.id);
      continue;
    }
    try {
      const result = await deriveNativeAreas(data, level.id, {
        mode: "connected",
        maxGapFeet: 0,
      });
      levels.push({
        levelId: level.id,
        regions: associateNativeRooms(
          result.regions,
          data.records.filter((r) => r.levelId === level.id),
        ),
        warningCount: result.warnings.length,
        boundaries: (data.reviewedAreaPartitions?.partitions ?? [])
          .filter((p) => result.logicalPartitionIds?.includes(p.id))
          .map((p) => ({
            id: p.id,
            label: p.label,
            pointsFeet: structuredClone(p.pointsFeet),
            closed: p.closed,
          })),
      });
    } catch {
      unavailableLevelIds.push(level.id);
    }
  }
  return {
    format: "openindoormaps-native-explore-mapping",
    version: 2,
    sourceModelSha256: data.source.modelSha256,
    datasetGeometrySha256,
    mappingSha256: await sha([levels, unavailableLevelIds]),
    levels,
    unavailableLevelIds,
  };
}
/** Browser export uses its own worker; CLI exports can compute directly. */
export async function publishNativeExploreMapping(
  data: IndoorDataset,
  visitorData: IndoorDataset,
): Promise<PublishedNativeExploreMapping | undefined> {
  if (
    data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256 ||
    !data.walkingSupport.floors.length
  )
    return;
  const datasetGeometrySha256 =
    await nativeExploreDatasetGeometrySha256(visitorData);
  if (data.nativeExploreMapping) {
    // Edits invalidate this derived cache. Never reuse stale polygons.
    const currentHash = await nativeExploreDatasetGeometrySha256(
      data,
      data.nativeExploreMapping.version,
    );
    if (currentHash === data.nativeExploreMapping.datasetGeometrySha256) {
      await validatePublishedNativeExploreMapping(data);
      const copy = structuredClone(data.nativeExploreMapping);
      if (copy.version === 1) {
        copy.version = 2;
        for (const level of copy.levels) {
          level.regions = associateNativeRooms(
            level.regions.map((r) => ({
              ...r,
              displayPartsFeet: nativeAreaDisplayParts(r.ringsFeet),
            })),
            data.records.filter((r) => r.levelId === level.levelId),
          );
        }
        copy.mappingSha256 = await sha([copy.levels, copy.unavailableLevelIds]);
      }
      copy.datasetGeometrySha256 = datasetGeometrySha256;
      return copy;
    }
  }
  if (typeof Worker === "undefined")
    return compileNativeExploreMapping(data, datasetGeometrySha256);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("native-explore-export.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({
      data: response,
    }: MessageEvent<{
      result?: PublishedNativeExploreMapping;
      error?: string;
    }>) => {
      worker.terminate();
      response.error
        ? reject(new Error(response.error))
        : resolve(response.result);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(
        new Error(
          "Native floor map publication failed. Retry exporting the campus viewer.",
        ),
      );
    };
    worker.postMessage({ data, datasetGeometrySha256 });
  });
}
export async function validatePublishedNativeExploreMapping(
  data: IndoorDataset,
): Promise<void> {
  const v = data.nativeExploreMapping;
  if (v === undefined) return;
  const point = (p: unknown) =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(
      (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7,
    );
  const hash = (h: unknown) =>
    typeof h === "string" && /^[a-f0-9]{64}$/.test(h);
  const keys = (v: object, allowed: string[]) =>
    Object.keys(v).every((k) => allowed.includes(k));
  if (
    !v ||
    v.format !== "openindoormaps-native-explore-mapping" ||
    ![1, 2].includes(v.version) ||
    v.sourceModelSha256 !== data.source.modelSha256 ||
    !hash(v.datasetGeometrySha256) ||
    !hash(v.mappingSha256) ||
    !keys(v, [
      "format",
      "version",
      "sourceModelSha256",
      "datasetGeometrySha256",
      "mappingSha256",
      "levels",
      "unavailableLevelIds",
    ]) ||
    !Array.isArray(v.levels) ||
    v.levels.length > 1000 ||
    !Array.isArray(v.unavailableLevelIds) ||
    v.unavailableLevelIds.length > 1000
  )
    throw new Error("Invalid published native floor mapping.");
  const ids = new Set<number>();
  for (const level of v.levels) {
    if (
      !level ||
      !keys(level, ["levelId", "regions", "boundaries", "warningCount"]) ||
      !Number.isSafeInteger(level.levelId) ||
      ids.has(level.levelId) ||
      !data.nativeLevels.some((l) => l.id === level.levelId) ||
      !Number.isSafeInteger(level.warningCount) ||
      level.warningCount < 0 ||
      !Array.isArray(level.regions) ||
      level.regions.length > 100000 ||
      !Array.isArray(level.boundaries) ||
      level.boundaries.length > 10000
    )
      throw new Error("Invalid published native level.");
    ids.add(level.levelId);
    const regions = new Set<string>();
    for (const r of level.regions) {
      if (
        !r ||
        !keys(r, [
          "id",
          "ringsFeet",
          "roomKeys",
          "nativeFloorIds",
          "nativeDoorIds",
          "areaSquareFeet",
          "exposedFloorEdgeFeet",
          ...(v.version === 2 ? ["displayPartsFeet", "associations"] : []),
        ]) ||
        typeof r.id !== "string" ||
        !r.id ||
        r.id.length > 200 ||
        regions.has(r.id) ||
        !Array.isArray(r.ringsFeet) ||
        !r.ringsFeet.length ||
        r.ringsFeet.length > 100000 ||
        r.ringsFeet.some(
          (r) =>
            !Array.isArray(r) ||
            r.length < 3 ||
            r.length > 1000000 ||
            !r.every(point),
        ) ||
        !Array.isArray(r.roomKeys) ||
        r.roomKeys.length > 100000 ||
        r.roomKeys.some(
          (k) =>
            !data.records.some(
              (p) => p.key === k && p.levelId === level.levelId,
            ),
        ) ||
        ![r.areaSquareFeet, r.exposedFloorEdgeFeet].every(
          (n) => Number.isFinite(n) && n >= 0,
        ) ||
        !Array.isArray(r.nativeFloorIds) ||
        !Array.isArray(r.nativeDoorIds) ||
        [...r.nativeFloorIds, ...r.nativeDoorIds].some(
          (id) => !Number.isSafeInteger(id) || id <= 0,
        )
      )
        throw new Error("Invalid published native area.");
      if (
        v.version === 2 &&
        (!Array.isArray(r.displayPartsFeet) ||
          !r.displayPartsFeet.length ||
          r.displayPartsFeet.length > 1000000 ||
          r.displayPartsFeet.some(
            (part) =>
              !Array.isArray(part) ||
              !part.length ||
              part.some(
                (ring) =>
                  !Array.isArray(ring) || ring.length < 3 || !ring.every(point),
              ),
          ) ||
          !Array.isArray(r.associations) ||
          r.associations.length !== r.roomKeys.length ||
          new Set(r.associations.map((a) => a.roomKey)).size !==
            r.roomKeys.length ||
          r.associations.some(
            (a) =>
              !a ||
              !keys(a, ["roomKey", "coverage", "method", "labelPointFeet"]) ||
              !r.roomKeys.includes(a.roomKey) ||
              (a.labelPointFeet !== undefined && !point(a.labelPointFeet)) ||
              !Number.isFinite(a.coverage) ||
              a.coverage < 0 ||
              a.coverage > 1 ||
              !["majority-overlap", "seed-fallback"].includes(a.method) ||
              (a.method === "majority-overlap" && a.coverage <= 0.5),
          ))
      )
        throw new Error(
          "Invalid precomputed native display or room association.",
        );
      regions.add(r.id);
    }
    for (const b of level.boundaries)
      if (
        !b ||
        !keys(b, ["id", "label", "pointsFeet", "closed"]) ||
        typeof b.id !== "string" ||
        !b.id ||
        b.id.length > 200 ||
        typeof b.label !== "string" ||
        b.label.length > 200 ||
        typeof b.closed !== "boolean" ||
        !Array.isArray(b.pointsFeet) ||
        b.pointsFeet.length < (b.closed ? 3 : 2) ||
        b.pointsFeet.length > 100 ||
        !b.pointsFeet.every(point)
      )
        throw new Error("Invalid published analytical boundary.");
  }
  if (
    new Set(v.unavailableLevelIds).size !== v.unavailableLevelIds.length ||
    v.unavailableLevelIds.some(
      (id) =>
        !Number.isSafeInteger(id) ||
        ids.has(id) ||
        !data.nativeLevels.some((l) => l.id === id),
    )
  )
    throw new Error("Invalid unavailable published level.");
  if (
    (await nativeExploreDatasetGeometrySha256(data, v.version)) !==
    v.datasetGeometrySha256
  )
    throw new Error(
      "Published native floor map has stale source geometry. Re-export the campus viewer from the current master.",
    );
  if ((await sha([v.levels, v.unavailableLevelIds])) !== v.mappingSha256)
    throw new Error(
      "Published native floor map geometry was changed or damaged.",
    );
}
