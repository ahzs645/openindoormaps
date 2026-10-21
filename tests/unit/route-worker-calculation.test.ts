import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  calculateRoute,
  createWorkerRouteCalculator,
} from "../../app/indoor-project/route-calculation";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";
import { resolveRouteArrival } from "../../app/indoor-project/route-arrival";
import { findProjectRoute } from "../../app/indoor-project/viewer-routing";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-agora-washroom-navigation.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { data: IndoorDataset; startKey: string; endKey: string };

test("normal authoring same-place calculations retain zero-distance and endpoint/source-policy guards", () => {
  const data = progressiveRoutingFixture();
  data.edges = [];
  const key = data.records[0].key;
  const before = JSON.stringify(data);
  const run = createWorkerRouteCalculator(structuredClone(data));
  for (const mode of ["public", "accessible"] as const) {
    const result = run(key, key, mode, { endpointMode: "inside" });
    assert.ok(result.route);
    assert.equal(result.route.distanceMetres, 0);
    assert.deepEqual(result.route.edges, []);
    assert.deepEqual(result.route.nodeIds, [data.records[0].arrivalNodeId]);
    assert.equal(result.diagnostic, undefined);
    assert.equal(run(key, data.records[1].key, mode).route, null);
  }
  for (const defect of [
    "staff",
    "non-walkable",
    "missing-arrival",
    "pending-boundary",
  ] as const) {
    const changed = structuredClone(data);
    if (defect === "staff") changed.records[0].access = "staff";
    if (defect === "non-walkable") changed.records[0].walkable = false;
    if (defect === "missing-arrival") delete changed.records[0].arrivalNodeId;
    if (defect === "pending-boundary")
      changed.boundaryPatchState = {
        patchIds: ["synthetic-pending"],
        regenerated: false,
      };
    const reject = createWorkerRouteCalculator(changed);
    for (const mode of ["public", "accessible"] as const)
      assert.equal(reject(key, key, mode).route, null, `${defect}/${mode}`);
  }
  assert.equal(JSON.stringify(data), before);
});

test("worker snapshot retains exact routing and step-free policy while excluding rendering payloads", () => {
  const { data, startKey, endKey } = fixture();
  const input = routeWorkerDataset(data);
  for (const field of [
    "records",
    "nodes",
    "edges",
    "walls",
    "doors",
    "walkingSupport",
    "circulationGeometry",
    "indoorExclusions",
    "connectors",
  ] as const)
    assert.equal(
      input[field],
      data[field],
      `${field} is unchanged before cloning`,
    );
  assert.equal(input.presentation, undefined);
  assert.equal(input.nativeExploreMapping, undefined);
  const run = createWorkerRouteCalculator(structuredClone(input));
  for (const mode of ["public", "accessible"] as const) {
    const expected = calculateRoute(data, startKey, endKey, mode);
    const actual = run(startKey, endKey, mode);
    assert.deepEqual(actual.route, expected.route);
    assert.deepEqual(actual.diagnostic, expected.diagnostic);
    assert.deepEqual(
      actual.reachable,
      reachableProjectDestinations(projectRoutingGraph(data, mode), startKey),
    );
    assert.deepEqual(
      run(startKey, endKey, mode),
      actual,
      "warm result matches cold geometry/policy",
    );
    if (expected.route)
      assert.deepEqual(
        actual.arrivals?.doorway,
        resolveRouteArrival(data, expected.route, endKey, "doorway"),
      );
    assert.deepEqual(
      actual.arrivals?.hallway?.route,
      findProjectRoute(data, startKey, endKey, mode, {
        endpointMode: "hallway",
      }),
    );
  }
});

test("coverage prepares without a destination and does not invent a route", () => {
  const { data, startKey } = fixture();
  const run = createWorkerRouteCalculator(
    structuredClone(routeWorkerDataset(data)),
  );
  assert.deepEqual(run("", "", "public"), { route: null });
  const coverage = run(startKey, "", "public");
  assert.equal(coverage.route, null);
  assert.equal(coverage.diagnostic, undefined);
  assert.deepEqual(
    coverage.reachable,
    reachableProjectDestinations(projectRoutingGraph(data), startKey),
  );
});

test("new snapshots invalidate private bindings; mutable authoring guards still detect door edits", () => {
  const { data, startKey, endKey } = fixture();
  const run = createWorkerRouteCalculator(
    structuredClone(routeWorkerDataset(data)),
  );
  const before = run(startKey, endKey, "public");
  assert.ok(before.route);
  calculateRoute(data, startKey, endKey, "public");
  const doorId = before.route.edges.find((edge) => edge.kind === "door")!.id;
  data.edges.find((edge) => edge.id === doorId)!.enabled = false;
  const expected = calculateRoute(data, startKey, endKey, "public");
  assert.notDeepEqual(
    expected.route,
    before.route,
    "authoring policy detects in-place disabled door",
  );
  assert.deepEqual(
    run(startKey, endKey, "public"),
    before,
    "private clone does not observe external mutation",
  );
  const edited = createWorkerRouteCalculator(
    structuredClone(routeWorkerDataset(data)),
  )(startKey, endKey, "public");
  assert.deepEqual(edited.route, expected.route);
  assert.deepEqual(edited.diagnostic, expected.diagnostic);
});

test("selected inside arrival preserves route, policy and coverage without unused hallway alternatives", () => {
  const { data, startKey, endKey } = fixture();
  for (const [start, end] of [
    [startKey, endKey],
    [endKey, startKey],
  ]) {
    for (const mode of ["public", "accessible"] as const) {
      const run = createWorkerRouteCalculator(
        structuredClone(routeWorkerDataset(data)),
      );
      const legacy = run(start, end, mode);
      const selected = run(start, end, mode, { endpointMode: "inside" });
      assert.deepEqual(selected.route, legacy.route);
      assert.deepEqual(selected.diagnostic, legacy.diagnostic);
      assert.deepEqual(selected.reachable, legacy.reachable);
      assert.deepEqual(selected.arrivals?.doorway, legacy.arrivals?.doorway);
      assert.equal(selected.arrivals?.hallway, undefined);
      assert.ok(Object.hasOwn(legacy.arrivals ?? {}, "hallway"));
    }
  }
  const run = createWorkerRouteCalculator(
    structuredClone(routeWorkerDataset(data)),
  );
  const legacy = run(startKey, "not-a-place", "public");
  const selected = run(startKey, "not-a-place", "public", {
    endpointMode: "inside",
  });
  assert.equal(selected.route, null);
  assert.deepEqual(selected.diagnostic, legacy.diagnostic);
});
