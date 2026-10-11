import assert from "node:assert/strict";
import test from "node:test";
import { project } from "../fixtures/native-area-project";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  REVIEWED_PARTITION_LOCAL_EVIDENCE_RULE,
  auditReviewedAreaPartitions,
  bindReviewedAreaPartitionEvidence,
  checkReviewedAreaPartition,
  decideReviewedAreaPartitionRebind,
  rebindReviewedAreaPartitions,
  reviewedAreaPartitionEvidenceSha256,
  reviewedAreaPartitionGeometrySha256,
  reviewedAreaPartitionLocalEvidence,
  saveReviewedAreaPartition,
  applyReviewedAreaPartitionGroup,
  validateReviewedAreaPartitions,
  type ReviewedAreaPartition,
} from "../../app/indoor-project/reviewed-area-partitions";
import { deriveNativeAreas } from "../../app/indoor-project/native-area-review";

type Point = [number, number];
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
/** A partition between two native returns, plus a curved-ish wall 60 ft away. */
async function fixture() {
  const p = await project();
  p.dataset.walkingSupport = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 100, 20)],
      },
    ],
  };
  p.dataset.walls = [
    { levelId: 1, nativeElementId: 200, ringsFeet: [rect(14.8, 0, 0.4, 8)] },
    { levelId: 1, nativeElementId: 201, ringsFeet: [rect(14.8, 12, 0.4, 8)] },
    {
      levelId: 1,
      nativeElementId: 900,
      ringsFeet: [
        [
          [75, 2],
          [76.1, 2.3],
          [77.05, 3.1],
          [77.3, 4],
          [76.9, 4.2],
          [75, 2.4],
        ],
      ],
    },
  ];
  p.dataset.doors = [];
  return p;
}
const partition = (
  levelHash: string,
  over: Partial<ReviewedAreaPartition> = {},
): ReviewedAreaPartition => ({
  id: "open-front",
  levelId: 1,
  elevationFeet: 0,
  geometrySha256: levelHash,
  kind: "shutter",
  pointsFeet: [
    [15, 8],
    [15, 12],
  ],
  closed: false,
  status: "proposed",
  label: "Pickup shutter front",
  notes: "Close selection only.",
  evidence: {
    kind: "native-endpoints",
    nativeElementIds: [200, 201],
    reason: "Exact native wall returns bound the opening.",
  },
  selection: "closed",
  navigation: "unchanged",
  ...over,
});
const nudgeFarWall = (d: IndoorDataset): IndoorDataset => ({
  ...d,
  walls: d.walls.map((w) =>
    w.nativeElementId === 900
      ? {
          ...w,
          ringsFeet: w.ringsFeet.map((r) =>
            r.map(([x, y], i) =>
              i === 2 ? ([x + 2 ** -46, y] as Point) : ([x, y] as Point),
            ),
          ),
        }
      : w,
  ),
});

test("a far-away wall drift by one ulp does not stale a locally bound partition (but stales a level-bound one)", async () => {
  const p = await fixture();
  const level = await reviewedAreaPartitionGeometrySha256(p.dataset, 1);
  const legacy = partition(level);
  const local = await bindReviewedAreaPartitionEvidence(p.dataset, legacy);
  assert.equal(local.evidenceBinding, REVIEWED_PARTITION_LOCAL_EVIDENCE_RULE);
  assert.notEqual(local.geometrySha256, level);
  const drifted = nudgeFarWall(p.dataset);
  assert.notDeepEqual(drifted.walls[2], p.dataset.walls[2]);
  assert.equal(
    await reviewedAreaPartitionEvidenceSha256(drifted, local),
    local.geometrySha256,
  );
  assert.equal(
    checkReviewedAreaPartition(
      drifted,
      local,
      await reviewedAreaPartitionEvidenceSha256(drifted, local),
    ).valid,
    true,
  );
  // The legacy binding is what made unrelated drift drop boundaries.
  const stale = checkReviewedAreaPartition(
    drifted,
    legacy,
    await reviewedAreaPartitionEvidenceSha256(drifted, legacy),
  );
  assert.equal(stale.valid, false);
  assert.match(stale.errors.join(" "), /Physical evidence changed/);
});

test("a local wall change stales the partition, and the check names the local window", async () => {
  const p = await fixture();
  const local = await bindReviewedAreaPartitionEvidence(
    p.dataset,
    partition("0".repeat(64)),
  );
  const returnMoved = {
    ...p.dataset,
    walls: p.dataset.walls.map((w) =>
      w.nativeElementId === 201
        ? {
            ...w,
            ringsFeet: [
              w.ringsFeet[0]!.map(
                ([x, y], i) => (i ? [x, y] : [x, y + 2 ** -48]) as Point,
              ),
            ],
          }
        : w,
    ),
  };
  const wallAdded = {
    ...p.dataset,
    walls: [
      ...p.dataset.walls,
      { levelId: 1, nativeElementId: 300, ringsFeet: [rect(19, 9, 0.4, 2)] },
    ],
  };
  for (const changed of [returnMoved, wallAdded]) {
    const digest = await reviewedAreaPartitionEvidenceSha256(changed, local);
    assert.notEqual(digest, local.geometrySha256);
    const check = checkReviewedAreaPartition(changed, local, digest);
    assert.equal(check.valid, false);
    assert.match(check.errors.join(" "), /evidence window/);
  }
});

