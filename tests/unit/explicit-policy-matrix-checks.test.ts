import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  AGREEMENT_FIELDS,
  checkPolicyExpectations,
  expectationProblems,
  policyAgreement,
  type PolicyExpectation,
  type PolicyOutcome,
} from "../../scripts/indoor/explicit-policy-matrix-checks";

const h = (c: string) => c.repeat(64);
const route: PolicyOutcome = {
  available: true,
  seconds: 1.5,
  distanceMetres: 83.947_639_624_930_91,
  edgeIdCount: 2,
  edgeIds: ["a", "door:694:1499373"],
  doorEdgeIds: ["door:694:1499373"],
  requiredEdgeUsed: true,
  arrivalChoices: ["inside"],
  reachableCount: 10,
  stepCount: 4,
  valueSha256: h("a"),
  stepsSha256: h("b"),
  summarySha256: h("c"),
};
const refusal: PolicyOutcome = {
  available: false,
  seconds: 0.4,
  diagnostic: {
    kind: "blocked",
    constraint: "hallways",
    message: "No hallway-only route is available.",
    blockers: [],
    sourceEdgeIdCount: 12,
  },
  stepCount: 0,
  valueSha256: h("d"),
  stepsSha256: h("e"),
  summarySha256: h("f"),
};

test("identical outcomes agree even with different timings and a normal-only explanation", () => {
  const r = policyAgreement(
    { ...route, explanation: { why: 1 } },
    { ...route, seconds: 9 },
  );
  assert.equal(r.agrees, true, r.problems.join("; "));
  for (const name of Object.keys(AGREEMENT_FIELDS))
    assert.equal(r.agreement![name as keyof typeof AGREEMENT_FIELDS], true);
});

test("every recorded comparison field must agree, not only availability, edges and distance", () => {
  const cases: [string, Partial<PolicyOutcome>][] = [
    ["valueSha256", { valueSha256: h("0") }],
    ["stepsSha256", { stepsSha256: h("1") }],
    ["summarySha256", { summarySha256: h("2") }],
    ["doorEdgeIds", { doorEdgeIds: [] }],
    ["requiredEdgeUsed", { requiredEdgeUsed: false }],
    ["stepCount", { stepCount: 5 }],
    ["arrivalChoices", { arrivalChoices: ["hallway"] }],
    ["reachableCount", { reachableCount: 11 }],
    ["edgeIdCount", { edgeIdCount: 3 }],
  ];
  for (const [field, change] of cases) {
    const r = policyAgreement(route, { ...route, ...change });
    assert.equal(r.agrees, false, field);
    assert.deepEqual(r.problems, [`${field} differs`], field);
  }
  // Same availability, edges and distance but a different hash: the old
  // three-field rule would have passed this.
  const weak = policyAgreement(route, { ...route, valueSha256: h("9") });
  assert.equal(weak.agreement!.sameAvailability, true);
  assert.equal(weak.agreement!.sameEdgeIds, true);
  assert.equal(weak.agreement!.sameDistance, true);
  assert.equal(weak.agrees, false);
});

test("the whole diagnostic is compared, not only its message", () => {
  const other = {
    ...refusal,
    diagnostic: {
      ...refusal.diagnostic!,
      constraint: undefined,
      sourceEdgeIdCount: 3,
    },
  };
  const r = policyAgreement(refusal, other);
  assert.equal(r.agrees, false);
  assert.deepEqual(r.problems, ["diagnostic differs"]);
  // Key order does not matter.
  const reordered = {
    ...refusal,
    diagnostic: Object.fromEntries(
      Object.entries(refusal.diagnostic!).reverse(),
    ) as PolicyOutcome["diagnostic"],
  };
  assert.equal(policyAgreement(refusal, reordered).agrees, true);
});

test("missing sides, errors, missing hashes and uncompared fields fail agreement", () => {
  assert.equal(policyAgreement(undefined, route).agrees, false);
  assert.equal(policyAgreement(route).agrees, false);
  assert.equal(
    policyAgreement(route, { ...route, error: "timeout" }).agrees,
    false,
  );
  const blank = { ...route, valueSha256: "" };
  assert.match(
    policyAgreement(blank, blank).problems.join(","),
    /valueSha256 missing/,
  );
  const extra = { ...route, novel: 1 } as PolicyOutcome;
  assert.match(
    policyAgreement(extra, extra).problems.join(","),
    /field novel is recorded but not compared/,
  );
});

const ids = ["x:inside:no-transit:public", "y:hallway:no-transit:public"];
const casesSha = "c".repeat(64);
const expectRoute: PolicyExpectation = {
  id: ids[0],
  expect: "route",
  distanceMetres: 83.948,
  toleranceMetres: 0.01,
  requiredEdgeUsed: true,
  source: "test",
};
const expectRefusal: PolicyExpectation = {
  id: ids[1],
  expect: "refusal",
  refusalConstraint: "hallways",
  source: "test",
};
const file = (expectations: unknown[], sha = casesSha) => ({
  format: "explicit-policy-expectations-v1",
  casesSha256: sha,
  expectations,
});

