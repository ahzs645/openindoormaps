import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
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
  reviewedAreaPartitionEvidenceStatuses,
  reviewedAreaPartitionEvidenceSnapshotBytes,
  REVIEWED_PARTITION_EVIDENCE_SNAPSHOT_MAX_BYTES,
  type ReviewedAreaPartition,
} from "../../app/indoor-project/reviewed-area-partitions";
import { reviewedAreaPartitionEvidenceSnapshotSha256 } from "../../app/indoor-project/reviewed-area-partition-evidence";
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

const moveWall = (
  d: IndoorDataset,
  id: number,
  f: (ring: Point[]) => Point[],
): IndoorDataset => ({
  ...d,
  walls: d.walls.map((w) =>
    w.nativeElementId === id
      ? { ...w, ringsFeet: [f(w.ringsFeet[0] as Point[])] }
      : w,
  ),
});
const firstVertexBy = (dy: number) => (r: Point[]) =>
  r.map(([x, y], i) => (i ? [x, y] : [x, y + dy]) as Point);

test("floating-point noise at the boundary passes the tolerant snapshot test; real local changes do not", async () => {
  const p = await fixture();
  const local = await bindReviewedAreaPartitionEvidence(
    p.dataset,
    partition("0".repeat(64)),
  );
  assert(local.evidenceSnapshot);
  assert(
    reviewedAreaPartitionEvidenceSnapshotBytes(local.evidenceSnapshot) <=
      REVIEWED_PARTITION_EVIDENCE_SNAPSHOT_MAX_BYTES,
  );
  const statusOf = async (d: IndoorDataset) =>
    (await reviewedAreaPartitionEvidenceStatuses(d, [local]))[local.id]!;
  // Unchanged: exact fast path.
  assert.equal((await statusOf(p.dataset)).test, "exact");

  // One ulp at a return the line ends on: the digest differs, the snapshot holds.
  const ulp = moveWall(p.dataset, 201, firstVertexBy(2 ** -48));
  assert.notEqual(
    (await reviewedAreaPartitionLocalEvidence(ulp, local)).sha256,
    local.geometrySha256,
  );
  const tolerant = await statusOf(ulp);
  assert.equal(tolerant.test, "tolerance");
  assert(
    tolerant.maxVertexDeltaFeet! > 0 && tolerant.maxVertexDeltaFeet! < 1e-12,
  );
  assert.equal(
    checkReviewedAreaPartition(ulp, local, tolerant.digest).valid,
    true,
  );
  const selected = await deriveNativeAreas(
    {
      ...ulp,
      reviewedAreaPartitions: {
        version: 1,
        sourceModelSha256: ulp.source.modelSha256,
        partitions: [{ ...local, status: "applied" }],
      },
    },
    1,
    {},
  );
  assert.deepEqual(selected.logicalPartitionEvidenceTests, {
    [local.id]: "tolerance",
  });

  const cases: [string, IndoorDataset, RegExp][] = [
    // 1e-4 ft is a real move.
    ["moved", moveWall(p.dataset, 201, firstVertexBy(1e-4)), /geometry/],
    [
      "added",
      {
        ...p.dataset,
        walls: [
          ...p.dataset.walls,
          {
            levelId: 1,
            nativeElementId: 300,
            ringsFeet: [rect(19, 9, 0.4, 2)],
          },
        ],
      },
      /added/,
    ],
    [
      "removed",
      {
        ...p.dataset,
        walls: p.dataset.walls.filter((w) => w.nativeElementId !== 201),
      },
      /removed/,
    ],
    // Same outline, one more vertex: a topology change, not noise.
    [
      "split edge",
      moveWall(p.dataset, 201, (r) => [r[0]!, [15, 12], ...r.slice(1)]),
      /topology/,
    ],
  ];
  for (const [name, changed, why] of cases) {
    const status = await statusOf(changed);
    assert.equal(status.test, "changed", name);
    assert.match(
      JSON.stringify(status.differences),
      why,
      `${name}: ${JSON.stringify(status.differences)}`,
    );
    const check = checkReviewedAreaPartition(changed, local, status.digest);
    assert.equal(check.valid, false, name);
    assert.match(check.errors.join(" "), /evidence window/);
  }

  // A snapshot only speaks for the digest it hashes to.
  const tampered = {
    ...local,
    evidenceSnapshot: {
      ...local.evidenceSnapshot,
      header: { ...local.evidenceSnapshot.header, strict: true },
    },
  };
  assert.equal(
    (await reviewedAreaPartitionEvidenceStatuses(ulp, [tampered]))[local.id]!
      .test,
    "changed",
  );
  // No snapshot: exact binding only.
  const { evidenceSnapshot: _, ...exactOnly } = local;
  assert.equal(
    (await reviewedAreaPartitionEvidenceStatuses(ulp, [exactOnly]))[local.id]!
      .test,
    "changed",
  );
  // Oversized or malformed snapshots are rejected.
  assert.throws(() =>
    validateReviewedAreaPartitions({
      version: 1,
      sourceModelSha256: p.dataset.source.modelSha256,
      partitions: [
        {
          ...local,
          evidenceSnapshot: {
            ...local.evidenceSnapshot,
            records: [
              [
                "walls",
                "x",
                "y".repeat(REVIEWED_PARTITION_EVIDENCE_SNAPSHOT_MAX_BYTES),
              ],
            ],
          },
        },
      ],
    }),
  );
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
    evidenceTest: "exact",
    maxVertexDeltaFeet: 0,
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

  assert.equal(rebound.partition.reboundFrom?.evidenceTest, "exact");
  assert(rebound.partition.evidenceSnapshot);
  assert.equal(migrated.history?.at(-1)?.after?.evidenceSnapshot, undefined);
  // Floating-point noise at the boundary since the review: re-bound via tolerance.
  const noisy = moveWall(current, 201, firstVertexBy(2 ** -48));
  const viaTolerance = decideReviewedAreaPartitionRebind(
    legacy,
    sources,
    await reviewedAreaPartitionLocalEvidence(noisy, legacy),
  );
  assert.equal(viaTolerance.outcome, "rebound");
  if (viaTolerance.outcome !== "rebound") return;
  assert.equal(viaTolerance.partition.reboundFrom?.evidenceTest, "tolerance");
  assert(viaTolerance.partition.reboundFrom!.maxVertexDeltaFeet! > 0);
  assert.equal(
    (
      await reviewedAreaPartitionEvidenceStatuses(noisy, [
        viaTolerance.partition,
      ])
    )[legacy.id]!.test,
    "exact",
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
    { collection: "walls", key: "201", change: "changed", detail: "geometry" },
  ]);
  assert.match(refused.reason, /evidence window/);
  // Already bound locally: nothing to do.
  assert.equal(
    decideReviewedAreaPartitionRebind(rebound.partition, sources, now).outcome,
    "already-local",
  );
});

