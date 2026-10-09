import { nativeMaterialPlanWalls } from "./native-material-plan";
import { verifyNativeMaterialSections } from "./native-material-sections";
import {
  preparedReviewedDoorApertures,
  validateDoorApertureBinding,
} from "./reviewed-door-apertures";
import type { IndoorProject } from "./package";
import type { IndoorDataset } from "./contract";
import type { VolumeAudit } from "./volume-coverage";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import pc from "polygon-clipping";
import { nativeBarrierTopology } from "./native-barrier-topology";
import { indoorExclusionParts } from "./indoor-exclusions";
import { nativeBoundaryPatchFloorSupport } from "./native-boundary-patch-floor-support";
import {
  boundaryPatchMaterialParts,
  reviewedBoundaryWalls,
  type NativeBoundaryPatch,
} from "./native-boundary-patches";
import {
  pointInNativeArea,
  deriveNativeAreas,
  type NativeAreaOptions,
  type NativeAreaResult,
} from "./native-area-review";
type Point = [number, number];
type Rings = Point[][];
export type SlabWalkwayPreview = {
  kind: "slab-supported-walkway";
  levelId: number;
  sourceGeometryKey: string;
  nativeFloorEvidence: {
    nativeElementId: number;
    elevationFeet: number;
    ringsFeet: Rings;
    partsFeet?: Rings[];
  }[];
  partsFeet: Rings[];
};

/** Full connected native region; a source outline supplies identity/seed only.
 * Leaky regions are investigation overlays, never completed hallway proposals. */
export type NativeEnclosureWalkwayPreview = Omit<SlabWalkwayPreview, "kind"> & {
  kind: "native-enclosure-walkway";
  previewPurpose: "walkway-candidate" | "boundary-investigation";
  seedPointFeet: Point;
  regionId: string;
  regionRingsFeet: Rings;
  nativeAreaGeometrySha256: string;
  nativeFloorIds: number[];
  nativeDoorIds: number[];
  /** Explicit floor-continuity comparison; physical doors and route policy are preserved. */
  passThroughDoorIds?: number[];
  diagnostics: {
    roomKeys: string[];
    exposedFloorEdgeFeet: number;
    doorChecks: NativeAreaResult["doorChecks"];
  };
};
export type ProposalDisplayPreview =
  | SlabWalkwayPreview
  | NativeEnclosureWalkwayPreview;

export type EnclosureProposal = {
  key: string;
  /** Original audit binding when a historical record is retained in a newer catalog. */
  evidenceSha256?: string;
  cause: string;
  solution: string;
  confidence: string;
  prerequisites: string[];
  relatedKeys: string[];
  /** References portable measured corrections, never free-form geometry. */
  boundaryPatchIds?: string[];
  displayPreview?: ProposalDisplayPreview;
};
export type EnclosureProposals = {
  format: "openindoormaps-enclosure-proposals";
  version: 1;
  title: string;
  modelSha256: string;
  evidenceSha256: string;
  records: EnclosureProposal[];
};
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const text = (v: unknown, limit: number) =>
  typeof v === "string" && v.length > 0 && v.length <= limit;
const strings = (v: unknown, count: number, limit: number) =>
  Array.isArray(v) && v.length <= count && v.every((s) => text(s, limit));
const rings = (v: unknown): v is Rings =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 100 &&
  v.every(
    (r) =>
      Array.isArray(r) &&
      r.length >= 3 &&
      r.length <= 10000 &&
      r.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every((n) => Number.isFinite(n) && Math.abs(n) < 1e7),
      ),
  );
const nativeIds = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length <= 10000 &&
  new Set(v).size === v.length &&
  v.every((id) => Number.isSafeInteger(id) && id > 0);
