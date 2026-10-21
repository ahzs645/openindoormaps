import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  Rational,
  rational as r,
  nativeRationalOverlay,
  type NativeRationalParts,
  type NativeRationalPoint,
} from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import type { NativeStairTypedFifo } from "../../../reviter/lib/reviter/native-stair-typed-fifo.ts";
import {
  replayPortableSteppedStairV2,
  encodeSteppedStairV2Operands,
  decodeSteppedStairV2Operands,
  type PortableSteppedSourceIndex,
  type PortableSteppedReceipt,
  type SteppedSupport,
  type Point3,
} from "../../scripts/indoor/proposals/stepped-stair-v2-kernel.ts";
import { captureOriginalSteppedStairGraphDemand } from "../../scripts/indoor/proposals/original-stepped-stair-graph-demand.ts";
import { extractOriginalSteppedStairV2Candidate } from "../../scripts/indoor/proposals/stepped-stair-v2-source-adapter.ts";

const model = "a".repeat(64),
  schema = "b".repeat(64);
const p = (x: number, y: number, z: number): Point3 => [r(x), r(y), r(z)];
const rect = (x0: number, x1: number, y0 = -2, y1 = 2): NativeRationalParts => [
  [
    [
      [r(x0), r(y0)],
      [r(x1), r(y0)],
      [r(x1), r(y1)],
      [r(x0), r(y1)],
    ],
  ],
];
const clone = <T>(value: T): T =>
  decodeSteppedStairV2Operands(encodeSteppedStairV2Operands(value)) as T;
function originalGraph(direction?: string, oriented = false) {
  const data = {
    source: { modelSha256: model },
    nodes: [
      {
        id: "old:lower",
        kind: "stair",
        roomKey: "lower",
        levelId: 1,
        pointFeet: [-2, 0, 0],
      },
      {
        id: "old:upper",
        kind: "stair",
        roomKey: "upper",
        levelId: 2,
        pointFeet: [4, 0, 3],
      },
    ],
    edges: [
      {
        id: "held:10",
        from: "old:lower",
        to: "old:upper",
        kind: "stairs",
        nativeElementId: 10,
        enabled: false,
        accessible: "no",
        roomKeys: ["lower", "upper"],
        pointsFeet: [
          [-2, 0, 0],
          [4, 0, 3],
        ],
        ...(direction ? { direction } : {}),
      },
    ],
    records: [1, 2].map((levelId) => ({
      key: levelId === 1 ? "lower" : "upper",
      levelId,
      building: "01",
      access: "unknown",
      walkable: true,
      circulation: true,
      stair: true,
    })),
    nativeLevels: [
      { id: 1, elevationFeet: 0 },
      { id: 2, elevationFeet: 3 },
    ],
  };
  if (oriented) {
    const turn = ([x, y, z]: number[]) => [x! - y!, x! + y!, z!];
    for (const node of data.nodes) node.pointFeet = turn(node.pointFeet);
    for (const edge of data.edges) edge.pointsFeet = edge.pointsFeet.map(turn);
  }
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return captureOriginalSteppedStairGraphDemand(
    bytes,
    createHash("sha256").update(bytes).digest("hex"),
    model,
    "held:10",
  );
}
/** Fully enumerated synthetic source FACTS for mathematical testing only.
 * They have no actual-RVT provenance and can never mint route authority. */
