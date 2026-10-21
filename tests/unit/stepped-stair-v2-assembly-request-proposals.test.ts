import assert from "node:assert/strict";
import test from "node:test";
import { proposeUntrustedFiniteRunRequests } from "../../scripts/indoor/proposals/stepped-stair-v2-assembly-request-proposals.mjs";
import {
  rational,
  type NativeRationalParts,
} from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import {
  nativeConservativeTwoFootStation,
  nativeSegmentInExactParts,
} from "../../../reviter/lib/reviter/native-source-stair-stepped-stations.ts";

// Entirely synthetic, fully enumerated mathematical operands. No source handle,
// source ownership, body clearance or route approval is established by these.
const point = (...n: number[]) => n.map(rational);
const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): NativeRationalParts =>
  [
    [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ].map((p) => point(...p)),
    ],
  ] as NativeRationalParts;
const line = (x: number) => ({
  m_origin: [x, 0, x],
  m_dirVec: [0, 1, 0],
  m_endParams: [-2, 2],
});
const fixture = (onRiser = true) => {
  const supports = [
    {
      id: "floor",
      role: "floor",
      nativeOwnerId: 20,
      physicalFaceToken: 5,
      elevationFeet: rational(0),
      innerPartsFeet: rect(-4, -3, 0, 3),
      uncertaintyPartsFeet: [],
      closedUncertaintyFeet: [],
    },
    ...[0, 1].map((i) => ({
      id: `tread${i}`,
      role: "tread",
      nativeOwnerId: 11,
      typedIndex: i,
      physicalFaceToken: i + 10,
      elevationFeet: rational(i + 1),
      innerPartsFeet: rect(i, -2, i + 1, 2),
      uncertaintyPartsFeet: [],
      closedUncertaintyFeet: [],
    })),
    {
      id: "landing",
      role: "landing",
      nativeOwnerId: 30,
      sourceGeometryOwnerElementId: 31,
      physicalFaceToken: 4,
      elevationFeet: rational(3),
      innerPartsFeet: rect(2, -3, 5, 3),
      uncertaintyPartsFeet: [],
      closedUncertaintyFeet: [],
    },
  ];
  return {
    nativeStairId: 10,
    nativeRunId: 11,
    originalEdgeId: "held:10",
    supports,
    receipt: {
      nativeStairId: 10,
      nativeRunId: 11,
      originalEdgeId: "held:10",
      widthFeet: 2,
      headroomFeet: 6,
      stations: [0, 1].map((i) => ({
        typedIndex: i,
        supportId: `tread${i}`,
        pointFeet: point(i + (onRiser ? 0 : 0.5), 0, i + 1),
        lateralDirectionFeet: [0, 1],
      })),
      terminals: [
        {
          kind: "original-graph",
          floorSupportId: "floor",
          originalNodeId: "node-lower",
          originalLevelId: 1,
          originalLogicalPointFeet: point(-2, 0, 0),
          physicalAttachmentPointFeet: point(-2, 0, 0),
          approachFeet: [point(-2, 0, 0), point(-0.25, 0, 0)],
          lateralDirectionFeet: [0, 1],
        },
        {
          kind: "source-landing",
          boundarySupportId: "landing",
          nativeLandingId: 30,
          nativeDefinitionId: 31,
          originalCapFaceToken: 4,
          approachFeet: [point(4, 0, 3), point(2.25, 0, 3)],
          lateralDirectionFeet: [0, 1],
        },
      ],
    },
    treadRelations: [0, 1].map((i) => ({
      originalFiniteStartLine: line(i),
      originalFiniteEndLine: line(i + 1),
      originalActualDepthFeet: 1,
      originalIntentPlanPartsFeet: rect(i, -2, i + 1, 2),
    })),
    orderedRisers: [0, 1, 2].map((i) => ({ originalCurve: line(i) })),
  };
};
const snapshot = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(snapshot);
  if (value && typeof value === "object") {
    if ("n" in value && "d" in value) return [String(value.n), String(value.d)];
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, snapshot(v)]),
    );
  }
  return value;
};
const noAuthority = (
  result: ReturnType<typeof proposeUntrustedFiniteRunRequests>,
) => {
  assert.equal(result.proposalOnly, true);
  assert.equal(result.sourceAuthorityGranted, false);
  assert.equal(result.runtimeIntegrationApproved, false);
  assert.equal(result.routeApproved, false);
};