function validDisplayPreview(p: ProposalDisplayPreview) {
  return (
    p &&
    ["slab-supported-walkway", "native-enclosure-walkway"].includes(p.kind) &&
    Number.isSafeInteger(p.levelId) &&
    hash(p.sourceGeometryKey) &&
    Array.isArray(p.partsFeet) &&
    p.partsFeet.length > 0 &&
    p.partsFeet.length <= 100 &&
    p.partsFeet.every(rings) &&
    Array.isArray(p.nativeFloorEvidence) &&
    p.nativeFloorEvidence.length > 0 &&
    p.nativeFloorEvidence.length <= 100 &&
    new Set(p.nativeFloorEvidence.map((f) => f?.nativeElementId)).size ===
      p.nativeFloorEvidence.length &&
    p.nativeFloorEvidence.every(
      (f) =>
        f &&
        Number.isSafeInteger(f.nativeElementId) &&
        f.nativeElementId > 0 &&
        Number.isFinite(f.elevationFeet) &&
        rings(f.ringsFeet) &&
        (f.partsFeet === undefined ||
          (Array.isArray(f.partsFeet) &&
            f.partsFeet.length > 0 &&
            f.partsFeet.length <= 100 &&
            f.partsFeet.every(rings))),
    ) &&
    (p.kind === "slab-supported-walkway" ||
      (["walkway-candidate", "boundary-investigation"].includes(
        p.previewPurpose,
      ) &&
        Array.isArray(p.seedPointFeet) &&
        p.seedPointFeet.length === 2 &&
        p.seedPointFeet.every(Number.isFinite) &&
        text(p.regionId, 200) &&
        rings(p.regionRingsFeet) &&
        hash(p.nativeAreaGeometrySha256) &&
        nativeIds(p.nativeFloorIds) &&
        p.nativeFloorIds.length > 0 &&
        nativeIds(p.nativeDoorIds) &&
        (p.passThroughDoorIds === undefined ||
          (nativeIds(p.passThroughDoorIds) &&
            p.passThroughDoorIds.every((id) =>
              p.nativeDoorIds.includes(id),
            ))) &&
        p.diagnostics &&
        strings(p.diagnostics.roomKeys, 10000, 200) &&
        new Set(p.diagnostics.roomKeys).size ===
          p.diagnostics.roomKeys.length &&
        Number.isFinite(p.diagnostics.exposedFloorEdgeFeet) &&
        p.diagnostics.exposedFloorEdgeFeet >= 0 &&
        Array.isArray(p.diagnostics.doorChecks) &&
        p.diagnostics.doorChecks.length <= 10000 &&
        p.diagnostics.doorChecks.every(
          (d) =>
            d &&
            Number.isSafeInteger(d.nativeElementId) &&
            d.nativeElementId > 0 &&
            Array.isArray(d.pointFeet) &&
            d.pointFeet.length === 2 &&
            d.pointFeet.every(Number.isFinite) &&
            ["same-region", "separated", "unsupported-side"].includes(
              d.status,
            ) &&
            Array.isArray(d.sideRegionIds) &&
            d.sideRegionIds.length === 2 &&
            d.sideRegionIds.every((id) => id === null || text(id, 200)),
        )))
  );
}
/** Proposed fixes are authoring evidence, never instructions or geometry approval. */
export function validateEnclosureProposals(
  value: unknown,
): asserts value is EnclosureProposals | undefined {
  if (value === undefined) return;
  const p = value as EnclosureProposals;
  if (
    !p ||
    p.format !== "openindoormaps-enclosure-proposals" ||
    p.version !== 1 ||
    !text(p.title, 200) ||
    !hash(p.modelSha256) ||
    !hash(p.evidenceSha256) ||
    !Array.isArray(p.records) ||
    p.records.length > 50_000 ||
    p.records.some(
      (r) =>
        !r ||
        !text(r.key, 200) ||
        (r.evidenceSha256 !== undefined && !hash(r.evidenceSha256)) ||
        !text(r.cause, 10_000) ||
        !text(r.solution, 10_000) ||
        !text(r.confidence, 100) ||
        !strings(r.prerequisites, 100, 2000) ||
        !strings(r.relatedKeys, 1000, 200) ||
        (r.boundaryPatchIds !== undefined &&
          (!strings(r.boundaryPatchIds, 100, 200) ||
            new Set(r.boundaryPatchIds).size !== r.boundaryPatchIds.length)) ||
        (r.displayPreview !== undefined &&
          !validDisplayPreview(r.displayPreview)),
    ) ||
    new Set(p.records.map((r) => r.key)).size !== p.records.length
  )
    throw new Error(
      "Invalid enclosure proposals: check room keys, evidence binding and text limits.",
    );
}
export function proposalMatchesModel(
  p: EnclosureProposals,
  project: IndoorProject,
) {
  return p.modelSha256 === project.dataset.source.modelSha256;
}
export function proposalIsCurrent(p: EnclosureProposals, report: VolumeAudit) {
  return (
    p.modelSha256 === report.source.modelSha256 &&
    p.evidenceSha256 === report.reviewEvidenceSha256
  );
}
/** Both the containing catalog and the selected record must have been reviewed
 * against this audit. Omitted record bindings retain the legacy catalog behavior. */
export function proposalRecordIsCurrent(
  catalog: EnclosureProposals,
  record: EnclosureProposal,
  currentEvidenceSha256: string,
) {
  return (
    catalog.evidenceSha256 === currentEvidenceSha256 &&
    (record.evidenceSha256 ?? catalog.evidenceSha256) === currentEvidenceSha256
  );
}
export function saveEnclosureProposals(
  project: IndoorProject,
  proposals: EnclosureProposals,
): IndoorProject {
  validateEnclosureProposals(proposals);
  if (!proposalMatchesModel(proposals, project))
    throw new Error("These proposals belong to another source model.");
  const keys = new Set(project.dataset.records.map((r) => r.key));
  if (
    proposals.records.some(
      (r) => !keys.has(r.key) || r.relatedKeys.some((k) => !keys.has(k)),
    )
  )
    throw new Error("These proposals refer to places missing from this map.");
  return {
    ...project,
    rooms: { ...project.rooms, enclosureProposals: proposals },
  };
}
export function proposalNotes(p: EnclosureProposal) {
  return `Proposed correction (not applied)\n\nCause: ${p.cause}\n\nSolution: ${p.solution}\n\nConfidence: ${p.confidence}\n\nChecks before applying:\n${p.prerequisites.map((s) => `- ${s}`).join("\n")}`.slice(
    0,
    10_000,
  );
}