function syntheticRun(): NativeStairTypedFifo {
  let token = 0,
    offset = 0;
  const entries: NativeStairTypedFifo["entries"] = [];
  const entry = (sourceClassName: string, value: Record<string, unknown>) => {
    const start = offset;
    offset += 100;
    const descriptor = {
      token: ++token,
      sourceClassSlot:
        sourceClassName === "GLine"
          ? 1973
          : sourceClassName === "CurveLoop"
            ? 1087
            : 4100,
      start,
      end: offset,
      path: `synthetic.${token}`,
    };
    entries.push({
      replayIndex: entries.length,
      descriptor,
      sourceClassName,
      start,
      end: offset,
      value,
      fields: [],
    });
    return descriptor;
  };
  const line = (x: number, z: number) =>
    entry("GLine", {
      m_origin: [x, -2, z],
      m_dirVec: [0, 1, 0],
      m_endParams: [0, 4],
    });
  const lines = [line(0, 1), line(1, 2), line(2, 3)];
  const loops = lines.map((d) =>
    entry("CurveLoop", { m_open: 1, m_curves: [d] }),
  );
  const treads = [0, 1].map((i) =>
    entry("StairsTreadInfo", {
      m_startRiser: { m_specifiedIdx: i, m_pRiserCurve: lines[i] },
      m_endRiser: { m_specifiedIdx: i + 1, m_pRiserCurve: lines[i + 1] },
      m_startLine: lines[i],
      m_endLine: lines[i + 1],
      m_treadType: 3,
      m_actDepth: 1,
      m_riserDir: [0, 1, 0],
      m_runDirProj: [1, 0, 0],
    }),
  );
  const begin = line(0, 0),
    end = line(2, 0);
  return {
    nativeRunId: 20,
    nativeElementId: 20,
    rootClassName: "StairsRun",
    rootClassSlot: 4102,
    rootStaticEnd: 0,
    endOffset: offset,
    root: {
      m_orderedRisers: loops,
      m_stairsTreadInfoArr: treads,
      m_beginWithRiser: 1,
      m_endWithRiser: 1,
      m_baseRiserIndex: 0,
      m_topRiserIndex: 3,
      m_bottomElevation: 0,
      m_topElevation: 3,
      m_oStartRiser: begin,
      m_oEndRiser: end,
    },
    rootFields: [],
    entries,
    completeOriginalTypedRootAndFifoByteReplay: true,
  } as NativeStairTypedFifo;
}
function fixture() {
  const support = (
    id: string,
    nativeOwnerId: number,
    face: number,
    role: SteppedSupport["role"],
    z: number,
    x0: number,
    x1: number,
    extra: Partial<SteppedSupport> = {},
  ): SteppedSupport => ({
    id,
    nativeOwnerId,
    physicalFaceToken: face,
    role,
    elevationFeet: r(z),
    referencePartsFeet: rect(x0, x1),
    innerPartsFeet: rect(x0, x1),
    uncertaintyPartsFeet: [],
    closedUncertaintyFeet: [],
    ...extra,
  });
  const supports = [
    support("lower-floor", 100, 1000, "floor", 0, -5, 0, { nativeLevelId: 1 }),
    support("tread:0", 20, 10, "tread", 1, 0, 1, { typedIndex: 0 }),
    support("tread:1", 20, 11, "tread", 2, 1, 2, { typedIndex: 1 }),
    support("upper-floor", 101, 1001, "floor", 3, 2, 6, { nativeLevelId: 2 }),
  ];
  const cells = supports.map((s) => ({
    id: `cell:${s.id}`,
    nativeOwnerId: s.nativeOwnerId,
    originalFaceTokens: [s.physicalFaceToken],
    minimumElevationFeet: new Rational(
      s.elevationFeet.n * 2n - s.elevationFeet.d,
      s.elevationFeet.d * 2n,
    ),
    maximumElevationFeet: s.elevationFeet,
    partsFeet: s.referencePartsFeet,
    closedSegmentsFeet: [],
  }));
  const physicalBodies = [100, 20, 101].map((owner) => ({
    key: `body:${owner}`,
    nativeOwnerId: owner,
    representation: {
      kind: "cells" as const,
      cellIds: cells.filter((c) => c.nativeOwnerId === owner).map((c) => c.id),
    },
  }));
  const index: PortableSteppedSourceIndex = {
    version: 2,
    kind: "original-native-stepped-source-operands",
    sourceModelSha256: model,
    sourceSchemaSha256: schema,
    sourceCensusScopeFeet: { minimum: p(-10, -10, -1), maximum: p(10, 10, 20) },
    nativeStairId: 10,
    nativeRunId: 20,
    run: syntheticRun(),
    servedLevelIds: [1, 2],
    supports,
    cells,
    physicalBodies,
    requiredPhysicalBodyKeys: physicalBodies.map((b) => b.key),
  };
  const receipt: PortableSteppedReceipt = {
    version: 2,
    kind: "original-native-stepped-support",
    sourceModelSha256: model,
    nativeStairId: 10,
    nativeRunId: 20,
    originalEdgeId: "held:10",
    widthFeet: 2,
    headroomFeet: 6,
    terminals: [
      {
        originalNodeId: "old:lower",
        originalLevelId: 1,
        originalLogicalPointFeet: p(-2, 0, 0),
        physicalAttachmentPointFeet: p(-2, 0, 0),
        logicalToPhysicalHeightDeltaFeet: r(0),
        floorSupportId: "lower-floor",
        approachFeet: [p(-2, 0, 0), p(-0.25, 0, 0)],
        lateralAxis: "y",
      },
      {
        originalNodeId: "old:upper",
        originalLevelId: 2,
        originalLogicalPointFeet: p(4, 0, 3),
        physicalAttachmentPointFeet: p(4, 0, 3),
        logicalToPhysicalHeightDeltaFeet: r(0),
        floorSupportId: "upper-floor",
        approachFeet: [p(4, 0, 3), p(2.25, 0, 3)],
        lateralAxis: "y",
      },
    ],
    stations: [
      {
        typedIndex: 0,
        supportId: "tread:0",
        pointFeet: p(0.5, 0, 1),
        lateralAxis: "y",
      },
      {
        typedIndex: 1,
        supportId: "tread:1",
        pointFeet: p(1.5, 0, 2),
        lateralAxis: "y",
      },
    ],
  };
  return { index, receipt, demand: originalGraph() };
}
const replay = ({ index, receipt, demand }: ReturnType<typeof fixture>) =>
  replayPortableSteppedStairV2(index, receipt, demand);
