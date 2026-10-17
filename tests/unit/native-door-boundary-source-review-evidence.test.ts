import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { validateNativeDoorBoundarySourceReviewEvidence as app } from "../../app/indoor-project/native-door-boundary-source-review-evidence";
import { validateNativeDoorBoundarySourceReviewEvidence as source } from "../../../reviter/lib/reviter/native-door-boundary-source-review-evidence.ts";
import { parseRoomDirectory } from "../../../reviter/lib/reviter/room-directory.ts";
import { project } from "../fixtures/native-area-project";
import {
  exportIndoorProject,
  exportCampusViewer,
  readIndoorProject,
} from "../../app/indoor-project/package";
const model = "a".repeat(64),
  sha = (v: unknown) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex"),
  bytesSha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
function entry(sourceModelSha256 = model) {
  const review = {
    format: "source-door-boundary-closure-review-v1",
    sourceModelSha256,
    sourceRoomsSha256: "b".repeat(64),
    nativeCacheSha256: "c".repeat(64),
    sourceBeforeSha256: "d".repeat(64),
    descriptorBeforeSha256: "e".repeat(64),
    currentPreparedSnapshotSha256: "f".repeat(64),
    currentPreparedSnapshot: {
      path: "diagnostic/snapshot.bin",
      sha256: "f".repeat(64),
      bytes: 100,
    },
    entries: [
      {
        oldId: "retained-original",
        oldRecordSha256: "b".repeat(64),
        reviewState: "held",
        reason: "Current original physical evidence does not support a closure",
      },
    ],
  };
  return {
    format: "source-door-boundary-closure-review-evidence-v1" as const,
    sourceModelSha256,
    reviewSha256: sha(review),
    review,
    partitionTransitions: [],
  };
}
for (const [name, validate] of [
  ["app", app],
  ["source", source],
] as const) {
  test(
    name +
      ": exact portable JSON is retained without issuing geometry approval",
    () => {
      const e = [entry()],
        before = JSON.stringify(e);
      validate(undefined, model);
      validate(e, model);
      validate(JSON.parse(before), model);
      assert.equal(JSON.stringify(e), before);
    },
  );
  test(
    name +
      ": altered, foreign, duplicate, unknown-wrapper and transition evidence refuse",
    () => {
      const cases: any[] = [[], null, [entry(), entry()]];
      for (const change of [
        (e: any) => (e.review.entries[0].reason += "changed"),
        (e: any) => (e.sourceModelSha256 = "0".repeat(64)),
        (e: any) => (e.approved = true),
        (e: any) => e.partitionTransitions.push({ id: "unreviewed-partition" }),
        (e: any) => (e.review.sourceModelSha256 = "0".repeat(64)),
        (e: any) => e.review.entries.push(e.review.entries[0]),
        (e: any) => (e.review.sourceAfterSha256 = "0".repeat(64)),
      ]) {
        const e = entry();
        change(e);
        cases.push([e]);
      }
      for (const c of cases)
        assert.throws(() => validate(c, model), /portable native door/);
      assert.throws(
        () => validate([entry()], "0".repeat(64)),
        /portable native door/,
      );
    },
  );
  test(
    name +
      ": bounded plain JSON rejects getters, cycles, sparse/exotic/nonfinite data",
    () => {
      const cases: any[] = [];
      for (const value of [
        new Map(),
        new Uint8Array([1]),
        Infinity,
        () => true,
        Object.create(null),
      ]) {
        const e: any = entry();
        e.review.entries[0].extra = value;
        cases.push([e]);
      }
      const accessor: any = entry();
      Object.defineProperty(accessor.review, "secret", {
        enumerable: true,
        get() {
          throw Error("getter must never execute");
        },
      });
      cases.push([accessor]);
      const cycle: any = entry();
      cycle.review.cycle = cycle.review;
      cases.push([cycle]);
      const sparse: any = entry();
      sparse.review.entries = new Array(2);
      cases.push([sparse]);
      const deep: any = entry();
      let at = deep.review;
      for (let i = 0; i < 70; i++) {
        at.child = {};
        at = at.child;
      }
      cases.push([deep]);
      const oversized: any = entry();
      oversized.review.entries[0].extra = "x".repeat(16 * 1024 * 1024);
      cases.push([oversized]);
      cases.push(Array(1001).fill(entry()));
      for (const c of cases)
        assert.throws(() => validate(c, model), /portable native door/);
    },
  );
  test(
    name +
      ": malformed review identities and unsupported lifecycle shapes refuse after rehash",
    () => {
      for (const change of [
        (e: any) => (e.review.currentPreparedSnapshot.sha256 = "0".repeat(64)),
        (e: any) => (e.review.currentPreparedSnapshot.bytes = 0),
        (e: any) => (e.review.sourceBeforeSha256 = "bad"),
        (e: any) => (e.review.entries[0].reviewState = "active"),
        (e: any) => (e.review.entries[0].reviewState = "superseded"),
        (e: any) => (e.review.entries[0].replacement = {}),
        (e: any) => (e.review.entries[0].oldRecordSha256 = "bad"),
      ]) {
        const e = entry();
        change(e);
        e.reviewSha256 = sha(e.review);
        assert.throws(() => validate([e], model), /portable native door/);
      }
    },
  );
}
test("normal source parser validates history and cross-binds the closure model", () => {
  const rooms = {
    format: "reviter-room-annotations",
    version: 1,
    coordinateSystem: "revit-model-feet",
    model: { fileName: "test.rvt" },
    annotations: [],
    nativeDoorBoundaryClosures: {
      version: 1,
      sourceModelSha256: model,
      doors: [],
    },
    nativeDoorBoundaryClosureReviewHistory: [entry()],
  };
  assert.deepEqual(
    parseRoomDirectory(JSON.stringify(rooms))
      .nativeDoorBoundaryClosureReviewHistory,
    rooms.nativeDoorBoundaryClosureReviewHistory,
  );
  rooms.nativeDoorBoundaryClosureReviewHistory[0].review.entries[0].reason =
    "tampered";
  assert.throws(
    () => parseRoomDirectory(JSON.stringify(rooms)),
    /portable native door/,
  );
});
test("normal app export/import retains history; campus viewer excludes and rejects it", async () => {
  const p = await project();
  p.rooms.nativeDoorBoundaryClosureReviewHistory = [
    entry(p.dataset.source.modelSha256),
  ];
  const master = await readIndoorProject(await exportIndoorProject(p));
  assert.deepEqual(
    master.rooms.nativeDoorBoundaryClosureReviewHistory,
    p.rooms.nativeDoorBoundaryClosureReviewHistory,
  );
  const bytes = await exportCampusViewer(master),
    files = unzipSync(bytes),
    metadata = JSON.parse(strFromU8(files["viewer/metadata.json"]));
  assert.equal(metadata.nativeDoorBoundaryClosureReviewHistory, undefined);
  metadata.nativeDoorBoundaryClosureReviewHistory =
    p.rooms.nativeDoorBoundaryClosureReviewHistory;
  files["viewer/metadata.json"] = strToU8(JSON.stringify(metadata));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  manifest.floors.bytes = files["viewer/metadata.json"].length;
  manifest.floors.sha256 = bytesSha(files["viewer/metadata.json"]);
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  await assert.rejects(
    readIndoorProject(zipSync(files)),
    /Authoring review files/,
  );
  p.rooms.nativeDoorBoundaryClosureReviewHistory[0].reviewSha256 = "0".repeat(
    64,
  );
  await assert.rejects(exportIndoorProject(p), /portable native door/);
});