export type BoundaryPatchPreviewPlan = {
  roomKey: string;
  sourceGeometryKey: string;
  proposalAuditEvidenceSha256?: string;
  patch: NativeBoundaryPatch;
  /** Exact coupled corrections from this room’s preserved proposal. */
  patches?: NativeBoundaryPatch[];
  options: NativeAreaOptions;
};

function segmentDistance(q: number[], a: number[], b: number[]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
}

/** Proximity is only a recommendation lookup, not proof of room ownership. */
export function roomBoundaryPreviewCandidates(
  project: IndoorProject,
  roomKey: string,
  proposal?: EnclosureProposal,
) {
  const room = project.dataset.records.find((r) => r.key === roomKey);
  if (!room) return [];
  return (project.rooms.nativeBoundaryPatches?.patches ?? []).filter((p) => {
    if (p.status !== "proposed" || p.levelId !== room.levelId) return false;
    if (proposal?.boundaryPatchIds)
      return proposal.boundaryPatchIds.includes(p.id);
    const centre = p.ringsFeet[0].reduce(
      (s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4],
      [0, 0],
    );
    return room.ringsFeet.some((ring) =>
      ring.some(
        (a, i) =>
          segmentDistance(centre, a, ring[(i + 1) % ring.length]) <= 0.75,
      ),
    );
  });
}

/** Recheck portable native evidence every time a preview starts. No mutations. */
export function boundaryPatchPreviewPlan(
  project: IndoorProject,
  roomKey: string,
  patchId: string,
  currentEvidenceSha256?: string,
): BoundaryPatchPreviewPlan {
  const catalog = project.rooms.enclosureProposals;
  const proposal = catalog?.records.find((r) => r.key === roomKey);
  if (
    catalog &&
    proposal &&
    !proposalRecordIsCurrent(
      catalog,
      proposal,
      currentEvidenceSha256 ?? catalog.evidenceSha256,
    )
  )
    throw new Error(
      "This room proposal retains earlier audit evidence. Re-audit it before previewing.",
    );
  const room = project.dataset.records.find((r) => r.key === roomKey);
  const p = project.rooms.nativeBoundaryPatches?.patches.find(
    (p) => p.id === patchId,
  );
  if (!room || !p || p.status !== "proposed" || room.levelId !== p.levelId)
    throw new Error(
      "Choose a proposed boundary correction on this room's native level.",
    );
  validateDoorApertureBinding(
    project.rooms.reviewedDoorApertures,
    project.dataset,
  );
  reviewedBoundaryWalls(
    project.dataset.walls,
    {
      version: 1,
      patches: [{ ...p, status: "applied" }],
    },
    project.dataset.source.modelSha256,
    undefined,
    project.rooms.reviewedDoorApertures,
    project.dataset.nativeMaterialSections,
    project.dataset.nativeMaterialSections
      ? (levelId) => nativeMaterialPlanWalls(project.dataset, levelId)
      : undefined,
  );
  const nativeLevel = project.dataset.nativeLevels.find(
    (l) => l.id === p.levelId,
  );
  if (
    !nativeLevel ||
    p.nativeDoorIds.some(
      (id) =>
        !project.dataset.doors?.some(
          (d) => d.levelId === p.levelId && d.nativeElementId === id,
        ),
    )
  )
    throw new Error(
      "This recommendation has stale native level or door evidence.",
    );
  if (p.nativeDoorIds.length)
    throw new Error(
      "A wall extension cannot close a measured navigation portal. Review the door separately.",
    );
  return structuredClone({
    roomKey,
    ...(currentEvidenceSha256
      ? { proposalAuditEvidenceSha256: currentEvidenceSha256 }
      : {}),
    // Bind all level inputs, including slab/door/void changes while a worker runs.
    sourceGeometryKey: bytesToHex(
      sha256(
        new TextEncoder().encode(
          JSON.stringify([
            project.dataset.source.modelSha256,
            nativeLevel,
            project.dataset.walkingSupport?.sourceModelSha256,
            project.dataset.walkingSupport?.floors.filter(
              (f) =>
                Math.abs(f.elevationFeet - nativeLevel.elevationFeet) < 0.15,
            ),
            project.dataset.walls.filter((w) => w.levelId === p.levelId),
            project.dataset.doors?.filter((d) => d.levelId === p.levelId),
            project.dataset.records.filter((r) => r.levelId === p.levelId),
            project.dataset.circulationGeometry?.fixtures?.filter((f) =>
              f.levelIds.includes(p.levelId),
            ),
            project.dataset.indoorExclusions,
          ]),
        ),
      ),
    ),
    patch: p,
    options: {
      mode: "connected",
      ...(p.manualPointsFeet
        ? { manualGapPoints: p.manualPointsFeet, maxGapFeet: p.widthFeet }
        : {}),
      previewGapIds: [p.id],
    },
  });
}