function completeLocalPartition(f: ReturnType<typeof fixture>) {
  const run = f.index.run;
  run.rootStaticEnd = 18;
  Object.assign(run.root, {
    m_id: { m_id: { m_id64: 20 } },
    m_stairsId: { m_id: { m_id64: 10 } },
    m_moribund: 0,
    m_dummy: 0,
  });
  for (const entry of run.entries.filter(
    (e) => e.sourceClassName === "StairsTreadInfo",
  ))
    for (const field of ["m_startRiser", "m_endRiser"])
      (entry.value[field] as Record<string, unknown>).m_pMultiSegRiser = {
        token: 0,
        sourceClassSlot: null,
      };
  f.index.riserPartition = {
    sourceModelSha256: model,
    sourceSchemaSha256: schema,
    nativeStairId: 10,
    originalParentFrameSha256: "c".repeat(64),
    originalParentRoot: {
      m_id: { m_id: { m_id64: 10 } },
      m_moribund: 0,
      m_dummy: 0,
      m_actualNumberOfRisers: 3,
      m_actualRiserHeight: 1,
      m_stairsHeight: 3,
      m_baseLevelId: { m_id: { m_id64: 1 } },
      m_topLevelId: { m_id: { m_id64: 2 } },
      m_baseLevelOffset: 0,
      m_topLevelOffset: 0,
    },
    ownedRuns: [
      { originalRunFrameSha256: "d".repeat(64), run: structuredClone(run) },
    ],
  };
  return f;
}
test("an explicit complete original local partition replays stale scalar indices while every physical guard remains", () => {
  const f = fixture();
  f.index.run.root.m_topRiserIndex = 8;
  f.index.run.root.m_topElevation = 100;
  assert.equal(replay(f).mathematicalReplayPassed, false);
  completeLocalPartition(f);
  assert.equal(replay(f).mathematicalReplayPassed, true);
  f.index.cells.push({
    id: "foreign-low-headroom",
    nativeOwnerId: 999,
    originalFaceTokens: [999],
    minimumElevationFeet: r(4),
    maximumElevationFeet: r(5),
    partsFeet: rect(0, 2),
    closedSegmentsFeet: [],
  });
  f.index.physicalBodies.push({
    key: "foreign999",
    nativeOwnerId: 999,
    representation: { kind: "cells", cellIds: ["foreign-low-headroom"] },
  });
  f.index.requiredPhysicalBodyKeys.push("foreign999");
  assert.equal(replay(f).mathematicalReplayPassed, false);
});
test("incomplete, stale, foreign and served-plane partition requests cannot replace source layout checks", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.index.riserPartition!.ownedRuns = [];
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.riserPartition!.originalParentRoot.m_actualNumberOfRisers = 4;
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.riserPartition!.sourceModelSha256 = "f".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.riserPartition!.ownedRuns[0]!.run.root.m_topRiserIndex = 99;
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.run.root.m_bottomElevation = -1;
      completeLocalPartition(f);
    },
  ]) {
    const f = completeLocalPartition(fixture());
    mutate(f);
    assert.equal(replay(f).mathematicalReplayPassed, false);
  }
});
test("upper-run typed references bind local ordered positions while retaining the separate authored range", () => {
  const f = fixture();
  f.index.run.root.m_baseRiserIndex = 12;
  f.index.run.root.m_topRiserIndex = 15;
  assert.equal(replay(f).mathematicalReplayPassed, true);
  const shifted = fixture();
  shifted.index.run.root.m_baseRiserIndex = 12;
  shifted.index.run.root.m_topRiserIndex = 15;
  const info = shifted.index.run.entries.find(
    (e) => e.sourceClassName === "StairsTreadInfo",
  )!;
  (info.value.m_startRiser as { m_specifiedIdx: number }).m_specifiedIdx = 12;
  assert.equal(replay(shifted).mathematicalReplayPassed, false);
  f.index.run.root.m_topRiserIndex = 16;
  assert.equal(
    replay(f).mathematicalReplayPassed,
    false,
    "the separate root range/cardinality guard remains required",
  );
});
/** Exact 45-degree similarity of the complete synthetic source operands.
 * The wider original geometry preserves full two-foot conservative demand;
 * no metadata point is shifted independently of its material/support/graph. */
