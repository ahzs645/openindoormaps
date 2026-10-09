import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { nativeExactPartsForProposals } from "./native-exact-planar-topology";
import pc from "polygon-clipping";
import type { IndoorDataset } from "./contract";
import { createNativeRoutingMaterialQuery } from "./native-routing-material";
import { preparedReviewedDoorApertures } from "./reviewed-door-apertures";
export const NATIVE_FLOOR_CONTACT_SELECTION_VERSION =
  "native-selection-floor-contact-monotone-plan-cuts-v2";
/** Analytical masks only. Original prepared wall/jamb evidence stays byte-for-byte
 * in data.walls so historical door and continuation checks retain their binding. */
export function nativeMaterialPlanWalls(
  data: IndoorDataset,
  levelId: number,
  query?: ReturnType<typeof createNativeRoutingMaterialQuery>,
  cutElevationFeet?: number,
): IndoorDataset["walls"] {
  const original = data.walls.filter((w) => w.levelId === levelId);
  const level = data.nativeLevels.find((l) => l.id === levelId);
  if (!level || !data.nativeMaterialSections) return original;
  const cut = cutElevationFeet ?? level.elevationFeet + 4;
  if (!Number.isFinite(cut))
    throw new Error("Native material cut must have a finite source elevation.");
  // Apply validated rigid source placement to the actual original section,
  // rather than retaining a historical proxy for a corrected owner.
  const material = (query ?? createNativeRoutingMaterialQuery(data))(
    level.elevationFeet,
    cut,
  );
  const apertures =
    preparedReviewedDoorApertures(data)?.patches.filter(
      (p) => p.levelId === levelId,
    ) ?? [];
  const recovered: IndoorDataset["walls"] = material.parts.flatMap(
    (section) => {
      const cuts = apertures.filter((p) =>
        p.wallEvidence.some(
          (w) => w.nativeElementId === section.nativeElementId,
        ),
      );
      const parts = cuts.length
        ? pc.difference(section.rings, ...cuts.map((p) => [p.apertureFeet]))
        : [section.rings];
      return parts.map((ringsFeet) => ({
        levelId,
        nativeElementId: section.nativeElementId,
        kind: section.column ? ("column" as const) : ("wall" as const),
        geometrySource: section.positiveSubsetOnly
          ? "original-native-positive-material-subset"
          : "original-native-material-section",
        ringsFeet,
      }));
    },
  );
  const derived = (data.nativeDerivedFrameReturns?.rows ?? [])
    .filter(
      (r) =>
        !r.sourceFloorOuterContext &&
        r.levelId === levelId &&
        r.baseElevationFeet <= cut &&
        r.topElevationFeet > cut,
    )
    .flatMap((r) =>
      r.partsFeet.map((ringsFeet) => ({
        levelId,
        nativeElementId: r.sourceNativeElementId,
        kind: "wall" as const,
        geometrySource: "derived-native-frame-return",
        reviewPatchId: r.id,
        ringsFeet,
      })),
    );
  const provisional = (data.nativeProvisionalCornerSeals?.rows ?? [])
    .filter(
      (r) =>
        !r.sourceFloorOuterContext &&
        !r.materialRole &&
        r.state === "applied" &&
        r.baseElevationFeet <= cut &&
        r.topElevationFeet > cut,
    )
    .flatMap((r, i) =>
      r.partsFeet.map((ringsFeet) => ({
        levelId,
        nativeElementId: -700000000 - i,
        kind: "wall" as const,
        geometrySource: "provisional-native-corner-seal",
        reviewPatchId: r.id,
        ringsFeet,
      })),
    );
  return [
    ...provisional,
    ...derived,
    ...original
      .filter(
        (w) =>
          (w.reviewPatchId &&
            (!material.known.has(w.nativeElementId) ||
              material.present.has(w.nativeElementId))) ||
          !material.known.has(w.nativeElementId),
      )
      .flatMap((w) => {
        // Tagged source recipes stay complete in data.walls. Only their own
        // independently checked original host aperture composes analytical material.
        const cuts = w.reviewPatchId
          ? apertures.filter((p) =>
              p.wallEvidence.some(
                (e) => e.nativeElementId === w.nativeElementId,
              ),
            )
          : [];
        return cuts.length
          ? pc
              .difference(w.ringsFeet, ...cuts.map((p) => [p.apertureFeet]))
              .map((ringsFeet) => ({ ...w, ringsFeet }))
          : [w];
      }),
    ...recovered,
  ];
}