/** A room may require several joins. Bind the complete preserved set, not proximity. */
export function boundaryPatchGroupPreviewPlan(
  project: IndoorProject,
  roomKey: string,
  patchIds: string[],
  currentEvidenceSha256?: string,
): BoundaryPatchPreviewPlan {
  const proposal = project.rooms.enclosureProposals?.records.find(
    (p) => p.key === roomKey,
  );
  if (
    patchIds.length < 2 ||
    new Set(patchIds).size !== patchIds.length ||
    JSON.stringify([...patchIds].sort()) !==
      JSON.stringify([...(proposal?.boundaryPatchIds ?? [])].sort())
  )
    throw new Error(
      "Choose the complete correction set linked to this room's proposal.",
    );
  const plans = patchIds.map((id) =>
    boundaryPatchPreviewPlan(project, roomKey, id, currentEvidenceSha256),
  );
  if (
    plans.some(
      (p) =>
        p.patch.manualPointsFeet ||
        p.sourceGeometryKey !== plans[0].sourceGeometryKey,
    )
  )
    throw new Error(
      "Coupled corrections need current exact native wall evidence on one floor.",
    );
  return {
    ...plans[0],
    patches: plans.map((p) => p.patch),
    options: { mode: "connected", previewGapIds: patchIds },
  };
}

/** Replay a preserved exact wall continuation on a disposable dataset. This
 * supports original-width corner repairs which the manual strip tool cannot
 * reproduce. It does not add authoring approval or modify routing geometry. */
export async function deriveExactBoundaryPatchPreview(
  data: IndoorDataset,
  levelId: number,
  patch: NativeBoundaryPatch,
  options: NativeAreaOptions,
): Promise<NativeAreaResult> {
  return deriveExactBoundaryPatchGroupPreview(data, levelId, [patch], options);
}

