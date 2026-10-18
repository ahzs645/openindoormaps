/** Regenerate review proposals from recovered originals. Every change must pass
 * existing original-source physical consumers; no saved receipt grants authority.
 * Invocation: node --import tsx scripts/indoor/recover-unbc-review-inputs.ts ROOT
 * ROOT contains reviews/boundary-locators.json and materials/reissued/cache.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { serialize } from "node:v8";
import { unzipSync } from "fflate";
import { unpackReviewBundle } from "../../../reviter/lib/reviter/review-bundle-wire.ts";
import { hydrateRoomNativeMaterials } from "../../../reviter/lib/reviter/native-material-wire.ts";
import { nativeDrawingReferenceInstanceHash } from "../../../reviter/lib/reviter/native-drawing-reference-source.ts";
import { reviewedDrawingReferencesHash } from "../../../reviter/lib/reviter/reviewed-drawing-references.ts";
import { reviewedDrawingReferenceElementIds } from "../../../reviter/lib/reviter/reviewed-drawing-reference-source.ts";
import { proposeNativeColumnSourceCapSupersession } from "../../../reviter/lib/reviter/native-column-cap-supersession.ts";
import { nativeMaterialPlanWalls } from "../../../reviter/lib/reviter/native-material-plan.ts";
import { deriveNativeMaterialSectionSupplement } from "../../../reviter/lib/reviter/native-material-section-supplement-derive.ts";
import { nativeWallPositionRepairedWalls } from "../../../reviter/lib/reviter/native-wall-position-repairs.ts";
import { architecturalPlanGeometry } from "../../../reviter/lib/reviter/architectural-plan.ts";
import { initializeNativeExactGeosOverlay } from "../../../reviter/lib/reviter/native-exact-geos-overlay.ts";
import { routingFloorPlateRecords } from "../../../reviter/lib/reviter/routing-floor-support.ts";
import { roomsWithCurrentDrawingFloorBindings } from "./rebind-drawing-floor-source-review.ts";
import { roomsWithDrawingReferenceReview } from "./source-drawing-reference-review.ts";
import {
  roomsWithCheckedNativeBoundaryReviewBundle,
  nativeBoundaryReviewBundleEntryEvidenceSha256,
} from "./source-native-boundary-review-bundle.ts";
import { verifyBoundaryReviewBundleSourceDelta } from "./boundary-review-bundle-scope-proof.ts";
import type { NativeBoundaryReviewBundle } from "./source-native-boundary-review-bundle.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import type { IndoorDataset } from "../../../reviter/lib/reviter/indoor-contract.ts";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory.ts";
import type {
  NativeBoundaryPatch,
  BoundaryWall,
} from "../../../reviter/lib/reviter/native-boundary-patches.ts";
const { join, resolve } = path;
const root = resolve(process.argv[2]!),
  recovered = resolve(root, "../unbc-recovery-20261017"),
  out = join(root, "reviews");
const hash = (b: Uint8Array | string) =>
    createHash("sha256").update(b).digest("hex"),
  sha = (v: unknown) => hash(JSON.stringify(v));
await initializeNativeExactGeosOverlay();
await mkdir(out, { recursive: true });
const master = await readFile(
  join(recovered, "UNBC.master.20261014.reviter.zip"),
);
assert.equal(
  hash(master),
  "13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520",
);
const files = unzipSync(master, {
  filter: (f) =>
    ["floors/rooms.json", "review/companions.bin"].includes(f.name),
});
const rooms = (await hydrateRoomNativeMaterials(
  JSON.parse(new TextDecoder().decode(files["floors/rooms.json"])),
)) as RoomDirectoryData;
rooms.reviewBundle = await unpackReviewBundle(rooms.reviewBundle, files);
const sourceRoomsSha256 = hash(files["floors/rooms.json"]!),
  context = (await hydrateRoomNativeMaterials(
    JSON.parse(
      await readFile(
        join(recovered, "reconstructed-input/indoor.json"),
        "utf8",
      ),
    ),
  )) as IndoorDataset;
const cacheBytes = await readFile(
  join(root, "materials/reissued/UNBC.regenerated-materials.native-cache.json"),
);
const nativeCacheSha256 = hash(cacheBytes),
  cache = JSON.parse(cacheBytes.toString()) as {
    sourceModelSha256: string;
    nativeModel: ConvertResult;
  };
const model = cache.nativeModel,
  modelSha = cache.sourceModelSha256;
assert.equal(modelSha, context.source.modelSha256);
assert.equal(context.source.roomsSha256, sourceRoomsSha256);
const decision = {
  sourceModelSha256: modelSha,
  decision: "Drawing references only",
  scope:
    "Original imported DWG floor plans, including Building 10 Teaching and Learning Centre L4.DWG",
  provenance:
    "Explicit owner answer in this chat; retained authorization, not an inferred geometry classification.",
};
await writeFile(
  join(out, "drawing-reference-owner-decision.json"),
  JSON.stringify(decision, null, 2) + "\n",
  { flag: "wx" },
);
const inventory = model.nativeDrawingReferenceSource!;
const drawingReview = {
  version: 1 as const,
  sourceModelSha256: modelSha,
  sourceInventorySha256: inventory.geometrySha256,
  decisionEvidenceSha256: sha(decision),
  instances: inventory.instances.map((f) => {
    const identities = model.nativeIdentity!.identities.filter(
      (i) => i.elementId === f.nativeElementId,
    );
    assert.equal(identities.length, 1);
    assert(
      /\.dwg$/i.test(f.sourceFileName) ||
        f.sourceFileName === "UNBC Floor Plan",
      "Unexpected original import requires review",
    );
    return {
      nativeElementId: f.nativeElementId,
      nativeUniqueId: identities[0]!.uniqueId,
      sourceFactSha256: nativeDrawingReferenceInstanceHash(f),
      sourceName: f.sourceFileName,
      classification: "drawing-reference" as const,
    };
  }),
  geometrySha256: "",
};
drawingReview.geometrySha256 = reviewedDrawingReferencesHash(drawingReview);
assert.equal(
  reviewedDrawingReferenceElementIds(model, drawingReview, modelSha).size,
  27,
);
await writeFile(
  join(out, "reviewed-drawing-references.json"),
  JSON.stringify(drawingReview, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  "Original drawing-reference identities and owner decision checked: 27",
);
const drawing = roomsWithDrawingReferenceReview(rooms, drawingReview, modelSha);
const floor = await roomsWithCurrentDrawingFloorBindings(
  model,
  drawing,
  modelSha,
  context,
);
await writeFile(
  join(out, "drawing-floor-bindings-replay.json"),
  JSON.stringify(floor.receipt, null, 2) + "\n",
  { flag: "wx" },
);
console.log("Drawing floor review: " + floor.receipt.status);
const before = floor.rooms;
// Build the same original physical source operands as the atomic consumer.
const walls: IndoorDataset["walls"] = [];
for (const id of new Set(before.annotations.map((r) => r.levelId))) {
  const g = architecturalPlanGeometry(model, id);
  walls.push(
    ...[
      ...g.walls.map((w) => ({ ...w, kind: "wall" as const })),
      ...g.columns.map((w) => ({ ...w, kind: "column" as const })),
    ]
      .filter((w) => w.polygon.length >= 3)
      .map((w) => ({
        levelId: id,
        nativeElementId: w.elementId,
        kind: w.kind,
        approximate: w.approximate,
        ringsFeet: [w.polygon],
      })),
  );
}
const supplement = deriveNativeMaterialSectionSupplement(
  model,
  before.nativeMaterialSections!,
);
let stage = {
  ...floor.replayContext,
  walls,
  nativeMaterialSections: before.nativeMaterialSections,
  nativeMaterialSectionSupplement: supplement.supplement,
  nativeWallPositionRepairs: before.nativeWallPositionRepairs,
  nativeProvisionalCornerSeals: before.nativeProvisionalCornerSeals,
  nativeDerivedFrameReturns: before.nativeDerivedFrameReturns,
} as IndoorDataset;
stage = {
  ...stage,
  walls: nativeWallPositionRepairedWalls(stage, { deferPhysicalChecks: true }),
};
const wallCache = new Map<number, BoundaryWall[]>(),
  material = (levelId: number) => {
    if (!wallCache.has(levelId))
      wallCache.set(
        levelId,
        nativeMaterialPlanWalls(stage, levelId, before.reviewedDoorApertures),
      );
    return wallCache.get(levelId)!;
  };
const locators = JSON.parse(
  await readFile(join(out, "boundary-locators.json"), "utf8"),
) as {
  oldPatchId: string;
  sourceWallId: number;
  targetNativeElementId: number;
  kind: NativeBoundaryReviewBundle["entries"][number]["kind"];
}[];
const bundle: NativeBoundaryReviewBundle = {
  format: "source-native-boundary-review-bundle-v1",
  sourceModelSha256: modelSha,
  sourceRoomsSha256,
  nativeCacheSha256,
  entries: [],
};
for (const loc of locators) {
  const old = before.nativeBoundaryPatches!.patches.find(
    (p) => p.id === loc.oldPatchId,
  );
  assert(old, "Original recipe missing: " + loc.oldPatchId);
  const physical = material(old.levelId),
    targets = physical.filter(
      (w) =>
        w.nativeElementId === loc.targetNativeElementId &&
        !(w as { reviewPatchId?: string }).reviewPatchId &&
        !w.approximate &&
        (w as { geometrySource?: string }).geometrySource ===
          "original-native-material-section",
    );
  assert.equal(targets.length, 1, "Ambiguous target: " + old.id);
  const target = targets[0]!;
  const bodies = model.elementBounds.filter(
    (r) => r.elementId === loc.targetNativeElementId,
  );
  assert.equal(bodies.length, 1);
  const entry: NativeBoundaryReviewBundle["entries"][number] = {
    ...loc,
    oldPatchSha256: sha(old),
    targetNativeBodySha256: sha(bodies[0]),
    replacementPatches: [],
  };
  let next: NativeBoundaryPatch;
  if (loc.kind === "native-column-cap-current-source") {
    const owners = physical.filter(
      (w) =>
        w.nativeElementId === loc.sourceWallId &&
        !w.reviewPatchId &&
        !w.approximate &&
        (w as { geometrySource?: string }).geometrySource ===
          "original-native-material-section",
    );
    const proposed = proposeNativeColumnSourceCapSupersession(
      old,
      target,
      owners,
    );
    assert(
      proposed.ok,
      "Column source proposal refused: " +
        old.id +
        " " +
        (proposed.ok ? "" : proposed.blockers.join(";")),
    );
    next = proposed.replacementPatches[0]!;
    const sourceBodies = model.elementBounds.filter(
      (r) => r.elementId === loc.sourceWallId,
    );
    assert.equal(sourceBodies.length, 1);
    entry.sourceCapReview = {
      ...proposed.sourceCapReview,
      sourceNativeBodySha256: sha(sourceBodies[0]),
    };
  } else {
    next = {
      ...structuredClone(old),
      id: old.id + ":recovered-original-source-v1",
      status: "proposed",
      wallEvidence: old.wallEvidence.map((w) =>
        w.nativeElementId === loc.sourceWallId
          ? structuredClone(w)
          : {
              nativeElementId: target.nativeElementId,
              kind: target.kind,
              ringsFeet: structuredClone(target.ringsFeet),
            },
      ),
    };
    if (loc.kind === "native-member") {
      entry.targetNativeHostRelationsSha256 = sha(
        model.nativeHostRelations!.filter(
          (h) => h.elementId === loc.targetNativeElementId,
        ),
      );
      const proof = next.continuationProof!,
        [a, b] = proof.sourceCapFeet,
        oldEnd = proof.targetContactFeet;
      let ux = (oldEnd[0][0] + oldEnd[1][0] - a[0] - b[0]) / 2,
        uy = (oldEnd[0][1] + oldEnd[1][1] - a[1] - b[1]) / 2;
      const length = Math.hypot(ux, uy);
      ux /= length;
      uy /= length;
      const hit = (p: [number, number]): [number, number] => {
        const hits: { t: number; p: [number, number] }[] = [];
        const ring = target.ringsFeet[0]!;
        for (let i = 0; i < ring.length; i++) {
          const q = ring[i]!,
            r = ring[(i + 1) % ring.length]!,
            vx = r[0] - q[0],
            vy = r[1] - q[1],
            den = ux * vy - uy * vx;
          if (!den) continue;
          const t = ((q[0] - p[0]) * vy - (q[1] - p[1]) * vx) / den,
            s = ((q[0] - p[0]) * uy - (q[1] - p[1]) * ux) / den;
          if (t > 0 && s >= 0 && s <= 1)
            hits.push({ t, p: [p[0] + ux * t, p[1] + uy * t] });
        }
        hits.sort((a, b) => a.t - b.t);
        assert(hits.length);
        return hits[0]!.p;
      };
      const c = hit(a),
        d = hit(b),
        nudge = (p: [number, number], s: number): [number, number] => [
          p[0] + ux * s,
          p[1] + uy * s,
        ];
      next.ringsFeet = [
        [
          nudge(a, -0.0002),
          nudge(b, -0.0002),
          nudge(d, 0.0002),
          nudge(c, 0.0002),
        ],
      ];
      next.widthFeet = Math.max(
        Math.hypot(c[0] - a[0], c[1] - a[1]),
        Math.hypot(d[0] - b[0], d[1] - b[1]),
      );
      proof.targetContactFeet = [c, d];
      delete proof.targetContactPathFeet;
    }
  }
  next.notes +=
    " Recovery: newly derived from exact current original source; independently checked by atomic consumer.";
  if (old.id === "all07:311:700050-738670:1") {
    const z = model.levels.find((l) => l.levelId === old.levelId)!.elevation!,
      records = routingFloorPlateRecords(model, z),
      ids = [400_238, 444_577];
    const named = ids.map((id) => {
      const rows = records.filter((f) => f.elementId === id);
      assert.equal(rows.length, 1);
      return rows[0]!;
    });
    entry.floorSupportReview = {
      kind: "existing-native-slab-join-support",
      nativeFloorIds: ids,
      sourceFloorRecordsSha256: sha(named),
      boundEnvelopeSha256: before.nativeIndoorEnvelopes!.geometrySha256,
      walkingAuthorityVersion: "native-slab-join-closures-v1",
    };
  }
  entry.replacementPatches = [next];
  bundle.entries.push(entry);
}
for (const e of bundle.entries)
  for (const p of e.replacementPatches)
    (p.continuationProof ?? p.drawingReconstructionProof)!.evidenceSha256 =
      nativeBoundaryReviewBundleEntryEvidenceSha256(bundle, e, p);
await writeFile(
  join(out, "proposed-boundary-review-bundle.json"),
  JSON.stringify(bundle, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  "Reconstructed all 29 proposals; replaying complete source guards.",
);
const applied = await roomsWithCheckedNativeBoundaryReviewBundle(
  before,
  context,
  model,
  { sourceRoomsSha256, nativeCacheSha256, review: bundle },
);
const delta = verifyBoundaryReviewBundleSourceDelta(
  before,
  applied.rooms,
  {
    sourceModelSha256: modelSha,
    originalSourceRoomsSha256: sourceRoomsSha256,
    nativeCacheSha256,
  },
  bundle,
  applied.receipt,
);
await writeFile(
  join(out, "checked-boundary-review-bundle.json"),
  JSON.stringify(bundle, null, 2) + "\n",
  { flag: "wx" },
);
await writeFile(
  join(out, "boundary-replay.json"),
  JSON.stringify(applied.receipt, null, 2) + "\n",
  { flag: "wx" },
);
await writeFile(
  join(out, "boundary-independent-delta.json"),
  JSON.stringify(delta, null, 2) + "\n",
  { flag: "wx" },
);
await writeFile(
  join(out, "checked-source-state.bin"),
  serialize({
    rooms: applied.rooms,
    context,
    modelSha,
    sourceRoomsSha256,
    nativeCacheSha256,
  }),
  { flag: "wx" },
);
console.log(
  "All 29 boundary reviews and independent source-delta proof passed.",
);
