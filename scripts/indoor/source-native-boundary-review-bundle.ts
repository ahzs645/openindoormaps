/** Atomic authoring review of source-bound boundary supersessions. No visitor
 * receipt, serialized approval, old proxy footprint or assumed owner union can
 * admit these changes. The complete final recipe set is replayed before return. */
import assert from "node:assert/strict";
import {
  nativeBoundaryMemberDigest as sha,
  checkNoNewMaterialBeyondFirstNativeSurface,
} from "./source-native-boundary-member-review";
import { architecturalPlanGeometry } from "../../../reviter/lib/reviter/architectural-plan.ts";
import {
  directoryDoorReviews,
  directoryDoors,
} from "../../../reviter/lib/reviter/directory-navigation.ts";
import {
  splitGeneratedLandingDoorLinks,
  type RoomDirectoryData,
} from "../../../reviter/lib/reviter/room-directory.ts";
import { supportedSemanticDoorLinks } from "../../../reviter/lib/reviter/semantic-door-links.ts";
import { nativeWallPositionRepairedWalls } from "../../../reviter/lib/reviter/native-wall-position-repairs.ts";
import { nativeMaterialPlanWalls } from "../../../reviter/lib/reviter/native-material-plan.ts";
import { deriveNativeMaterialSectionSupplement } from "../../../reviter/lib/reviter/native-material-section-supplement-derive.ts";
import { verifyNativeMaterialSections } from "../../../reviter/lib/reviter/native-material-sections.ts";
import {
  routingFloorPlateRecords,
  nativeFloorPolygons,
} from "../../../reviter/lib/reviter/routing-floor-support.ts";
import { validateIndoorExclusions } from "../../../reviter/lib/reviter/indoor-exclusions.ts";
import {
  reviewedBoundaryWalls,
  validateNativeBoundaryPatches,
  validateCurrentBoundaryContacts,
  boundaryPatchMaterialParts,
  validNativeContinuation,
  type NativeBoundaryPatch,
  type BoundaryWall,
} from "../../../reviter/lib/reviter/native-boundary-patches.ts";
import {
  nativeRationalOverlay as overlay,
  rational,
  type NativeRationalParts,
} from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import {
  orient2d,
  sub,
  mul,
  div,
  compare,
} from "../../../reviter/lib/reviter/vendor/native-rational-overlay-arithmetic.mjs";
import {
  verifyNativeIndoorEnvelopes,
  nativeIndoorEnvelopeParts,
} from "../../../reviter/lib/reviter/native-indoor-envelopes.ts";
import {
  nativeSlabJoinClosures,
  nativeWalkingFloorsWithSlabJoins,
  NATIVE_SLAB_JOIN_CLOSURES_VERSION,
} from "../../../reviter/lib/reviter/native-slab-join-closures.ts";
import type { IndoorDataset } from "../../../reviter/lib/reviter/indoor-contract.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
export type NativeBoundaryCurrentSourceCapReview = {
  originalSourceCapFeet: [[number, number], [number, number]];
  originalSourceEvidenceSha256: string;
  sourceNativeBodySha256: string;
  currentSourceSectionsSha256: string;
  currentSourcePartSha256: string;
  currentSourceCapFeet: [[number, number], [number, number]];
};
export type ExistingBoundaryWalkingSupportReview = {
  kind: "existing-native-slab-join-support";
  nativeFloorIds: number[];
  sourceFloorRecordsSha256: string;
  boundEnvelopeSha256: string;
  walkingAuthorityVersion: typeof NATIVE_SLAB_JOIN_CLOSURES_VERSION;
};
export type NativeBoundaryReviewBundleEntry = {
  oldPatchId: string;
  oldPatchSha256: string;
  kind:
    | "native-member"
    | "native-column-cap"
    | "native-column-cap-current-source"
    | "registered-drawing-column";
  sourceWallId: number;
  targetNativeElementId: number;
  targetNativeBodySha256: string;
  targetNativeHostRelationsSha256?: string;
  sourceCapReview?: NativeBoundaryCurrentSourceCapReview;
  floorSupportReview?: ExistingBoundaryWalkingSupportReview;
  replacementPatches: NativeBoundaryPatch[];
};
export type NativeBoundaryReviewBundle = {
  format: "source-native-boundary-review-bundle-v1";
  sourceModelSha256: string;
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
  entries: NativeBoundaryReviewBundleEntry[];
};
export type NativeBoundaryReviewBundlePhysicalGuards = {
  currentAllPatchContacts: true;
  currentHistoricalBinding: true;
  nativeFloorIds: number[];
  floorGeometrySha256: string;
  physicalMaterialSha256: string;
  doorsSha256: string;
  doorFootprintIntersections: 0;
  reviewedApertureIntersections: 0;
  exclusionIntersections: 0;
  fullCurrentSourceCapOrRegisteredBody: true;
  completeCurrentColumnOrMemberEvidence: true;
  firstMaterial: ReturnType<typeof checkNoNewMaterialBeyondFirstNativeSurface>;
  floorSupport: ReturnType<typeof checkBoundaryExistingWalkingFloorSupport>;
  registeredBodyUnchanged?: true;
  sourceRegistrationEvidencePreserved?: true;
  excludedOriginalRegisteredSupportingPartSha256?: string;
  registeredSourceSupportReview?: ReturnType<
    typeof checkRegisteredBodyNativeShadow
  >["registeredSourceSupportReview"];
  currentSourceCapReview?: NativeBoundaryCurrentSourceCapReview & {
    currentSourcePartFeet: BoundaryWall["ringsFeet"];
    currentSourceSectionsFeet: BoundaryWall["ringsFeet"][];
    allCurrentSourceOwnerVerticesInward: true;
    originalFullWallAxisContractRetained: true;
    noSourceMaterialExemption: true;
    originalBodyAxisFeet: [[number, number], [number, number]];
    originalBodyThicknessFeet: number;
  };
};
export type NativeBoundaryReviewBundleReceipt = {
  format: "checked-native-boundary-review-bundle-v1";
  physicalGuardsWaived: false;
  sourceModelSha256: string;
  originalSourceRoomsSha256: string;
  nativeCacheSha256: string;
  sourceBeforeSha256: string;
  sourceAfterSha256: string;
  reviewSha256: string;
  entries: {
    oldPatchId: string;
    kind: NativeBoundaryReviewBundleEntry["kind"];
    originalRecord: NativeBoundaryPatch;
    retainedRecord: NativeBoundaryPatch;
    newAppliedRecords: NativeBoundaryPatch[];
    physicalGuards: NativeBoundaryReviewBundlePhysicalGuards[];
  }[];
  sourcePreservation: {
    onlyEnumeratedPatchRecordsAndPortableEvidenceAppendChanged: true;
    allOtherSourceReferencesUnchanged: true;
  };
  finalValidation: {
    currentAllPatchContacts: true;
    currentHistoricalBinding: true;
    appliedBefore: number;
    appliedAfter: number;
  };
  portableSourceEvidence: {
    priorCount: number;
    afterCount: number;
    appendedRecord: {
      format: "source-native-boundary-review-evidence-v1";
      sourceModelSha256: string;
      reviewSha256: string;
      review: NativeBoundaryReviewBundle;
    };
  };
  sourceMaterialGeometrySha256: string;
  sourceSupplementGeometrySha256?: string;
};
export function nativeBoundaryReviewBundleEntryEvidenceSha256(
  bundle: NativeBoundaryReviewBundle,
  entry: NativeBoundaryReviewBundleEntry,
  patch: NativeBoundaryPatch,
) {
  const plain = {
    ...patch,
    ...(patch.continuationProof
      ? {
          continuationProof: {
            ...patch.continuationProof,
            evidenceSha256: undefined,
          },
        }
      : {}),
    ...(patch.drawingReconstructionProof
      ? {
          drawingReconstructionProof: {
            ...patch.drawingReconstructionProof,
            evidenceSha256: undefined,
          },
        }
      : {}),
  };
  return sha([
    bundle.format,
    bundle.sourceModelSha256,
    bundle.sourceRoomsSha256,
    bundle.nativeCacheSha256,
    entry.oldPatchId,
    entry.oldPatchSha256,
    entry.kind,
    entry.sourceWallId,
    entry.targetNativeElementId,
    entry.targetNativeBodySha256,
    entry.targetNativeHostRelationsSha256 ?? null,
    entry.sourceCapReview ?? null,
    entry.floorSupportReview ?? null,
    plain,
  ]);
}
const digest = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const complete = (w: BoundaryWall) =>
  (w as BoundaryWall & { geometrySource?: string }).geometrySource ===
  "original-native-material-section";
