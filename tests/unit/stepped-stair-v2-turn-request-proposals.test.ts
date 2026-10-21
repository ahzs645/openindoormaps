import assert from "node:assert/strict";
import test from "node:test";
import { rational } from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import { proposeRepeatedOriginalTurnRequests } from "../../scripts/indoor/proposals/stepped-stair-v2-turn-request-proposals.mjs";

// Pure request fixture: two narrow flights with an original wide turning cap.
// These mathematical operands do not represent an original-source capability.
function fixture() {
  const point = (x: number, y: number) => [rational(x), rational(y)];
  const box = (x0: number, y0: number, x1: number, y1: number) => [
    [[point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)]],
  ];
  const line = (x0: number, x1: number, y: number, direction = 1) => ({
    m_origin: [x0, y, 0],
    m_dirVec: [direction, 0, 0],
    m_endParams: [0, (x1 - x0) / direction],
  });
  const lines = [
    line(-2, 2, -1),
    line(-2, 2, 0),
    line(6, 2, 0, -1),
    line(6, 2, -1, -1),
  ];
  const support = (
    id: string,
    role: string,
    typedIndex: number | undefined,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
  ) => ({
    id,
    role,
    nativeOwnerId: role === "tread" ? 11 : typedIndex === undefined ? 101 : 102,
    typedIndex,
    elevationFeet: rational(z),
    referencePartsFeet: box(x0, y0, x1, y1),
    innerPartsFeet: box(x0, y0, x1, y1),
    uncertaintyPartsFeet: [],
    closedUncertaintyFeet: [],
  });
  const supports = [
    support("lower", "floor", undefined, -2, -6, 2, -1, 0),
    support("tread0", "tread", 0, -2, -1, 2, 0, 0.5),
    support("turn", "tread", 1, -2, 0, 6, 4, 1),
    support("tread2", "tread", 2, 2, -1, 6, 0, 1.5),
    support("upper", "floor", 3, 2, -6, 6, -1, 2),
  ];
  const stations = [
    {
      typedIndex: 0,
      supportId: "tread0",
      pointFeet: [...point(0, -0.5), rational(0.5)],
      lateralDirectionFeet: [1, 0],
    },
    {
      typedIndex: 1,
      supportId: "turn",
      pointFeet: [...point(2, 1), rational(1)],
      lateralDirectionFeet: [1, 0],
    },
    {
      typedIndex: 2,
      supportId: "tread2",
      pointFeet: [...point(4, -0.5), rational(1.5)],
      lateralDirectionFeet: [-1, 0],
    },
  ];
  const terminals = [
    {
      kind: "source-floor",
      floorSupportId: "lower",
      originalNodeId: "original-lower",
      originalLevelId: 1,
      originalLogicalPointFeet: [...point(0, -3), rational(0)],
      physicalAttachmentPointFeet: [...point(0, -3), rational(0)],
      approachFeet: [point(0, -3), point(0, -1.5)].map((p) => [
        ...p,
        rational(0),
      ]),
      lateralDirectionFeet: [1, 0],
    },
    {
      kind: "source-floor",
      floorSupportId: "upper",
      originalNodeId: "original-upper",
      originalLevelId: 2,
      originalLogicalPointFeet: [...point(4, -3), rational(2)],
      physicalAttachmentPointFeet: [...point(4, -3), rational(2)],
      approachFeet: [point(4, -3), point(4, -1.5)].map((p) => [
        ...p,
        rational(2),
      ]),
      lateralDirectionFeet: [-1, 0],
    },
  ];
  return {
    nativeStairId: 10,
    nativeRunId: 11,
    originalEdgeId: "original-edge",
    supports,
    receipt: {
      nativeStairId: 10,
      nativeRunId: 11,
      originalEdgeId: "original-edge",
      widthFeet: 2,
      headroomFeet: 6,
      stations,
      terminals,
    },
    orderedRisers: lines.map((originalCurve, index) => ({
      index,
      originalCurve,
    })),
    treadRelations: stations.map((s, i) => ({
      typedIndex: i,
      startRiserIndex: i,
      endRiserIndex: i + 1,
      originalFiniteStartLine: lines[i],
      originalFiniteEndLine: lines[i + 1],
      originalIntentPlanPartsFeet: [],
    })),
  };
}

test("proposes two interior turn stations while preserving graph terminals and other stations", () => {
  const input = fixture(),
    originalStations = [...input.receipt.stations],
    terminals = [...input.receipt.terminals];
  const r = proposeRepeatedOriginalTurnRequests(input, {
    typedIndex: 1,
    maxAttempts: 1,
  });
  assert.equal(r.found, true);
  assert("stations" in r);
  assert("originalGraphTerminals" in r);
  assert.equal(r.stations.length, 4);
  assert.deepEqual(
    r.stations.map((s: { typedIndex: number }) => s.typedIndex),
    [0, 1, 1, 2],
  );
  assert.deepEqual(r.stations[0].pointFeet, [0, -0.5]);
  assert.deepEqual(r.stations.at(-1).pointFeet, [4, -0.5]);
  assert.deepEqual(
    r.originalGraphTerminals.map(
      (t: { originalNodeId: string }) => t.originalNodeId,
    ),
    ["original-lower", "original-upper"],
  );
  assert.deepEqual(input.receipt.stations, originalStations);
  assert.deepEqual(input.receipt.terminals, terminals);
  assert.equal(r.sourceAuthorityGranted, false);
  assert.equal(r.runtimeIntegrationApproved, false);
  assert.equal(r.routeApproved, false);
});