function orientedFixture() {
  const f = fixture();
  const sum = (a: Rational, b: Rational) =>
    new Rational(a.n * b.d + b.n * a.d, a.d * b.d);
  const neg = (a: Rational) => new Rational(-a.n, a.d);
  const turn2 = ([x, y]: NativeRationalPoint): NativeRationalPoint => [
    sum(x, neg(y)),
    sum(x, y),
  ];
  const turn3 = ([x, y, z]: Point3): Point3 => [...turn2([x, y]), z];
  const turnParts = (parts: NativeRationalParts) =>
    parts.map((part) => part.map((ring) => ring.map(turn2)));
  for (const support of f.index.supports) {
    support.referencePartsFeet = turnParts(support.referencePartsFeet);
    support.innerPartsFeet = turnParts(support.innerPartsFeet);
    support.uncertaintyPartsFeet = turnParts(support.uncertaintyPartsFeet);
    support.closedUncertaintyFeet = support.closedUncertaintyFeet.map((line) =>
      line.map(turn2),
    );
  }
  for (const cell of f.index.cells) {
    cell.partsFeet = turnParts(cell.partsFeet);
    cell.closedSegmentsFeet = cell.closedSegmentsFeet.map((line) =>
      line.map(turn2),
    );
  }
  for (const entry of f.index.run.entries)
    for (const field of [
      "m_origin",
      "m_dirVec",
      "m_runDirProj",
      "m_riserDir",
    ]) {
      const a = entry.value[field];
      if (Array.isArray(a))
        entry.value[field] = [a[0] - a[1], a[0] + a[1], a[2]];
    }
  for (const terminal of f.receipt.terminals) {
    terminal.originalLogicalPointFeet = turn3(
      terminal.originalLogicalPointFeet,
    );
    terminal.physicalAttachmentPointFeet = turn3(
      terminal.physicalAttachmentPointFeet,
    );
    terminal.approachFeet = terminal.approachFeet.map(turn3);
    delete (terminal as { lateralAxis?: string }).lateralAxis;
    terminal.lateralDirectionFeet = [-1, 1];
  }
  for (const station of f.receipt.stations) {
    station.pointFeet = turn3(station.pointFeet);
    delete (station as { lateralAxis?: string }).lateralAxis;
    station.lateralDirectionFeet = [-1, 1];
  }
  f.index.sourceCensusScopeFeet = {
    minimum: p(-30, -30, -1),
    maximum: p(30, 30, 20),
  };
  f.demand = originalGraph(undefined, true);
  return f;
}
test("complete source-oriented stations compose through both served floors and full clearance in both directions", () => {
  const f = orientedFixture();
  for (const direction of ["forward", "reverse"] as const) {
    const result = replayPortableSteppedStairV2(f.index, f.receipt, f.demand, {
      direction,
    });
    assert.equal(
      result.mathematicalReplayPassed,
      true,
      result.issues.join("; "),
    );
    assert.equal(result.originalSourceAuthorityGranted, false);
    assert.equal(result.routeApproved, false);
    assert.equal(result.checkedMovements, 10);
  }
  assert.equal(
    replay({ ...f, receipt: clone(f.receipt) }).mathematicalReplayPassed,
    true,
  );
});
test("oriented station admission retains original holes, foreign and own raised material, unknown bodies and stale source refusal", () => {
  for (const owner of [99, 20]) {
    const f = orientedFixture();
    obstacle(f, owner, 3, 4, rect(0.25, 0.75, 0.25, 0.75));
    const result = replay(f);
    assert.equal(result.mathematicalReplayPassed, false);
    assert.ok(result.materialContacts.some((c) => c.nativeOwnerId === owner));
  }
  const hole = orientedFixture();
  hole.index.supports[1]!.innerPartsFeet = nativeRationalOverlay(
    "difference",
    hole.index.supports[1]!.innerPartsFeet,
    rect(0.4, 0.6, 0.4, 0.6),
  );
  assert.equal(replay(hole).mathematicalReplayPassed, false);
  const unknown = orientedFixture();
  unknown.index.physicalBodies[0]!.representation = {
    kind: "unknown",
    reason: "Unqualified original body",
  };
  assert.equal(replay(unknown).mathematicalReplayPassed, false);
  const stale = orientedFixture();
  stale.receipt.sourceModelSha256 = "c".repeat(64);
  assert.equal(replay(stale).mathematicalReplayPassed, false);
  for (const direction of [[0, 0], [Infinity, 1], []]) {
    const malformed = orientedFixture();
    (
      malformed.receipt.stations[0] as {
        lateralDirectionFeet: readonly number[];
      }
    ).lateralDirectionFeet = direction;
    assert.equal(replay(malformed).mathematicalReplayPassed, false);
  }
  const ambiguous = orientedFixture();
  (ambiguous.receipt.stations[0] as { lateralAxis?: string }).lateralAxis = "x";
  assert.equal(replay(ambiguous).mathematicalReplayPassed, false);
});
test("source census bounds are mandatory and a supported path cannot leave the enumerated physical scope", () => {
  const f = fixture();
  assert.equal(replay(f).mathematicalReplayPassed, true);
  for (const change of [
    (v: typeof f) => {
      delete (v.index as Partial<typeof v.index>).sourceCensusScopeFeet;
    },
    (v: typeof f) => {
      v.index.sourceCensusScopeFeet.minimum = p(20, -10, -1);
    },
    (v: typeof f) => {
      v.index.sourceCensusScopeFeet.maximum = p(10, 10, 8);
    },
    (v: typeof f) => {
      v.index.sourceCensusScopeFeet.minimum = p(-3, -10, -1);
    },
  ]) {
    const v = fixture();
    change(v);
    assert.equal(replay(v).mathematicalReplayPassed, false);
  }
});
function obstacle(
  f: ReturnType<typeof fixture>,
  owner: number,
  low: number,
  high: number,
  parts = rect(-0.1, 0.1, -1, 1),
  segments: [Rational, Rational][][] = [],
) {
  f.index.cells.push({
    id: `obstacle:${owner}`,
    nativeOwnerId: owner,
    originalFaceTokens: [999],
    minimumElevationFeet: r(low),
    maximumElevationFeet: r(high),
    partsFeet: parts,
    closedSegmentsFeet: segments,
  });
  const existing = f.index.physicalBodies.find(
    (b) => b.nativeOwnerId === owner,
  );
  if (existing?.representation.kind === "cells")
    existing.representation.cellIds.push(`obstacle:${owner}`);
  else {
    const key = `body:extra:${owner}`;
    f.index.requiredPhysicalBodyKeys.push(key);
    f.index.physicalBodies.push({
      key,
      nativeOwnerId: owner,
      representation: { kind: "cells", cellIds: [`obstacle:${owner}`] },
    });
  }
}

