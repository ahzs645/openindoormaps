/** Agreement and expectation checks for run-explicit-policy-matrix.ts.
 *
 * Two calculators that agree are not enough: both can be wrong in the same
 * way. The report therefore requires
 *  - strict agreement: every recorded comparison field of the normal and
 *    worker outcome is identical (availability, edge ids, door edge ids,
 *    required-edge use, distance, complete-value hash, step hash, summary
 *    hash, step count, arrival choices, reachable count and the whole
 *    diagnostic), and
 *  - an explicit expected outcome per case from a separate expectations file
 *    (route with distance and tolerance, or refusal with its constraint or
 *    blocker kinds), checked against BOTH outcomes.
 */
import assert from "node:assert/strict";

export type PolicyOutcomeDiagnostic = {
  kind: string;
  constraint?: string;
  message: string;
  blockers: { kind: string; edgeId?: string; roomKey?: string }[];
  sourceEdgeIdCount: number;
  requiredEdgeInWitness?: boolean;
  reviewRoomKey?: string;
  reviewEdgeId?: string;
};
export type PolicyOutcome = {
  available: boolean;
  error?: string;
  seconds: number;
  distanceMetres?: number;
  edgeIdCount?: number;
  edgeIds?: string[];
  doorEdgeIds?: string[];
  requiredEdgeUsed?: boolean;
  diagnostic?: PolicyOutcomeDiagnostic;
  arrivalChoices?: string[];
  reachableCount?: number;
  stepCount: number;
  valueSha256: string;
  stepsSha256: string;
  summarySha256: string;
  /** Normal stage only: why a refusal happened, from the diagnostic witness. */
  explanation?: unknown;
};

/** Every recorded field that both stages produce and must therefore match. */
export const AGREEMENT_FIELDS = {
  sameAvailability: "available",
  sameEdgeIdCount: "edgeIdCount",
  sameEdgeIds: "edgeIds",
  sameDoorEdgeIds: "doorEdgeIds",
  sameRequiredEdgeUse: "requiredEdgeUsed",
  sameDistance: "distanceMetres",
  sameDiagnostic: "diagnostic",
  sameArrivalChoices: "arrivalChoices",
  sameReachableCount: "reachableCount",
  sameStepCount: "stepCount",
  sameCompleteValue: "valueSha256",
  sameSteps: "stepsSha256",
  sameSummary: "summarySha256",
} as const satisfies Record<string, keyof PolicyOutcome>;
/** Fields that are not compared: timing, and the normal-only explanation. */
const NOT_COMPARED = new Set<string>(["seconds", "explanation", "error"]);

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  ) ?? "undefined";

export type PolicyAgreement = Record<keyof typeof AGREEMENT_FIELDS, boolean> & {
  /** Any other field present on either side (none expected). */
  unexpectedFields: string[];
};

export function policyAgreement(
  normal?: PolicyOutcome,
  worker?: PolicyOutcome,
): { agreement?: PolicyAgreement; agrees: boolean; problems: string[] } {
  if (!normal) return { agrees: false, problems: ["normal outcome missing"] };
  if (!worker) return { agrees: false, problems: ["worker outcome missing"] };
  const problems: string[] = [];
  if (normal.error !== undefined)
    problems.push(`normal error: ${normal.error}`);
  if (worker.error !== undefined)
    problems.push(`worker error: ${worker.error}`);
  // A hash that was never computed cannot vouch for agreement.
  for (const [side, o] of [
    ["normal", normal],
    ["worker", worker],
  ] as const)
    for (const key of ["valueSha256", "stepsSha256", "summarySha256"] as const)
      if (!/^[a-f0-9]{64}$/.test(o[key] ?? ""))
        problems.push(`${side} ${key} missing`);
  const known = new Set<string>([
    ...Object.values(AGREEMENT_FIELDS),
    ...NOT_COMPARED,
  ]);
  const unexpectedFields = [
    ...new Set([...Object.keys(normal), ...Object.keys(worker)]),
  ]
    .filter((key) => !known.has(key))
    .sort();
  for (const key of unexpectedFields)
    problems.push(`field ${key} is recorded but not compared`);
  const agreement = { unexpectedFields } as PolicyAgreement;
  for (const [name, key] of Object.entries(AGREEMENT_FIELDS) as [
    keyof typeof AGREEMENT_FIELDS,
    keyof PolicyOutcome,
  ][]) {
    agreement[name] = canonical(normal[key]) === canonical(worker[key]);
    if (!agreement[name]) problems.push(`${key} differs`);
  }
  return { agreement, agrees: problems.length === 0, problems };
}

export type PolicyExpectation = {
  id: string;
  expect: "route" | "refusal";
  distanceMetres?: number;
  toleranceMetres?: number;
  /** For routes: whether the case's requiredEdgeId must (true) or must not
   * (false) be on the route. */
  requiredEdgeUsed?: boolean;
  /** For refusals: the diagnostic constraint (for example "hallways"). */
  refusalConstraint?: string;
  /** For refusals: every blocker has one of these kinds, and there is at
   * least one blocker. */
  refusalBlockerKinds?: string[];
  source: string;
};
export type PolicyExpectations = {
  format: "explicit-policy-expectations-v1";
  casesSha256: string;
  expectations: PolicyExpectation[];
};

