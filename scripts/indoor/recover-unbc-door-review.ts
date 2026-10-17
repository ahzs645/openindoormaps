/** Rebuild selection/display door reviews against a freshly captured original
 * prelanding phase. No physical portal is created and full final replay remains
 * mandatory. Refused source rows remain visible in held history. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deserialize, serialize } from "node:v8";
import path from "node:path";
import {
  closedBoundaryDoors,
  activeNativeDoorBoundaryClosures,
  type NativeDoorBoundaryClosures,
} from "../../../reviter/lib/reviter/native-door-boundary-closures.ts";
import { closedBoundaryDoors as appClosedBoundaryDoors } from "../../app/indoor-project/native-door-boundary-closures.ts";
import { initializeNativeExactGeosOverlay } from "../../../reviter/lib/reviter/native-exact-geos-overlay.ts";
import { initializeNativeExactGeosOverlay as initializeAppGeos } from "../../app/indoor-project/native-exact-geos-overlay.ts";
import {
  roomsWithCheckedSourceDoorBoundaryClosureReview,
  sourceDoorBoundaryClosureEntryEvidenceSha256,
  verifySourceDoorBoundaryClosureReviewDelta,
  type SourceDoorBoundaryClosureReview,
} from "./source-door-boundary-closure-review.ts";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory.ts";
import type { IndoorDataset } from "../../../reviter/lib/reviter/indoor-contract.ts";
const root = path.resolve(process.argv[2]!),
  out = path.join(root, "reviews"),
  hash = (b: Uint8Array | string) =>
    createHash("sha256").update(b).digest("hex"),
  sha = (v: unknown) => hash(JSON.stringify(v));
const stateBytes = await readFile(path.join(out, "checked-source-state.bin"));
const state = deserialize(stateBytes) as {
  rooms: RoomDirectoryData;
  context: IndoorDataset;
  modelSha: string;
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
};
const snapshotBytes = await readFile(
    path.join(out, "prelanding-source-snapshot.bin"),
  ),
  capture = JSON.parse(
    await readFile(path.join(out, "prelanding-source-snapshot.json"), "utf8"),
  );
assert.equal(hash(snapshotBytes), capture.sha256);
assert.equal(hash(stateBytes), capture.sourceStateSha256);
const snapshot = deserialize(snapshotBytes) as IndoorDataset,
  rooms = state.rooms,
  descriptor = rooms.nativeDoorBoundaryClosures!;
assert.equal(sha(rooms), snapshot.source.roomsSha256);
assert.equal(sha(descriptor), sha(snapshot.nativeDoorBoundaryClosures));
const cacheBytes = await readFile(
  path.join(
    root,
    "materials/reissued/UNBC.regenerated-materials.native-cache.json",
  ),
);
assert.equal(hash(cacheBytes), state.nativeCacheSha256);
const cache = JSON.parse(cacheBytes.toString());
await Promise.all([initializeNativeExactGeosOverlay(), initializeAppGeos()]);
type Closure = NativeDoorBoundaryClosures["doors"][number];
const test = (row: Closure) => {
  const d = { ...descriptor, doors: [row] };
  try {
    closedBoundaryDoors(snapshot, row.levelId, d);
    appClosedBoundaryDoors(snapshot as never, row.levelId, d as never);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
const unchanged: Closure[] = [],
  stale: Closure[] = [],
  audit: unknown[] = [];
for (const row of activeNativeDoorBoundaryClosures(descriptor)) {
  const door = snapshot.doors?.find(
    (d) =>
      d.levelId === row.levelId && d.nativeElementId === row.nativeElementId,
  );
  const doorwayChanged =
    !door ||
    door.state !== (row.selectionBarrierOnly ? "unmatched" : "connected") ||
    sha([
      door.pointFeet,
      door.normalFeet,
      door.footprintFeet,
      door.roomKeys,
    ]) !==
      sha([
        row.originalDoor.pointFeet,
        row.originalDoor.normalFeet,
        row.originalDoor.footprintFeet,
        row.originalDoor.roomKeys,
      ]);
  const jambChanged = row.jambEvidence.some((j) => {
    const current = snapshot.walls.find(
      (w) =>
        w.levelId === row.levelId &&
        w.nativeElementId === j.nativeElementId &&
        !w.approximate &&
        !w.reviewPatchId &&
        (w.kind === "wall" || w.kind === "column"),
    );
    return !current || sha(current.ringsFeet) !== sha(j.ringsFeet);
  });
  if (doorwayChanged || jambChanged) stale.push(row);
  else unchanged.push(row);
}
for (const levelId of new Set(unchanged.map((d) => d.levelId))) {
  const d = { ...descriptor, doors: unchanged };
  closedBoundaryDoors(snapshot, levelId, d);
  appClosedBoundaryDoors(snapshot as never, levelId, d as never);
}
const review: SourceDoorBoundaryClosureReview = {
  format: "source-door-boundary-closure-review-v1",
  sourceModelSha256: state.modelSha,
  sourceRoomsSha256: state.sourceRoomsSha256,
  nativeCacheSha256: state.nativeCacheSha256,
  sourceBeforeSha256: sha(rooms),
  descriptorBeforeSha256: sha(descriptor),
  currentPreparedSnapshotSha256: hash(snapshotBytes),
  currentPreparedSnapshot: {
    path: path.join(out, "prelanding-source-snapshot.bin"),
    sha256: hash(snapshotBytes),
    bytes: snapshotBytes.length,
  },
  entries: [],
};
for (const old of stale) {
  const initial = test(old);
  assert(
    initial,
    "Stale metadata must actually fail the existing physical consumer",
  );
  let replacement: Closure | undefined;
  const probes: { change: string; error: string | null }[] = [];
  const rebound = structuredClone(old);
  let supported = true;
  rebound.id = old.id + ":regenerated-original-profile-v1";
  for (const jamb of rebound.jambEvidence) {
    const current = snapshot.walls.filter(
      (w) =>
        w.levelId === old.levelId &&
        w.nativeElementId === jamb.nativeElementId &&
        !w.approximate &&
        !w.reviewPatchId &&
        (w.kind === "wall" || w.kind === "column"),
    );
    if (current.length === 0) {
      supported = false;
      break;
    }
    if (sha(jamb.ringsFeet) !== sha(current[0]!.ringsFeet)) {
      const owners = cache.nativeModel.elementBounds.filter(
        (r: { elementId: number }) => r.elementId === jamb.nativeElementId,
      );
      if (
        current.length !== 1 ||
        current[0]!.kind !== "column" ||
        owners.length !== 1 ||
        owners[0].renderGeometryProvenance !== "native"
      ) {
        supported = false;
        break;
      }
      jamb.ringsFeet = structuredClone(current[0]!.ringsFeet);
      jamb.sourceNativeColumnProfile = true;
    }
  }
  const finish = (r: Closure, change: string) => {
    r.evidenceSha256 = sha({
      sourceModelSha256: state.modelSha,
      nativeCacheSha256: state.nativeCacheSha256,
      snapshotSha256: hash(snapshotBytes),
      oldRecordSha256: sha(old),
      change,
      footprintFeet: r.footprintFeet,
      jambEvidence: r.jambEvidence,
    });
    r.notes +=
      " Fresh original-source recovery: " +
      change +
      ". Full existing portal, threshold, slab, hole, jamb and foreign-material predicates replayed; final regenerated fixture replay still required.";
    const error = test(r);
    probes.push({ change, error });
    return error === null;
  };
  if (supported) {
    if (
      finish(
        rebound,
        "complete original native column profile; original threshold retained",
      )
    )
      replacement = rebound;
    else {
      const n = old.originalDoor.normalFeet,
        m = Math.hypot(...n),
        normal: [number, number] = [n[0] / m, n[1] / m],
        t: [number, number] = [-normal[1], normal[0]],
        bounds = (p: [number, number][], axis: [number, number]) => [
          Math.min(...p.map((q) => q[0] * axis[0] + q[1] * axis[1])),
          Math.max(...p.map((q) => q[0] * axis[0] + q[1] * axis[1])),
        ],
        originalT = bounds(old.originalDoor.footprintFeet, t),
        savedT = bounds(old.footprintFeet, t),
        limit = old.measuredTangentLimitFeet ?? 0.15;
      for (const side of [0, 1]) {
        const r = structuredClone(rebound),
          goal = side ? originalT[1]! + limit : originalT[0]! - limit,
          delta = goal - savedT[side]!;
        r.footprintFeet = old.footprintFeet.map((p) => {
          const value = p[0] * t[0] + p[1] * t[1];
          return Math.abs(value - savedT[side]!) < 1e-8
            ? [p[0] + t[0] * delta, p[1] + t[1] * delta]
            : [...p];
        });
        if (
          finish(
            r,
            "original native column profile and one tangent end at existing " +
              limit +
              " ft bound",
          )
        ) {
          replacement = r;
          break;
        }
      }
    }
  }
  audit.push({
    oldId: old.id,
    nativeElementId: old.nativeElementId,
    originalFailure: initial,
    probes,
    outcome: replacement
      ? "superseded-with-checked-replacement"
      : "held-no-supported-replacement",
  });
  review.entries.push({
    oldId: old.id,
    oldRecordSha256: sha(old),
    reviewState: replacement ? "superseded" : "held",
    reason: replacement
      ? "Current original column profile and bounded threshold pass both physical consumers."
      : "Retain failed original recipe as held: " + initial,
    ...(replacement ? { replacement } : {}),
  });
}
for (const entry of review.entries)
  if (entry.replacement)
    entry.replacement.evidenceSha256 =
      sourceDoorBoundaryClosureEntryEvidenceSha256(review, entry);
await writeFile(
  path.join(out, "door-closure-audit.json"),
  JSON.stringify(
    {
      originalRows: descriptor.doors.length,
      unchangedActive: unchanged.length,
      reviewedRows: stale.length,
      audit,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
await writeFile(
  path.join(out, "proposed-door-boundary-review.json"),
  JSON.stringify(review, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    unchanged: unchanged.length,
    reviewed: stale.length,
    replacements: review.entries.filter((r) => r.replacement).length,
  }),
);
const checked = await roomsWithCheckedSourceDoorBoundaryClosureReview(
  rooms,
  state.context,
  cache.nativeModel,
  {
    sourceRoomsSha256: state.sourceRoomsSha256,
    nativeCacheSha256: state.nativeCacheSha256,
    review,
  },
);
verifySourceDoorBoundaryClosureReviewDelta(
  rooms,
  checked.rooms,
  {
    sourceModelSha256: state.modelSha,
    originalSourceRoomsSha256: state.sourceRoomsSha256,
    nativeCacheSha256: state.nativeCacheSha256,
  },
  review,
  checked.receipt,
);
await writeFile(
  path.join(out, "checked-door-boundary-review.json"),
  JSON.stringify(review, null, 2) + "\n",
  { flag: "wx" },
);
await writeFile(
  path.join(out, "door-boundary-replay.json"),
  JSON.stringify(checked.receipt, null, 2) + "\n",
  { flag: "wx" },
);
await writeFile(
  path.join(out, "checked-door-source-state.bin"),
  serialize({ ...state, rooms: checked.rooms }),
  { flag: "wx" },
);
console.log(
  "Checked source door review and independent delta passed. No physical portal or route admitted.",
);
