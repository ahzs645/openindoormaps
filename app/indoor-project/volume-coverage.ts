import type { IndoorDataset } from "./contract";
import { isFlatArea } from "./display-passages";
import { prepareFloor } from "./prepared-floor";

export const volumeScopes = (data: IndoorDataset) => [
  ...data.floors.map((f) => ({ ...f, scope: "campus-floor" as const })),
  ...data.nativeLevels.map((f) => ({
    id: `native:${f.id}`,
    name: f.name,
    levelIds: [f.id],
    scope: "native-level" as const,
  })),
];
export type VolumeScope = ReturnType<typeof volumeScopes>[number];

/** Uses the exact visitor geometry, rather than assuming prepared metadata is visible. */
export function auditVolumeScope(data: IndoorDataset, scope: VolumeScope) {
  const modes = [false, true].map((relativeHeights) => {
    const prepared = prepareFloor(data, scope.levelIds, "all", {
      review: false,
      simplifyGeometry: false,
      relativeHeights,
      showPillars: false,
      showPassThroughPlaces: true,
      showVestibuleDoors: false,
      showStructures: true,
    });
    const blocks = new Map<string, number>();
    for (const f of prepared.stairCutRooms.features) {
      if (!f.geometry.coordinates.some((p) => (p[0]?.length ?? 0) >= 3))
        continue;
      const key = String(f.properties?.key);
      blocks.set(key, (blocks.get(key) ?? 0) + 1);
    }
    const masks = new Map<string, Set<string>>();
    for (const f of prepared.selectionAreas.features) {
      const key = String(f.properties?.key);
      if (!masks.has(key)) masks.set(key, new Set());
      masks
        .get(key)!
        .add(String(f.properties?.floorMaskSource ?? "source-outline"));
    }
    return { relativeHeights, blocks, masks };
  });
  const records = data.records
    .filter((r) => scope.levelIds.includes(r.levelId))
    .map((room) => {
      const present = modes.map((m) => (m.blocks.get(room.key) ?? 0) > 0);
      const intentional = room.stair
        ? "native-stair-display"
        : room.walkable
          ? isFlatArea(room)
            ? room.access === "staff"
              ? "restricted-flat-area"
              : "circulation-or-passage"
            : undefined
          : "nonwalkable-area";
      const status = intentional
        ? ("intentional-flat" as const)
        : present.every(Boolean)
          ? ("block-present" as const)
          : present.some(Boolean)
            ? ("mode-discrepancy" as const)
            : ("unsupported-room-enclosure" as const);
      return {
        key: room.key,
        number: room.number,
        name: room.name,
        building: room.building,
        nativeLevel: room.levelId,
        nativeElevationFeet: room.elevationFeet,
        access: room.access,
        status,
        intentionalReason: intentional,
        modes: modes.map((m) => ({
          relativeHeights: m.relativeHeights,
          blockCount: m.blocks.get(room.key) ?? 0,
          floorMaskSources: [...(m.masks.get(room.key) ?? [])],
        })),
        preparedBoundary: data.presentation?.rooms.find(
          (r) => r.roomKey === room.key,
        )?.boundarySource,
        diagnostics: (
          data.presentation?.diagnostics.filter(
            (d) => d.roomKey === room.key,
          ) ?? []
        ).map(({ code, message }) => ({ code, message })),
      };
    });
  const buildings = [...new Set(records.map((r) => r.building))]
    .sort()
    .map((building) => {
      const rs = records.filter((r) => r.building === building);
      return {
        building,
        records: rs.length,
        blocks: rs.filter((r) => r.status === "block-present").length,
        intentionalFlat: rs.filter((r) => r.status === "intentional-flat")
          .length,
        unsupported: rs.filter((r) => r.status === "unsupported-room-enclosure")
          .length,
        modeDiscrepancies: rs.filter((r) => r.status === "mode-discrepancy")
          .length,
      };
    });
  return {
    scope: scope.scope,
    id: scope.id,
    name: scope.name,
    levelIds: scope.levelIds,
    buildings,
    records,
  };
}
export type VolumeView = ReturnType<typeof auditVolumeScope>;
export type VolumeEntry = VolumeView["records"][number];
export type VolumeAudit = {
  format: "openindoormaps-volume-coverage-audit";
  version: 1;
  datasetSha256: string;
  reviewEvidenceSha256: string;
  source: IndoorDataset["source"];
  views: VolumeView[];
};
