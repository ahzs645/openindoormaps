import { nativeMaterialPlanWalls } from "./native-material-plan";
import { validateDoorApertureBinding } from "./reviewed-door-apertures";
import type { IndoorProject } from "./package";
import {
  reviewedBoundaryWalls,
  validateNativeBoundaryBinding,
  validateNativeBoundaryPatches,
  type NativeBoundaryPatch,
  type NativeBoundaryPatches,
} from "./native-boundary-patches";

/** A replayable source correction log, separate from the proprietary RVT.
 * roomsSha256 is the export's provenance; unchanged native wall evidence lets
 * proposals be replayed after unrelated room-review edits. */
export type NativeBoundaryPatchFile = {
  format: "openindoormaps-native-boundary-patches";
  version: 1;
  source: { modelSha256: string; roomsSha256: string };
  nativeBoundaryPatches: NativeBoundaryPatches;
};

export function nativeBoundaryPatchFile(
  project: IndoorProject,
): NativeBoundaryPatchFile {
  validateDoorApertureBinding(
    project.rooms.reviewedDoorApertures,
    project.dataset,
  );
  validateNativeBoundaryBinding(
    project.dataset.walls,
    project.rooms.nativeBoundaryPatches,
    project.dataset.source.modelSha256,
    project.dataset.boundaryPatchState,
    project.rooms.reviewedDoorApertures,
    project.dataset.nativeMaterialSections,
    project.dataset.nativeMaterialSections
      ? (levelId) => nativeMaterialPlanWalls(project.dataset, levelId)
      : undefined,
  );
  return structuredClone({
    format: "openindoormaps-native-boundary-patches",
    version: 1,
    source: {
      modelSha256: project.dataset.source.modelSha256,
      roomsSha256: project.dataset.source.roomsSha256,
    },
    nativeBoundaryPatches: project.rooms.nativeBoundaryPatches ?? {
      version: 1,
      patches: [],
    },
  });
}

const content = (p: NativeBoundaryPatch) =>
  JSON.stringify({
    id: p.id,
    levelId: p.levelId,
    sourceModelSha256: p.sourceModelSha256,
    widthFeet: p.widthFeet,
    ringsFeet: p.ringsFeet,
    wallEvidence: p.wallEvidence,
    nativeDoorIds: p.nativeDoorIds,
    manualPointsFeet: p.manualPointsFeet,
    continuationProof: p.continuationProof,
    drawingReconstructionProof: p.drawingReconstructionProof,
    assumedEnclosureProof: p.assumedEnclosureProof,
    notes: p.notes,
  });

/** Import never applies geometry. Existing applied patches keep their state;
 * new patches become proposals and must pass current worker preview/apply. */
export function importNativeBoundaryPatchFile(
  project: IndoorProject,
  value: unknown,
): IndoorProject {
  if (project.manifest.format !== "reviter-project")
    throw new Error(
      "Import geometry patches into the matching authoring master.",
    );
  const file = value as NativeBoundaryPatchFile | undefined;
  if (
    !file ||
    file.format !== "openindoormaps-native-boundary-patches" ||
    file.version !== 1 ||
    !file.source ||
    !/^[a-f0-9]{64}$/.test(file.source.modelSha256) ||
    !/^[a-f0-9]{64}$/.test(file.source.roomsSha256) ||
    file.source.modelSha256 !== project.dataset.source.modelSha256 ||
    !file.nativeBoundaryPatches
  )
    throw new Error(
      "Geometry patch file has an invalid format or different source model.",
    );
  validateNativeBoundaryPatches(
    file.nativeBoundaryPatches,
    file.source.modelSha256,
  );
  validateDoorApertureBinding(
    project.rooms.reviewedDoorApertures,
    project.dataset,
  );
  validateNativeBoundaryBinding(
    project.dataset.walls,
    project.rooms.nativeBoundaryPatches,
    project.dataset.source.modelSha256,
    project.dataset.boundaryPatchState,
    project.rooms.reviewedDoorApertures,
    project.dataset.nativeMaterialSections,
    project.dataset.nativeMaterialSections
      ? (levelId) => nativeMaterialPlanWalls(project.dataset, levelId)
      : undefined,
  );
  // Check even proposed evidence against exact original wall faces.
  reviewedBoundaryWalls(
    project.dataset.walls,
    {
      version: 1,
      patches: file.nativeBoundaryPatches.patches.map((p) => ({
        ...p,
        status: "applied",
      })),
    },
    file.source.modelSha256,
    undefined,
    project.rooms.reviewedDoorApertures,
    project.dataset.nativeMaterialSections,
    project.dataset.nativeMaterialSections
      ? (levelId) => nativeMaterialPlanWalls(project.dataset, levelId)
      : undefined,
  );
  for (const p of file.nativeBoundaryPatches.patches) {
    if (
      !project.dataset.nativeLevels.some((l) => l.id === p.levelId) ||
      p.nativeDoorIds.some(
        (id) =>
          !project.dataset.doors?.some(
            (d) => d.levelId === p.levelId && d.nativeElementId === id,
          ),
      )
    )
      throw new Error(
        `Boundary patch ${p.id} has stale native level or door evidence.`,
      );
  }
  const prior = project.rooms.nativeBoundaryPatches?.patches ?? [];
  const additions: NativeBoundaryPatch[] = [];
  for (const p of file.nativeBoundaryPatches.patches) {
    const existing = prior.find((q) => q.id === p.id);
    if (existing && content(existing) !== content(p))
      throw new Error(
        `Boundary patch ${p.id} conflicts with the saved correction. Keep both files and review the difference.`,
      );
    if (!existing)
      additions.push({ ...structuredClone(p), status: "proposed" });
  }
  if (prior.length + additions.length > 5000)
    throw new Error("Geometry patch import exceeds the 5000-patch limit.");
  return {
    ...project,
    rooms: {
      ...project.rooms,
      nativeBoundaryPatches: {
        version: 1,
        patches: [...prior, ...additions],
      },
    },
  };
}
