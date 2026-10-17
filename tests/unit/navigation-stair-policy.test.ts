import assert from "node:assert/strict";
import test from "node:test";
import fixture from "../fixtures/synthetic-navigation-stair-policy.json";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
import { nativeStairRouteQualified } from "../../app/indoor-project/native-source-stair";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";

// This deliberately small, synthetic native flight has complete tread/body,
// material, width and original terminal receipts. It approves no UNBC stair.
const fresh = () => structuredClone(fixture.data) as unknown as IndoorDataset;
const roomKeys = ["synthetic-room-0", "synthetic-room-1"] as const;
const modes = ["public", "accessible"] as const;

function assertBlocked(
  data: IndoorDataset,
  reason: "disabled" | "staff" | "direction" | "source-proof",
  forward: boolean,
  mode: (typeof modes)[number],
) {
  const edge = data.edges[0]!;
  const start = forward ? edge.from : edge.to;
  const graph = projectRoutingGraph(data, mode);
  const blocked = graph.allAdjacency
    .get(start)
    ?.find((link) => link.edge.id === edge.id);
  assert(blocked, "A rejected link remains available for diagnostics");
  assert(blocked.blockers.some((blocker) => blocker.kind === reason));
  assert(!graph.adjacency.get(start)?.some((link) => link.edge.id === edge.id));
  const calculate = createWorkerRouteCalculator(data);
  const result = calculate(
    roomKeys[forward ? 0 : 1],
    roomKeys[forward ? 1 : 0],
    mode,
  );
  assert.equal(result.route, null);
  assert(
    result.diagnostic?.blockers.some((blocker) => blocker.kind === reason),
  );
}

test("qualified synthetic local steps retain their exact source geometry and same-campus-floor instructions in both directions", () => {
  const data = fresh();
  const original = JSON.stringify(data);
  assert(nativeStairRouteQualified(data, data.edges[0]!));
  const calculate = createWorkerRouteCalculator(data);
  for (const forward of [true, false]) {
    const from = roomKeys[forward ? 0 : 1];
    const to = roomKeys[forward ? 1 : 0];
    const route = calculate(from, to, "public").route;
    assert(route, "Fully qualified public steps must remain usable");
    assert.deepEqual(
      route.edges.map((edge) => edge.id),
      [data.edges[0]!.id],
    );
    const points = forward
      ? data.edges[0]!.pointsFeet
      : [...data.edges[0]!.pointsFeet].reverse();
    assert.deepEqual(route.paths[0]!.pointsFeet, points);
    assert.equal(route.paths[0]!.centered, false);
    const step = projectNavigationSteps(data, route, from, to).find(
      (instruction) => instruction.type === "floor-change",
    );
    assert(step);
    assert.equal(step.message, `Take the steps ${forward ? "up" : "down"}`);
    assert.equal(step.networkType, "stairs");
    assert.equal(step.floorsTraversed, 0);
    assert.equal(step.fromLevel, forward ? 1 : 2);
    assert.equal(step.toLevel, forward ? 2 : 1);
    assert.deepEqual(step.pointsFeet, points);
    assert.equal(calculate(from, to, "accessible").route, null);
  }
  assert.equal(JSON.stringify(data), original);
});

test("disabled qualified local steps remain blocked in both directions and every route profile", () => {
  for (const mode of modes)
    for (const forward of [true, false]) {
      const data = fresh();
      data.edges[0]!.enabled = false;
      assert(nativeStairRouteQualified(data, data.edges[0]!));
      assertBlocked(data, "disabled", forward, mode);
      const graph = projectRoutingGraph(data, mode);
      assert(
        !graph.allAdjacency
          .get(data.edges[0]!.from)![0]!
          .blockers.some((blocker) => blocker.kind === "source-proof"),
        "The refusal comes from the explicit disable, not missing qualification",
      );
    }
});

test("native stair qualification never overrides a staff area in either direction or profile", () => {
  for (const mode of modes)
    for (const forward of [true, false]) {
      const data = fresh();
      data.records[1]!.access = "staff";
      assert(nativeStairRouteQualified(data, data.edges[0]!));
      assertBlocked(data, "staff", forward, mode);
    }
});

test("qualified steps obey both one-way orientations while step-free routing refuses both directions", () => {
  for (const direction of ["from-to", "to-from"] as const) {
    const data = fresh();
    data.edges[0]!.direction = direction;
    assert(nativeStairRouteQualified(data, data.edges[0]!));
    const forward = direction === "from-to";
    const calculate = createWorkerRouteCalculator(data);
    assert(
      calculate(roomKeys[forward ? 0 : 1], roomKeys[forward ? 1 : 0], "public")
        .route,
    );
    assertBlocked(data, "direction", !forward, "public");
    for (const reverse of [true, false])
      assert.equal(
        calculate(
          roomKeys[reverse ? 0 : 1],
          roomKeys[reverse ? 1 : 0],
          "accessible",
        ).route,
        null,
      );
  }
});

test("enabled and accessible labels cannot replace missing or altered original stair proof", () => {
  const changes: ((data: IndoorDataset) => void)[] = [
    (data) => {
      delete data.edges[0]!.nativeSourceStair;
    },
    (data) => {
      data.edges[0]!.pointsFeet[2]![0] += 0.1;
    },
    (data) => {
      data.edges[0]!.accessible = "yes";
    },
  ];
  for (const change of changes)
    for (const mode of modes)
      for (const forward of [true, false]) {
        const data = fresh();
        change(data);
        data.edges[0]!.enabled = true;
        assert.equal(nativeStairRouteQualified(data, data.edges[0]!), false);
        assertBlocked(data, "source-proof", forward, mode);
      }
});

test("ordinary authoring calculations invalidate a previously allowed qualified stair after access or direction edits", () => {
  const data = fresh();
  const edge = data.edges[0]!;
  const forwardRoute = () =>
    projectRoutingGraph(data, "public")
      .adjacency.get(edge.from)
      ?.some((link) => link.edge.id === edge.id) ?? false;
  assert(forwardRoute());
  edge.enabled = false;
  assert.equal(forwardRoute(), false);
  edge.enabled = true;
  assert(forwardRoute());
  data.records[1]!.access = "staff";
  assert.equal(forwardRoute(), false);
  data.records[1]!.access = "public";
  assert(forwardRoute());
  edge.direction = "to-from";
  assert.equal(forwardRoute(), false);
  edge.direction = "from-to";
  assert(forwardRoute());
  delete edge.nativeSourceStair;
  assert.equal(forwardRoute(), false);
});
