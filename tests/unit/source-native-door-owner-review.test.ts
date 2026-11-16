import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  directoryDoorReviews,
  directoryDoors,
  type NativeDoorCell,
} from "../../../reviter/lib/reviter/directory-navigation";
import {
  evaluateNativeDoorOwner,
  reviewedNativeDoorOwnerPortal,
  type NativeDoorOwnerEvidence,
} from "../../../reviter/lib/reviter/reviewed-native-door-owners";
import type {
  DirectoryRoom,
  RoomDirectoryData,
} from "../../../reviter/lib/reviter/room-directory";
import type { ConvertResult } from "../../../reviter/lib/reviter/types";
import {
  checkSourceNativeDoorOwnerReview,
  type SourceNativeDoorOwnerReview,
} from "../../scripts/indoor/source-native-door-owner-review";

type Point = [number, number];
const sha = "a".repeat(64);
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
// One native door (id 10) in a thin wall along y = 0, spanning x 1..5.
const boundsFeet = { min: { x: -2, y: -2, z: 0 }, max: { x: 8, y: 2, z: 10 } };
const model = {
  levels: [{ levelId: 1, elevation: 0 }],
  elementBounds: [
    {
      elementId: 10,
      categoryId: -2_000_023,
      boundsFeet,
      orientedBox: [
        [1, -0.1, 0],
        [5, -0.1, 0],
        [5, 0.1, 0],
        [1, 0.1, 0],
      ],
    },
    // A door with no decoded opening: bounds only, so no precise footprint.
    { elementId: 11, categoryId: -2_000_023, boundsFeet },
  ],
  nativeAssociatedLevelRelations: [
    { elementId: 10, levelId: 1 },
    { elementId: 11, levelId: 1 },
  ],
  nativeHostRelations: [],
} as unknown as ConvertResult;
const room = (
  key: string,
  ring: Point[],
  extra: Partial<DirectoryRoom> = {},
): DirectoryRoom => ({
  key,
  levelId: 1,
  name: key,
  polygonFeet: ring,
  labelPointFeet: ring[0]!,
  confidence: 1,
  ...extra,
});
// Outlines stop 1.4 ft short of the wall faces at y = -0.1 and y = 0.1.
const rooms = (
  annotations = [
    room("south", rect(0, -10, 6, -1.5)),
    room("north", rect(0, 1.5, 6, 10)),
  ],
  extra: Partial<RoomDirectoryData> = {},
) =>
  ({
    format: "reviter-room-annotations",
    version: 1,
    annotations,
    ...extra,
  }) as unknown as RoomDirectoryData;
const review = (
  doors: unknown = [
    {
      levelId: 1,
      nativeDoorId: 10,
      roomKeys: ["north", "south"],
      notes: "Synthetic door.",
    },
  ],
  extra: Record<string, unknown> = {},
) =>
  ({
    format: "source-native-door-owner-review-v1",
    id: "synthetic-native-door-owners",
    sourceModelSha256: sha,
    notes: "Synthetic review.",
    doors,
    ...extra,
  }) as SourceNativeDoorOwnerReview;
const cells: NativeDoorCell[] = [
  { id: "S", roomKeys: ["south"], ringsFeet: [rect(0, -10, 6, -0.1)] },
  { id: "N", roomKeys: ["north"], ringsFeet: [rect(0, 0.1, 6, 10)] },
];
/** What the compiler reports for the listed door once it has applied it. */
function compiled(
  data: RoomDirectoryData,
  listed: [string, string] = ["north", "south"],
): NativeDoorOwnerEvidence {
  const door = directoryDoors(model, 1).find((d) => d.id === 10)!,
    level = data.annotations;
  const evidence = evaluateNativeDoorOwner({
    levelId: 1,
    nativeDoorId: 10,
    listedRoomKeys: listed,
    rooms: level,
    door,
    review: directoryDoorReviews(level, [door])[0]!,
    explicitLinks: [],
    cells,
    roomElevationFeet: () => 0,
  });
  assert.equal(evidence.accepted, true, evidence.reason);
  return {
    ...evidence,
    elevationFeet: 0,
    applied: true,
    portal: reviewedNativeDoorOwnerPortal(level, door, cells)!,
  };
}