test("cap-supported leading-riser stations become interior requests without moving original graph operands or planes", () => {
  const input = fixture(),
    before = snapshot(input),
    result = proposeUntrustedFiniteRunRequests(input);
  assert.equal(result.found, true);
  assert.ok("stations" in result);
  noAuthority(result);
  assert.deepEqual(snapshot(input), before);
  assert.deepEqual(result.changedStationOrdinals, [0, 1]);
  assert.equal(result.nativeStairId, 10);
  assert.equal(result.nativeRunId, 11);
  assert.equal(result.originalEdgeId, "held:10");
  assert.deepEqual(result.originalGraphTerminals, [
    {
      originalNodeId: "node-lower",
      originalLevelId: 1,
      originalLogicalPointFeet: [
        ["-2", "1"],
        ["0", "1"],
        ["0", "1"],
      ],
      physicalAttachmentPointFeet: [
        ["-2", "1"],
        ["0", "1"],
        ["0", "1"],
      ],
      floorSupportId: "floor",
      approachXYFeet: [
        [-2, 0],
        [-0.25, 0],
      ],
    },
  ]);
  assert.deepEqual(
    result.physicalPlanes.map(
      (p: { elevationFeet: string[][] }) => p.elevationFeet,
    ),
    [
      ["0", "1"],
      ["1", "1"],
      ["2", "1"],
      ["3", "1"],
    ],
  );
  for (const [i, station] of result.stations.entries()) {
    assert.ok(station.pointFeet[0] > i && station.pointFeet[0] < i + 1);
    const support = input.supports[i + 1];
    assert.ok(
      nativeSegmentInExactParts(
        ...nativeConservativeTwoFootStation(
          point(...station.pointFeet) as never,
          station.lateralDirectionFeet,
        ),
        support.innerPartsFeet,
      ),
    );
  }
});

test("valid original stations remain untouched, and final landing demand needs its full lateral rather than a whole final square", () => {
  const result = proposeUntrustedFiniteRunRequests(fixture(false));
  assert.equal(result.found, true);
  assert.ok("stations" in result);
  assert.deepEqual(result.changedStationOrdinals, []);
  assert.deepEqual(
    result.stations.map((s: { pointFeet: number[] }) => s.pointFeet),
    [
      [0.5, 0],
      [1.5, 0],
    ],
  );
  assert.deepEqual(result.landingRequests[0], {
    nativeLandingId: 30,
    nativeDefinitionId: 31,
    originalCapFaceToken: 4,
    approachXYFeet: [
      [4, 0],
      [2.25, 0],
    ],
    lateralDirectionFeet: [0, 1],
  });
  noAuthority(result);
});

test("retained cap holes and insufficient full width cannot become hull-based requests", () => {
  for (const mode of ["hole", "narrow"] as const) {
    const input = fixture();
    input.supports[1].innerPartsFeet =
      mode === "hole"
        ? ([
            [...rect(0, -2, 1, 2)[0], ...rect(-1, -0.5, 2, 0.5)[0]],
          ] as NativeRationalParts)
        : rect(0, -0.95, 1, 0.95);
    const result = proposeUntrustedFiniteRunRequests(input);
    assert.equal(result.found, false);
    assert.ok("reason" in result);
    assert.match(result.reason, /no-supported-station-request/);
    noAuthority(result);
  }
});

test("closed uncertainty, foreign ownership and stale physical planes remain refusals", () => {
  for (const mode of ["uncertainty", "owner", "plane", "landing"] as const) {
    const input = fixture();
    if (mode === "uncertainty")
      input.supports[1].uncertaintyPartsFeet = rect(-1, -3, 2, 3) as never;
    if (mode === "owner") input.supports[1].nativeOwnerId = 99;
    if (mode === "plane") input.supports[1].elevationFeet = rational(99);
    if (mode === "landing") input.receipt.terminals[1].nativeLandingId = 99;
    const result = proposeUntrustedFiniteRunRequests(input);
    assert.equal(result.found, false);
    noAuthority(result);
  }
});

test("candidate budgets refuse explicitly without granting authority or mutating operands", () => {
  const input = fixture(),
    before = snapshot(input);
  const result = proposeUntrustedFiniteRunRequests({
    ...input,
    maxTransitionChecks: 1,
  });
  assert.equal(result.found, false);
  assert.ok("reason" in result);
  assert.equal(result.reason, "request-budget-exhausted");
  assert.deepEqual(snapshot(input), before);
  noAuthority(result);
});

test("missing local stations and a colliding cap token from a foreign geometry arena remain refused", () => {
  for (const mode of ["missing", "arena"] as const) {
    const input = fixture();
    if (mode === "missing") input.receipt.stations.shift();
    if (mode === "arena") {
      const landing = input.supports.at(-1)!;
      assert.ok("sourceGeometryOwnerElementId" in landing);
      landing.sourceGeometryOwnerElementId = 999;
    }
    const result = proposeUntrustedFiniteRunRequests(input);
    assert.equal(result.found, false);
    assert.ok("reason" in result);
    assert.equal(
      result.reason,
      mode === "missing"
        ? "incomplete-local-riser-request"
        : "foreign-landing-cap-request",
    );
    noAuthority(result);
  }
});
