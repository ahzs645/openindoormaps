import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorEdge } from "../../app/indoor-project/contract";
import type { RouteCalculation } from "../../app/indoor-project/route-calculation";
import {
  assertSharedCorridorRouteParity,
  validateCandidateRouteCases,
  type CandidateRouteCase,
} from "../../scripts/indoor/lib/shared-corridor-acceptance";

function fixture() {
  const edge: IndoorEdge = {
    id: "door:level:123",
    from: "a",
    to: "b",
    kind: "door",
    nativeElementId: 123,
    enabled: true,
    accessible: "unknown",
    roomKeys: ["room-a", "room-b"],
    lengthMetres: 1,
    pointsFeet: [
      [0, 0, 0],
      [1, 0, 0],
    ],
    evidence: "native-source",
  };
  const item: CandidateRouteCase = {
    id: "crossing",
    from: "room-a",
    to: "room-b",
    mode: "public",
    options: { endpointMode: "hallway", allowOtherRoomTransit: false },
    expected: true,
    requiredNativeDoorId: 123,
    requiredSourceEdgeIds: [edge.id],
    requireSharedGuide: true,
  };
  const result: RouteCalculation = {
    route: {
      nodeIds: ["a", "b"],
      edges: [edge],
      distanceMetres: 1,
      sourceDistanceMetres: 1,
      doorEdgeIds: [edge.id],
      unknownAccessAreas: ["room-b"],
      unknownAccessibilityEdges: 1,
      paths: [
        {
          edgeIds: [edge.id],
          levelIds: [1],
          pointsFeet: edge.pointsFeet,
          centered: true,
          sharedCorridorGuideUsed: true,
        },
      ],
    },
  };
  const baseline = structuredClone(result);
  baseline.route!.paths[0].sharedCorridorGuideUsed = false;
  baseline.route!.paths[0].pointsFeet = [
    [0, 0, 0],
    [0.5, 0.2, 0],
    [1, 0, 0],
  ];
  baseline.route!.distanceMetres = 1.1;
  return {
    item,
    result,
    baseline,
    original: new Map([[edge.id, structuredClone(edge)]]),
  };
}
function refusal(): RouteCalculation {
  return {
    route: null,
    diagnostic: {
      kind: "blocked",
      constraint: "hallways",
      message: "Room transit is disabled.",
      blockers: [],
      sourceEdgeIds: ["door:level:123"],
      reviewRoomKey: "room-b",
    },
  };
}