const exactOrient = (
  a: [number, number],
  b: [number, number],
  p: [number, number],
) =>
  orient2d(
    rational(a[0]),
    rational(a[1]),
    rational(b[0]),
    rational(b[1]),
    rational(p[0]),
    rational(p[1]),
  );
const determinant = (
  a: [number, number],
  b: [number, number],
  p: [number, number],
) =>
  sub(
    mul(
      sub(rational(b[0]), rational(a[0])),
      sub(rational(p[1]), rational(a[1])),
    ),
    mul(
      sub(rational(b[1]), rational(a[1])),
      sub(rational(p[0]), rational(a[0])),
    ),
  );
/** Positive finite segment coverage in a convex original part, without rounding intersection points. */
function convexCapOverlap(
  a: [number, number],
  b: [number, number],
  ring: [number, number][],
) {
  let lo = rational(0),
    hi = rational(1);
  const turns = new Set(
    ring
      .map((p, i) =>
        exactOrient(
          p,
          ring[(i + 1) % ring.length]!,
          ring[(i + 2) % ring.length]!,
        ),
      )
      .filter(Boolean),
  );
  if (turns.size !== 1) return false;
  const sign = -[...turns][0]!;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!,
      q = ring[(i + 1) % ring.length]!,
      h0 = mul(determinant(p, q, a), rational(sign)),
      h1 = mul(determinant(p, q, b), rational(sign)),
      s0 = compare(h0, 0),
      s1 = compare(h1, 0);
    if (s0 < 0 && s1 < 0) return false;
    if (s0 < 0 || s1 < 0) {
      const t = rational(div(sub(rational(0), h0), sub(h1, h0)));
      if (s0 < 0 && compare(t, lo) > 0) lo = t;
      if (s1 < 0 && compare(t, hi) < 0) hi = t;
    }
    if (compare(lo, hi) >= 0) return false;
  }
  return compare(lo, hi) < 0;
}
const ringParts = (walls: readonly BoundaryWall[], owner: number) =>
  walls
    .filter((w) => w.nativeElementId === owner && complete(w))
    .map((w) => w.ringsFeet);
const rationalPartsSha = (parts: NativeRationalParts) =>
  sha(
    parts.map((part) =>
      part.map((ring) =>
        ring.map((point) => point.map((q) => [String(q.n), String(q.d)])),
      ),
    ),
  );
