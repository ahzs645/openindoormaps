import assert from "node:assert/strict";
import test from "node:test";
import stairFixture from "../fixtures/synthetic-navigation-stair-policy.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  progressiveRoutingFixture,
  progressiveRoutingDisclosureFixture,
} from "../fixtures/progressive-routing";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import {
  auditCoverage,
  compareCoverage,
  safetySnapshot,
  compareSafety,
  connectorCases,
  type RouteCase,
  checkRouteResult,
  originalBlockedArrivalEvidence,
  checkedStationaryNativeAliasChanges,
  masterVisitorPhysicalAuthoritySha256,
  type Matrix,
} from "../../scripts/indoor/pathway-candidate-audit";
import {
  prepareNativeCirculationGeometry,
  attachNativeCirculationCellRoutes,
} from "../../../reviter/lib/reviter/native-circulation-geometry";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import { nativeCirculationWalkBlockers } from "../../app/indoor-project/native-circulation";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import type { ConvertResult } from "../../../reviter/lib/reviter/types";
import { strictOriginalBlockedArrivalEvidence } from "../../scripts/indoor/candidate-arrival-loss";
import { retainDistinctActualRouteCase } from "../../scripts/indoor/pathway-route-case-identity";

function coverage(
  data: IndoorDataset,
  mode: "public" | "accessible" = "public",
) {
  return createImmutableRoutingSession(data)(() => auditCoverage(data, mode));
}

test("candidate coverage distinguishes absent entrances from valid but isolated arrivals and matches the original oracle", () => {
  const data = progressiveRoutingDisclosureFixture();
  data.records[1]!.arrivalNodeId = undefined;
  const publicResult = coverage(data),
    stepFree = coverage(data, "accessible");
  assert.equal(publicResult.oracleChecks, 3);
  assert.deepEqual(publicResult.missingArrivals, [data.records[1]!.key]);
  assert.equal(publicResult.reachable, 2);
  assert.equal(stepFree.reachable, 0);
  assert.deepEqual(
    new Set(stepFree.isolatedWithArrival),
    new Set([data.records[0]!.key, "middle"]),
  );
  assert(!stepFree.isolatedWithArrival.includes(data.records[1]!.key));
});

test("coverage delta joins by source key, tolerates reorder and detects lost pairs when an endpoint disappears", () => {
  const data = progressiveRoutingFixture(),
    before = coverage(data);
  data.records.reverse();
  const reordered = coverage(data),
    unchanged = compareCoverage(before, reordered);
  assert.equal(unchanged.comparableLossCount, 0);
  assert.equal(unchanged.comparableGainCount, 0);
  const endpoint = before.endpoints[0]!,
    removed: Matrix = {
      endpoints: [endpoint],
      rowBytes: 1,
      matrix: new Uint8Array(1),
    },
    loss = compareCoverage(before, removed);
  assert.equal(loss.comparableLossCount, 2);
  assert.deepEqual(loss.removedEndpoints, [before.endpoints[1]!.key]);
  assert.deepEqual(loss.lostArrivals, [before.endpoints[1]!.key]);
});

test("a newly restored actual approach records two pair gains and one recovered arrival without changing the source dataset", () => {
  const data = progressiveRoutingFixture(),
    existing = data.records[1]!.arrivalNodeId;
  data.records[1]!.arrivalNodeId = undefined;
  const before = coverage(data);
  data.records[1]!.arrivalNodeId = existing;
  const original = JSON.stringify(data),
    after = coverage(data),
    delta = compareCoverage(before, after);
  assert.equal(delta.comparableGainCount, 2);
  assert.equal(delta.comparableLossCount, 0);
  assert.deepEqual(delta.recoveredArrivals, [data.records[1]!.key]);
  assert.equal(JSON.stringify(data), original);
});