test("the local evidence is canonical: row order, ring start and direction do not matter", async () => {
  const p = await fixture();
  const a = await reviewedAreaPartitionLocalEvidence(
    p.dataset,
    partition("0".repeat(64)),
  );
  const reordered = {
    ...p.dataset,
    walls: [...p.dataset.walls].reverse().map((w) => ({
      ...w,
      ringsFeet: w.ringsFeet.map((r) => [...r.slice(1), r[0]!].reverse()),
    })),
  };
  const b = await reviewedAreaPartitionLocalEvidence(
    reordered,
    partition("0".repeat(64)),
  );
  assert.equal(b.sha256, a.sha256);
  assert(a.records.some((r) => r.collection === "walls" && r.key === "200"));
  assert(!a.records.some((r) => r.collection === "walls" && r.key === "900"));
  // Applying, relabelling or re-noting the boundary is not physical evidence.
  const c = await reviewedAreaPartitionLocalEvidence(
    p.dataset,
    partition("0".repeat(64), {
      status: "applied",
      label: "Renamed",
      notes: "Other notes.",
    }),
  );
  assert.equal(c.sha256, a.sha256);
  // Moving the boundary itself is.
  const d = await reviewedAreaPartitionLocalEvidence(
    p.dataset,
    partition("0".repeat(64), {
      pointsFeet: [
        [15, 8],
        [15, 11.5],
      ],
    }),
  );
  assert.notEqual(d.sha256, a.sha256);
});

test("applying an unrelated seal elsewhere does not stale the partition; a seal at it does", async () => {
  const p = await fixture();
  // Strict-native descriptors are read for their local rows only.
  const seals = (rows: { id: string; partsFeet: Point[][][] }[]) =>
    ({
      version: 1,
      sourceModelSha256: p.dataset.source.modelSha256,
      sourceMaterialGeometrySha256: "c".repeat(64),
      sourceWallPositionRepairsSha256: "d".repeat(64),
      geometrySha256: rows.length > 0 ? "e".repeat(64) : "f".repeat(64),
      completeOriginalPhysicalOwnerCensusSha256: "1".repeat(64),
      foreignBodies: [],
      rows: rows.map((r) => ({
        id: r.id,
        levelId: 1,
        elevationFeet: 0,
        baseElevationFeet: 0,
        topElevationFeet: 9,
        state: "applied",
        partsFeet: r.partsFeet,
        evidenceSha256: "2".repeat(64),
      })),
    }) as unknown as IndoorDataset["nativeProvisionalCornerSeals"];
  const strict = {
    ...p.dataset,
    nativeIndoorEnvelopes: {
      version: 1,
      sourceModelSha256: p.dataset.source.modelSha256,
      geometrySha256: "3".repeat(64),
      levels: [],
    },
    nativeProvisionalCornerSeals: seals([]),
  } as IndoorDataset;
  const local = await bindReviewedAreaPartitionEvidence(
    strict,
    partition("0".repeat(64)),
  );
  const elsewhere = {
    ...strict,
    nativeProvisionalCornerSeals: seals([
      { id: "seal:far", partsFeet: [[rect(80, 10, 0.1, 2)]] },
    ]),
  };
  assert.notEqual(
    await reviewedAreaPartitionGeometrySha256(elsewhere, 1),
    await reviewedAreaPartitionGeometrySha256(strict, 1),
  );
  assert.equal(
    await reviewedAreaPartitionEvidenceSha256(elsewhere, local),
    local.geometrySha256,
  );
  const here = {
    ...strict,
    nativeProvisionalCornerSeals: seals([
      { id: "seal:far", partsFeet: [[rect(80, 10, 0.1, 2)]] },
      { id: "seal:near", partsFeet: [[rect(16, 9, 0.1, 2)]] },
    ]),
  };
  assert.notEqual(
    await reviewedAreaPartitionEvidenceSha256(here, local),
    local.geometrySha256,
  );
});