test("complete synthetic stepped geometry passes portable math in both directions, never source/route authority", () => {
  const f = fixture(),
    before = encodeSteppedStairV2Operands({
      index: f.index,
      receipt: f.receipt,
    });
  for (const direction of ["forward", "reverse"] as const) {
    const result = replayPortableSteppedStairV2(f.index, f.receipt, f.demand, {
      direction,
    });
    assert.equal(
      result.mathematicalReplayPassed,
      true,
      result.issues.join("; "),
    );
    assert.equal(result.checkedMovements, 10);
    assert.equal(result.originalSourceAuthorityGranted, false);
    assert.equal(result.routeApproved, false);
    assert.ok(
      result.physicalPointsFeet.some(
        (p, i, all) =>
          i && p[0].n === all[i - 1]![0].n && p[2].n !== all[i - 1]![2].n,
      ),
    );
  }
  assert.deepEqual(
    replayPortableSteppedStairV2(f.index, f.receipt, f.demand, {
      direction: "reverse",
    }).physicalPointsFeet,
    [
      ...replayPortableSteppedStairV2(f.index, f.receipt, f.demand)
        .physicalPointsFeet,
    ].reverse(),
  );
  assert.equal(
    encodeSteppedStairV2Operands({ index: f.index, receipt: f.receipt }),
    before,
  );
});

test("exact bounds preserve all original contact decisions, thin overlaps, closed tangencies and fresh authoring edits", () => {
  const cases = [fixture(), fixture(), fixture(), fixture()];
  obstacle(cases[0]!, 200, 0, 20, rect(100, 102));
  obstacle(
    cases[1]!,
    201,
    1.25,
    1.5,
    rect(0.25, 0.25 + 1e-12, 1 - 1e-12, 1 + 1e-12),
  );
  obstacle(cases[2]!, 202, 1.25, 1.5, [], [[[r(0.25), r(1)]]]);
  obstacle(
    cases[3]!,
    203,
    3,
    9,
    [],
    [
      [
        [r(4), r(1)],
        [r(4), r(2)],
      ],
    ],
  );
  for (const f of cases)
    for (const direction of ["forward", "reverse"] as const) {
      const original = replayPortableSteppedStairV2(
          f.index,
          f.receipt,
          f.demand,
          { direction, broadPhase: "disabled" },
        ),
        indexed = replayPortableSteppedStairV2(f.index, f.receipt, f.demand, {
          direction,
        });
      assert.deepEqual(indexed, original);
    }
  const f = cases[0]!,
    before = replay(f);
  assert.equal(before.mathematicalReplayPassed, true);
  f.index.cells.at(-1)!.partsFeet = rect(0.25, 0.75, -1, 1);
  const after = replay(f);
  assert.equal(after.mathematicalReplayPassed, false);
  assert(after.materialContacts.some((c) => c.nativeOwnerId === 200));
});

test("portable roundtrip replays same exact operands; malformed/non-normalized rationals refuse", () => {
  const f = fixture(),
    index = clone(f.index),
    receipt = clone(f.receipt);
  assert.equal(
    replayPortableSteppedStairV2(index, receipt, f.demand)
      .mathematicalReplayPassed,
    true,
  );
  for (const pair of [
    ["1", "0"],
    ["1", "-1"],
    ["2", "2"],
    ["-0", "1"],
    ["Infinity", "1"],
  ])
    assert.throws(() =>
      decodeSteppedStairV2Operands(JSON.stringify({ $rational: pair })),
    );
});

test("any unknown physical body refuses, including68 current-style unknowns", () => {
  const f = fixture();
  for (let i = 0; i < 68; i++) {
    const key = `unknown:${i}`;
    f.index.requiredPhysicalBodyKeys.push(key);
    f.index.physicalBodies.push({
      key,
      nativeOwnerId: 2000 + i,
      representation: {
        kind: "unknown",
        reason: "Original null bound/unsupported body",
      },
    });
  }
  const result = replay(f);
  assert.equal(result.mathematicalReplayPassed, false);
  assert.equal(result.unknownPhysicalBodyKeys.length, 68);
  assert.equal(result.checkedMovements, 0);
  assert.equal(result.routeApproved, false);
});

test("missing/duplicate/borrowed occurrence cells and declared-empty bodies fail closed", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.index.physicalBodies.pop();
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.physicalBodies.push(clone(f.index.physicalBodies[0]!));
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.physicalBodies[0]!.representation = {
        kind: "cells",
        cellIds: [],
      };
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.physicalBodies[0]!.representation = {
        kind: "cells",
        cellIds: ["cell:tread:0"],
      };
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.cells.push(clone(f.index.cells[0]!));
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.cells[0]!.originalFaceTokens = [777];
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(replay(f).mathematicalReplayPassed, false);
  }
});

test("raised foreign body, own upper flight and exact six-foot head tangency remain vetoes", () => {
  for (const [owner, low, high] of [
    [99, 3, 4],
    [20, 3, 4],
    [99, 7, 7],
  ] as const) {
    const f = fixture();
    obstacle(f, owner, low, high);
    const result = replay(f);
    assert.equal(
      result.mathematicalReplayPassed,
      false,
      result.issues.join("; "),
    );
    assert.ok(result.materialContacts.some((c) => c.nativeOwnerId === owner));
  }
});