/** Raw source slabs remain unchanged. The only additional support this authoring
 * check may use is the SAME existing exact walking join policy, independently
 * restricted to the explicitly named original slabs and bound indoor envelope. */
export function checkBoundaryExistingWalkingFloorSupport(
  patch: NativeBoundaryPatch,
  records: ReturnType<typeof routingFloorPlateRecords>,
  envelope: BoundaryWall["ringsFeet"][],
  envelopeSha256: string | undefined,
  review?: ExistingBoundaryWalkingSupportReview,
) {
  const original = records.flatMap((f) => nativeFloorPolygons(f, true)),
    unsupported = overlay("difference", [patch.ringsFeet], original);
  if (!unsupported.length) {
    assert.equal(
      review,
      undefined,
      "A slab-join review must reproduce its raw native floor refusal",
    );
    return {
      rawNativeFloorUnsupportedPartCount: 0 as const,
      originalSlabsUnchanged: true as const,
    };
  }
  assert(
    review?.kind === "existing-native-slab-join-support",
    "Replacement leaves original native floor or fills a real floor hole",
  );
  assert.equal(
    review.walkingAuthorityVersion,
    NATIVE_SLAB_JOIN_CLOSURES_VERSION,
    "Existing walking join authority changed",
  );
  assert(
    envelope.length && digest(envelopeSha256),
    "Bound original indoor envelope required",
  );
  assert.equal(
    review.boundEnvelopeSha256,
    envelopeSha256,
    "Original indoor walking envelope changed",
  );
  assert(
    Array.isArray(review.nativeFloorIds) &&
      review.nativeFloorIds.length >= 2 &&
      review.nativeFloorIds.every(Number.isSafeInteger) &&
      new Set(review.nativeFloorIds).size === review.nativeFloorIds.length,
    "Distinct named original native slabs required",
  );
  const named = review.nativeFloorIds.map((id) => {
    const matches = records.filter((f) => f.elementId === id);
    assert.equal(
      matches.length,
      1,
      "Named original native slab identity missing or ambiguous",
    );
    return matches[0]!;
  });
  assert.equal(
    sha(named),
    review.sourceFloorRecordsSha256,
    "Original named native floor records changed",
  );
  const holes = original.flatMap((part) => part.slice(1));
  assert.equal(
    holes.filter(
      (h) => overlay("intersection", [patch.ringsFeet], [[h]]).length,
    ).length,
    0,
    "A real original native floor hole remains forbidden",
  );
  const joins = nativeSlabJoinClosures(
      named.map((f) => ({
        nativeElementId: f.elementId,
        partsFeet: nativeFloorPolygons(f, true),
      })),
    ),
    joinInside = overlay("intersection", joins, envelope);
  assert.equal(
    overlay("difference", unsupported, joinInside).length,
    0,
    "Unsupported material is outside the existing named slab-join authority",
  );
  assert.equal(
    overlay("difference", unsupported, envelope).length,
    0,
    "Existing numerical joins may not extend outside the bound indoor envelope",
  );
  const authority = nativeWalkingFloorsWithSlabJoins(original, envelope);
  assert.equal(
    overlay("difference", unsupported, authority).length,
    0,
    "Current unchanged walking authority refuses this source join",
  );
  return {
    rawNativeFloorUnsupportedPartCount: unsupported.length,
    originalSlabsUnchanged: true as const,
    existingWalkingSupport: {
      ...review,
      rawNativeFloorRefused: true as const,
      onlyExistingWalkingAuthorityUsed: true as const,
      noNewTolerance: true as const,
      originalFloorHoleIntersections: 0 as const,
      unsupportedOutsideNamedJoinParts: 0 as const,
      unsupportedOutsideBoundEnvelopeParts: 0 as const,
      unsupportedOutsideCurrentWalkingAuthorityParts: 0 as const,
      rawUnsupportedGeometrySha256: rationalPartsSha(unsupported),
      namedJoinGeometrySha256: rationalPartsSha(joins),
      boundJoinGeometrySha256: rationalPartsSha(joinInside),
    },
  };
}
/** This basis is diagnostic only, never an invented native continuation. The
 * source remains the complete registered drawing body. Excluding its ONE bound
 * original supporting part permits its measured missing run; disconnected
 * source-owner parts and every other original member remain in the shadow. */