test("refuses a finite riser narrower than the unchanged two-foot demand", () => {
  const input = fixture();
  input.orderedRisers[1].originalCurve = {
    m_origin: [-0.5, 0, 0],
    m_dirVec: [1, 0, 0],
    m_endParams: [0, 1],
  };
  const r = proposeRepeatedOriginalTurnRequests(input, {
    typedIndex: 1,
    maxAttempts: 1,
  });
  assert.equal(r.found, false);
  assert.equal(r.sourceAuthorityGranted, false);
});

test("retains a turn-cap hole that blocks the complete flat strip", () => {
  const input = fixture(),
    cap = input.supports.find((s) => s.id === "turn")!;
  cap.innerPartsFeet[0].push([
    [rational(1), rational(1)],
    [rational(1), rational(2)],
    [rational(3), rational(2)],
    [rational(3), rational(1)],
  ]);
  const r = proposeRepeatedOriginalTurnRequests(input, {
    typedIndex: 1,
    maxAttempts: 1,
  });
  assert.equal(r.found, false);
});

test("retains closed source uncertainty and refuses unsupported turn stations", () => {
  const input = fixture(),
    cap = input.supports.find((s) => s.id === "turn")!;
  cap.closedUncertaintyFeet = [
    [
      [rational(-2), rational(1.5)],
      [rational(6), rational(1.5)],
    ],
  ] as never[];
  assert.equal(
    proposeRepeatedOriginalTurnRequests(input, {
      typedIndex: 1,
      maxAttempts: 1,
    }).found,
    false,
  );
});

test("refuses width changes, endpoint turns and unbounded request options", () => {
  const input = fixture();
  input.receipt.widthFeet = 1;
  assert.equal(
    proposeRepeatedOriginalTurnRequests(input, {
      typedIndex: 1,
      maxAttempts: 1,
    }).found,
    false,
  );
  assert.equal(
    proposeRepeatedOriginalTurnRequests(fixture(), { typedIndex: 0 }).found,
    false,
  );
  assert.equal(
    proposeRepeatedOriginalTurnRequests(fixture(), {
      typedIndex: 1,
      maxAttempts: 257,
    }).found,
    false,
  );
  assert.equal(
    proposeRepeatedOriginalTurnRequests(fixture(), {
      typedIndex: 1,
      depthsFeet: [Infinity],
    }).found,
    false,
  );
});

test("refuses missing source relations and malformed ordered boundary indices explicitly", () => {
  const missing = fixture();
  missing.treadRelations[1] = undefined as never;
  assert.equal(
    proposeRepeatedOriginalTurnRequests(missing, { typedIndex: 1 }).reason,
    "missing-original-finite-turn-relation",
  );
  const malformed = fixture();
  malformed.treadRelations[1].endRiserIndex = 999;
  assert.equal(
    proposeRepeatedOriginalTurnRequests(malformed, { typedIndex: 1 }).reason,
    "unsupported-original-finite-turn-boundaries",
  );
  assert.equal(
    proposeRepeatedOriginalTurnRequests(undefined, { typedIndex: 1 }).reason,
    "missing-original-single-run-request-operands",
  );
});

test("refuses the strict proposer's fallback changes to an unselected station", () => {
  const input = fixture();
  input.receipt.stations[0].pointFeet[0] = rational(100);
  const result = proposeRepeatedOriginalTurnRequests(input, {
    typedIndex: 1,
    maxAttempts: 1,
  });
  assert.equal(result.found, false);
  assert.equal(
    result.reason,
    "strict-proposer-changed-unselected-original-request",
  );
  assert("unexpectedOriginalStationOrdinals" in result);
  assert.deepEqual(result.unexpectedOriginalStationOrdinals, [0]);
});

test("retains distinct typed station and ordered crossing source vectors exactly", () => {
  const input = fixture();
  input.orderedRisers[1].originalCurve = {
    ...input.orderedRisers[1].originalCurve,
    m_dirVec: [1, 1e-15, 0],
  };
  const result = proposeRepeatedOriginalTurnRequests(input, {
    typedIndex: 1,
    maxAttempts: 1,
  });
  assert.equal(result.found, true);
  assert("stations" in result);
  assert.deepEqual(result.stations[1].lateralDirectionFeet, [1, 0]);
  assert.deepEqual(result.stations[2].lateralDirectionFeet, [-1, 0]);
  assert.deepEqual(
    input.orderedRisers[1].originalCurve.m_dirVec,
    [1, 1e-15, 0],
  );
});