test("closed vertical-station line contact and zero-area source point/line contact survive area-only overlays", () => {
  for (const segments of [
    [[r(-0.25), r(0)]],
    [
      [r(-0.25), r(-1)],
      [r(-0.25), r(1)],
    ],
  ]) {
    const f = fixture();
    obstacle(f, 99, 2, 4, [], [segments as [Rational, Rational][]]);
    const result = replay(f);
    assert.equal(result.mathematicalReplayPassed, false);
    assert.ok(
      result.materialContacts.some((c) => c.movement === "begin-riser:rise"),
    );
  }
});

test("named exact support contact is permitted but a foreign coincident foot-plane face is retained", () => {
  assert.equal(replay(fixture()).mathematicalReplayPassed, true);
  const f = fixture();
  obstacle(f, 99, 0.5, 1, rect(0, 1));
  f.index.cells.at(-1)!.originalFaceTokens = [10];
  const result = replay(f);
  assert.equal(result.mathematicalReplayPassed, false);
  assert.ok(
    result.materialContacts.some(
      (c) => c.cellId === "obstacle:99" && c.movement === "begin-riser:go",
    ),
  );
});

test("tiny real floor hole and retained zero-area boundary uncertainty reject terminal approaches", () => {
  for (const mode of ["hole", "line"]) {
    const f = fixture(),
      support = f.index.supports[0]!;
    if (mode === "hole")
      support.innerPartsFeet[0]!.push(
        rect(-1.5, -1.5 + 1e-12, -0.1, 0.1)[0]![0]!,
      );
    else
      support.closedUncertaintyFeet.push([
        [r(-1.5), r(-1)],
        [r(-1.5), r(1)],
      ]);
    const result = replay(f);
    assert.equal(result.mathematicalReplayPassed, false);
    assert.match(result.issues.join("; "), /approach/);
  }
});

test("skipped/wrong-height/foreign-owner stations, changed native riser flags and unsupported finite crossing refuse", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.receipt.stations[0]!.typedIndex = 1;
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.stations[0]!.pointFeet[2] = r(1.001);
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.supports[1]!.nativeOwnerId = 100;
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.run.root.m_beginWithRiser = 0;
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.run.root.m_baseRiserIndex = 1;
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.run.entries.find(
        (e) =>
          e.descriptor.token ===
          (f.index.run.root.m_oEndRiser as { token: number }).token,
      )!.value.m_endParams = [0, 0.1];
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(replay(f).mathematicalReplayPassed, false);
  }
});

test("original graph identity, logical-to-physical attachment and typed served levels cannot be replaced by a cap label", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.receipt.terminals[0].originalNodeId = "source-demand-only";
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.terminals[0].approachFeet[0] = p(-1.9, 0, 0);
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.servedLevelIds[0] = 2;
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.run.root.m_bottomElevation = 0.001;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(replay(f).mathematicalReplayPassed, false);
  }
});

test("step-free, one-way reverse, wrong version and copied opaque graph handles refuse without legacy fallback", () => {
  const f = fixture();
  assert.equal(
    replayPortableSteppedStairV2(f.index, f.receipt, f.demand, {
      profile: "step-free",
    }).mathematicalReplayPassed,
    false,
  );
  assert.equal(
    replayPortableSteppedStairV2(f.index, f.receipt, originalGraph("from-to"), {
      direction: "reverse",
    }).mathematicalReplayPassed,
    false,
  );
  assert.equal(
    replayPortableSteppedStairV2(
      f.index,
      { ...f.receipt, version: 1 } as never,
      f.demand,
    ).mathematicalReplayPassed,
    false,
  );
  assert.equal(
    replayPortableSteppedStairV2(f.index, f.receipt, { ...f.demand })
      .mathematicalReplayPassed,
    false,
  );
});

test("logical and actual physical floor heights remain distinct without adding a fictitious graph-to-floor walking segment", () => {
  const f = fixture(),
    z = r(1e-14),
    terminal = f.receipt.terminals[0];
  f.index.supports[0]!.elevationFeet = z;
  f.index.cells[0]!.maximumElevationFeet = z;
  terminal.approachFeet = terminal.approachFeet.map((point) => [
    point[0],
    point[1],
    z,
  ]);
  terminal.physicalAttachmentPointFeet[2] = z;
  terminal.logicalToPhysicalHeightDeltaFeet = z;
  const result = replay(f);
  assert.equal(result.mathematicalReplayPassed, true, result.issues.join("; "));
  assert.equal(terminal.originalLogicalPointFeet[2].n, 0n);
  assert.equal(result.physicalPointsFeet[0]![2].n, z.n);
  assert.equal(result.physicalPointsFeet[0]![2].d, z.d);
  terminal.logicalToPhysicalHeightDeltaFeet = r(0);
  assert.equal(replay(f).mathematicalReplayPassed, false);
});