export function checkRegisteredBodyNativeShadow(
  patch: NativeBoundaryPatch,
  sourceWallId: number,
  physical: BoundaryWall[],
) {
  const proof = patch.drawingReconstructionProof!,
    r = proof.registeredRingsFeet[0]!,
    target = patch.wallEvidence.find(
      (w) => w.nativeElementId !== sourceWallId,
    )!,
    source = patch.wallEvidence.find(
      (w) => w.nativeElementId === sourceWallId,
    )!;
  const lengths = r.map((p, i) =>
      Math.hypot(p[0] - r[(i + 1) % 4]![0], p[1] - r[(i + 1) % 4]![1]),
    ),
    minimum = Math.min(...lengths),
    tc = target.ringsFeet[0]!.reduce(
      (s, p) => [
        s[0] + p[0] / target.ringsFeet[0]!.length,
        s[1] + p[1] / target.ringsFeet[0]!.length,
      ],
      [0, 0],
    );
  const candidates = r.flatMap((a, i) => {
    if (
      lengths[i]! - minimum >
      16 * Number.EPSILON * Math.max(1, ...r.flat().map(Math.abs))
    )
      return [];
    const b = r[(i + 1) % 4]!,
      c = patch.ringsFeet[0]![(i + 3) % 4]!,
      d = patch.ringsFeet[0]![(i + 2) % 4]!,
      m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      end = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2],
      toward =
        (end[0]! - m[0]!) * (tc[0]! - m[0]!) +
        (end[1]! - m[1]!) * (tc[1]! - m[1]!);
    return toward > 0 ? [{ a, b, c, d, toward }] : [];
  });
  assert(
    candidates.length,
    "The registered source body has no finite target-facing cap",
  );
  candidates.sort((a, b) => b.toward - a.toward);
  const chosen = candidates[0]!;
  const supports = physical.filter((w) => {
    if (
      !complete(w) ||
      w.nativeElementId !== sourceWallId ||
      w.ringsFeet.length !== 1
    )
      return false;
    const ring = w.ringsFeet[0]!;
    if (
      !convexCapOverlap(chosen.a, chosen.b, ring) ||
      !overlay("intersection", [proof.registeredRingsFeet], [w.ringsFeet])
        .length
    )
      return false;
    const sides = new Set(
      ring.map((p) => exactOrient(chosen.a, chosen.b, p)).filter(Boolean),
    );
    return sides.has(-1) && sides.has(1);
  });
  assert.equal(
    supports.length,
    1,
    "Registered body requires one complete convex current native part crossing its registered source cap",
  );
  const supporting = supports[0]!;
  const retained = physical.filter((w) => w !== supporting),
    virtual = {
      ...patch,
      continuationProof: {
        sourceWallId,
        sourceCapFeet: [chosen.a, chosen.b] as [
          [number, number],
          [number, number],
        ],
        targetContactFeet: [chosen.c, chosen.d] as [
          [number, number],
          [number, number],
        ],
        evidenceSha256: proof.evidenceSha256,
      },
    };
  return {
    firstMaterial: checkNoNewMaterialBeyondFirstNativeSurface(
      virtual,
      retained,
    ),
    excludedOriginalRegisteredSupportingPartSha256: sha(supporting.ringsFeet),
    registeredSourceSupportReview: {
      sourceNativeElementId: sourceWallId,
      currentSourcePartFeet: supporting.ringsFeet,
      currentSourceSectionsFeet: ringParts(physical, sourceWallId),
      registeredSourceCapFeet: [chosen.a, chosen.b] as [
        [number, number],
        [number, number],
      ],
      exactPositiveFiniteCapOverlap: true as const,
      completeConvexNoHolePart: true as const,
      allOtherSameOwnerPartsRetained: true as const,
    },
  };
}
export async function roomsWithCheckedNativeBoundaryReviewBundle<
  T extends RoomDirectoryData,
