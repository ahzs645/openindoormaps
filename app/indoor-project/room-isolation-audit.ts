import type { IndoorDataset } from "./contract";
import {
  nativeAreaGeometrySha256,
  type NativeAreaResult,
} from "./native-area-review";

/** Selection connectivity is evidence for review, never approval of a wall or route. */
export async function auditRoomIsolation(
  data: IndoorDataset,
  traces: NativeAreaResult[],
) {
  const byKey = new Map(data.records.map((r) => [r.key, r]));
  if (byKey.size !== data.records.length)
    throw new Error("Duplicate room identities.");
  const levels = new Set<number>();
  const membership = new Map<
    string,
    {
      id: string;
      levelId: number;
      roomKeys: string[];
      areaSquareFeet: number;
    }[]
  >();
  for (const trace of traces) {
    if (trace.sourceModelSha256 !== data.source.modelSha256)
      throw new Error("Native trace belongs to another source model.");
    if (levels.has(trace.levelId))
      throw new Error("Duplicate native level trace.");
    if (
      trace.geometrySha256 !==
      (await nativeAreaGeometrySha256(data, trace.levelId, trace.options))
    )
      throw new Error("Native trace has stale geometry or selection metadata.");
    levels.add(trace.levelId);
    const options = trace.options;
    if (
      options?.roomKey ||
      options?.nativeFloorId ||
      options?.cropPolygonFeet ||
      options?.manualGapPoints ||
      options?.previewGapIds?.length ||
      options?.previewPartitionIds?.length ||
      options?.ignoreAppliedPartitions ||
      (options?.maxGapFeet ?? 0) !== 0 ||
      (options?.mode && options.mode !== "connected")
    ) {
      throw new Error(
        "Room isolation audit requires current whole-level connected selection without experimental closures.",
      );
    }
    const ids = new Set<string>();
    for (const region of trace.regions) {
      if (
        ids.has(region.id) ||
        new Set(region.roomKeys).size !== region.roomKeys.length
      )
        throw new Error("Duplicate native region or labels.");
      ids.add(region.id);
      for (const key of region.roomKeys) {
        const room = byKey.get(key);
        if (!room || room.levelId !== trace.levelId)
          throw new Error(
            "Native region contains an unknown or wrong-level room identity.",
          );
        const list = membership.get(key) ?? [];
        list.push({
          id: region.id,
          levelId: trace.levelId,
          roomKeys: region.roomKeys,
          areaSquareFeet: region.areaSquareFeet,
        });
        membership.set(key, list);
      }
    }
  }
  return data.records.map((room) => {
    const regions = membership.get(room.key) ?? [];
    const state =
      regions.length === 0
        ? "no-native-region"
        : regions.length > 1
          ? "multiple-native-regions"
          : regions[0].roomKeys.length > 1
            ? "shared-native-region"
            : "single-label-native-region";
    return {
      key: room.key,
      number: room.number,
      name: room.name,
      building: room.building,
      levelId: room.levelId,
      campusFloors: data.floors
        .filter((f) => f.levelIds.includes(room.levelId))
        .map((f) => ({ id: f.id, name: f.name })),
      state,
      traceAvailable: levels.has(room.levelId),
      declaredUse: {
        circulation: room.circulation,
        stair: room.stair,
        walkable: room.walkable,
        access: room.access,
      },
      surfaceReview: {
        roomElevationFeet: room.elevationFeet,
        nativeLevelElevationFeet: data.nativeLevels.find(
          (l) => l.id === room.levelId,
        )?.elevationFeet,
        needsHeightReview:
          Math.abs(
            room.elevationFeet -
              (data.nativeLevels.find((l) => l.id === room.levelId)
                ?.elevationFeet ?? room.elevationFeet),
          ) > 0.15,
        nativeSlabIdsAtRoomElevation:
          data.walkingSupport?.sourceModelSha256 === data.source.modelSha256
            ? data.walkingSupport.floors
                .filter(
                  (f) => Math.abs(f.elevationFeet - room.elevationFeet) < 0.15,
                )
                .map((f) => f.nativeElementId)
            : [],
      },
      hasArrival: !!room.arrivalNodeId,
      regions: regions.map((region) => ({
        ...region,
        places: region.roomKeys.map((key) => {
          const r = byKey.get(key)!;
          return {
            key: r.key,
            number: r.number,
            name: r.name,
            building: r.building,
          };
        }),
      })),
      interpretation:
        state === "single-label-native-region"
          ? "One label in selection; raised geometry and arrival still need their own checks."
          : room.circulation || room.stair || !room.walkable
            ? "Declared circulation, stair or non-walkable area; review connectivity without forcing an enclosure."
            : "Investigate source partitions, measured door closures and identity seeds; shared labels alone do not authorize a wall.",
    };
  });
}