test("expectations must cover exactly the cases of the bound cases file", () => {
  assert.equal(
    checkPolicyExpectations(file([expectRoute, expectRefusal]), ids, casesSha)
      .size,
    2,
  );
  assert.throws(
    () => checkPolicyExpectations(file([expectRoute]), ids, casesSha),
    /No expectation/,
  );
  assert.throws(
    () =>
      checkPolicyExpectations(
        file([expectRoute, expectRefusal, { ...expectRefusal, id: "z" }]),
        ids,
        casesSha,
      ),
    /unknown case/,
  );
  assert.throws(
    () =>
      checkPolicyExpectations(
        file([expectRoute, expectRefusal], "d".repeat(64)),
        ids,
        casesSha,
      ),
    /different cases file/,
  );
  assert.throws(
    () =>
      checkPolicyExpectations(
        file([{ ...expectRoute, distanceMetres: undefined }, expectRefusal]),
        ids,
        casesSha,
      ),
    /needs distanceMetres/,
  );
  assert.throws(() =>
    checkPolicyExpectations(
      file([expectRoute, { ...expectRefusal, distanceMetres: 3 }]),
      ids,
      casesSha,
    ),
  );
});

test("two calculators agreeing on a wrong result fail the expectation", () => {
  // Both sides agree on a route that is 1 m longer than intended.
  const wrong = { ...route, distanceMetres: 84.95 };
  assert.equal(policyAgreement(wrong, wrong).agrees, true);
  assert.match(
    expectationProblems(expectRoute, wrong).join(","),
    /outside 83.948 ± 0.01/,
  );
  // Both agree on a route that avoids the required door.
  assert.match(
    expectationProblems(expectRoute, {
      ...route,
      requiredEdgeUsed: false,
    }).join(","),
    /required edge used = false/,
  );
  // Both agree on a refusal where a route is intended, and vice versa.
  assert.match(
    expectationProblems(expectRoute, refusal).join(","),
    /expected a route/,
  );
  assert.match(
    expectationProblems(expectRefusal, route).join(","),
    /expected a refusal/,
  );
  // A refusal for the wrong reason.
  assert.match(
    expectationProblems(expectRefusal, {
      ...refusal,
      diagnostic: { ...refusal.diagnostic!, constraint: undefined },
    }).join(","),
    /refusal constraint none != hallways/,
  );
  const stepFree: PolicyExpectation = {
    id: "s",
    expect: "refusal",
    refusalBlockerKinds: ["step-free"],
    source: "test",
  };
  assert.match(expectationProblems(stepFree, refusal).join(","), /no blockers/);
  assert.deepEqual(
    expectationProblems(stepFree, {
      ...refusal,
      diagnostic: { ...refusal.diagnostic!, blockers: [{ kind: "step-free" }] },
    }),
    [],
  );
  assert.match(
    expectationProblems(stepFree, {
      ...refusal,
      diagnostic: { ...refusal.diagnostic!, blockers: [{ kind: "closed" }] },
    }).join(","),
    /unexpected blocker kinds closed/,
  );
  // Correct results meet them.
  assert.deepEqual(expectationProblems(expectRoute, route), []);
  assert.deepEqual(expectationProblems(expectRefusal, refusal), []);
  assert.deepEqual(expectationProblems(expectRoute), ["outcome missing"]);
});

test("the committed expectations cover the committed 160 policy cases", () => {
  const casesBytes = readFileSync(
    "docs/continuation/unbc-20261102/policy/POLICY-CASES.json",
  );
  const cases = JSON.parse(casesBytes.toString()) as {
    name: string;
    endpointMode: string;
    allowOtherRoomTransit: boolean;
    profile: string;
  }[];
  const caseIds = cases.map((c) =>
    [
      c.name,
      c.endpointMode,
      c.allowOtherRoomTransit ? "transit" : "no-transit",
      c.profile,
    ].join(":"),
  );
  const byId = checkPolicyExpectations(
    JSON.parse(
      readFileSync(
        "docs/continuation/unbc-20261102/final-proof/POLICY-EXPECTATIONS.json",
        "utf8",
      ),
    ),
    caseIds,
    createHash("sha256").update(casesBytes).digest("hex"),
  );
  assert.equal(byId.size, 160);
  const e = (id: string) => byId.get(id)!;
  assert.equal(
    e("08-264-to-10-2006:inside:no-transit:public").distanceMetres,
    83.948,
  );
  assert.equal(
    e("08-264-to-10-2006:inside:no-transit:public").requiredEdgeUsed,
    true,
  );
  assert.equal(
    e("08-264-to-10-2006:hallway:no-transit:public").refusalConstraint,
    "hallways",
  );
  assert.equal(
    e("10-2066-to-08-267:hallway:transit:public").distanceMetres,
    34.019,
  );
  assert.equal(
    e("06-376-to-06-364:inside:no-transit:public").expect,
    "refusal",
  );
  assert.equal(e("06-376-to-06-364:inside:transit:public").expect, "route");
  assert.equal(
    e("06-388-to-06-364:inside:no-transit:public").requiredEdgeUsed,
    true,
  );
  const values = [...byId.values()];
  assert.equal(values.filter((v) => v.expect === "route").length, 78);
  assert(
    values
      .filter((v) => v.id.endsWith(":accessible"))
      .every(
        (v) =>
          v.expect === "refusal" && v.refusalBlockerKinds?.[0] === "step-free",
      ),
  );
});
