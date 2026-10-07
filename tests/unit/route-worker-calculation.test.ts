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
      for (const choice of ["doorway", "hallway"] as const)
        assert.deepEqual(
          actual.arrivals?.[choice],
          resolveRouteArrival(data, expected.route, endKey, choice),
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