test("candidate safety refuses silent staff/public, walkability, GIS, aperture and accessibility edits", () => {
  const data = progressiveRoutingFixture(),
    before = safetySnapshot(data);
  data.records[0]!.access = "staff";
  data.records[1]!.walkable = false;
  data.alignment.rotationRadians += 0.01;
  data.indoorExclusions = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    areas: [],
  };
  data.edges[0]!.accessible = "unknown";
  const delta = compareSafety(before, safetySnapshot(data));
  for (const text of [
    "room access",
    "room walkable",
    "GIS",
    "exclusion",
    "Accessibility",
  ])
    assert(
      delta.violations.some((v) => v.includes(text)),
      text,
    );
  assert(
    delta.changes.some(
      (change) => change.target === "edge" && change.field === "accessible",
    ),
  );
});

test("master/visitor parity binds complete shared v2 source index inventory and every exact nested operand", () => {
  const data = progressiveRoutingFixture() as IndoorDataset & {
      nativeSteppedStairV2SourceIndices?: unknown;
    },
    original = masterVisitorPhysicalAuthoritySha256(data);
  // Hash-binding fixture only; these values do not claim a valid source index.
  data.nativeSteppedStairV2SourceIndices = [
    { id: "source-index", cells: [{ exact: { n: "1", d: "3" } }] },
  ] as never;
  const indexBound = masterVisitorPhysicalAuthoritySha256(data);
  assert.notEqual(indexBound, original);
  const clone = structuredClone(data);
  assert.equal(masterVisitorPhysicalAuthoritySha256(clone), indexBound);
  (
    clone.nativeSteppedStairV2SourceIndices as unknown as {
      cells: { exact: { n: string; d: string } }[];
    }[]
  )[0].cells[0].exact.n = "2";
  assert.notEqual(masterVisitorPhysicalAuthoritySha256(clone), indexBound);
  delete clone.nativeSteppedStairV2SourceIndices;
  assert.equal(masterVisitorPhysicalAuthoritySha256(clone), original);
});

test("candidate QA runs real source-qualified steps up/down and independently vetoes forged step-free output", () => {
  const data = structuredClone(stairFixture.data) as unknown as IndoorDataset,
    inventory = connectorCases(data),
    calculate = createWorkerRouteCalculator(data),
    original = JSON.stringify(data);
  assert.equal(inventory.cases.length, 4);
  assert.equal(inventory.unresolved.length, 0);
  for (const routeCase of inventory.cases) {
    const value = calculate(routeCase.start, routeCase.end, routeCase.mode),
      checked = checkRouteResult(data, routeCase, value);
    assert.deepEqual(checked.errors, []);
    assert.equal(checked.available, routeCase.mode === "public");
  }
  const publicCase = inventory.cases.find((c) => c.mode === "public")!,
    value = calculate(publicCase.start, publicCase.end, "public"),
    forged = checkRouteResult(
      data,
      { ...publicCase, mode: "accessible" },
      value,
    );
  assert(forged.errors.some((e) => e.startsWith("step-free-veto")));
  assert(forged.errors.includes("graph-vs-calculator-availability"));
  assert.equal(JSON.stringify(data), original);
});