export async function deriveExactBoundaryPatchGroupPreview(
  data: IndoorDataset,
  levelId: number,
  patches: NativeBoundaryPatch[],
  options: NativeAreaOptions,
): Promise<NativeAreaResult> {
  if (
    !patches.length ||
    new Set(patches.map((p) => p.id)).size !== patches.length
  )
    throw new Error("Choose a unique exact correction set.");
  await verifyNativeMaterialSections(
    data.nativeMaterialSections,
    data.source.modelSha256,
  );
  const checkedWalls: IndoorDataset["walls"] = [];
  const actualWalls = nativeMaterialPlanWalls(data, levelId);
  const groupWalls = reviewedBoundaryWalls(
    data.walls,
    { version: 1, patches: patches.map((p) => ({ ...p, status: "applied" })) },
    data.source.modelSha256,
    undefined,
    preparedReviewedDoorApertures(data),
    data.nativeMaterialSections,
    data.nativeMaterialSections
      ? (id) =>
          id === levelId ? actualWalls : nativeMaterialPlanWalls(data, id)
      : undefined,
  );
  const contactChecks: ((rings: Rings) => boolean)[] = [];
  for (const patch of patches) {
    if (
      patch.status !== "proposed" ||
      patch.levelId !== levelId ||
      patch.nativeDoorIds.length ||
      patch.manualPointsFeet ||
      JSON.stringify(options) !==
        JSON.stringify({
          mode: "connected",
          previewGapIds: patches.map((p) => p.id),
        })
    )
      throw new Error(
        "Choose exact proposed wall continuations for this floor.",
      );
    const walls = groupWalls.filter((w) => w.reviewPatchId === patch.id);
    const level = data.nativeLevels.find((l) => l.id === levelId);
    const floors =
      data.walkingSupport?.sourceModelSha256 === data.source.modelSha256 &&
      level
        ? data.walkingSupport.floors.filter(
            (f) => Math.abs(f.elevationFeet - level.elevationFeet) < 0.15,
          )
        : [];
    const parts = floors.flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
    const area = (ps: Rings[]) =>
      ps.reduce(
        (sum, rs) =>
          sum +
          rs.reduce(
            (s, r, i) =>
              s +
              ((i ? -1 : 1) *
                Math.abs(
                  r.reduce((v, p, j) => {
                    const q = r[(j + 1) % r.length];
                    return v + p[0] * q[1] - q[0] * p[1];
                  }, 0),
                )) /
                2,
            0,
          ),
        0,
      );
    // Evaluate contacts near a common local origin. Coincident native faces
    // can differ only in trailing floating-point digits at campus coordinates;
    // passing those directly to the sweep line can throw. This comparison
    // grid is much smaller than the contact overlap and never edits source
    // coordinates or buffers a real gap.
    const origin = patch.ringsFeet[0][0];
    const local = (rings: Rings): Rings =>
      rings.map((ring) =>
        ring.map((p) => [p[0] - origin[0], p[1] - origin[1]]),
      );
    const effectiveParts = boundaryPatchMaterialParts(
      patch,
      preparedReviewedDoorApertures(data),
      data.source.modelSha256,
    );
    const intersects = (rings: Rings) =>
      effectiveParts.some((part) => {
        const [a, b] = nativeBarrierTopology([local(part), local(rings)], 1e8);
        return area(pc.intersection(a, b)) > 1e-8;
      });
    const openings = data.nativeIndoorEnvelopes
      ? []
      : data.records
          .filter((r) => r.levelId === levelId)
          .flatMap((r) => (r.properties.floorOpeningsFeet ?? []) as Point[][]);
    const floorSupport = nativeBoundaryPatchFloorSupport(patch, parts);
    if (
      !floorSupport.supported ||
      (floorSupport.originalContactAllowance &&
        nativeMaterialPlanWalls(data, levelId).some(
          (w) =>
            w.levelId === levelId &&
            !patch.wallEvidence.some(
              (e) =>
                e.nativeElementId === w.nativeElementId &&
                JSON.stringify(e.ringsFeet) === JSON.stringify(w.ringsFeet),
            ) &&
            intersects(w.ringsFeet),
        )) ||
      openings.some((r) => intersects([r])) ||
      data.doors?.some(
        (d) =>
          d.levelId === levelId &&
          d.footprintFeet &&
          intersects([d.footprintFeet]),
      ) ||
      nativeMaterialPlanWalls(data, levelId).some(
        (w) =>
          w.levelId === levelId &&
          w.kind === "column" &&
          !patch.wallEvidence.some(
            (e) =>
              (patch.continuationProof || patch.drawingReconstructionProof) &&
              e.kind === "column" &&
              e.nativeElementId === w.nativeElementId,
          ) &&
          intersects(w.ringsFeet),
      ) ||
      data.circulationGeometry?.fixtures?.some(
        (f) =>
          f.levelIds.includes(levelId) &&
          !patch.wallEvidence.some(
            (e) =>
              (patch.continuationProof || patch.drawingReconstructionProof) &&
              e.kind === "column" &&
              e.nativeElementId === f.nativeElementId,
          ) &&
          intersects(f.ringsFeet),
      )
    )
      throw new Error(
        "The wall continuation crosses unsupported floor, a protected opening, measured door or fixture.",
      );
    if (
      !patch.drawingReconstructionProof &&
      !patch.assumedEnclosureProof &&
      !intersects(patch.wallEvidence[0].ringsFeet)
    )
      throw new Error(
        "The wall continuation must contact both supporting native walls.",
      );
    contactChecks.push(intersects);
    checkedWalls.push(...walls);
  }
  // A full-width corner can need two continuations. Each must touch its own
  // original cap; the linked set must reach the other original support through
  // positive-area overlaps. Edge/point contacts do not complete a corner.
  for (let i = 0; i < patches.length; i++) {
    const reachable = new Set([i]);
    const pending = [i];
    while (pending.length) {
      const current = pending.pop()!;
      for (let j = 0; j < patches.length; j++) {
        if (!reachable.has(j) && contactChecks[current](patches[j].ringsFeet)) {
          reachable.add(j);
          pending.push(j);
        }
      }
    }
    if (
      patches[i].wallEvidence.some(
        (wall) =>
          ![...reachable].some((j) =>
            nativeMaterialPlanWalls(data, levelId).some(
              (current) =>
                !current.reviewPatchId &&
                !current.approximate &&
                current.nativeElementId === wall.nativeElementId &&
                contactChecks[j](current.ringsFeet),
            ),
          ),
      )
    )
      throw new Error(
        "The wall continuation must contact both supporting native walls, directly or through overlapping linked continuations.",
      );
  }
  const result = await deriveNativeAreas(
    { ...data, walls: [...data.walls, ...checkedWalls] },
    levelId,
  );
  return {
    ...result,
    options: structuredClone(options),
    gapCandidates: structuredClone(patches),
  };
}

const preciseGeometry = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v,
  );