export function checkPolicyExpectations(
  value: unknown,
  caseIds: string[],
  casesSha256: string,
): Map<string, PolicyExpectation> {
  const v = value as PolicyExpectations;
  assert(v && typeof v === "object" && !Array.isArray(v));
  assert.equal(v.format, "explicit-policy-expectations-v1");
  assert.equal(
    v.casesSha256,
    casesSha256,
    "Expectations were written for a different cases file",
  );
  assert(Array.isArray(v.expectations));
  const known = new Set([
    "id",
    "expect",
    "distanceMetres",
    "toleranceMetres",
    "requiredEdgeUsed",
    "refusalConstraint",
    "refusalBlockerKinds",
    "source",
  ]);
  const byId = new Map<string, PolicyExpectation>();
  for (const e of v.expectations) {
    assert(e && typeof e === "object" && !Array.isArray(e));
    assert(
      Object.keys(e).every((key) => known.has(key)),
      `Unknown expectation field in ${e.id}`,
    );
    assert(typeof e.id === "string" && e.id.length > 0);
    assert(!byId.has(e.id), `Duplicate expectation ${e.id}`);
    assert(typeof e.source === "string" && e.source.length > 0);
    if (e.expect === "route") {
      assert(
        typeof e.distanceMetres === "number" &&
          Number.isFinite(e.distanceMetres) &&
          e.distanceMetres > 0,
        `Route expectation ${e.id} needs distanceMetres`,
      );
      assert(
        typeof e.toleranceMetres === "number" &&
          e.toleranceMetres >= 0 &&
          e.toleranceMetres <= 5,
        `Route expectation ${e.id} needs toleranceMetres (0–5)`,
      );
      assert(
        e.refusalConstraint === undefined &&
          e.refusalBlockerKinds === undefined,
      );
      assert(
        e.requiredEdgeUsed === undefined ||
          typeof e.requiredEdgeUsed === "boolean",
      );
    } else {
      assert.equal(e.expect, "refusal", `Bad expectation kind in ${e.id}`);
      assert(
        e.distanceMetres === undefined &&
          e.toleranceMetres === undefined &&
          e.requiredEdgeUsed === undefined,
      );
      assert(
        e.refusalConstraint === undefined ||
          (typeof e.refusalConstraint === "string" &&
            e.refusalConstraint.length > 0),
      );
      assert(
        e.refusalBlockerKinds === undefined ||
          (Array.isArray(e.refusalBlockerKinds) &&
            e.refusalBlockerKinds.length > 0 &&
            e.refusalBlockerKinds.every((k) => typeof k === "string")),
      );
    }
    byId.set(e.id, e);
  }
  const missing = caseIds.filter((id) => !byId.has(id));
  assert.equal(missing.length, 0, `No expectation for ${missing.join(", ")}`);
  const extra = [...byId.keys()].filter((id) => !caseIds.includes(id));
  assert.equal(
    extra.length,
    0,
    `Expectation for unknown case ${extra.join(", ")}`,
  );
  return byId;
}

/** Problems of one outcome against its expectation (empty = met). */
export function expectationProblems(
  e: PolicyExpectation,
  o?: PolicyOutcome,
): string[] {
  if (!o) return ["outcome missing"];
  if (o.error !== undefined) return [`error: ${o.error}`];
  const problems: string[] = [];
  if (e.expect === "route") {
    if (!o.available) {
      problems.push(
        `expected a route, got a refusal (${o.diagnostic?.constraint ?? o.diagnostic?.kind ?? "no diagnostic"})`,
      );
      return problems;
    }
    const d = o.distanceMetres;
    if (typeof d !== "number" || !Number.isFinite(d))
      problems.push("route has no distance");
    else if (Math.abs(d - e.distanceMetres!) > e.toleranceMetres!)
      problems.push(
        `distance ${d.toFixed(3)} m outside ${e.distanceMetres} ± ${e.toleranceMetres} m`,
      );
    if (!o.edgeIds?.length) problems.push("route has no edges");
    if (o.stepCount < 1) problems.push("route has no steps");
    if (
      e.requiredEdgeUsed !== undefined &&
      o.requiredEdgeUsed !== e.requiredEdgeUsed
    )
      problems.push(
        `required edge used = ${o.requiredEdgeUsed}, expected ${e.requiredEdgeUsed}`,
      );
  } else {
    if (o.available) {
      problems.push(
        `expected a refusal, got a ${o.distanceMetres?.toFixed(3)} m route`,
      );
      return problems;
    }
    if (o.diagnostic) {
      if (
        e.refusalConstraint !== undefined &&
        o.diagnostic.constraint !== e.refusalConstraint
      )
        problems.push(
          `refusal constraint ${o.diagnostic.constraint ?? "none"} != ${e.refusalConstraint}`,
        );
      if (e.refusalBlockerKinds !== undefined) {
        const kinds = o.diagnostic.blockers.map((b) => b.kind);
        if (kinds.length === 0) problems.push("refusal has no blockers");
        const wrong = [...new Set(kinds)].filter(
          (k) => !e.refusalBlockerKinds!.includes(k),
        );
        if (wrong.length > 0)
          problems.push(`unexpected blocker kinds ${wrong.join(", ")}`);
      }
    } else {
      problems.push("refusal has no diagnostic");
    }
  }
  return problems;
}