test("step-free connector cases permit a valid alternate lift while public stair cases require the actual intended stair", () => {
  const data = structuredClone(stairFixture.data) as unknown as IndoorDataset,
    stair = data.edges[0]!,
    liftId = "synthetic-reviewed-alternate-lift",
    evidence = "Synthetic reviewed served native lift entrances";
  Object.assign(data, {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    issues: [],
    report: progressiveRoutingFixture().report,
  });
  // This case has actual landing records on both named planes; it does not use
  // the fixture's separate display-only fractional-floor alias experiment.
  data.nativePhysicalLevels = {
    ...data.nativePhysicalLevels!,
    levels: data.nativePhysicalLevels!.levels.map((level) => ({
      ...level,
      annotationLevel: true,
    })),
    displayAliases: [],
  };
  data.connectors = [
    {
      id: liftId,
      kind: "elevator",
      nativeElementId: 999,
      sourceModelSha256: data.source.modelSha256,
      accessible: "yes",
      direction: "both",
      evidence,
      entrances: [stair.from, stair.to].map((nodeId) => {
        const node = data.nodes.find((n) => n.id === nodeId)!;
        return { nodeId, roomKey: node.roomKey, levelId: node.levelId };
      }),
    },
  ];
  data.edges.push({
    id: `${liftId}:edge`,
    nativeElementId: 999,
    connectorId: liftId,
    from: stair.from,
    to: stair.to,
    kind: "elevator",
    roomKeys: [...stair.roomKeys],
    pointsFeet: [
      structuredClone(data.nodes[0].pointFeet),
      structuredClone(data.nodes[1].pointFeet),
    ],
    enabled: true,
    accessible: "yes",
    direction: "both",
    evidence,
    lengthMetres: 10,
  });
  validateIndoorDataset(data);
  const cases = connectorCases(data).cases.filter((c) =>
      c.name.includes(stair.id),
    ),
    calculate = createWorkerRouteCalculator(data);
  assert.equal(cases.length, 4);
  for (const routeCase of cases) {
    const result = calculate(routeCase.start, routeCase.end, routeCase.mode);
    assert(result.route);
    assert.deepEqual(checkRouteResult(data, routeCase, result).errors, []);
    if (routeCase.mode === "accessible") {
      assert.equal(routeCase.intendedEdgeId, undefined);
      assert.deepEqual(routeCase.forbiddenEdgeIds, [stair.id]);
      assert(result.route.edges.some((e) => e.kind === "elevator"));
      assert(!result.route.edges.some((e) => e.id === stair.id));
    } else {
      assert.equal(routeCase.intendedEdgeId, stair.id);
      assert(result.route.edges.some((e) => e.id === stair.id));
      const alternate = calculate(routeCase.start, routeCase.end, "accessible");
      assert(
        checkRouteResult(data, routeCase, alternate).errors.includes(
          "intended-connector-not-exercised",
        ),
      );
    }
  }
  const accessibleCase = cases.find((c) => c.mode === "accessible")!,
    actualSteps = calculate(accessibleCase.start, accessibleCase.end, "public"),
    forged = checkRouteResult(data, accessibleCase, actualSteps);
  assert(forged.errors.includes(`forbidden-connector-exercised:${stair.id}`));
  assert(forged.errors.some((e) => e.startsWith("step-free-veto:")));
});

test("QA catches calculator output whose edge was disabled or whose one-way restriction changed", () => {
  const original = progressiveRoutingFixture(),
    calculate = createWorkerRouteCalculator(original),
    testCase = {
      name: "original crossing",
      start: original.records[0]!.key,
      end: original.records[1]!.key,
      mode: "public" as const,
    },
    result = calculate(testCase.start, testCase.end, testCase.mode);
  assert(result.route);
  const disabled = structuredClone(original);
  disabled.edges[0]!.enabled = false;
  const disabledResult = checkRouteResult(disabled, testCase, result);
  assert(
    disabledResult.errors.some((error) =>
      error.startsWith("inadmissible-edge"),
    ),
  );
  assert(disabledResult.errors.includes("graph-vs-calculator-availability"));
  const oneWay = structuredClone(original);
  oneWay.edges[0]!.direction = "to-from";
  assert(
    checkRouteResult(oneWay, testCase, result).errors.some((error) =>
      error.startsWith("inadmissible-edge"),
    ),
  );
});

