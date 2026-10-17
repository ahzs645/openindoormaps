/** Independent narrow source-review delta check. This grants no physical or
 * route approval: candidate import and fresh original physical QA remain required. */
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import { nativeDerivedFrameHash } from "../../../reviter/lib/reviter/native-derived-frame-returns";
import {
  nativeProvisionalCornerSealsHash,
  validateNativeProvisionalCornerSeals,
} from "../../../reviter/lib/reviter/native-provisional-corner-seals";
import {
  nativeIndoorEnvelopeHash,
  verifyNativeIndoorEnvelopes,
} from "../../../reviter/lib/reviter/native-indoor-envelopes";
import type { roomsWithCurrentDrawingFloorBindings } from "./rebind-drawing-floor-source-review";

export type DrawingFloorRebindReceipt = Awaited<
  ReturnType<typeof roomsWithCurrentDrawingFloorBindings>
>["receipt"];
type Context = Pick<IndoorDataset, "source" | "walkingSupport">;
type Binding =
  DrawingFloorRebindReceipt["changedRows"][number]["currentBindings"][number];

export async function verifyDrawingFloorSourceReviewDelta(
  before: RoomDirectoryData,
  after: RoomDirectoryData,
  originalPhysical: Context,
  candidatePhysical: Context,
  receipt: DrawingFloorRebindReceipt,
) {
  assert.equal(receipt.format, "reviter-drawing-native-floor-source-rebind");
  assert.equal(receipt.version, 1);
  assert.equal(
    receipt.algorithm,
    "named-native-drawing-floor-source-review-v1",
  );
  assert.equal(
    receipt.status,
    "COMPLETE_ORIGINAL_PHYSICAL_AND_DRAWING_REPLAY_PASSED",
  );
  for (const name of [
    "patchBodiesUnchanged",
    "sourceHistoryAndDecisionsUnchanged",
    "allOriginalGuardPredicatesRetained",
  ] as const)
    assert.equal(receipt[name], true, `Missing complete floor review: ${name}`);
  for (const name of [
    "sourceInputMutated",
    "geometryEquivalenceClaimed",
    "sourceCoordinatesSnapped",
    "physicalGuardWaived",
  ] as const)
    assert.equal(receipt[name], false, `Invalid floor review claim: ${name}`);
  const model = originalPhysical.source.modelSha256;
  assert.equal(candidatePhysical.source.modelSha256, model);
  assert.equal(receipt.sourceModelSha256, model);
  assert.equal(originalPhysical.walkingSupport?.sourceModelSha256, model);
  assert.equal(candidatePhysical.walkingSupport?.sourceModelSha256, model);
  assert.equal(nativeDerivedFrameHash(before), receipt.sourceRoomsBeforeSha256);
  assert.equal(nativeDerivedFrameHash(after), receipt.sourceRoomsAfterSha256);

  const original = before.nativeProvisionalCornerSeals;
  assert(original, "Floor review requires original assumptions");
  validateNativeProvisionalCornerSeals(original, model);
  assert.equal(
    original.geometrySha256,
    nativeProvisionalCornerSealsHash(original),
  );
  assert.equal(original.geometrySha256, receipt.descriptorBeforeSha256);
  assert.equal(original.rows.length, receipt.allRows);
  assert.equal(
    original.rows.filter((row) => row.drawingBacked).length,
    receipt.drawingRows,
  );
  assert.equal(
    new Set(original.rows.map((row) => row.id)).size,
    original.rows.length,
  );

  const oldFloors = originalPhysical.walkingSupport!.floors,
    freshFloors = candidatePhysical.walkingSupport!.floors,
    fresh = new Map(freshFloors.map((floor) => [floor.nativeElementId, floor]));
  assert.equal(
    new Set(oldFloors.map((floor) => floor.nativeElementId)).size,
    oldFloors.length,
  );
  assert.equal(fresh.size, freshFloors.length);
  const binding = (floor: (typeof freshFloors)[number]): Binding => ({
    nativeElementId: floor.nativeElementId,
    elevationFeet: floor.elevationFeet,
    partsFeet: floor.partsFeet ?? [floor.ringsFeet],
  });
  assert.deepEqual(
    receipt.allOriginalWalkingFloorIdsRefreshed,
    oldFloors.map((floor) => floor.nativeElementId),
  );
  const floorChanges = oldFloors.flatMap((old) => {
    const current = fresh.get(old.nativeElementId);
    assert(
      current,
      `Original named walking floor disappeared: ${old.nativeElementId}`,
    );
    const before = binding(old),
      after = binding(current);
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : [
          {
            nativeElementId: old.nativeElementId,
            beforeSha256: nativeDerivedFrameHash(before),
            afterSha256: nativeDerivedFrameHash(after),
            before,
            after,
          },
        ];
  });
  assert.deepEqual(
    receipt.floorChanges,
    floorChanges,
    "Replay floor changes must equal every actual old/new walking profile change",
  );
  const changedRows: DrawingFloorRebindReceipt["changedRows"] = [];
  const rows = original.rows.map((row) => {
    if (!row.drawingBacked) return row;
    assert.equal(
      row.sourceFloorPartsSha256,
      nativeDerivedFrameHash(row.sourceFloorBindings),
    );
    assert.equal(new Set(row.sourceFloorIds).size, row.sourceFloorIds.length);
    const sourceFloorBindings = row.sourceFloorIds
      .map((id) => {
        const floor = fresh.get(id);
        assert(floor, `Drawing row ${row.id} has no current named floor ${id}`);
        return binding(floor);
      })
      .sort((a, b) => a.nativeElementId - b.nativeElementId);
    if (
      JSON.stringify(sourceFloorBindings) ===
      JSON.stringify(row.sourceFloorBindings)
    )
      return row;
    const sourceFloorPartsSha256 = nativeDerivedFrameHash(sourceFloorBindings);
    changedRows.push({
      id: row.id,
      state: row.state,
      kind: row.drawingBacked.kind,
      floorIds: [...row.sourceFloorIds],
      beforeSha256: row.sourceFloorPartsSha256,
      afterSha256: sourceFloorPartsSha256,
      originalBindings: row.sourceFloorBindings,
      currentBindings: sourceFloorBindings,
    });
    return { ...row, sourceFloorBindings, sourceFloorPartsSha256 };
  });
  assert.deepEqual(
    receipt.changedRows,
    changedRows,
    "Replay must enumerate exactly the changed drawing bindings",
  );
  const seals = { ...original, rows };
  seals.geometrySha256 = nativeProvisionalCornerSealsHash(seals);
  assert.equal(receipt.descriptorAfterSha256, seals.geometrySha256);

  await verifyNativeIndoorEnvelopes(before.nativeIndoorEnvelopes, model);
  let envelope = before.nativeIndoorEnvelopes;
  const envelopeChanges: DrawingFloorRebindReceipt["envelopeChanges"] = [];
  if (envelope && seals.geometrySha256 !== original.geometrySha256) {
    envelope = {
      ...envelope,
      levels: envelope.levels.map((level) => {
        if (level.provisionalCornerGeometrySha256 === undefined) return level;
        assert.equal(
          level.provisionalCornerGeometrySha256,
          original.geometrySha256,
        );
        envelopeChanges.push({
          levelId: level.levelId,
          elevationFeet: level.elevationFeet,
        });
        return {
          ...level,
          provisionalCornerGeometrySha256: seals.geometrySha256,
        };
      }),
    };
    envelope.geometrySha256 = await nativeIndoorEnvelopeHash(envelope);
  }
  assert.deepEqual(receipt.envelopeChanges, envelopeChanges);
  assert.equal(
    receipt.envelopeBeforeSha256,
    before.nativeIndoorEnvelopes?.geometrySha256,
  );
  assert.equal(receipt.envelopeAfterSha256, envelope?.geometrySha256);
  const expected = {
    ...before,
    nativeProvisionalCornerSeals: seals,
    ...(envelope ? { nativeIndoorEnvelopes: envelope } : {}),
  };
  assert.deepEqual(
    after,
    expected,
    "Floor review may change only named drawing floor bindings and dependent checksum references; every other source annotation must stay exact",
  );
  return {
    format: "unbc-independent-drawing-floor-review-delta-v1",
    sourceModelSha256: model,
    sourceRoomsBeforeSha256: nativeDerivedFrameHash(before),
    sourceRoomsAfterSha256: nativeDerivedFrameHash(after),
    changedRowIds: changedRows.map((row) => row.id),
    changedFloorIds: floorChanges.map((floor) => floor.nativeElementId),
    originalWalkingFloors: oldFloors.length,
    allowedFields: [
      "drawingRow.sourceFloorBindings",
      "drawingRow.sourceFloorPartsSha256",
      "nativeProvisionalCornerSeals.geometrySha256",
      "nativeIndoorEnvelopes.level.provisionalCornerGeometrySha256",
      "nativeIndoorEnvelopes.geometrySha256",
    ],
    unrelatedSourceOperandsExactlyPreserved: true,
    physicalOrNavigationApprovalGranted: false,
    requiresFreshCandidateOriginalImportAndPhysicalValidation: true,
  } as const;
}
