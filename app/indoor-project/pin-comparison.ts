import pc from "polygon-clipping";
import type { IndoorDataset } from "./contract";
import type { NativeBoundaryPatch } from "./native-boundary-patches";
import { reviewedBoundaryWalls } from "./native-boundary-patches";
import { preparedReviewedDoorApertures } from "./reviewed-door-apertures";
import {
  deriveNativeAreas,
  pointInNativeArea,
  type NativeAreaRegion,
  type NativeAreaResult,
} from "./native-area-review";
import { roomLabelPoint } from "./map-edits";
export type PinComparisonMode =
  | "map"
  | "current-selection"
  | "patch"
  | "updated-selection";
export type PinComparisonResult = {
  current?: NativeAreaRegion;
  updated?: NativeAreaRegion;
  currentRegions?: NativeAreaRegion[];
  updatedRegions?: NativeAreaRegion[];
  /** Applied corrections are removed only in the disposable before view. */
  beforeAppliedPatch?: boolean;
  patches: NativeBoundaryPatch[];
  targetRoomKey?: string;
  warnings: string[];
};
type Point = [number, number];
const area = (parts: Point[][][]) =>
  parts.reduce(
    (s, rings) =>
      s +
      rings.reduce(
        (n, ring, i) =>
          n +
          ((i ? -1 : 1) *
            Math.abs(
              ring.reduce((a, p, j) => {
                const q = ring[(j + 1) % ring.length];
                return a + p[0] * q[1] - q[0] * p[1];
              }, 0),
            )) /
            2,
        0,
      ),
    0,
  );
/** Descendants of the same actual before component, including unlabelled parts. */
export function affectedComparisonRegions(
  before: NativeAreaRegion | undefined,
  after: NativeAreaResult,
) {
  return before
    ? after.regions.filter(
        (r) =>
          r.roomKeys.some((k) => before.roomKeys.includes(k)) ||
          area(pc.intersection(r.ringsFeet, before.ringsFeet)) > 0.001,
      )
    : [];
}
/** Temporary comparison only. Every operation runs on a copy, never the source project. */
export async function comparePinBoundary(
  data: IndoorDataset,
  levelId: number,
  point: Point,
  patches: NativeBoundaryPatch[],
): Promise<PinComparisonResult> {
  const patchIds = new Set(patches.map((p) => p.id));
  const beforeData = {
    ...data,
    walls: data.walls.filter(
      (w) => !w.reviewPatchId || !patchIds.has(w.reviewPatchId),
    ),
  };
  const current = await deriveNativeAreas(beforeData, levelId, {
    mode: "connected",
    maxGapFeet: 0,
  });
  const nearest = data.records
    .filter((r) => r.levelId === levelId)
    .map((r) => ({ key: r.key, point: roomLabelPoint(data, r.key) }))
    .sort(
      (a, b) =>
        Math.hypot(a.point[0] - point[0], a.point[1] - point[1]) -
        Math.hypot(b.point[0] - point[0], b.point[1] - point[1]),
    )[0];
  const atPin = current.regions.find((r) =>
    pointInNativeArea(point, r.ringsFeet),
  );
  const region =
    atPin ??
    current.regions.find((r) => nearest && r.roomKeys.includes(nearest.key));
  const target =
    nearest && region?.roomKeys.includes(nearest.key)
      ? nearest.key
      : region?.roomKeys[0];
  const result: PinComparisonResult = {
    current: region,
    currentRegions: region ? [region] : [],
    beforeAppliedPatch: data.walls.some(
      (w) => w.reviewPatchId && patchIds.has(w.reviewPatchId),
    ),
    patches,
    targetRoomKey: target,
    warnings: [...current.warnings],
  };
  if (!atPin)
    result.warnings.push(
      "The pin is on a barrier or unsupported surface; selection uses the nearest supported place label as a location hint.",
    );
  if (!patches.length) return result;
  if (
    patches.some(
      (p) =>
        p.levelId !== levelId ||
        p.sourceModelSha256 !== data.source.modelSha256,
    )
  )
    throw new Error("Proposal does not match this model and native level.");
  const derived = reviewedBoundaryWalls(
    data.walls,
    { version: 1, patches: patches.map((p) => ({ ...p, status: "applied" })) },
    data.source.modelSha256,
    levelId,
    preparedReviewedDoorApertures(data),
  );
  const elevation = data.nativeLevels.find(
    (l) => l.id === levelId,
  )!.elevationFeet;
  const support = data
    .walkingSupport!.floors.filter(
      (f) => Math.abs(f.elevationFeet - elevation) < 0.15,
    )
    .flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
  const ground = pc.union(support[0], ...support.slice(1));
  const holes = data.records
    .filter((r) => r.levelId === levelId)
    .flatMap((r) =>
      ((r.properties.floorOpeningsFeet ?? []) as Point[][]).map((h) => [h]),
    );
  const solids = data.walls
    .filter((w) => w.levelId === levelId && w.kind === "column")
    .map((w) => w.ringsFeet);
  const fixtures =
    data.circulationGeometry?.sourceModelSha256 === data.source.modelSha256
      ? (data.circulationGeometry.fixtures ?? [])
          .filter((f) => f.levelIds.includes(levelId))
          .map((f) => f.ringsFeet)
      : [];
  const doors = (data.doors ?? [])
    .filter((d) => d.levelId === levelId && d.footprintFeet)
    .map((d) => [d.footprintFeet!]);
  for (const p of patches) {
    if (
      area(pc.difference([p.ringsFeet], ground)) > 0.001 ||
      [...holes, ...solids, ...fixtures, ...doors].some(
        (mask) => area(pc.intersection(p.ringsFeet, mask)) > 0.001,
      )
    )
      throw new Error(
        "Proposed geometry crosses unsupported floor, a protected opening, column, fixture or measured door. Comparison blocked.",
      );
  }
  const previewData = {
    ...data,
    walls: [
      ...data.walls,
      ...derived.filter(
        (w) => !data.walls.some((old) => old.reviewPatchId === w.reviewPatchId),
      ),
    ],
  };
  const updated = await deriveNativeAreas(previewData, levelId, {
    mode: "connected",
    maxGapFeet: 0,
  });
  result.updated =
    updated.regions.find((r) => target && r.roomKeys.includes(target)) ??
    updated.regions.find((r) => pointInNativeArea(point, r.ringsFeet));
  // Include every resulting component of the original selection, not only
  // the one containing the target label. Unlabelled components remain visible.
  result.updatedRegions = affectedComparisonRegions(region, updated);
  result.warnings = [...new Set([...result.warnings, ...updated.warnings])];
  return result;
}