test("withholding a physically refused original arrival requires every nonempty enabled incident edge to be an original blocked native walk with no alias or connector bypass", () => {
  const setup = () => {
    const data = progressiveRoutingFixture();
    data.edges[0]!.nativeCellId = "original-native-cell";
    data.nodes[1]!.surfaceId = data.nodes[0]!.surfaceId;
    return data;
  };
  const original = setup(),
    key = original.records[0]!.key,
    blockers = new Set([original.edges[0]!.id]);
  assert(
    originalBlockedArrivalEvidence(original, key, blockers)
      .allOriginalApproachesPhysicallyRefused,
  );
  const mutations: [string, (data: IndoorDataset) => void][] = [
    [
      "no incident edges",
      (data) => {
        data.edges = [];
      },
    ],
    [
      "unblocked other native branch",
      (data) => {
        data.edges.push({ ...data.edges[0]!, id: "another-walk" });
      },
    ],
    [
      "door bypass",
      (data) => {
        data.edges.push({
          ...data.edges[0]!,
          id: "physical-door",
          kind: "door",
        });
      },
    ],
    [
      "lift bypass",
      (data) => {
        data.edges.push({ ...data.edges[0]!, id: "lift", kind: "elevator" });
      },
    ],
    [
      "native alias",
      (data) => {
        data.nodes[1]!.levelId++;
      },
    ],
    [
      "different surface",
      (data) => {
        data.nodes[1]!.surfaceId = "other-surface";
      },
    ],
    [
      "reviewed noncell link",
      (data) => {
        data.edges[0]!.reviewedCirculationLinkId = "reviewed-owner-link";
      },
    ],
    [
      "unbound infrastructure",
      (data) => {
        data.edges[0]!.nativeCellId = undefined;
      },
    ],
    [
      "different original owner",
      (data) => {
        data.nodes[0]!.roomKey = "different-room";
      },
    ],
  ];
  for (const [name, change] of mutations) {
    const data = setup();
    change(data);
    assert.equal(
      originalBlockedArrivalEvidence(data, key, blockers)
        .allOriginalApproachesPhysicallyRefused,
      false,
      name,
    );
  }
});

test("final arrival-loss QA refuses a physically blocked same-plane stationary alias, including forged positive length", () => {
  const data = progressiveRoutingFixture(),
    edge = data.edges[0]!;
  edge.nativeCellId = "original-cell";
  data.nodes[1]!.surfaceId = data.nodes[0]!.surfaceId;
  const key = data.records[0]!.key,
    blockers = new Set([edge.id]);
  assert(
    strictOriginalBlockedArrivalEvidence(data, key, blockers)
      .allOriginalApproachesPhysicallyRefused,
  );
  data.nodes[1]!.pointFeet = [...data.nodes[0]!.pointFeet];
  edge.pointsFeet = data.nodes.map((node) => [...node.pointFeet]);
  for (const length of [0, 10]) {
    edge.lengthMetres = length;
    const proof = strictOriginalBlockedArrivalEvidence(data, key, blockers);
    assert.equal(proof.allOriginalApproachesPhysicallyRefused, false);
    assert.deepEqual(proof.stationaryIncidentEdgeIds, [edge.id]);
  }
});

async function stationaryFixture() {
  const data = progressiveRoutingFixture(),
    ring: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ];
  data.records = [
    { ...data.records[0]!, ringsFeet: [ring], circulation: true },
  ];
  data.nodes = [
    { ...data.nodes[0]!, pointFeet: [5, 5, 0] },
    {
      ...data.nodes[0]!,
      id: "original-native-connector",
      kind: "connector",
      pointFeet: [5, 5, 0],
    },
  ];
  data.edges = [];
  data.walls = [];
  data.doors = [];
  const envelope = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    levels: [
      {
        levelId: data.records[0]!.levelId,
        elevationFeet: 0,
        partsFeet: [[ring]],
        sourceElementIds: [10],
        cutElevationsFeet: [4, 8],
        evidenceSha256: "c".repeat(64),
      },
    ],
  };
  data.nativeIndoorEnvelopes = {
    ...envelope,
    geometrySha256: await nativeIndoorEnvelopeHash(envelope),
  };
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [{ nativeElementId: 10, elevationFeet: 0, ringsFeet: [ring] }],
  };
  const model = {
    elementBounds: [
      {
        elementId: 10,
        categoryId: -2_000_032,
        boundsFeet: { min: { x: 0, y: 0, z: -1 }, max: { x: 20, y: 10, z: 0 } },
        loops: [ring.map(([x, y]) => [x, y, 0])],
      },
    ],
    levels: [{ levelId: data.records[0]!.levelId, elevation: 0 }],
    nativeAssociatedLevelRelations: [],
  } as unknown as ConvertResult;
  data.circulationGeometry = prepareNativeCirculationGeometry(
    model,
    data,
  ).geometry;
  attachNativeCirculationCellRoutes(data);
  assert.equal(data.edges.length, 1);
  assert.equal(data.edges[0]!.lengthMetres, 0);
  data.edges[0]!.accessible = "unknown";
  return data;
}