test("plain report/receipt/hash objects cannot impersonate actual RVT-issued source contexts", () => {
  const f = fixture();
  const forged = {
    sourceModelSha256: model,
    sourceSchemaSha256: schema,
    complete: true,
    sourceFrameSha256s: {},
    routeApproved: true,
  };
  assert.throws(
    () =>
      extractOriginalSteppedStairV2Candidate(
        {
          stair: forged,
          foreign: forged,
          own: forged,
          terminalMaterials: [
            { kind: "floor-domains", certificate: forged },
            { kind: "planar-slab", certificate: forged },
          ],
        } as never,
        f.demand,
        {
          nativeRunId: 20,
          terminals: [
            {
              nativeFloorElementId: 100,
              originalCapFaceToken: 1000,
              lateralAxis: "y",
              approachXYFeet: [
                [-2, 0],
                [-0.25, 0],
              ],
            },
            {
              nativeFloorElementId: 101,
              originalCapFaceToken: 1001,
              lateralAxis: "y",
              approachXYFeet: [
                [4, 0],
                [2.25, 0],
              ],
            },
          ],
          stations: [],
        },
      ),
    /Untrusted|original|source|context/i,
  );
});

test("internal source landing is a distinct physical run boundary and retains the complete profile guards", async () => {
  const { replayUntrustedSteppedRunPiece } = await import(
    "../../scripts/indoor/proposals/stepped-stair-v2-kernel.ts"
  );
  const { inspectOriginalSteppedStairGraphDemand } = await import(
    "../../scripts/indoor/proposals/original-stepped-stair-graph-demand.ts"
  );
  const make = () => {
    const f = fixture(),
      graph = inspectOriginalSteppedStairGraphDemand(f.demand);
    const floor = f.index.supports.find((s) => s.id === "upper-floor")!;
    floor.role = "landing";
    floor.sourceGeometryOwnerElementId = 102;
    f.index.cells.find(
      (c) => c.nativeOwnerId === 101,
    )!.sourceGeometryOwnerElementId = 102;
    delete floor.nativeLevelId;
    floor.sourceOccurrenceFrameSha256 = "c".repeat(64);
    const bound = {
      kind: "source-landing" as const,
      nativeLandingId: 101,
      nativeDefinitionId: 102,
      originalLandingSemanticFrameSha256: "d".repeat(64),
      originalOccurrenceFrameSha256: "c".repeat(64),
      originalCapFaceToken: 1001,
      originalNominalElevationFeet: 3,
      requestedBoundaryPointFeet: p(4, 0, 3),
    };
    const upper = f.receipt.terminals[1];
    const receipt = {
      ...f.receipt,
      terminals: [
        f.receipt.terminals[0],
        {
          ...bound,
          physicalAttachmentPointFeet: upper.physicalAttachmentPointFeet,
          nominalToPhysicalHeightDeltaFeet: r(0),
          boundarySupportId: "upper-floor",
          approachFeet: upper.approachFeet,
          lateralAxis: "y" as const,
        },
      ] as import("../../scripts/indoor/proposals/stepped-stair-v2-kernel.ts").PortableSteppedRunPieceReceipt["terminals"],
    };
    return {
      ...f,
      receipt,
      boundary: {
        sourceModelSha256: model,
        edge: graph.edge,
        terminals: [
          { kind: "original-graph" as const, original: graph.terminals[0]! },
          bound,
        ] as import("../../scripts/indoor/proposals/stepped-stair-v2-kernel.ts").PortableSteppedRunPieceDemand["terminals"],
      },
    };
  };
  for (const direction of ["forward", "reverse"] as const) {
    const f = make(),
      result = replayUntrustedSteppedRunPiece(f.index, f.receipt, f.boundary, {
        direction,
      });
    assert.equal(
      result.mathematicalReplayPassed,
      true,
      result.issues.join(";"),
    );
    assert.equal(result.originalSourceAuthorityGranted, false);
    assert.equal(result.routeApproved, false);
  }
  const check = (alter: (f: ReturnType<typeof make>) => void) => {
    const f = make();
    alter(f);
    assert.equal(
      replayUntrustedSteppedRunPiece(f.index, f.receipt, f.boundary)
        .mathematicalReplayPassed,
      false,
    );
  };
  check((f) => {
    f.index.supports.find((s) => s.role === "landing")!.nativeLevelId = 999;
  });
  check((f) => {
    f.index.supports.find((s) => s.role === "landing")!.nativeOwnerId = 999;
  });
  check((f) => {
    f.index.cells.find(
      (c) => c.nativeOwnerId === 101,
    )!.sourceGeometryOwnerElementId = 101;
  });
  check((f) => {
    const original = f.index.cells.find((c) => c.nativeOwnerId === 101)!;
    f.index.cells.push({
      ...original,
      id: "inline-carrier-same-numeric-token",
      sourceGeometryOwnerElementId: 101,
      minimumElevationFeet: r(3),
      maximumElevationFeet: r(3),
    });
    const body = f.index.physicalBodies.find((b) => b.nativeOwnerId === 101)!;
    assert.equal(body.representation.kind, "cells");
    if (body.representation.kind === "cells")
      body.representation.cellIds.push("inline-carrier-same-numeric-token");
  });
  check((f) => {
    f.index.supports.find(
      (s) => s.role === "landing",
    )!.sourceOccurrenceFrameSha256 = "e".repeat(64);
  });
  check((f) => {
    f.index.run.root.m_topElevation = 4;
  });
  check((f) => {
    f.index.run.root.m_topRiserIndex = 4;
  });
  check((f) => {
    f.index.supports.find((s) => s.role === "landing")!.innerPartsFeet = [];
  });
  check((f) => {
    f.index.physicalBodies[0]!.representation = {
      kind: "unknown",
      reason: "retained unknown",
    };
  });
  check((f) => {
    f.index.cells[0]!.maximumElevationFeet = r(10);
  });
  const f = make();
  assert.equal(
    replayUntrustedSteppedRunPiece(f.index, f.receipt, f.boundary, {
      profile: "step-free",
    }).mathematicalReplayPassed,
    false,
  );
  assert.equal(
    replayPortableSteppedStairV2(
      f.index,
      f.receipt as PortableSteppedReceipt,
      f.demand,
    ).mathematicalReplayPassed,
    false,
    "internal boundary operands cannot substitute for an original terminal in the existing producer",
  );
});

