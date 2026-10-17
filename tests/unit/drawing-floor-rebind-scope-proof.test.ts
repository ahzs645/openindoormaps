import assert from "node:assert/strict";
import test from "node:test";
import {
  drawingBackedSealFixture,
  rect,
} from "../../../reviter/tests/fixtures/drawing-backed-seal";
import type { ConvertResult } from "../../../reviter/lib/reviter/types";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nativeDerivedFrameHash } from "../../../reviter/lib/reviter/native-derived-frame-returns";
import { nativeProvisionalCornerSealsHash } from "../../../reviter/lib/reviter/native-provisional-corner-seals";
import { roomsWithCurrentDrawingFloorBindings } from "../../scripts/indoor/rebind-drawing-floor-source-review";
import { verifyDrawingFloorSourceReviewDelta } from "../../scripts/indoor/drawing-floor-rebind-scope-proof";

async function fixture() {
  const source = drawingBackedSealFixture();
  source.rehash();
  const floor = source.data.walkingSupport!.floors[0]!,
    record = {
      elementId: 10,
      categoryId: -2000032,
      boundsFeet: { min: { x: -1, y: -2, z: -0.3 }, max: { x: 4, y: 2, z: 0 } },
      loops: floor
        .partsFeet!.flat()
        .map((ring) => ring.map((p) => [p[0], p[1], 0])),
    };
  record.loops[0][2][0] += 2 ** -40;
  const model = { elementBounds: [record] } as unknown as Pick<
      ConvertResult,
      "elementBounds"
    >,
    before = {
      annotations: [],
      nativeProvisionalCornerSeals: source.data.nativeProvisionalCornerSeals,
      nativeMaterialSections: source.data.nativeMaterialSections,
      boundaryReference: source.boundaryReference,
    } as unknown as RoomDirectoryData,
    applied = await roomsWithCurrentDrawingFloorBindings(
      model,
      before,
      source.data.source.modelSha256,
      source.data,
    ),
    original = source.data as unknown as IndoorDataset,
    candidate = structuredClone(original);
  candidate.walkingSupport!.floors = applied.currentFloors.map((floor) => ({
    ...floor,
    ringsFeet: floor.partsFeet[0],
  }));
  return {
    before,
    after: applied.rooms,
    original,
    candidate,
    receipt: applied.receipt,
  };
}
const check = (f: Awaited<ReturnType<typeof fixture>>) =>
  verifyDrawingFloorSourceReviewDelta(
    f.before,
    f.after,
    f.original,
    f.candidate,
    f.receipt,
  );

test("narrow source scope independently binds real current profiles and preserves every unrelated annotation", async () => {
  const f = await fixture(),
    snapshot = JSON.stringify(f);
  const proof = await check(f);
  assert.deepEqual(proof.changedFloorIds, [10]);
  assert.equal(proof.changedRowIds.length, 1);
  assert.equal(proof.physicalOrNavigationApprovalGranted, false);
  assert.equal(JSON.stringify(f), snapshot);
});

test("a proposed or waived source review cannot authorize the metadata change", async () => {
  for (const change of [
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.status = "UNVALIDATED_SOURCE_REVIEW_PROPOSAL" as never;
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.physicalGuardWaived = true as never;
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.sourceModelSha256 = "f".repeat(64);
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.changedRows = [];
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.allOriginalWalkingFloorIdsRefreshed = [];
    },
  ]) {
    const f = await fixture();
    change(f);
    await assert.rejects(check(f));
  }
});

test("a rehashed receipt cannot substitute a different floor profile, a real hole or a missing named floor", async () => {
  for (const change of [
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.candidate.walkingSupport!.floors[0].partsFeet![0].push(
        rect(3, 1, 3.1, 1.1)[0][0],
      );
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.candidate.walkingSupport!.floors = [];
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.candidate.walkingSupport!.floors.push(
        structuredClone(f.candidate.walkingSupport!.floors[0]),
      );
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.changedRows[0].currentBindings[0].partsFeet = rect(
        20,
        20,
        21,
        21,
      );
    },
  ]) {
    const f = await fixture();
    change(f);
    await assert.rejects(check(f));
  }
});

test("room data and patch body or history edits remain forbidden even with newly computed descriptor and room hashes", async () => {
  for (const change of [
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.after.annotations.push({ key: "foreign-room" } as never);
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.after.nativeProvisionalCornerSeals!.rows[0].partsFeet[0][0][0][0] +=
        2 ** -40;
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.after.nativeProvisionalCornerSeals!.rows[0].evidenceSha256 = "f".repeat(
        64,
      );
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.after.nativeProvisionalCornerSeals!.rows[0].assumption = {
        ...f.after.nativeProvisionalCornerSeals!.rows[0].assumption,
        note: "changed history",
      } as never;
    },
  ]) {
    const f = await fixture();
    change(f);
    const seals = f.after.nativeProvisionalCornerSeals!;
    seals.geometrySha256 = nativeProvisionalCornerSealsHash(seals);
    f.receipt.sourceRoomsAfterSha256 = nativeDerivedFrameHash(f.after);
    f.receipt.descriptorAfterSha256 = seals.geometrySha256;
    await assert.rejects(check(f));
  }
});

test("original profile-change inventory and descriptor bindings are exact, rather than a blanket source-change allowance", async () => {
  for (const change of [
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.floorChanges = [];
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.floorChanges[0].beforeSha256 = "f".repeat(64);
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.changedRows[0].floorIds = [999];
    },
    (f: Awaited<ReturnType<typeof fixture>>) => {
      f.receipt.descriptorBeforeSha256 = "f".repeat(64);
    },
  ]) {
    const f = await fixture();
    change(f);
    await assert.rejects(check(f));
  }
});