test("an accepted review hands the compiler only the listed doors and leaves the rooms alone", () => {
  const data = rooms();
  const snapshot = JSON.stringify(data);
  const bytes = new TextEncoder().encode(JSON.stringify(review()));
  const check = checkSourceNativeDoorOwnerReview(
    data,
    review(),
    sha,
    model,
    bytes,
  );
  assert.equal(JSON.stringify(data), snapshot, "source rooms are not changed");
  assert.deepEqual(check.decisions, [
    { levelId: 1, nativeDoorId: 10, roomKeys: ["north", "south"] },
  ]);
  // No receipt before the compile has applied every listed door.
  assert.equal(check.complete(), false);
  assert.throws(() => check.receipt(), /must be applied by the compile/);
  // Observations of other doors are not part of the review.
  check.onEvidence({
    ...compiled(data),
    nativeDoorId: 99,
    listedRoomKeys: undefined,
  });
  assert.equal(check.complete(), false);
  check.onEvidence(compiled(data));
  assert.equal(check.complete(), true);
  const receipt = check.receipt();
  assert.equal(receipt.format, "checked-source-native-door-owner-review-v1");
  assert.equal(receipt.sourceModelSha256, sha);
  assert.match(receipt.reviewSha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.reviewFileSha256!, /^[a-f0-9]{64}$/);
  assert.equal(receipt.sourceRoomsChanged, false);
  assert.equal(receipt.accessOrAccessibilityGranted, false);
  assert.deepEqual(receipt.rule.stepsFeet, [0.25, 0.5, 1, 1.5]);
  assert.equal(receipt.rule.maxOwnerGapFeet, 2);
  assert.equal(receipt.doors.length, 1);
  const door = receipt.doors[0]!;
  assert.deepEqual(door.listedRoomKeys, ["north", "south"]);
  assert.deepEqual(door.appliedRoomKeys, ["south", "north"]);
  assert.deepEqual(door.beforeReview, { state: "unmatched", candidates: [] });
  assert.deepEqual(
    door.nativeSides.map((s) => [s.side, s.cellId, s.owner, s.stepFeet]),
    [
      ["against-normal", "S", "south", 0.25],
      ["along-normal", "N", "north", 0.25],
    ],
  );
  for (const side of door.nativeSides)
    assert.ok(Math.abs(side.ownerGapFeet - 1.15) < 1e-9);
  assert.deepEqual(
    door.nativeSides.map((s) => s.cellBoundsFeet),
    [
      [0, -10, 6, -0.1],
      [0, 0.1, 6, 10],
    ],
  );
  assert.equal(JSON.stringify(data), snapshot);
  // A door is applied once.
  assert.throws(() => check.onEvidence(compiled(data)), /more than once/);
});

test("each static refusal is raised before the compile starts", () => {
  const refuse = (
    pattern: RegExp,
    value = review(),
    data = rooms(),
    modelSha = sha,
  ) =>
    assert.throws(
      () => checkSourceNativeDoorOwnerReview(data, value, modelSha, model),
      pattern,
    );
  const row = (extra: Record<string, unknown> = {}) => ({
    levelId: 1,
    nativeDoorId: 10,
    roomKeys: ["north", "south"],
    notes: "Synthetic door.",
    ...extra,
  });
  refuse(/explicit source native door owner review/, {
    ...review(),
    format: "source-door-aperture-review-v1",
  } as never);
  refuse(/different Revit model/, review(), rooms(), "f".repeat(64));
  refuse(
    /Invalid source model digest/,
    review([row()], {
      sourceModelSha256: "nope",
    }),
  );
  refuse(/id and notes are required/, review([row()], { notes: " " }));
  refuse(/needs doors/, review([]));
  refuse(/notes are required/, review([row({ notes: "" })]));
  // No tolerance, geometry or access can be carried by the file.
  refuse(
    /fields this review does not accept/,
    review([row()], {
      maxOwnerGapFeet: 5,
    }),
  );
  refuse(
    /fields this review does not accept/,
    review([row({ maxOwnerGapFeet: 5 })]),
  );
  refuse(
    /fields this review does not accept/,
    review([row({ overrideLegacy: true })]),
  );
  refuse(/two different room keys/, review([row({ roomKeys: ["north"] })]));
  refuse(
    /two different room keys/,
    review([row({ roomKeys: ["north", "north"] })]),
  );
  refuse(/more than once/, review([row(), row({ notes: "Again." })]));
  // Rooms must be walkable areas on the door's own level.
  refuse(
    /room attic is not a walkable area on the door's level/,
    review([row({ roomKeys: ["north", "attic"] })]),
  );
  refuse(
    /room north is not a walkable area/,
    review(),
    rooms([
      room("south", rect(0, -10, 6, -1.5)),
      room("north", rect(0, 1.5, 6, 10), { levelId: 2 }),
    ]),
  );
  refuse(
    /room north is not a walkable area/,
    review(),
    rooms([
      room("south", rect(0, -10, 6, -1.5)),
      room("north", rect(0, 1.5, 6, 10), { walkability: "void" }),
    ]),
  );
  refuse(
    /room north is not a walkable area/,
    review(),
    rooms([
      room("south", rect(0, -10, 6, -1.5)),
      room("north", rect(0, 1.5, 6, 10), { status: "deleted" }),
    ]),
  );
  // An explicit reviewed link for the door keeps precedence.
  refuse(
    /explicit reviews keep precedence/,
    review(),
    rooms(undefined, {
      navigation: {
        version: 1,
        doorLinks: [{ doorId: 10, levelId: 1, rooms: ["north", "south"] }],
      },
    }),
  );
  // The door must exist on the level with a precise footprint and normal.
  refuse(/no such native door/, review([row({ nativeDoorId: 404 })]));
  refuse(
    /is not a walkable area|no such native door/,
    review([row({ levelId: 2 })]),
  );
  refuse(
    /no precise footprint and normal/,
    review([row({ nativeDoorId: 11 })]),
  );
  // The legacy matcher already pairs the door: nothing to review.
  refuse(
    /legacy matcher already pairs this door/,
    review(),
    rooms([
      room("south", rect(0, -10, 6, -0.1)),
      room("north", rect(0, 0.1, 6, 10)),
    ]),
  );
});

