import type { IndoorDataset } from "./contract";
import { validateNativePhysicalLevels } from "./native-physical-levels";

export type NativePhysicalDisplayPlane = {
  id: string;
  label: string;
  kind: "main" | "source-level";
  levelIds: number[];
  /** Original source elevation; the public floor group never moves this plane. */
  elevationFeet?: number;
  provisional: boolean;
};

/** Keep established annotated planes together. A newly certified source-only
 * fractional plane is a separate 2D choice, so its opaque floor cannot conceal
 * lower rooms. This changes display membership only, never physical geometry,
 * room ownership, connector heights or access. */
export function nativePhysicalDisplayPlanes(
  data: IndoorDataset,
  floorId: string,
): NativePhysicalDisplayPlane[] {
  validateNativePhysicalLevels(data);
  const floor = data.floors.find((entry) => entry.id === floorId);
  if (!floor) return [];
  const aliases = (data.nativePhysicalLevels?.displayAliases ?? [])
    .filter((alias) => alias.displayFloorId === floor.id)
    .sort(
      (a, b) =>
        a.elevationFeet - b.elevationFeet || a.nativeLevelId - b.nativeLevelId,
    );
  const extraIds = new Set(aliases.map((alias) => alias.nativeLevelId));
  return [
    {
      id: "main",
      label: "Main floor",
      kind: "main",
      levelIds: floor.levelIds.filter((id) => !extraIds.has(id)),
      provisional: false,
    },
    ...aliases.map(
      (alias): NativePhysicalDisplayPlane => ({
        id: `native:${alias.nativeLevelId}`,
        label: alias.sourceName,
        kind: "source-level",
        levelIds: [alias.nativeLevelId],
        elevationFeet: alias.elevationFeet,
        provisional: true,
      }),
    ),
  ];
}

/** Unknown/stale UI choices revert to Main floor without changing source data. */
export function nativePhysicalDisplayPlaneLevelIds(
  data: IndoorDataset,
  floorId: string,
  planeId = "main",
): number[] {
  const planes = nativePhysicalDisplayPlanes(data, floorId);
  return [
    ...((planes.find((plane) => plane.id === planeId) ?? planes[0])?.levelIds ??
      []),
  ];
}

/** Search and route transitions can select the target's actual source plane.
 * There is no nearest-height or contour-based relocation. */
export function nativePhysicalDisplayPlaneForLevel(
  data: IndoorDataset,
  floorId: string,
  nativeLevelId: number,
): string {
  return (
    nativePhysicalDisplayPlanes(data, floorId).find((plane) =>
      plane.levelIds.includes(nativeLevelId),
    )?.id ?? "main"
  );
}