/** Strict selection retains exact aperture intersections. Numeric wall copies
 * are proposal/evidence buffers and never supply subsequent floor Booleans. */
export function nativeMaterialPlanExactWalls(
  data: IndoorDataset,
  levelId: number,
  query: ReturnType<typeof createNativeRoutingMaterialQuery>,
  cutElevationFeet?: number,
): (IndoorDataset["walls"][number] & { exactParts: NativeRationalParts })[] {
  const level = data.nativeLevels.find((l) => l.id === levelId);
  if (!level || !data.nativeMaterialSections)
    throw new Error(
      "Exact native wall selection needs bound original material.",
    );
  const cut = cutElevationFeet ?? level.elevationFeet + 4;
  const material = query(level.elevationFeet, cut);
  const apertures =
    preparedReviewedDoorApertures(data)?.patches.filter(
      (p) => p.levelId === levelId,
    ) ?? [];
  const original = data.walls.filter((w) => w.levelId === levelId);
  const copied: (IndoorDataset["walls"][number] & {
    parts: [number, number][][][];
    cutOwnApertures: boolean;
  })[] = [
    ...material.parts.map((section) => ({
      levelId,
      nativeElementId: section.nativeElementId,
      kind: section.column ? ("column" as const) : ("wall" as const),
      geometrySource: section.positiveSubsetOnly
        ? "original-native-positive-material-subset"
        : "original-native-material-section",
      ringsFeet: section.rings,
      parts: [section.rings],
      cutOwnApertures: true,
    })),
    ...original
      .filter(
        (w) =>
          (w.reviewPatchId &&
            (!material.known.has(w.nativeElementId) ||
              material.present.has(w.nativeElementId))) ||
          !material.known.has(w.nativeElementId),
      )
      .map((w) => ({
        ...w,
        parts: [w.ringsFeet],
        cutOwnApertures: !!w.reviewPatchId,
      })),
    ...(data.nativeDerivedFrameReturns?.rows ?? [])
      .filter(
        (r) =>
          !r.sourceFloorOuterContext &&
          r.levelId === levelId &&
          r.baseElevationFeet <= cut &&
          r.topElevationFeet > cut,
      )
      .flatMap((r) =>
        r.partsFeet.map((ringsFeet) => ({
          levelId,
          nativeElementId: r.sourceNativeElementId,
          kind: "wall" as const,
          geometrySource: "derived-native-frame-return",
          reviewPatchId: r.id,
          ringsFeet,
          parts: [ringsFeet],
          cutOwnApertures: false,
        })),
      ),
    ...(data.nativeProvisionalCornerSeals?.rows ?? [])
      .filter(
        (r) =>
          !r.sourceFloorOuterContext &&
          !r.materialRole &&
          r.state === "applied" &&
          r.baseElevationFeet <= cut &&
          r.topElevationFeet > cut,
      )
      .flatMap((r, i) =>
        r.partsFeet.map((ringsFeet) => ({
          levelId,
          nativeElementId: -700000000 - i,
          kind: "wall" as const,
          geometrySource: "provisional-native-corner-seal",
          reviewPatchId: r.id,
          ringsFeet,
          parts: [ringsFeet],
          cutOwnApertures: false,
        })),
      ),
  ];
  return copied.flatMap(({ parts, cutOwnApertures, ...wall }) => {
    const cuts = cutOwnApertures
      ? apertures.filter((p) =>
          p.wallEvidence.some(
            (e) => e.nativeElementId === wall.nativeElementId,
          ),
        )
      : [];
    const exactParts = nativeRationalOverlay(
      cuts.length ? "difference" : "union",
      parts,
      ...cuts.map((p) => [[p.apertureFeet]]),
    );
    return exactParts.map((part) => ({
      ...wall,
      ringsFeet: nativeExactPartsForProposals([part])[0],
      exactParts: [part],
    }));
  });
}