test("complete route parity permits geometric guide changes while retaining the original crossing and unknown policy records", () => {
  const { item, result, baseline, original } = fixture();
  validateCandidateRouteCases([item]);
  const verified = assertSharedCorridorRouteParity(
    item,
    result,
    baseline,
    original,
  );
  assert.equal(verified.requiredSourceEdgesVerified, true);
  assert.equal(verified.requiredNativeDoorVerified, true);
});
test("two refused routes with different complete diagnostic evidence do not pass", () => {
  const { item, original } = fixture();
  const refused = {
    ...item,
    expected: false,
    requiredNativeDoorId: undefined,
    requiredSourceEdgeIds: undefined,
    requireSharedGuide: false,
  };
  const result = refusal(),
    baseline = refusal();
  baseline.diagnostic!.sourceEdgeIds = ["another-crossing"];
  assert.throws(
    () => assertSharedCorridorRouteParity(refused, result, baseline, original),
    /diagnostics/,
  );
  baseline.diagnostic = structuredClone(result.diagnostic);
  baseline.diagnostic!.reviewRoomKey = "another-room";
  assert.throws(
    () => assertSharedCorridorRouteParity(refused, result, baseline, original),
    /diagnostics/,
  );
});
test("an unchanged refusal passes as a refusal, including its arrival message", () => {
  const { original } = fixture();
  const item: CandidateRouteCase = {
    id: "refused",
    from: "room-a",
    to: "room-b",
    mode: "public",
    options: { endpointMode: "hallway", allowOtherRoomTransit: false },
    expected: false,
  };
  const result = refusal();
  result.arrivals = {
    hallway: { route: null, message: "No hallway-only route" },
  };
  assert.equal(
    assertSharedCorridorRouteParity(
      item,
      result,
      structuredClone(result),
      original,
    ).diagnosticParity,
    true,
  );
  const baseline = structuredClone(result);
  baseline.arrivals!.hallway!.message = "An unrelated physical gap";
  assert.throws(
    () => assertSharedCorridorRouteParity(item, result, baseline, original),
    /arrival refusal/,
  );
});
test("a detour using the same native door ID cannot satisfy a required original edge", () => {
  const { item, result, baseline, original } = fixture();
  const detour = {
    ...result.route!.edges[0],
    id: "other-edge-with-same-native-id",
  };
  original.set(detour.id, detour);
  result.route!.edges = [detour];
  baseline.route!.edges = [structuredClone(detour)];
  assert.throws(
    () => assertSharedCorridorRouteParity(item, result, baseline, original),
    /required original source edge/,
  );
});
test("a changed original edge or disabled source crossing is refused", () => {
  const { item, result, baseline, original } = fixture();
  result.route!.edges[0].accessible = "yes";
  assert.throws(
    () => assertSharedCorridorRouteParity(item, result, baseline, original),
    /source edge changed/,
  );
  result.route!.edges[0].accessible = "unknown";
  original.get(item.requiredSourceEdgeIds![0])!.enabled = false;
  assert.throws(
    () => assertSharedCorridorRouteParity(item, result, baseline, original),
    /disabled or invented/,
  );
});
test("guide use cannot silently change access uncertainty or selected source nodes", () => {
  const { item, result, baseline, original } = fixture();
  result.route!.unknownAccessAreas = [];
  assert.throws(() =>
    assertSharedCorridorRouteParity(item, result, baseline, original),
  );
  result.route!.unknownAccessAreas = ["room-b"];
  baseline.route!.nodeIds.reverse();
  assert.throws(
    () => assertSharedCorridorRouteParity(item, result, baseline, original),
    /source node traversal/,
  );
});
test("guide-on and guide-off availability and selected original edges must agree", () => {
  const { item, result, baseline, original } = fixture();
  assert.throws(
    () =>
      assertSharedCorridorRouteParity(item, result, { route: null }, original),
    /availability/,
  );
  baseline.route!.edges = [];
  assert.throws(
    () => assertSharedCorridorRouteParity(item, result, baseline, original),
    /selected source edges/,
  );
});
test("a walking guide cannot satisfy an accessible route assertion", () => {
  const { item, result, baseline, original } = fixture();
  const accessible = {
    ...item,
    mode: "accessible" as const,
    requireSharedGuide: false,
  };
  assert.throws(
    () =>
      assertSharedCorridorRouteParity(accessible, result, baseline, original),
    /step-free clearance/,
  );
});
test("acceptance cases require explicit endpoint/transit choices and reject policy overrides or duplicate identities", () => {
  const { item } = fixture();
  assert.throws(
    () => validateCandidateRouteCases([item, structuredClone(item)]),
    /unique explicit IDs/,
  );
  assert.throws(
    () =>
      validateCandidateRouteCases([
        { ...item, options: { endpointMode: "hallway" } },
      ]),
    /ordinary-room transit/,
  );
  assert.throws(
    () =>
      validateCandidateRouteCases([
        {
          ...item,
          options: { ...item.options, useSharedCorridorGuides: false },
        },
      ]),
    /verifier controls/,
  );
  assert.throws(
    () =>
      validateCandidateRouteCases([
        { ...item, options: { ...item.options, grantStaffAccess: true } },
      ]),
    /Unsupported route option/,
  );
  assert.throws(
    () =>
      validateCandidateRouteCases([
        { ...item, requiredSourceEdgeIds: ["same", "same"] },
      ]),
    /nonempty unique/,
  );
  assert.throws(
    () => validateCandidateRouteCases([{ ...item, expected: false }]),
    /refused journey/,
  );
});
