import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import {
  roomsWithCheckedSourceAccessDecision,
  type SourceAccessDecisionReview,
} from "../../scripts/indoor/source-access-decision-review";

const json = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const legendDirectory = "docs/continuation/unbc-20261020/hall-a-q-legend";
const accessDirectory =
  "docs/continuation/unbc-20261018/completion-work/access-and-device";
const decision: SourceAccessDecisionReview = json(
  `${legendDirectory}/ACCESS-DECISION.json`,
);
const inventory = json(`${accessDirectory}/preserved-access-inventory.json`);
const model = decision.sourceModelSha256;
const zone = inventory.sourceAccessZones.find(
  (z: { id: string }) => z.id === decision.requiredAccessZoneId,
);
const square = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as [number, number][];

/** Annotations shaped like the preserved master: the bound halls, one
 * staff-zone hall and one unrelated office. P (07-113A) is already public. */
function fixture(): RoomDirectoryData {
  const halls = decision.bindings.map((binding) => ({
    key: binding.key,
    levelId: binding.levelId,
    number: binding.number || undefined,
    building: binding.number ? undefined : binding.building,
    name: binding.name === "Unnamed area" ? undefined : binding.name,
    polygonFeet: square,
    labelPointFeet: [0.5, 0.5] as [number, number],
    confidence: 1,
    ...(binding.reviewLabel === "P"
      ? {
          access: {
            kind: "public" as const,
            evidence: "user-reported" as const,
          },
        }
      : {}),
  }));
  return {
    format: "reviter-room-annotations",
    version: 1,
    coordinateSystem: "revit-model-feet",
    model: { fileName: "UNBC.rvt" },
    annotations: [
      ...halls,
      {
        key: "rm-311-d5a30ed8aa65",
        levelId: 311,
        number: "07-702",
        name: "ESR",
        access: { kind: "staff", evidence: "user-reported" },
        polygonFeet: square,
        labelPointFeet: [0.5, 0.5],
        confidence: 1,
      },
      {
        key: "rm-311-other",
        levelId: 311,
        number: "07-999",
        name: "Office",
        polygonFeet: square,
        labelPointFeet: [0.5, 0.5],
        confidence: 1,
      },
    ],
    nativeAccessZones: {
      version: 1,
      sourceModelSha256: model,
      zones: [zone],
    },
  } as RoomDirectoryData;
}
const withBinding = (
  key: string,
  change: (room: RoomDirectoryData["annotations"][number]) => void,
) => {
  const rooms = fixture();
  change(rooms.annotations.find((room) => room.key === key)!);
  return rooms;
};
const hallG = decision.bindings.find((b) => b.reviewLabel === "G")!.key;
const hallA = decision.bindings.find((b) => b.reviewLabel === "A")!.key;

test("committed Hall A-Q decision matches the recovered legend, source index and approval", () => {
  const legend = json(`${legendDirectory}/LEGEND.json`);
  const index = json(`${accessDirectory}/source-identity-index.json`);
  assert.equal(decision.bindings.length, 16);
  assert.deepEqual(
    decision.bindings.map((b) => b.reviewLabel),
    [..."ABCDEFGHIJKLMNPQ"],
  );
  assert.deepEqual(
    decision.bindings.map((b) => b.key),
    legend.bindings.map((b: { sourceRoomKey: string }) => b.sourceRoomKey),
  );
  for (const binding of decision.bindings) {
    const record = index.records.find(
      (r: { key: string }) => r.key === binding.key,
    );
    assert.ok(record, binding.key);
    assert.deepEqual(
      [binding.levelId, binding.building, binding.number, binding.name],
      [record.levelId, record.building, record.number, record.name],
    );
    assert.notEqual(record.access, "staff");
    assert.ok(!zone.memberRoomKeys.includes(binding.key));
  }
  assert.equal(index.source.modelSha256, model);
  assert.equal(
    createHash("sha256")
      .update(
        readFileSync(
          new URL(`../../${decision.decision.path}`, import.meta.url),
        ),
      )
      .digest("hex"),
    decision.decision.sha256,
  );
  const approval = json(decision.decision.path);
  assert.match(
    approval.resolved["Q3.4 r3-b7-halls-staff"].decision,
    /Halls A-Q public/,
  );
});