test("a receipt is refused unless the compile applied exactly the listed rooms", () => {
  const data = rooms([
    room("south", rect(0, -10, 6, -1.5)),
    room("north", rect(0, 1.5, 6, 10)),
    room("other", rect(20, 1.5, 26, 10)),
  ]);
  const check = checkSourceNativeDoorOwnerReview(data, review(), sha, model);
  // Evidence for a door outside the review is rejected outright.
  assert.throws(
    () => check.onEvidence({ ...compiled(data), nativeDoorId: 404 }),
    /not in the native door owner review/,
  );
  // Accepted but not applied: still no receipt.
  check.onEvidence({ ...compiled(data), applied: false });
  assert.equal(check.complete(), false);
  // Applied to rooms other than the listed pair.
  const wrong = compiled(data);
  check.onEvidence({
    ...wrong,
    portal: { ...wrong.portal!, rooms: ["south", "other"] },
  });
  assert.throws(() => check.receipt(), /applied rooms differ/);
});

test("the regeneration passes the review to the compiler only when the flag is given", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const script = readFileSync(
    path.join(root, "scripts/indoor/regenerate-from-native-cache.ts"),
    "utf8",
  );
  assert.ok(script.includes('"--native-door-owner-review",'));
  assert.ok(
    script.includes(
      "...(nativeDoorOwnerReview ? { nativeDoorOwnerReview } : {}),",
    ),
    "unset flag adds no compiler option",
  );
  assert.equal(script.split("checkSourceNativeDoorOwnerReview(").length, 2);
  // run.sh: unset adds nothing to the command line; set adds one flag pair.
  const work = mkdtempSync(path.join(tmpdir(), "recompile-run-"));
  try {
    for (const dir of ["openindoormaps", "reviter", "inputs"])
      mkdirSync(path.join(work, dir));
    const run = (env: Record<string, string>) =>
      execFileSync(
        "bash",
        [
          path.join(root, "docs/continuation/unbc-20261021/recompile/run.sh"),
          work,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            DRY_RUN: "1",
            NATIVE_WORKERS: "1",
            LANDING_WORKERS: "1",
            PARENT_HEAP_MIB: "6144",
            ...env,
          },
        },
      )
        .split("\n")
        .find((line) => line.includes("regenerate-from-native-cache.ts"))!;
    const plain = run({ NATIVE_DOOR_OWNER_REVIEW: "" });
    assert.ok(!plain.includes("native-door-owner"));
    const set = run({ NATIVE_DOOR_OWNER_REVIEW: "/tmp/owners.json" });
    assert.equal(
      set.replace(" --native-door-owner-review /tmp/owners.json", ""),
      plain,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