/** Seal rows that stand on one level-wide slab, as drawing-backed rows do: each
 * carries the slab's full parts in its floor binding and digests of them. */
async function slabBoundFixture() {
  const p = await fixture();
  const slab = (ring: Point[]): Point[][][] => [[ring]];
  const fullSlab: Point[] = rect(0, 0, 100, 20);
  const row = (id: string, body: Point[], slabRing: Point[] = fullSlab) => {
    const binding = [
      { nativeElementId: 100, elevationFeet: 0, partsFeet: slab(slabRing) },
    ];
    const digest = (v: unknown) =>
      createHash("sha256").update(JSON.stringify(v)).digest("hex");
    const r = {
      id,
      levelId: 1,
      elevationFeet: 0,
      baseElevationFeet: 0,
      topElevationFeet: 9,
      state: "applied",
      partsFeet: [[body]],
      sourceFloorIds: [100],
      sourceFloorBindings: binding,
      sourceFloorPartsSha256: digest(binding),
      drawingBacked: {
        version: 1,
        kind: "exact-contact-closure",
        nativeOwnerIds: [200, 201],
        construction: {
          kind: "bridge",
          pointAFeet: body[0],
          pointBFeet: body[2],
          directionFeet: [1, 0],
          halfWidthFeet: 0.0001,
          overlapFeet: 0.0001,
        },
      },
      assumption: { kind: "drawing-backed", evidenceSha256: "2".repeat(64) },
    };
    return { ...r, evidenceSha256: digest(r) };
  };
  const strict = (
    rows: ReturnType<typeof row>[],
    slabRing: Point[] = fullSlab,
  ) =>
    ({
      ...p.dataset,
      walkingSupport: {
        ...p.dataset.walkingSupport!,
        floors: [
          { nativeElementId: 100, elevationFeet: 0, ringsFeet: [slabRing] },
        ],
      },
      nativeIndoorEnvelopes: {
        version: 1,
        sourceModelSha256: p.dataset.source.modelSha256,
        geometrySha256: "3".repeat(64),
        levels: [],
      },
      nativeProvisionalCornerSeals: {
        version: 1,
        sourceModelSha256: p.dataset.source.modelSha256,
        sourceMaterialGeometrySha256: "c".repeat(64),
        sourceWallPositionRepairsSha256: "d".repeat(64),
        geometrySha256: `${rows.length}`.padStart(64, "e"),
        completeOriginalPhysicalOwnerCensusSha256: "1".repeat(64),
        foreignBodies: [],
        rows,
      },
    }) as unknown as IndoorDataset;
  return { fullSlab, row, strict };
}