test("version 1 source packages bind history to actual model bytes without an indoor dataset", async () => {
  const { createProjectPackage, readProjectPackage } = await import(
    "../../../reviter/lib/reviter/project-package.ts"
  );
  const modelFile = new File([new Uint8Array([1, 2, 3, 4])], "model.rvt");
  const modelSha = bytesSha(new Uint8Array(await modelFile.arrayBuffer()));
  const rooms = {
    format: "reviter-room-annotations" as const,
    version: 1 as const,
    coordinateSystem: "revit-model-feet" as const,
    model: { fileName: modelFile.name },
    annotations: [],
    nativeDoorBoundaryClosureReviewHistory: [entry(modelSha)],
  };
  const bytes = await createProjectPackage(modelFile, rooms);
  const restored = await readProjectPackage(bytes);
  assert.deepEqual(
    restored.rooms.nativeDoorBoundaryClosureReviewHistory,
    rooms.nativeDoorBoundaryClosureReviewHistory,
  );
  const foreign = {
    ...rooms,
    nativeDoorBoundaryClosureReviewHistory: [entry("0".repeat(64))],
  };
  await assert.rejects(
    createProjectPackage(modelFile, foreign),
    /portable native door/,
  );
  const files = unzipSync(bytes),
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
  files["floors/rooms.json"] = strToU8(JSON.stringify(foreign));
  manifest.floors.bytes = files["floors/rooms.json"].length;
  manifest.floors.sha256 = bytesSha(files["floors/rooms.json"]);
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  await assert.rejects(
    readProjectPackage(zipSync(files)),
    /portable native door/,
  );
});