test("strict candidate alias scope replays original exact source cell and physical support before accepting a zero-motion unknown-to-yes change", async () => {
  const data = await stationaryFixture(),
    before = safetySnapshot(data),
    edge = data.edges[0]!;
  edge.accessible = "yes";
  const original = JSON.stringify(data),
    run = createImmutableRoutingSession(data);
  const proofs = run(() =>
    checkedStationaryNativeAliasChanges(
      data,
      before,
      new Set([edge.id]),
      nativeCirculationWalkBlockers(data),
    ),
  );
  assert.equal(proofs.length, 1);
  assert.equal(proofs[0]!.accepted, true, JSON.stringify(proofs));
  assert.equal(proofs[0]!.passageApproved, false);
  assert(
    compareSafety(before, safetySnapshot(data)).violations.some((v) =>
      v.includes("Accessibility"),
    ),
  );
  assert.deepEqual(
    compareSafety(
      before,
      safetySnapshot(data),
      new Set(proofs.filter((p) => p.accepted).map((p) => p.edgeId)),
    ).violations,
    [],
  );
  assert.equal(JSON.stringify(data), original);
});

test("candidate alias certification refuses near motion, height/owner/surface/cell substitution, disabled edges and original physical vetoes", async () => {
  const baseline = await stationaryFixture(),
    before = safetySnapshot(baseline),
    id = baseline.edges[0]!.id;
  const mutations: [string, (data: IndoorDataset) => void][] = [
    [
      "actual epsilon movement",
      (data) => {
        data.nodes[1]!.pointFeet[0] += 2 ** -40;
        data.edges[0]!.pointsFeet[1] = [...data.nodes[1]!.pointFeet];
      },
    ],
    [
      "height change",
      (data) => {
        data.nodes[1]!.pointFeet[2] = 2 ** -40;
        data.edges[0]!.pointsFeet[1] = [...data.nodes[1]!.pointFeet];
      },
    ],
    [
      "source owner",
      (data) => {
        data.nodes[1]!.roomKey = "other-source-room";
      },
    ],
    [
      "surface",
      (data) => {
        data.nodes[1]!.surfaceId = "another-source-surface";
      },
    ],
    [
      "cell",
      (data) => {
        data.edges[0]!.nativeCellId = "different-cell";
      },
    ],
    [
      "disabled",
      (data) => {
        data.edges[0]!.enabled = false;
      },
    ],
    [
      "claiming no-to-yes",
      (data) => {
        data.edges[0]!.accessible = "no";
      },
    ],
  ];
  for (const [name, mutate] of mutations) {
    const data = structuredClone(baseline);
    data.edges[0]!.accessible = "yes";
    mutate(data);
    const proof = createImmutableRoutingSession(data)(() =>
      checkedStationaryNativeAliasChanges(
        data,
        before,
        new Set([id]),
        new Set(),
      ),
    );
    assert.equal(proof[0]!.accepted, false, name);
  }
  const data = structuredClone(baseline);
  data.edges[0]!.accessible = "yes";
  assert.equal(
    createImmutableRoutingSession(data)(() =>
      checkedStationaryNativeAliasChanges(
        data,
        before,
        new Set([id]),
        new Set([id]),
      ),
    )[0]!.accepted,
    false,
    "fresh physical native veto is authoritative",
  );
  const explicitNo = structuredClone(baseline);
  explicitNo.edges[0]!.accessible = "no";
  const noSnapshot = safetySnapshot(explicitNo);
  explicitNo.edges[0]!.accessible = "yes";
  const noProof = createImmutableRoutingSession(explicitNo)(() =>
    checkedStationaryNativeAliasChanges(
      explicitNo,
      noSnapshot,
      new Set([id]),
      new Set(),
    ),
  );
  assert.equal(
    noProof[0]!.accepted,
    false,
    "an explicit negative access decision cannot become an identity certificate",
  );
  assert(
    compareSafety(
      noSnapshot,
      safetySnapshot(explicitNo),
      new Set([id]),
    ).violations.some((v) => v.includes("Accessibility")),
  );
});

