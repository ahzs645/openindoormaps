/** Assertions for a real, complete route replay. A guide changes presentation,
 * never the selected source graph, permissions or refusal evidence. */
import assert from "node:assert/strict";
import type { IndoorEdge } from "../../../app/indoor-project/contract";
import type {
  RouteCalculation,
  RouteRequest,
} from "../../../app/indoor-project/route-calculation";
import { projectRoutingOptionsKey } from "../../../app/indoor-project/routing-options";

export type CandidateRouteCase = {
  id: string;
  from: string;
  to: string;
  mode: RouteRequest["mode"];
  options: NonNullable<RouteRequest["options"]>;
  expected: boolean;
  requiredNativeDoorId?: number;
  /** Require these original edges in the complete on AND off routes. */
  requiredSourceEdgeIds?: string[];
  requireSharedGuide?: boolean;
};

const caseKeys = new Set([
  "id",
  "from",
  "to",
  "mode",
  "options",
  "expected",
  "requiredNativeDoorId",
  "requiredSourceEdgeIds",
  "requireSharedGuide",
]);
const optionKeys = new Set([
  "endpointMode",
  "preferHallways",
  "allowOtherRoomTransit",
  "excludedNativeStairIds",
]);
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validateCandidateRouteCases(
  value: unknown,
): asserts value is CandidateRouteCase[] {
  assert(
    Array.isArray(value) && value.length > 0,
    "Require explicit route cases",
  );
  const ids = new Set<string>();
  for (const item of value as CandidateRouteCase[]) {
    assert(item && typeof item === "object" && !Array.isArray(item));
    assert(
      Object.keys(item).every((key) => caseKeys.has(key)),
      "Unsupported route case field",
    );
    assert(
      nonempty(item.id) && !ids.has(item.id),
      "Cases require unique explicit IDs",
    );
    ids.add(item.id);
    assert(nonempty(item.from) && nonempty(item.to) && item.from !== item.to);
    assert(
      ["public", "accessible"].includes(item.mode),
      "Invalid route profile",
    );
    assert.equal(
      typeof item.expected,
      "boolean",
      "Every case needs an expectation",
    );
    assert(
      item.options &&
        typeof item.options === "object" &&
        !Array.isArray(item.options),
      "Every case needs explicit route options",
    );
    assert(
      Object.keys(item.options).every((key) => optionKeys.has(key)),
      "Unsupported route option; the verifier controls guide on/off",
    );
    assert(
      ["inside", "hallway"].includes(item.options.endpointMode ?? ""),
      "Choose an explicit route endpoint mode",
    );
    assert.equal(
      typeof item.options.allowOtherRoomTransit,
      "boolean",
      "Choose an explicit ordinary-room transit policy",
    );
    projectRoutingOptionsKey(item.options);
    if (item.requiredNativeDoorId !== undefined)
      assert(
        Number.isSafeInteger(item.requiredNativeDoorId) &&
          item.requiredNativeDoorId > 0,
        "Invalid required native door identity",
      );
    if (item.requiredSourceEdgeIds !== undefined)
      assert(
        Array.isArray(item.requiredSourceEdgeIds) &&
          item.requiredSourceEdgeIds.length > 0 &&
          item.requiredSourceEdgeIds.every(nonempty) &&
          new Set(item.requiredSourceEdgeIds).size ===
            item.requiredSourceEdgeIds.length,
        "Required original edges must be a nonempty unique list",
      );
    if (item.requireSharedGuide !== undefined)
      assert.equal(typeof item.requireSharedGuide, "boolean");
    if (!item.expected)
      assert(
        item.requiredNativeDoorId === undefined &&
          item.requiredSourceEdgeIds === undefined &&
          !item.requireSharedGuide,
        "A refused journey cannot assert traversed edges or guides",
      );
    if (item.mode === "accessible")
      assert(
        !item.requireSharedGuide,
        "Walking guides cannot establish step-free clearance",
      );
  }
}

export function assertSharedCorridorRouteParity(
  item: CandidateRouteCase,
  result: RouteCalculation,
  baseline: RouteCalculation,
  originalEdges: ReadonlyMap<string, IndoorEdge>,
) {
  assert.equal(!!result.route, item.expected, `${item.id}: route expectation`);
  assert.equal(
    !!result.route,
    !!baseline.route,
    "Guides changed route availability",
  );
  // Include complete blocker/source-edge/constraint/message evidence for both
  // successful and refused cases. Matching false booleans alone is insufficient.
  assert.deepEqual(
    result.diagnostic,
    baseline.diagnostic,
    "Guides changed route diagnostics",
  );
  assert.deepEqual(
    result.reachable,
    baseline.reachable,
    "Guides changed reachability",
  );
  assert.deepEqual(
    Object.keys(result.arrivals ?? {}).sort(),
    Object.keys(baseline.arrivals ?? {}).sort(),
    "Guides changed arrival choices",
  );
  for (const mode of Object.keys(result.arrivals ?? {}) as Array<
    keyof NonNullable<RouteCalculation["arrivals"]>
  >) {
    const a = result.arrivals?.[mode],
      b = baseline.arrivals?.[mode];
    assert.equal(!!a?.route, !!b?.route, "Guides changed arrival availability");
    assert.equal(
      a?.message,
      b?.message,
      "Guides changed arrival refusal evidence",
    );
  }
  if (result.route && baseline.route) {
    assert.deepEqual(
      result.route.edges.map((edge) => edge.id),
      baseline.route.edges.map((edge) => edge.id),
      "Guides changed selected source edges",
    );
    assert.deepEqual(
      result.route.nodeIds,
      baseline.route.nodeIds,
      "Guides changed source node traversal",
    );
    assert.deepEqual(result.route.doorEdgeIds, baseline.route.doorEdgeIds);
    assert.deepEqual(
      result.route.unknownAccessAreas,
      baseline.route.unknownAccessAreas,
    );
    assert.deepEqual(
      result.route.unknownAccessibilityEdges,
      baseline.route.unknownAccessibilityEdges,
    );
    for (const [label, route] of [
      ["guide-on", result.route],
      ["guide-off", baseline.route],
    ] as const) {
      for (const edge of route.edges) {
        const original = originalEdges.get(edge.id);
        assert(
          original?.enabled,
          `${label}: a disabled or invented source edge was used`,
        );
        assert.deepEqual(edge, original, `${label}: a source edge changed`);
      }
      if (item.requiredNativeDoorId !== undefined)
        assert(
          route.edges.some(
            (edge) =>
              edge.kind === "door" &&
              edge.nativeElementId === item.requiredNativeDoorId,
          ),
          `${label}: required original native door was not used`,
        );
      for (const id of item.requiredSourceEdgeIds ?? [])
        assert(
          route.edges.some((edge) => edge.id === id),
          `${label}: required original source edge was not used: ${id}`,
        );
      if (item.mode === "accessible")
        assert(
          route.paths.every((part) => !part.sharedCorridorGuideUsed),
          "Shared walking guides cannot approve step-free clearance",
        );
    }
    if (item.requireSharedGuide)
      assert(
        result.route.paths.some((part) => part.sharedCorridorGuideUsed),
        "No accepted shared guide exercised",
      );
  }
  return {
    diagnosticParity: true as const,
    requiredSourceEdgesVerified: !!item.requiredSourceEdgeIds?.length,
    requiredNativeDoorVerified: item.requiredNativeDoorId !== undefined,
  };
}