/** The worker must reproduce the exact proposal, not merely a nearby gap. */
export function assertBoundaryPatchPreviewResult(
  project: IndoorProject,
  plan: BoundaryPatchPreviewPlan,
  result: NativeAreaResult,
) {
  const patches = plan.patches ?? [plan.patch];
  const current = plan.patches
    ? boundaryPatchGroupPreviewPlan(
        project,
        plan.roomKey,
        patches.map((p) => p.id),
        plan.proposalAuditEvidenceSha256,
      )
    : boundaryPatchPreviewPlan(
        project,
        plan.roomKey,
        plan.patch.id,
        plan.proposalAuditEvidenceSha256,
      );
  if (
    JSON.stringify(current) !== JSON.stringify(plan) ||
    result.levelId !== plan.patch.levelId ||
    result.sourceModelSha256 !== plan.patch.sourceModelSha256 ||
    JSON.stringify(result.options?.previewGapIds) !==
      JSON.stringify(patches.map((p) => p.id)) ||
    (!!plan.patches && result.gapCandidates?.length !== patches.length) ||
    patches.some((patch) => {
      const candidate = result.gapCandidates?.find((c) => c.id === patch.id);
      return (
        !candidate ||
        preciseGeometry(candidate.ringsFeet) !==
          preciseGeometry(patch.ringsFeet) ||
        preciseGeometry(candidate.wallEvidence) !==
          preciseGeometry(patch.wallEvidence) ||
        Math.abs(candidate.widthFeet - patch.widthFeet) > 1e-6 ||
        JSON.stringify([...candidate.nativeDoorIds].sort()) !==
          JSON.stringify([...patch.nativeDoorIds].sort())
      );
    })
  )
    throw new Error(
      "The worker preview does not match the saved native correction. Review its evidence again.",
    );
}

export type ProposalDisplayPreviewPlan = {
  roomKey: string;
  levelId: number;
  kind: ProposalDisplayPreview["kind"];
  partsFeet: Rings[];
  sourceModelSha256: string;
  evidenceSha256: string;
  sourceGeometryKey: string;
  /** Recheck a saved record while its worker runs, without blocking an independently
   * imported current catalog because another saved catalog is historical. */
  savedProposalBinding?: {
    catalogEvidenceSha256: string;
    recordEvidenceSha256: string;
  };
  boundaryProvenance: "source-outline-crop" | "full-native-region";
  /** Present only for full-native replay, which must finish in a worker. */
  nativeRegion?: NativeEnclosureWalkwayPreview;
  options?: NativeAreaOptions;
};
export function proposalDisplayGeometryKey(
  project: IndoorProject,
  levelId: number,
) {
  const d = project.dataset;
  const level = d.nativeLevels.find((l) => l.id === levelId);
  return bytesToHex(
    sha256(
      new TextEncoder().encode(
        JSON.stringify([
          d.source.modelSha256,
          level,
          d.walkingSupport?.sourceModelSha256,
          d.walkingSupport?.floors.filter(
            (f) =>
              level && Math.abs(f.elevationFeet - level.elevationFeet) < 0.15,
          ),
          d.walls.filter((w) => w.levelId === levelId),
          d.doors?.filter((door) => door.levelId === levelId),
          d.records.filter((r) => r.levelId === levelId),
          d.circulationGeometry?.fixtures?.filter((f) =>
            f.levelIds.includes(levelId),
          ),
          d.indoorExclusions,
        ]),
      ),
    ),
  );
}
const polygonArea = (parts: Rings[]) =>
  parts.reduce(
    (n, p) =>
      n +
      p.reduce(
        (s, r, i) =>
          s +
          ((i ? -1 : 1) *
            Math.abs(
              r.reduce((a, q, j) => {
                const next = r[(j + 1) % r.length];
                return a + q[0] * next[1] - next[0] * q[1];
              }, 0),
            )) /
            2,
        0,
      ),
    0,
  );