test("the decision makes only the bound halls public and is idempotent", () => {
  const rooms = fixture();
  const before = JSON.stringify(rooms);
  const { rooms: next, receipt } = roomsWithCheckedSourceAccessDecision(
    rooms,
    decision,
    model,
  );
  assert.equal(JSON.stringify(rooms), before, "input stays unchanged");
  assert.equal(receipt.changed.length, 15);
  assert.deepEqual(receipt.alreadyApplied, [
    decision.bindings.find((b) => b.reviewLabel === "P")!.key,
  ]);
  for (const binding of decision.bindings) {
    const room = next.annotations.find((r) => r.key === binding.key)!;
    assert.equal(room.access?.kind, "public");
  }
  const staff = next.annotations.find((r) => r.key === "rm-311-d5a30ed8aa65")!;
  assert.equal(staff.access?.kind, "staff");
  assert.equal(
    next.annotations.find((r) => r.key === "rm-311-other")!.access,
    undefined,
  );
  assert.equal(next.nativeAccessZones, rooms.nativeAccessZones);
  const again = roomsWithCheckedSourceAccessDecision(next, decision, model);
  assert.equal(again.receipt.changed.length, 0);
  assert.equal(again.receipt.alreadyApplied.length, 16);
  assert.equal(again.receipt.sourceAfterSha256, receipt.sourceAfterSha256);
});

test("renamed, renumbered, staff, void, deleted or zone areas refuse", () => {
  const cases: [RoomDirectoryData, RegExp][] = [
    [withBinding(hallA, (r) => (r.name = "Other")), /renamed/],
    [
      withBinding(hallA, (r) => (r.number = "07-181")),
      /changed building|renumbered/,
    ],
    [withBinding(hallG, (r) => (r.building = "03")), /changed building/],
    [withBinding(hallA, (r) => (r.levelId = 312)), /moved level/],
    [withBinding(hallA, (r) => (r.walkability = "void")), /not walkable/],
    [withBinding(hallA, (r) => (r.status = "deleted")), /deleted/],
    [
      withBinding(
        hallA,
        (r) => (r.access = { kind: "staff", evidence: "user-reported" }),
      ),
      /different reviewed access/,
    ],
  ];
  for (const [rooms, message] of cases)
    assert.throws(
      () => roomsWithCheckedSourceAccessDecision(rooms, decision, model),
      message,
    );
  const missing = fixture();
  missing.annotations = missing.annotations.filter((r) => r.key !== hallA);
  assert.throws(
    () => roomsWithCheckedSourceAccessDecision(missing, decision, model),
    /missing or duplicated/,
  );
  const inZone = fixture();
  inZone.nativeAccessZones!.zones[0] = {
    ...zone,
    memberRoomKeys: [...zone.memberRoomKeys, hallA],
  };
  assert.throws(
    () => roomsWithCheckedSourceAccessDecision(inZone, decision, model),
    /staff zone/,
  );
});

test("the decision requires its model and its reviewed staff zone", () => {
  assert.throws(
    () =>
      roomsWithCheckedSourceAccessDecision(fixture(), decision, "0".repeat(64)),
    /different Revit model/,
  );
  const noZone = fixture();
  delete noZone.nativeAccessZones;
  assert.throws(
    () => roomsWithCheckedSourceAccessDecision(noZone, decision, model),
    /access zone is missing/,
  );
  const otherZone = fixture();
  otherZone.nativeAccessZones!.zones[0] = { ...zone, id: "access-zone:other" };
  assert.throws(
    () => roomsWithCheckedSourceAccessDecision(otherZone, decision, model),
    /Required access zone/,
  );
  assert.throws(
    () =>
      roomsWithCheckedSourceAccessDecision(
        fixture(),
        { ...decision, bindings: [...decision.bindings, decision.bindings[0]] },
        model,
      ),
    /Duplicate/,
  );
});
