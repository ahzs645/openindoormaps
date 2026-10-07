import type { IndoorDataset } from "./contract";
import type { IndoorProject } from "./package";
import type { NativeBoundaryPatch } from "./native-boundary-patches";
import {
  pinRecommendationGeometryHash,
  pinRecommendations,
  type PinDecision,
} from "./pin-recommendations";
import { reviewFileBytes } from "./review-bundle";
import { saveReviewCompanion } from "./review-companion-save";
export type PinPatchDecision = PinDecision & {
  patchId: string;
  patchSha256: string;
};
export type PinPatchDecisions = {
  format: "openindoormaps-pin-patch-decisions";
  version: 1;
  sourceModelSha256: string;
  decisions: PinPatchDecision[];
};
export async function patchEvidenceHash(patch: NativeBoundaryPatch) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(patch)),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function readPinPatchDecisions(
  project: IndoorProject,
): PinPatchDecisions {
  const empty: PinPatchDecisions = {
    format: "openindoormaps-pin-patch-decisions",
    version: 1,
    sourceModelSha256: project.dataset.source.modelSha256,
    decisions: [],
  };
  const file = project.rooms.reviewBundle?.files.find(
    (f) => f.path === "pin-review/patch-decisions.json",
  );
  if (!file) return empty;
  try {
    const value = JSON.parse(
      new TextDecoder().decode(reviewFileBytes(file)),
    ) as PinPatchDecisions;
    if (
      value.format !== empty.format ||
      value.version !== 1 ||
      value.sourceModelSha256 !== empty.sourceModelSha256 ||
      !Array.isArray(value.decisions) ||
      value.decisions.length > 10000
    )
      return empty;
    return {
      ...value,
      decisions: value.decisions.filter(
        (d) =>
          d &&
          typeof d.recommendationId === "string" &&
          typeof d.patchId === "string" &&
          [d.patchSha256, d.evidenceSha256, d.geometrySha256].every(
            (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s),
          ) &&
          ["accept", "reject", "more-evidence"].includes(d.decision) &&
          typeof d.notes === "string" &&
          d.notes.length <= 4000 &&
          typeof d.reviewedAt === "string",
      ),
    };
  } catch {
    return empty;
  }
}
export function matchingPatchDecision(
  decisions: PinPatchDecision[],
  recommendationId: string,
  patchId: string,
  evidenceSha256: string,
  geometrySha256: string | undefined,
  patchSha256: string | undefined,
) {
  return decisions.find(
    (d) =>
      d.recommendationId === recommendationId &&
      d.patchId === patchId &&
      d.evidenceSha256 === evidenceSha256 &&
      d.geometrySha256 === geometrySha256 &&
      d.patchSha256 === patchSha256,
  );
}
export async function savePinPatchDecision(
  project: IndoorProject,
  recommendationId: string,
  patchId: string,
  decision: PinDecision["decision"],
  notes: string,
  verifiedGeometrySha256?: string,
) {
  const geometrySha256 =
    verifiedGeometrySha256 ??
    (await pinRecommendationGeometryHash(project.dataset));
  const entry = pinRecommendations(project, geometrySha256).find(
    (e) => e.recommendation.id === recommendationId,
  );
  if (!entry?.current)
    throw new Error(
      "Recommendation belongs to older geometry. Refresh its evidence before reviewing patches.",
    );
  const patch = project.rooms.nativeBoundaryPatches?.patches.find(
    (p) => p.id === patchId,
  );
  if (
    !entry.recommendation.patchIds.includes(patchId) ||
    !patch ||
    patch.sourceModelSha256 !== project.dataset.source.modelSha256
  )
    throw new Error(
      "Patch does not belong to this recommendation and source model.",
    );
  if (
    !["accept", "reject", "more-evidence"].includes(decision) ||
    !notes.trim() ||
    notes.length > 4000
  )
    throw new Error(
      "Choose a decision and add a note (up to 4000 characters).",
    );
  const old = readPinPatchDecisions(project);
  const record: PinPatchDecision = {
    recommendationId,
    patchId,
    decision,
    notes: notes.trim(),
    geometrySha256,
    patchSha256: await patchEvidenceHash(patch),
    evidenceSha256: entry.evidenceSha256,
    roomsSha256: project.dataset.source.roomsSha256,
    reviewedAt: new Date().toISOString(),
  };
  return saveReviewCompanion(project, "pin-review/patch-decisions.json", {
    ...old,
    decisions: [
      ...old.decisions.filter(
        (d) => d.recommendationId !== recommendationId || d.patchId !== patchId,
      ),
      record,
    ],
  });
}
/** Resolve accepted scope in the worker, binding exact patches and the current dataset again. */
export async function acceptedPinPatches(
  data: IndoorDataset,
  patches: NativeBoundaryPatch[],
  review: {
    decisions: PinPatchDecisions;
    recommendationId: string;
    evidenceSha256: string;
  },
) {
  if (review.decisions.sourceModelSha256 !== data.source.modelSha256) return [];
  const geometrySha256 = await pinRecommendationGeometryHash(data);
  const hashes = await Promise.all(patches.map((p) => patchEvidenceHash(p)));
  return patches.filter(
    (p, i) =>
      matchingPatchDecision(
        review.decisions.decisions,
        review.recommendationId,
        p.id,
        review.evidenceSha256,
        geometrySha256,
        hashes[i],
      )?.decision === "accept",
  );
}