test("assembly source extraction requires original checked graph and live RVT membership handles", async () => {
  const { extractOriginalTwoRunStairAssemblyCandidate } = await import(
    "../../scripts/indoor/proposals/stepped-stair-v2-assembly-source-adapter.ts"
  );
  const f = fixture();
  assert.throws(
    () =>
      extractOriginalTwoRunStairAssemblyCandidate(
        {
          membership: {} as never,
          runs: [] as never,
          outerFloorMaterials: [] as never,
        },
        f.demand,
        {} as never,
      ),
    /Untrusted original assembly/,
  );
  assert.throws(
    () =>
      extractOriginalTwoRunStairAssemblyCandidate(
        {
          membership: {} as never,
          runs: [] as never,
          outerFloorMaterials: [] as never,
        },
        { ...f.demand },
        {} as never,
      ),
    /checked-byte handle/,
  );
});

test("explicit turning operands cannot replace their current cap, parent snapshot or source frame bindings", () => {
  const create = () => {
    const f = completeLocalPartition(fixture()),
      support = f.index.supports.find(
        (s) => s.role === "tread" && s.typedIndex === 0,
      )!;
    f.index.nativeDefinitionId = 30;
    f.index.sourceFrameBindings = {
      "20:4102": "d".repeat(64),
      "30:2246": "e".repeat(64),
    };
    f.index.capBackedTurns = [
      {
        mode: "original-cap-backed-turn-v1",
        sourceModelSha256: model,
        sourceSchemaSha256: schema,
        nativeStairId: 10,
        nativeRunId: 20,
        nativeDefinitionId: 30,
        sourceGeometryOwnerElementId: 30,
        originalRunFrameSha256: "d".repeat(64),
        originalDefinitionFrameSha256: "e".repeat(64),
        typedIndex: 0,
        originalTreadHistoryBinding: {
          typedIndex: 0,
          physicalFaceToken: support.physicalFaceToken,
          physicalFaceTag: 1,
          history: [{ id: 1, keys: [53, 0, -1] }],
          coedges: [1, 2, 3, 4].map((sourceEdgeToken) => ({ sourceEdgeToken })),
        },
        cap: {
          physicalFaceToken: support.physicalFaceToken,
          physicalFaceTag: 1,
          sourceComponentIndex: 0,
          originalPhysicalPlaneHeightFeet: support.elevationFeet,
          allEndpointEmbeddingHeightBand: [
            support.elevationFeet,
            support.elevationFeet,
          ],
          originalEdgeTokens: [1, 2, 3, 4],
          referenceEmbedding: support.referencePartsFeet,
          boundaryUncertainty: support.uncertaintyPartsFeet,
          guaranteedInnerPlanSupport: support.innerPartsFeet,
        },
      },
    ];
    return f;
  };
  for (const mutate of [
    (f: ReturnType<typeof create>) => {
      delete f.index.riserPartition;
    },
    (f: ReturnType<typeof create>) => {
      delete f.index.sourceFrameBindings;
    },
    (f: ReturnType<typeof create>) => {
      f.index.capBackedTurns![0]!.originalDefinitionFrameSha256 = "f".repeat(
        64,
      );
    },
    (f: ReturnType<typeof create>) => {
      f.index.capBackedTurns![0]!.cap.referenceEmbedding = rect(-100, 100);
    },
    (f: ReturnType<typeof create>) => {
      f.index.capBackedTurns![0]!.cap.guaranteedInnerPlanSupport = rect(
        -100,
        100,
      );
    },
    (f: ReturnType<typeof create>) => {
      f.index.capBackedTurns![0]!.sourceGeometryOwnerElementId = 20;
    },
    (f: ReturnType<typeof create>) => {
      f.index.riserPartition!.ownedRuns[0]!.originalRunFrameSha256 = "f".repeat(
        64,
      );
    },
  ]) {
    const f = create();
    mutate(f);
    const result = replay(f);
    assert.equal(result.mathematicalReplayPassed, false);
    assert.match(result.issues.join("; "), /cap-backed/);
  }
  // A coherently encoded caller packet still cannot reinterpret a straight
  // native tread as the observed original zero-vector turning source mode.
  const result = replay(create());
  assert.equal(result.mathematicalReplayPassed, false);
  assert.match(
    result.issues.join("; "),
    /explicit original cap-backed|turning mode/,
  );
});