const bounds = (parts: Rings[]) => {
  const pts = parts.flat(2);
  return [
    Math.min(...pts.map((q) => q[0])),
    Math.min(...pts.map((q) => q[1])),
    Math.max(...pts.map((q) => q[0])),
    Math.max(...pts.map((q) => q[1])),
  ];
};
const intersectsBounds = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Portable display comparison. It neither classifies a place nor creates a route. */
export function proposalDisplayPreviewPlan(
  project: IndoorProject,
  catalog: EnclosureProposals,
  report: VolumeAudit,
  roomKey: string,
): ProposalDisplayPreviewPlan {
  validateEnclosureProposals(catalog);
  const proposal = catalog.records.find((r) => r.key === roomKey);
  if (
    !proposalMatchesModel(catalog, project) ||
    !proposalIsCurrent(catalog, report) ||
    !proposal ||
    !proposalRecordIsCurrent(catalog, proposal, report.reviewEvidenceSha256)
  )
    throw new Error(
      "This display proposal was measured on different or earlier evidence. Re-audit it before previewing.",
    );
  const r = project.dataset.records.find((r) => r.key === roomKey);
  const savedProposalBinding =
    project.rooms.enclosureProposals === catalog
      ? {
          catalogEvidenceSha256: catalog.evidenceSha256,
          recordEvidenceSha256:
            proposal.evidenceSha256 ?? catalog.evidenceSha256,
        }
      : undefined;
  const preview = catalog.records.find(
    (r) => r.key === roomKey,
  )?.displayPreview;
  if (
    project.dataset.nativeIndoorEnvelopes &&
    preview?.kind !== "native-enclosure-walkway"
  )
    throw new Error(
      "This native-only project requires a full native-region preview; historical outline crops cannot define its floor geometry.",
    );
  const level =
    preview &&
    project.dataset.nativeLevels.find((l) => l.id === preview.levelId);
  if (!r || !preview || !level || r.levelId !== preview.levelId || !r.stair)
    throw new Error(
      "A measured landing preview must match this stair place's native level.",
    );
  const currentGeometryKey = proposalDisplayGeometryKey(
    project,
    preview.levelId,
  );
  if (preview.sourceGeometryKey !== currentGeometryKey)
    throw new Error(
      "This landing proposal has stale native geometry. Review it against the current floor.",
    );
  if (
    project.dataset.walkingSupport?.sourceModelSha256 !== catalog.modelSha256 ||
    preview.nativeFloorEvidence.some(
      (e) =>
        Math.abs(e.elevationFeet - level.elevationFeet) >= 0.15 ||
        !project.dataset.walkingSupport?.floors.some(
          (f) =>
            JSON.stringify([
              f.nativeElementId,
              f.elevationFeet,
              f.ringsFeet,
              f.partsFeet,
            ]) ===
            JSON.stringify([
              e.nativeElementId,
              e.elevationFeet,
              e.ringsFeet,
              e.partsFeet,
            ]),
        ),
    )
  )
    throw new Error("This display proposal has stale native slab evidence.");
  if (preview.kind === "native-enclosure-walkway") {
    if (
      !pointInNativeArea(preview.seedPointFeet, r.ringsFeet) ||
      !pointInNativeArea(preview.seedPointFeet, preview.regionRingsFeet) ||
      !preview.diagnostics.roomKeys.includes(roomKey) ||
      preview.nativeFloorIds.some(
        (id) =>
          !preview.nativeFloorEvidence.some((f) => f.nativeElementId === id),
      ) ||
      preview.nativeDoorIds.some(
        (id) =>
          !project.dataset.doors?.some(
            (d) =>
              d.nativeElementId === id &&
              d.levelId === preview.levelId &&
              d.footprintFeet &&
              d.normalFeet,
          ),
      ) ||
      (preview.previewPurpose === "walkway-candidate" &&
        (preview.diagnostics.roomKeys.some((key) => {
          const place = project.dataset.records.find((r) => r.key === key);
          return !place || (!place.circulation && !place.stair);
        }) ||
          preview.diagnostics.exposedFloorEdgeFeet >= 0.1 ||
          preview.diagnostics.doorChecks.some(
            (d) =>
              d.status === "same-region" &&
              !preview.passThroughDoorIds?.includes(d.nativeElementId),
          )))
    )
      throw new Error(
        "This full native preview needs boundary investigation; a shared or open region cannot be certified as a walkway.",
      );
    return structuredClone({
      roomKey,
      levelId: preview.levelId,
      kind: preview.kind,
      partsFeet: preview.partsFeet,
      sourceModelSha256: catalog.modelSha256,
      evidenceSha256: catalog.evidenceSha256,
      ...(savedProposalBinding ? { savedProposalBinding } : {}),
      sourceGeometryKey: currentGeometryKey,
      boundaryProvenance: "full-native-region",
      nativeRegion: preview,
      options: {
        mode: "connected",
        maxGapFeet: 0,
        ...(preview.passThroughDoorIds?.length
          ? { passThroughDoorIds: preview.passThroughDoorIds }
          : {}),
      },
    });
  }
  const parts = preview.partsFeet;
  const support = preview.nativeFloorEvidence.flatMap(
    (f) => f.partsFeet ?? [f.ringsFeet],
  );
  const area = polygonArea(parts);
  const box = bounds(parts);
  const barriers = project.dataset.walls
    .filter(
      (w) =>
        w.levelId === preview.levelId &&
        !w.approximate &&
        intersectsBounds(box, bounds([w.ringsFeet])),
    )
    .map((w) => w.ringsFeet);
  const holes = project.dataset.records
    .filter((r) => r.levelId === preview.levelId)
    .flatMap((r) =>
      ((r.properties.floorOpeningsFeet ?? []) as Point[][]).map((h) => [h]),
    );
  const fixtures =
    project.dataset.circulationGeometry?.fixtures
      ?.filter(
        (f) =>
          f.levelIds.includes(preview.levelId) &&
          intersectsBounds(box, bounds([f.ringsFeet])),
      )
      .map((f) => f.ringsFeet) ?? [];
  const excluded = indoorExclusionParts(project.dataset, level.elevationFeet);
  if (
    !Number.isFinite(area) ||
    area <= 0 ||
    polygonArea(pc.difference(parts, ...support)) > 0.001 ||
    polygonArea(pc.difference(parts, r.ringsFeet)) > 0.001 ||
    [...barriers, ...holes, ...fixtures, ...excluded].some(
      (b) => polygonArea(pc.intersection(parts, b)) > 0.001,
    )
  )
    throw new Error(
      "The proposed landing extends outside supported room floor or crosses a solid barrier/protected opening.",
    );
  return structuredClone({
    roomKey,
    levelId: preview.levelId,
    kind: preview.kind,
    partsFeet: parts,
    sourceModelSha256: catalog.modelSha256,
    evidenceSha256: catalog.evidenceSha256,
    ...(savedProposalBinding ? { savedProposalBinding } : {}),
    sourceGeometryKey: currentGeometryKey,
    boundaryProvenance: "source-outline-crop",
  });
}