>(
  rooms: T,
  context: IndoorDataset,
  model: ConvertResult,
  options: {
    sourceRoomsSha256: string;
    nativeCacheSha256: string;
    review: NativeBoundaryReviewBundle;
  },
): Promise<{ rooms: T; receipt: NativeBoundaryReviewBundleReceipt }> {
  const review = options.review,
    before = sha(rooms),
    modelSha = context.source.modelSha256;
  assert(
    review?.format === "source-native-boundary-review-bundle-v1",
    "An explicit boundary source review bundle is required",
  );
  assert(
    [
      review.sourceModelSha256,
      review.sourceRoomsSha256,
      review.nativeCacheSha256,
    ].every(digest),
    "Invalid source bundle digests",
  );
  assert.equal(review.sourceModelSha256, modelSha, "Source model changed");
  assert.equal(
    review.sourceRoomsSha256,
    options.sourceRoomsSha256,
    "Original source room bytes changed",
  );
  assert.equal(
    context.source.roomsSha256,
    options.sourceRoomsSha256,
    "Original physical context belongs to different source room bytes",
  );
  assert.equal(
    review.nativeCacheSha256,
    options.nativeCacheSha256,
    "Original decoded native cache bytes changed",
  );
  assert(
    Array.isArray(review.entries) &&
      review.entries.length > 0 &&
      review.entries.length <= 100,
    "Finite explicit source entries required",
  );
  assert.equal(
    new Set(review.entries.map((e) => e.oldPatchId)).size,
    review.entries.length,
    "Duplicate original review identities",
  );
  assert(
    rooms.nativeMaterialSections,
    "Hydrated original material is required",
  );
  await verifyNativeMaterialSections(rooms.nativeMaterialSections, modelSha);
  assert.equal(
    context.nativeMaterialSections?.geometrySha256,
    rooms.nativeMaterialSections.geometrySha256,
    "Original physical/source material contexts differ",
  );
  validateNativeBoundaryPatches(rooms.nativeBoundaryPatches, modelSha);
  const nativeLevels = model.levels
    .filter(
      (l) => Number.isSafeInteger(l.levelId) && Number.isFinite(l.elevation),
    )
    .map((l) => ({
      id: l.levelId!,
      name: l.name ?? `Level ${l.levelId}`,
      elevationFeet: l.elevation,
    }));
  assert.deepEqual(
    nativeLevels,
    context.nativeLevels,
    "Original native levels changed",
  );
  const walls: IndoorDataset["walls"] = [],
    doors: NonNullable<IndoorDataset["doors"]> = [],
    immediate = splitGeneratedLandingDoorLinks(
      rooms.navigation?.doorLinks ?? [],
    ).immediate,
    semantic = supportedSemanticDoorLinks(model, rooms, modelSha, immediate);
  for (const levelId of new Set(rooms.annotations.map((r) => r.levelId))) {
    const g = architecturalPlanGeometry(model, levelId);
    walls.push(
      ...[
        ...g.walls.map((w) => ({ ...w, kind: "wall" as const })),
        ...g.columns.map((w) => ({ ...w, kind: "column" as const })),
      ]
        .filter((w) => w.polygon.length >= 3)
        .map((w) => ({
          levelId,
          nativeElementId: w.elementId,
          kind: w.kind,
          approximate: w.approximate,
          ringsFeet: [w.polygon],
        })),
    );
    doors.push(
      ...directoryDoorReviews(
        rooms.annotations.filter((r) => r.levelId === levelId),
        directoryDoors(model, levelId),
        semantic.links,
        immediate,
      ).map(({ door, candidates, state, portal }) => ({
        id: `door:${levelId}:${door.id}`,
        levelId,
        nativeElementId: door.id,
        pointFeet: door.point,
        footprintFeet: door.footprint,
        normalFeet: door.normal,
        roomKeys: portal?.rooms ?? candidates,
        state,
      })),
    );
  }
  const derived = deriveNativeMaterialSectionSupplement(
      model,
      rooms.nativeMaterialSections,
    ),
    stage: IndoorDataset = {
      ...context,
      nativeLevels,
      walls,
      doors,
      nodes: [],
      edges: [],
      nativeMaterialSections: rooms.nativeMaterialSections,
      nativeMaterialSectionSupplement: derived.supplement,
      nativeWallPositionRepairs: rooms.nativeWallPositionRepairs,
      nativeIndoorEnvelopes: rooms.nativeIndoorEnvelopes,
      nativeProvisionalCornerSeals: rooms.nativeProvisionalCornerSeals,
      nativeDerivedFrameReturns: rooms.nativeDerivedFrameReturns,
    };
  const elevations = new Set([
      ...nativeLevels.map((l) => l.elevationFeet),
      ...context.records.map((r) => r.elevationFeet),
    ]),
    floorMap = new Map(
      [...elevations]
        .flatMap((z) => routingFloorPlateRecords(model, z))
        .map((f) => [f.elementId, f]),
    );
  stage.walkingSupport = {
    version: 1,
    sourceModelSha256: modelSha,
    floors: [...floorMap.values()]
      .sort((a, b) => a.elementId - b.elementId)
      .map((f) => ({
        nativeElementId: f.elementId,
        elevationFeet: f.boundsFeet.max.z,
        ringsFeet: nativeFloorPolygons(f, !!stage.nativeIndoorEnvelopes)[0]!,
        partsFeet: nativeFloorPolygons(f, !!stage.nativeIndoorEnvelopes),
      })),
  };
  stage.walls = nativeWallPositionRepairedWalls(stage, {
    deferPhysicalChecks: true,
  });
  await verifyNativeIndoorEnvelopes(stage.nativeIndoorEnvelopes, modelSha);
  validateIndoorExclusions(rooms.indoorExclusions, modelSha, nativeLevels);
  const current = new Map<number, BoundaryWall[]>(),
    material = (levelId: number) => {
      if (!current.has(levelId))
        current.set(
          levelId,
          nativeMaterialPlanWalls(stage, levelId, rooms.reviewedDoorApertures),
        );
      return current.get(levelId)!;
    },
    floorCache = new Map<
      number,
      {
        records: ReturnType<typeof routingFloorPlateRecords>;
        parts: NativeRationalParts;
        geometrySha256: string;
      }
    >(),
    floorAt = (levelId: number) => {
      if (!floorCache.has(levelId)) {
        const level = nativeLevels.find((l) => l.id === levelId)!;
        assert(level, "Original native level missing");
        const records = routingFloorPlateRecords(model, level.elevationFeet),
          parts = records.flatMap((f) => nativeFloorPolygons(f, true));
        assert(parts.length, "No original native floor support exists");
        floorCache.set(levelId, {
          records,
          parts: overlay("union", parts),
          geometrySha256: sha(records),
        });
      }
      return floorCache.get(levelId)!;
    };
  const oldRecords = new Map(
      rooms.nativeBoundaryPatches!.patches.map((p) => [p.id, p]),
    ),
    newIds = new Set<string>(),
    retained = new Map<string, NativeBoundaryPatch>(),
    appended: NativeBoundaryPatch[] = [],
    receiptEntries: NativeBoundaryReviewBundleReceipt["entries"] = [];
  for (const entry of review.entries) {
    try {
      assert(
        [
          "native-member",
          "native-column-cap",
          "native-column-cap-current-source",
          "registered-drawing-column",
        ].includes(entry.kind),
        "Unknown source review kind",
      );
      assert(
        entry.kind === "native-column-cap-current-source" ||
          entry.sourceCapReview === undefined,
        "Current source cap evidence requires its explicit review variant",
      );
      assert(
        [entry.oldPatchSha256, entry.targetNativeBodySha256].every(digest),
        "Invalid per-entry source binding",
      );
      const old = oldRecords.get(entry.oldPatchId);
      assert(old?.status === "applied", "Original applied recipe missing");
      assert.equal(
        sha(old),
        entry.oldPatchSha256,
        "Historical source recipe changed",
      );
      const oldSource = old.wallEvidence.find(
          (w) => w.nativeElementId === entry.sourceWallId,
        ),
        oldTarget = old.wallEvidence.find(
          (w) => w.nativeElementId !== entry.sourceWallId,
        );
      assert(
        oldSource && oldTarget && oldSource.kind !== "column",
        "Original source/target ownership changed",
      );
      const bodies = model.elementBounds.filter(
        (r) => r.elementId === entry.targetNativeElementId,
      );
      assert.equal(
        bodies.length,
        1,
        "Original target native body identity is duplicated or missing",
      );
      const body = bodies[0]!;
      assert.equal(
        sha(body),
        entry.targetNativeBodySha256,
        "Original target native body changed",
      );
      assert.equal(
        body.renderGeometryProvenance,
        "native",
        "Original native target body required",
      );
      if (entry.kind === "native-member") {
        const hosts = (model.nativeHostRelations ?? []).filter(
          (h) => h.elementId === entry.targetNativeElementId,
        );
        assert.equal(
          hosts.length,
          1,
          "Exactly one resolved original target host required",
        );
        const h = hosts[0]!;
        assert(
          h.evidence === "persisted" &&
            h.kind === "host" &&
            h.source === "Partitions/InsertableInst.m_hostId" &&
            Number.isSafeInteger(h.hostId) &&
            h.hostId > 0 &&
            h.hostId !== entry.targetNativeElementId &&
            Number.isSafeInteger(h.fieldOffset) &&
            h.fieldOffset >= 0 &&
            Number.isSafeInteger(h.recordOffset) &&
            h.recordOffset >= 0 &&
            Number.isSafeInteger(h.objectLength) &&
            h.objectLength >= h.fieldOffset + 4,
          "Original target host source field/frame binding required",
        );
        assert.equal(
          sha(hosts),
          entry.targetNativeHostRelationsSha256,
          "Original target host identity changed",
        );
      } else {
        assert.equal(
          oldTarget.kind,
          "column",
          "The historical target was not a column",
        );
        assert.equal(
          entry.targetNativeElementId,
          oldTarget.nativeElementId,
          "A column review cannot replace its owner",
        );
        assert(
          [-2000100, -2000133].includes(body.categoryId ?? 0),
          "Original native column body required",
        );
      }
      assert(
        Array.isArray(entry.replacementPatches) &&
          entry.replacementPatches.length === 1,
        "Each reviewed full original cap/body requires exactly one replacement",
      );
      const guards: NativeBoundaryReviewBundlePhysicalGuards[] = [],
        newApplied: NativeBoundaryPatch[] = [];
      for (const patch of entry.replacementPatches) {
        validateNativeBoundaryPatches(
          { version: 1, patches: [patch] },
          modelSha,
        );
        assert.equal(
          patch.status,
          "proposed",
          "Source review input must remain proposed",
        );
        assert(
          !oldRecords.has(patch.id) && !newIds.has(patch.id),
          "Replacement source identity duplicated",
        );
        newIds.add(patch.id);
        assert.equal(
          patch.levelId,
          old.levelId,
          "Original native level changed",
        );
        assert.deepEqual(
          patch.nativeDoorIds,
          old.nativeDoorIds,
          "Original doorway ownership changed",
        );
        const source = patch.wallEvidence.find(
            (w) => w.nativeElementId === entry.sourceWallId,
          ),
          target = patch.wallEvidence.find(
            (w) => w.nativeElementId !== entry.sourceWallId,
          );
        assert(source && target);
        assert.deepEqual(
          source,
          oldSource,
          "Original full supporting source wall evidence changed",
        );
        assert.equal(
          target.nativeElementId,
          entry.targetNativeElementId,
          "Original target binding changed",
        );
        const physical = material(patch.levelId).filter(
            (w) => !w.reviewPatchId && !w.approximate,
          ),
          targetParts = ringParts(physical, target.nativeElementId);
        assert(
          targetParts.some((p) => sha(p) === sha(target.ringsFeet)),
          "Complete current original target material evidence is missing",
        );
        assert.equal(
          target.kind ?? "wall",
          entry.kind === "native-member" ? "wall" : "column",
          "Native target source kind changed",
        );
        let currentCapSourcePart: BoundaryWall["ringsFeet"] | undefined;
        let firstMaterial: ReturnType<
            typeof checkNoNewMaterialBeyondFirstNativeSurface
          >,
          drawingExtra: Partial<NativeBoundaryReviewBundlePhysicalGuards> = {};
        if (entry.kind === "registered-drawing-column") {
          assert(
            old.drawingReconstructionProof &&
              patch.drawingReconstructionProof &&
              !patch.continuationProof,
            "Original drawing reconstruction proof required",
          );
          assert.deepEqual(
            patch.ringsFeet,
            old.ringsFeet,
            "The registered source body cannot move or stretch",
          );
          assert.equal(
            patch.widthFeet,
            old.widthFeet,
            "Original registered width changed",
          );
          const originalProof: unknown = {
              ...old.drawingReconstructionProof,
              evidenceSha256: undefined,
            },
            newProof: unknown = {
              ...patch.drawingReconstructionProof,
              evidenceSha256: undefined,
            };
          assert.deepEqual(
            newProof,
            originalProof,
            "Original registered source/section/body/adaptation evidence changed",
          );
          const shadow = checkRegisteredBodyNativeShadow(
            patch,
            entry.sourceWallId,
            physical,
          );
          firstMaterial = shadow.firstMaterial;
          drawingExtra = {
            registeredBodyUnchanged: true,
            sourceRegistrationEvidencePreserved: true,
            excludedOriginalRegisteredSupportingPartSha256:
              shadow.excludedOriginalRegisteredSupportingPartSha256,
            registeredSourceSupportReview: shadow.registeredSourceSupportReview,
          };
        } else {
          assert(
            old.continuationProof &&
              patch.continuationProof &&
              !patch.drawingReconstructionProof,
            "Original native continuation proof required",
          );
          assert.equal(
            patch.continuationProof.sourceWallId,
            entry.sourceWallId,
          );
          if (entry.kind === "native-column-cap-current-source") {
            const witness = entry.sourceCapReview;
            assert(witness, "Explicit current source cap review is required");
            assert.deepEqual(
              witness.originalSourceCapFeet,
              old.continuationProof.sourceCapFeet,
              "Historical original source cap witness changed",
            );
            assert.equal(
              witness.originalSourceEvidenceSha256,
              sha(oldSource),
              "Historical full source body witness changed",
            );
            assert.deepEqual(
              witness.currentSourceCapFeet,
              patch.continuationProof.sourceCapFeet,
              "Current exact source cap witness differs from proposed cap",
            );
            const sourceBodies = model.elementBounds.filter(
              (r) => r.elementId === entry.sourceWallId,
            );
            assert.equal(
              sourceBodies.length,
              1,
              "Original source native body identity is ambiguous",
            );
            const sourceBody = sourceBodies[0]!;
            assert.equal(
              sha(sourceBody),
              witness.sourceNativeBodySha256,
              "Original native source body changed",
            );
            assert(
              sourceBody.categoryId === -2000011 &&
                sourceBody.renderGeometryProvenance === "native" &&
                sourceBody.solid,
              "Original straight native wall body required",
            );
            const solid = sourceBody.solid;
            assert(
              [
                solid.start.x,
                solid.start.y,
                solid.end.x,
                solid.end.y,
                solid.thickness,
              ].every(Number.isFinite) && solid.thickness > 0,
              "Original native wall axis/thickness missing",
            );
            const ownerParts = ringParts(physical, entry.sourceWallId);
            assert.equal(
              sha(ownerParts),
              witness.currentSourceSectionsSha256,
              "Complete current source section inventory changed",
            );
            const selected = ownerParts.filter(
              (p) => sha(p) === witness.currentSourcePartSha256,
            );
            assert.equal(
              selected.length,
              1,
              "Current complete source fragment selection is ambiguous",
            );
            const selectedPart = selected[0]!;
            currentCapSourcePart = selectedPart;
            const [a, b] = witness.currentSourceCapFeet,
              equal = (p: [number, number], q: [number, number]) =>
                p[0] === q[0] && p[1] === q[1];
            assert(
              selectedPart[0]!.some((p, i) => {
                const q = selectedPart[0]![(i + 1) % selectedPart[0]!.length]!;
                return (
                  (equal(p, a) && equal(q, b)) || (equal(p, b) && equal(q, a))
                );
              }),
              "Current source cap is not an actual complete consecutive native edge",
            );
            const sourceSides = new Set(
              ownerParts
                .flat(2)
                .map((p) => exactOrient(a, b, p))
                .filter(Boolean),
            );
            assert.equal(
              sourceSides.size,
              1,
              "Current cap is not an exposed end of ALL original source owner sections",
            );
            const inward = [...sourceSides][0]!;
            assert(
              target.ringsFeet
                .flat()
                .some((p) => exactOrient(a, b, p) === -inward),
              "Current native cap does not face its original target",
            );
            assert(
              validNativeContinuation(patch),
              "Original full-wall width/axis continuation contract failed",
            );
            drawingExtra.currentSourceCapReview = {
              ...witness,
              currentSourcePartFeet: selectedPart,
              currentSourceSectionsFeet: ownerParts,
              allCurrentSourceOwnerVerticesInward: true,
              originalFullWallAxisContractRetained: true,
              noSourceMaterialExemption: true,
              originalBodyAxisFeet: [
                [solid.start.x, solid.start.y],
                [solid.end.x, solid.end.y],
              ],
              originalBodyThicknessFeet: solid.thickness,
            };
          } else {
            assert.equal(
              entry.sourceCapReview,
              undefined,
              "Only explicit current-source-cap reviews may change source cap evidence",
            );
            assert.deepEqual(
              patch.continuationProof.sourceCapFeet,
              old.continuationProof.sourceCapFeet,
              "Original full source cap moved or split",
            );
          }
          const sourceParts = ringParts(physical, entry.sourceWallId);
          assert(
            sourceParts.length,
            "Original current native source material missing",
          );
          const originalOverlap = overlay(
            "intersection",
            [patch.ringsFeet],
            [currentCapSourcePart ?? source.ringsFeet],
          );
          assert(
            originalOverlap.length,
            "No original full source-cap contact exists",
          );
          assert.equal(
            overlay("difference", originalOverlap, sourceParts).length,
            0,
            "Original full source cap loses retained current native support",
          );
          firstMaterial = checkNoNewMaterialBeyondFirstNativeSurface(
            patch,
            physical,
          );
        }
        const proof =
          patch.continuationProof ?? patch.drawingReconstructionProof!;
        assert.equal(
          proof.evidenceSha256,
          nativeBoundaryReviewBundleEntryEvidenceSha256(review, entry, patch),
          "Replacement source proof checksum changed",
        );
        const floor = floorAt(patch.levelId),
          levelElevation = nativeLevels.find(
            (l) => l.id === patch.levelId,
          )!.elevationFeet,
          floorSupport = checkBoundaryExistingWalkingFloorSupport(
            patch,
            floor.records,
            nativeIndoorEnvelopeParts(
              stage.nativeIndoorEnvelopes,
              modelSha,
              levelElevation,
            ),
            stage.nativeIndoorEnvelopes?.geometrySha256,
            entry.floorSupportReview,
          );
        assert.equal(
          doors.filter(
            (d) =>
              d.levelId === patch.levelId &&
              d.footprintFeet &&
              d.footprintFeet.length >= 3 &&
              overlay("intersection", [patch.ringsFeet], [[d.footprintFeet]])
                .length,
          ).length,
          0,
          "Replacement fills an original measured doorway",
        );
        assert.equal(
          (rooms.reviewedDoorApertures?.patches ?? []).filter(
            (p) =>
              p.levelId === patch.levelId &&
              overlay("intersection", [patch.ringsFeet], [[p.apertureFeet]])
                .length,
          ).length,
          0,
          "Replacement fills a reviewed doorway aperture",
        );
        assert.equal(
          (rooms.indoorExclusions?.areas ?? []).filter(
            (a) =>
              a.levelId === patch.levelId &&
              overlay("intersection", [patch.ringsFeet], a.partsFeet).length,
          ).length,
          0,
          "Replacement intrudes into a preserved exclusion/void",
        );
        guards.push({
          currentAllPatchContacts: true,
          currentHistoricalBinding: true,
          nativeFloorIds: [
            ...new Set(floor.records.map((f) => f.elementId)),
          ].sort((a, b) => a - b),
          floorGeometrySha256: floor.geometrySha256,
          physicalMaterialSha256: sha(physical),
          doorsSha256: sha(doors),
          doorFootprintIntersections: 0,
          reviewedApertureIntersections: 0,
          exclusionIntersections: 0,
          fullCurrentSourceCapOrRegisteredBody: true,
          completeCurrentColumnOrMemberEvidence: true,
          firstMaterial,
          floorSupport,
          ...drawingExtra,
        });
        newApplied.push({ ...patch, status: "applied" });
      }
      const kept = { ...old, status: "proposed" as const };
      retained.set(old.id, kept);
      appended.push(...newApplied);
      receiptEntries.push({
        oldPatchId: old.id,
        kind: entry.kind,
        originalRecord: old,
        retainedRecord: kept,
        newAppliedRecords: newApplied,
        physicalGuards: guards,
      });
    } catch (error) {
      throw new Error(
        `Checked boundary entry ${entry.oldPatchId}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  const priorEvidence = rooms.nativeBoundaryPatches!.sourceReviewEvidence ?? [];
  const portableEvidence = {
    format: "source-native-boundary-review-evidence-v1" as const,
    sourceModelSha256: modelSha,
    reviewSha256: sha(review),
    review,
  };
  assert(
    !priorEvidence.some(
      (record) => record.reviewSha256 === portableEvidence.reviewSha256,
    ),
    "This exact source review evidence is already retained",
  );
  const candidate: T = {
    ...rooms,
    nativeBoundaryPatches: {
      ...rooms.nativeBoundaryPatches!,
      sourceReviewEvidence: [...priorEvidence, portableEvidence],
      patches: [
        ...rooms.nativeBoundaryPatches!.patches.map(
          (p) => retained.get(p.id) ?? p,
        ),
        ...appended,
      ],
    },
  };
  // No source result or approval receipt exists until BOTH independent original
  // production checks pass over the complete candidate, with every other old
  // recipe retained in the same original graph and permission context.
  reviewedBoundaryWalls(
    stage.walls,
    candidate.nativeBoundaryPatches,
    modelSha,
    undefined,
    rooms.reviewedDoorApertures,
    rooms.nativeMaterialSections,
    material,
  );
  assert.equal(sha(rooms), before, "Source input was mutated");
  assert(
    Object.keys(rooms).every(
      (k) =>
        k === "nativeBoundaryPatches" ||
        rooms[k as keyof T] === candidate[k as keyof T],
    ),
    "Unrelated source operand/reference changed",
  );
  return {
    rooms: candidate,
    receipt: {
      format: "checked-native-boundary-review-bundle-v1",
      physicalGuardsWaived: false,
      sourceModelSha256: modelSha,
      originalSourceRoomsSha256: options.sourceRoomsSha256,
      nativeCacheSha256: options.nativeCacheSha256,
      sourceBeforeSha256: before,
      sourceAfterSha256: sha(candidate),
      reviewSha256: sha(review),
      entries: receiptEntries,
      sourcePreservation: {
        onlyEnumeratedPatchRecordsAndPortableEvidenceAppendChanged: true,
        allOtherSourceReferencesUnchanged: true,
      },
      finalValidation: {
        currentAllPatchContacts: true,
        currentHistoricalBinding: true,
        appliedBefore: rooms.nativeBoundaryPatches!.patches.filter(
          (p) => p.status === "applied",
        ).length,
        appliedAfter: candidate.nativeBoundaryPatches!.patches.filter(
          (p) => p.status === "applied",
        ).length,
      },
      portableSourceEvidence: {
        priorCount: priorEvidence.length,
        afterCount: priorEvidence.length + 1,
        appendedRecord: portableEvidence,
      },
      sourceMaterialGeometrySha256: rooms.nativeMaterialSections.geometrySha256,
      ...(derived.supplement
        ? { sourceSupplementGeometrySha256: derived.supplement.geometrySha256 }
        : {}),
    },
  };
}
