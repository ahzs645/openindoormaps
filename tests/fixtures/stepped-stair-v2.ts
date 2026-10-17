/** Synthetic exact operands only. They carry no original-RVT source authority. */
import {
  Rational,
  rational as r,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import type { NativeStairTypedFifo } from "../../app/indoor-project/native-stepped-stair-v2-source-types";
import {
  encodeSteppedStairV2Operands,
  decodeSteppedStairV2Operands,
  type PortableSteppedSourceIndex,
  type PortableSteppedReceipt,
  type SteppedSupport,
  type Point3,
} from "../../app/indoor-project/native-stepped-stair-v2-kernel";
import { createCurrentSteppedStairGraphBinding } from "../../app/indoor-project/native-stepped-stair-v2-graph-binding";
export const model = "a".repeat(64),
  schema = "b".repeat(64);
export const p = (x: number, y: number, z: number): Point3 => [
  r(x),
  r(y),
  r(z),
];
export const rect = (
  x0: number,
  x1: number,
  y0 = -2,
  y1 = 2,
): NativeRationalParts => [
  [
    [
      [r(x0), r(y0)],
      [r(x1), r(y0)],
      [r(x1), r(y1)],
      [r(x0), r(y1)],
    ],
  ],
];
export const clone = <T>(value: T): T =>
  decodeSteppedStairV2Operands(encodeSteppedStairV2Operands(value)) as T;
export function originalGraph(direction?: string) {
  const data = {
    source: { modelSha256: model },
    nodes: [
      {
        id: "old:lower",
        kind: "stair",
        roomKey: "lower",
        levelId: 1,
        pointFeet: [-2, 0, 0] as [number, number, number],
      },
      {
        id: "old:upper",
        kind: "stair",
        roomKey: "upper",
        levelId: 2,
        pointFeet: [4, 0, 3] as [number, number, number],
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
  return createCurrentSteppedStairGraphBinding(data, "held:10");
}
/** Fully enumerated synthetic source FACTS for mathematical testing only.
 * They have no actual-RVT provenance and can never mint route authority. */
export function syntheticRun(): NativeStairTypedFifo {
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
export function fixture() {
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