/** Run after deriveNativeAreas in the worker, never with a hand-built region.
 * Exact whole-region equality forbids source crops, hulls and arbitrary strips. */
export function assertProposalDisplayPreviewResult(
  project: IndoorProject,
  plan: ProposalDisplayPreviewPlan,
  result: NativeAreaResult,
) {
  assertProposalDisplayPreviewPlan(project, plan);
  const preview = plan.nativeRegion;
  const region =
    preview && result.regions.find((r) => r.id === preview.regionId);
  const options = result.options;
  const checks =
    region &&
    result.doorChecks.filter((d) => d.sideRegionIds.includes(region.id));
  const fail = () => {
    throw new Error(
      "The full native preview does not match the current uncropped native region. Recheck walls, doors and protected openings.",
    );
  };
  if (
    plan.kind !== "native-enclosure-walkway" ||
    !preview ||
    !region ||
    plan.boundaryProvenance !== "full-native-region" ||
    result.levelId !== plan.levelId ||
    result.sourceModelSha256 !== plan.sourceModelSha256 ||
    result.geometrySha256 !== preview.nativeAreaGeometrySha256 ||
    result.cropEvidence ||
    !options ||
    options.mode !== "connected" ||
    options.maxGapFeet !== 0 ||
    options.roomKey !== undefined ||
    options.cropPolygonFeet !== undefined ||
    options.nativeFloorId !== undefined ||
    options.manualGapPoints !== undefined ||
    options.previewGapIds?.length ||
    preciseGeometry(options.passThroughDoorIds ?? []) !==
      preciseGeometry(preview.passThroughDoorIds ?? []) ||
    result.gapCandidates?.length ||
    preciseGeometry(region.ringsFeet) !==
      preciseGeometry(preview.regionRingsFeet) ||
    preciseGeometry(region.nativeFloorIds) !==
      preciseGeometry(preview.nativeFloorIds) ||
    preciseGeometry(region.nativeDoorIds) !==
      preciseGeometry(preview.nativeDoorIds) ||
    preciseGeometry(region.roomKeys) !==
      preciseGeometry(preview.diagnostics.roomKeys) ||
    Math.abs(
      region.exposedFloorEdgeFeet - preview.diagnostics.exposedFloorEdgeFeet,
    ) > 1e-6 ||
    preciseGeometry(checks) !==
      preciseGeometry(preview.diagnostics.doorChecks) ||
    !pointInNativeArea(preview.seedPointFeet, region.ringsFeet)
  )
    fail();
  // Polygon equivalence accepts triangulated or unioned display parts but not
  // even a thin unsupported addition, missing landing strip or filled aperture.
  const exact = [region!.ringsFeet];
  if (
    polygonArea(pc.difference(plan.partsFeet, ...exact)) > 1e-6 ||
    polygonArea(pc.difference(exact, ...plan.partsFeet)) > 1e-6 ||
    preciseGeometry(plan.partsFeet) !== preciseGeometry(preview!.partsFeet)
  )
    fail();
}

export function assertProposalDisplayPreviewPlan(
  project: IndoorProject,
  plan: ProposalDisplayPreviewPlan,
) {
  if (
    project.dataset.nativeIndoorEnvelopes &&
    (plan.kind !== "native-enclosure-walkway" ||
      plan.boundaryProvenance !== "full-native-region")
  )
    throw new Error(
      "This native-only project requires a full native-region preview; historical outline crops cannot define its floor geometry.",
    );
  const catalog = project.rooms.enclosureProposals;
  const proposal = catalog?.records.find((r) => r.key === plan.roomKey);
  if (
    (plan.savedProposalBinding &&
      (!catalog ||
        !proposal ||
        !proposalRecordIsCurrent(catalog, proposal, plan.evidenceSha256) ||
        catalog.evidenceSha256 !==
          plan.savedProposalBinding.catalogEvidenceSha256 ||
        (proposal.evidenceSha256 ?? catalog.evidenceSha256) !==
          plan.savedProposalBinding.recordEvidenceSha256)) ||
    plan.sourceModelSha256 !== project.dataset.source.modelSha256 ||
    plan.sourceGeometryKey !==
      proposalDisplayGeometryKey(project, plan.levelId) ||
    !project.dataset.records.some(
      (r) => r.key === plan.roomKey && r.levelId === plan.levelId && r.stair,
    )
  )
    throw new Error(
      "The landing preview belongs to earlier geometry. Recheck its evidence.",
    );
}