test("a row far away on the same slab does not stale the partition; its floor binding is not local evidence", async () => {
  const { row, strict } = await slabBoundFixture();
  const base = strict([]);
  const local = await bindReviewedAreaPartitionEvidence(
    base,
    partition("0".repeat(64)),
  );
  // 60 ft away; its binding holds the whole slab, which contains the window.
  const far = strict([row("db:far", rect(80, 10, 0.1, 0.1))]);
  const evidence = await reviewedAreaPartitionLocalEvidence(far, local);
  assert.equal(evidence.sha256, local.geometrySha256);
  assert(
    !evidence.records.some((r) => r.collection === "provisionalCornerSeals"),
  );
  assert.equal(
    (await reviewedAreaPartitionEvidenceStatuses(far, [local]))[local.id]!.test,
    "exact",
  );
  // Many far rows anywhere on the level: still exact.
  const many = strict(
    Array.from({ length: 20 }, (_, i) =>
      row(`db:far:${i}`, rect(30 + i * 3, 1 + (i % 15), 0.1, 0.1)),
    ),
  );
  assert.equal(
    (await reviewedAreaPartitionEvidenceStatuses(many, [local]))[local.id]!
      .test,
    "exact",
  );
});

test("a row whose body meets the window stales the partition, and only its window trace is recorded", async () => {
  const { row, strict } = await slabBoundFixture();
  const local = await bindReviewedAreaPartitionEvidence(
    strict([]),
    partition("0".repeat(64)),
  );
  const near = strict([row("db:near", rect(16, 9, 0.1, 2))]);
  const status = (await reviewedAreaPartitionEvidenceStatuses(near, [local]))[
    local.id
  ]!;
  assert.equal(status.test, "changed");
  assert.deepEqual(status.differences, [
    { collection: "provisionalCornerSeals", key: "db:near", change: "added" },
  ]);
  const record = (
    await reviewedAreaPartitionLocalEvidence(near, local)
  ).records.find((r) => r.collection === "provisionalCornerSeals")!;
  const value = JSON.parse(record.value);
  // Body and construction as window traces; the slab only as its window trace
  // (no edge meets this window, all four corners inside); no full-slab digests.
  assert.notEqual(value.partsFeet, null);
  assert.notEqual(value.drawingBacked.construction.pointAFeet, null);
  assert.deepEqual(value.sourceFloorBindings[0].partsFeet, [[["o", 15, []]]]);
  assert.equal(value.sourceFloorPartsSha256, undefined);
  assert.equal(value.evidenceSha256, undefined);
  assert.equal(value.assumption.evidenceSha256, "2".repeat(64));
  assert(!record.value.includes("100,0"));
});