test("a stricter explicit expected route survives a matching generated intended case and rejects an actual refusal", () => {
  const data = progressiveRoutingFixture();
  data.edges[0]!.enabled = false;
  const generated: RouteCase = {
      name: "generated intended connector",
      start: data.records[0]!.key,
      end: data.records[1]!.key,
      mode: "public",
      intendedEdgeId: data.edges[0]!.id,
    },
    explicit: RouteCase = {
      ...generated,
      name: "required repaired approach",
      expect: "route",
    },
    seen = new Set<string>(),
    retained = [generated, explicit].filter((row) =>
      retainDistinctActualRouteCase(row, seen),
    ),
    before = JSON.stringify(data),
    run = createImmutableRoutingSession(data),
    calculate = createWorkerRouteCalculator(data),
    result = run(() =>
      calculate(generated.start, generated.end, generated.mode),
    );
  assert.deepEqual(
    retained.map((row) => row.name),
    [generated.name, explicit.name],
  );
  assert.equal(result.route, null);
  assert.deepEqual(
    run(() => checkRouteResult(data, retained[0]!, result)).errors,
    [],
  );
  assert(
    run(() => checkRouteResult(data, retained[1]!, result)).errors.includes(
      "explicit-route-expectation",
    ),
  );
  assert.equal(JSON.stringify(data), before);
});

test("identical expected cases still deduplicate while contradictory availability expectations both remain checked", () => {
  const original: RouteCase = {
      name: "required route",
      start: "a",
      end: "b",
      mode: "public",
      expect: "route",
    },
    duplicate = { ...original, name: "same request repeated" },
    blocked: RouteCase = {
      ...original,
      name: "explicit refusal",
      expect: "blocked",
    },
    intended = {
      ...original,
      name: "particular connector",
      intendedEdgeId: "original-edge",
    },
    forbidden = {
      ...original,
      name: "forbidden original connector",
      forbiddenEdgeIds: ["original-edge"],
    },
    input = [original, duplicate, blocked, intended, forbidden],
    before = JSON.stringify(input),
    seen = new Set<string>(),
    retained = input.filter((row) => retainDistinctActualRouteCase(row, seen));
  assert.deepEqual(
    retained.map((row) => row.name),
    [original.name, blocked.name, intended.name, forbidden.name],
  );
  assert.equal(JSON.stringify(input), before);
});

test("retained explicit positive cases still exercise actual calculator paths and original instruction guards", () => {
  const data = progressiveRoutingFixture(),
    generated: RouteCase = {
      name: "generated available connector",
      start: data.records[0]!.key,
      end: data.records[1]!.key,
      mode: "public",
      intendedEdgeId: data.edges[0]!.id,
    },
    explicit: RouteCase = {
      ...generated,
      name: "required available connector",
      expect: "route",
    },
    seen = new Set<string>(),
    retained = [generated, explicit].filter((row) =>
      retainDistinctActualRouteCase(row, seen),
    ),
    before = JSON.stringify(data),
    run = createImmutableRoutingSession(data),
    calculate = createWorkerRouteCalculator(data),
    result = run(() => calculate(explicit.start, explicit.end, explicit.mode));
  assert.equal(retained.length, 2);
  assert(result.route);
  const checked = run(() => checkRouteResult(data, retained[1]!, result));
  assert.deepEqual(checked.errors, []);
  assert(checked.instructionCount > 0);
  const refusal: RouteCase = { ...explicit, expect: "blocked" };
  assert(
    run(() => checkRouteResult(data, refusal, result)).errors.includes(
      "explicit-route-expectation",
    ),
  );
  assert.equal(JSON.stringify(data), before);
});