test("a stale applied partition is reported, counted and never silently dropped", async () => {
  const p = await fixture();
  const local = await bindReviewedAreaPartitionEvidence(
    p.dataset,
    partition("0".repeat(64)),
  );
  const saved = saveReviewedAreaPartition(p, local);
  const applied = applyReviewedAreaPartitionGroup(saved, [local.id], {
    [local.id]: await reviewedAreaPartitionEvidenceSha256(saved.dataset, local),
  });
  const ok = await deriveNativeAreas(applied.dataset, 1, {});
  assert.deepEqual(ok.logicalPartitionIds, [local.id]);
  assert.equal(ok.omittedLogicalPartitions, undefined);
  assert.equal(
    (await auditReviewedAreaPartitions(applied.dataset)).appliedOmittedCount,
    0,
  );
  const changed = {
    ...applied.dataset,
    walls: [
      ...applied.dataset.walls,
      { levelId: 1, nativeElementId: 301, ringsFeet: [rect(17, 1, 0.4, 2)] },
    ],
  };
  const result = await deriveNativeAreas(changed, 1, {});
  assert.equal(result.logicalPartitionIds, undefined);
  assert.deepEqual(
    result.omittedLogicalPartitions?.map((o) => o.id),
    [local.id],
  );
  assert(
    result.warnings.some(
      (w) => w.includes(local.label) && w.includes("omitted from selection"),
    ),
  );
  const audit = await auditReviewedAreaPartitions(changed);
  assert.equal(audit.appliedCount, 1);
  assert.equal(audit.appliedOmittedCount, 1);
  assert.match(audit.entries[0]!.errors.join(" "), /evidence window/);
});

test("migration re-binds where the stored level digest is recovered and the local evidence is unchanged, and refuses otherwise", async () => {
  const p = await fixture();
  const reviewed = p.dataset;
  const level = await reviewedAreaPartitionGeometrySha256(reviewed, 1);
  const legacy = partition(level, { status: "applied" });
  const current = nudgeFarWall(reviewed);
  assert.notEqual(await reviewedAreaPartitionGeometrySha256(current, 1), level);
  const source = async (d: IndoorDataset, sha: string) => ({
    sha256: sha,
    label: `master ${sha.slice(0, 4)}`,
    levelEvidenceSha256: await reviewedAreaPartitionGeometrySha256(d, 1),
    localEvidence: await reviewedAreaPartitionLocalEvidence(d, legacy),
  });
  const now = await reviewedAreaPartitionLocalEvidence(current, legacy);
  const sources = [
    await source(current, "4".repeat(64)),
    await source(reviewed, "5".repeat(64)),
  ];
  const rebound = decideReviewedAreaPartitionRebind(legacy, sources, now);
  assert.equal(rebound.outcome, "rebound");
  if (rebound.outcome !== "rebound") return;
  assert.equal(rebound.source.sha256, "5".repeat(64));
  assert.deepEqual(rebound.partition.reboundFrom, {
    rule: REVIEWED_PARTITION_LOCAL_EVIDENCE_RULE,
    previousRule: "logical-area-partition-physical-v1",
    geometrySha256: level,
    sourceDatasetSha256: "5".repeat(64),
  });
  assert.equal(rebound.partition.status, "applied");
  assert.equal(
    checkReviewedAreaPartition(
      current,
      rebound.partition,
      await reviewedAreaPartitionEvidenceSha256(current, rebound.partition),
    ).valid,
    true,
  );
  const value = {
    version: 1 as const,
    sourceModelSha256: reviewed.source.modelSha256,
    partitions: [legacy],
  };
  const migrated = rebindReviewedAreaPartitions(
    value,
    [rebound],
    "2026-10-11T00:00:00.000Z",
  );
  assert.equal(migrated.history?.at(-1)?.action, "rebind");
  assert.equal(migrated.history?.at(-1)?.before?.geometrySha256, level);
  validateReviewedAreaPartitions(migrated, reviewed.source.modelSha256);
  // A receipt that does not belong to the review is rejected.
  assert.throws(() =>
    validateReviewedAreaPartitions({
      ...migrated,
      history: [
        {
          ...migrated.history!.at(-1)!,
          before: { ...legacy, geometrySha256: "6".repeat(64) },
        },
      ],
    }),
  );
  assert.throws(() =>
    validateReviewedAreaPartitions({
      ...value,
      partitions: [{ ...legacy, reboundFrom: rebound.partition.reboundFrom }],
    }),
  );

  // No candidate reproduces the stored digest: never re-bound.
  const lost = decideReviewedAreaPartitionRebind(legacy, [sources[0]!], now);
  assert.equal(lost.outcome, "needs-review");
  assert.match(
    lost.outcome === "needs-review" ? lost.reason : "",
    /cannot be recovered/,
  );

  // The digest is recovered, but the evidence at the boundary changed since.
  const moved = {
    ...current,
    walls: current.walls.map((w) =>
      w.nativeElementId === 201
        ? { ...w, ringsFeet: [rect(14.8, 12.01, 0.4, 7.99)] }
        : w,
    ),
  };
  const refused = decideReviewedAreaPartitionRebind(
    legacy,
    sources,
    await reviewedAreaPartitionLocalEvidence(moved, legacy),
  );
  assert.equal(refused.outcome, "needs-review");
  if (refused.outcome !== "needs-review") return;
  assert.equal(refused.source?.sha256, "5".repeat(64));
  assert.deepEqual(refused.differences, [
    { collection: "walls", key: "201", change: "changed" },
  ]);
  assert.match(refused.reason, /evidence window/);
  // Already bound locally: nothing to do.
  assert.equal(
    decideReviewedAreaPartitionRebind(rebound.partition, sources, now).outcome,
    "already-local",
  );
});