test("a slab edit inside the window stales the partition; a slab edit away from it does not", async () => {
  const { fullSlab, row, strict } = await slabBoundFixture();
  const body = rect(16, 9, 0.1, 2);
  const local = await bindReviewedAreaPartitionEvidence(
    strict([row("db:near", body)]),
    partition("0".repeat(64)),
  );
  // A notch in the slab edge reaching into the window (x 18..19, up to y 4).
  const notched: Point[] = [
    [0, 0],
    [18, 0],
    [18, 4],
    [19, 4],
    [19, 0],
    ...fullSlab.slice(1),
  ];
  const inside = strict([row("db:near", body, notched)], notched);
  const changed = (
    await reviewedAreaPartitionEvidenceStatuses(inside, [local])
  )[local.id]!;
  assert.equal(changed.test, "changed");
  assert.match(JSON.stringify(changed.differences), /provisionalCornerSeals/);
  assert.match(JSON.stringify(changed.differences), /floors/);
  // The same row re-generated on a slab moved 60 ft away from the window: its
  // floor digest and row digest change, the local evidence does not.
  const moved: Point[] = [
    [0, 0],
    [100, -1],
    [100, 20],
    [0, 20],
  ];
  const away = strict([row("db:near", body, moved)], moved);
  assert.notEqual(
    away.nativeProvisionalCornerSeals!.rows[0]!.sourceFloorPartsSha256,
    strict([row("db:near", body)]).nativeProvisionalCornerSeals!.rows[0]!
      .sourceFloorPartsSha256,
  );
  assert.equal(
    (await reviewedAreaPartitionEvidenceStatuses(away, [local]))[local.id]!
      .test,
    "exact",
  );
});

test("a snapshot bound before the floor-bound row reduction still compares on its local content", async () => {
  const { row, strict } = await slabBoundFixture();
  const data = strict([row("db:far", rect(80, 10, 0.1, 0.1))]);
  const local = await bindReviewedAreaPartitionEvidence(
    data,
    partition("0".repeat(64)),
  );
  // What the previous reduction stored for the far row: every plan value
  // traced (only the slab is local) and the full-slab digests.
  const previous = {
    ...local.evidenceSnapshot!,
    records: [
      ...local.evidenceSnapshot!.records,
      [
        "provisionalCornerSeals",
        "db:far",
        JSON.stringify({
          baseElevationFeet: 0,
          drawingBacked: { construction: { pointAFeet: null } },
          elevationFeet: 0,
          evidenceSha256: "9".repeat(64),
          id: "db:far",
          partsFeet: null,
          sourceFloorBindings: [
            {
              elevationFeet: 0,
              nativeElementId: 100,
              partsFeet: [[["o", 15, []]]],
            },
          ],
          sourceFloorPartsSha256: "8".repeat(64),
        }),
      ] as [string, string, string],
    ].sort(),
  };
  const old = {
    ...local,
    evidenceSnapshot: previous,
    geometrySha256: await reviewedAreaPartitionEvidenceSnapshotSha256(previous),
  };
  const status = (await reviewedAreaPartitionEvidenceStatuses(data, [old]))[
    old.id
  ]!;
  assert.equal(status.test, "tolerance");
  assert.equal(status.maxVertexDeltaFeet, 0);
  // A stored row whose own body was local is still compared: removing it is a change.
  const bodyLocal = {
    ...previous,
    records: previous.records.map((r) =>
      r[1] === "db:far"
        ? ([
            r[0],
            r[1],
            r[2].replace('"partsFeet":null', '"partsFeet":[[16,9]]'),
          ] as [string, string, string])
        : r,
    ),
  };
  const stale = {
    ...local,
    evidenceSnapshot: bodyLocal,
    geometrySha256:
      await reviewedAreaPartitionEvidenceSnapshotSha256(bodyLocal),
  };
  assert.equal(
    (await reviewedAreaPartitionEvidenceStatuses(data, [stale]))[stale.id]!
      .test,
    "changed",
  );
});
