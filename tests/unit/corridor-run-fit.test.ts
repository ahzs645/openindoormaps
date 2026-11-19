import test from "node:test";
import assert from "node:assert/strict";
import {
  createCorridorCenterline,
  type CorridorXY,
} from "../../app/indoor-project/corridor-centerline";
import {
  branchedCorridorFixture,
  clearance,
  rect,
  type FixtureTerminal,
} from "./corridor-run-fixture";

const turn = (a: CorridorXY, b: CorridorXY, c: CorridorXY) => {
  const u = [b[0] - a[0], b[1] - a[1]],
    v = [c[0] - b[0], c[1] - b[1]];
  return (
    (Math.abs(
      Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]),
    ) *
      180) /
    Math.PI
  );
};
const turns = (path: readonly CorridorXY[]) =>
  path
    .filter(
      (p, i) => i === 0 || p[0] !== path[i - 1][0] || p[1] !== path[i - 1][1],
    )
    .flatMap((c, i, all) => (i >= 2 ? [turn(all[i - 2], all[i - 1], c)] : []));
/** Angle (0-90) between the last leg of a door branch and the x axis. */
const angleToHall = (approach: readonly CorridorXY[]) => {
  const a = approach.at(-2)!,
    b = approach.at(-1)!;
  const degrees =
    (Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0])) * 180) / Math.PI;
  return Math.min(degrees, 180 - degrees);
};

const hallDoors = (terminals: readonly FixtureTerminal[]) =>
  terminals.filter((t) => /^[sn]\d+$/.test(t.id));

function build(
  fixture: ReturnType<typeof branchedCorridorFixture>,
  options: { straightRuns?: boolean } = {},
  supported?: (path: CorridorXY[], terminal?: string) => boolean,
  terminals: readonly FixtureTerminal[] = fixture.terminals,
) {
  const check = clearance(fixture.parts);
  return createCorridorCenterline(
    fixture.rings,
    terminals,
    supported ?? ((path) => check(path)),
    {
      straightRuns: true,
      ...options,
      // Include journeys across multiple fitted runs (lobby, main hall, corner
      // and side corridors), not only routes incident to one hallway door.
      requiredEdges: fixture.terminals.flatMap((a, i) =>
        fixture.terminals.slice(i + 1).map((b) => ({ from: a.id, to: b.id })),
      ),
    },
  );
}

test("a branched hall becomes straight runs between real junctions with perpendicular door branches", () => {
  const fixture = branchedCorridorFixture();
  const before = JSON.stringify(fixture.terminals);
  const check = clearance(fixture.parts);
  const control = build(fixture, { straightRuns: false });
  const network = build(fixture);
  const runs = network.statistics().straightRuns!;
  assert.ok(runs.fittedRuns >= 3, JSON.stringify(runs));
  assert.equal(network.statistics().missingTerminals, 0);
  // Every route: exact support and the original terminals as endpoints.
  let bendsAfter = 0,
    bendsBefore = 0;
  for (const a of fixture.terminals)
    for (const b of fixture.terminals) {
      if (a.id >= b.id) continue;
      const route = network.routeDetails(a.id, b.id)!;
      assert.ok(route, `${a.id} -> ${b.id}`);
      assert.ok(check(route.points), `${a.id} -> ${b.id} support`);
      assert.deepEqual(route.points[0], a.point);
      assert.deepEqual(route.points.at(-1), b.point);
      // Original terminal approaches keep at most one elbow (checkpoint rule).
      assert.ok(route.hallwayJoins[0] <= 2);
      assert.ok(route.points.length - 1 - route.hallwayJoins[1] <= 2);
      assert.deepEqual(network.route(b.id, a.id), route.points.toReversed());
      const routeLength = (p: readonly CorridorXY[]) =>
        p
          .slice(1)
          .reduce(
            (sum, point, i) =>
              sum + Math.hypot(point[0] - p[i][0], point[1] - p[i][1]),
            0,
          );
      assert.ok(
        routeLength(route.points) <=
          routeLength(control.routeDetails(a.id, b.id)!.points) * 1.15 + 3,
        `${a.id} -> ${b.id} detour`,
      );
      const core = (r: typeof route) =>
        r.points.slice(r.hallwayJoins[0], r.hallwayJoins[1] + 1);
      bendsAfter += turns(core(route)).filter((t) => t > 5).length;
      bendsBefore += turns(core(control.routeDetails(a.id, b.id)!)).filter(
        (t) => t > 5,
      ).length;
    }
  assert.ok(bendsAfter < bendsBefore, `${bendsAfter} < ${bendsBefore}`);
  // The main hall is one straight centre line through its junctions, and
  // every hall door meets it at a right angle.
  const doors = hallDoors(fixture.terminals);
  const west = doors.find((t) => t.id === "s12")!,
    east = doors.find((t) => t.id === "s104")!;
  const hall = network.routeDetails(west.id, east.id)!;
  const lane = hall.points.slice(
    hall.hallwayJoins[0],
    hall.hallwayJoins[1] + 1,
  );
  assert.ok(
    turns(lane).every((t) => t < 0.5),
    JSON.stringify(lane),
  );
  assert.ok(lane.every((p) => Math.abs(p[1] - 4) <= 0.35));
  let perpendicular = 0;
  for (const door of doors) {
    const route = network.routeDetails(
      door.id,
      west.id === door.id ? east.id : west.id,
    )!;
    const approach = route.points.slice(0, route.hallwayJoins[0] + 1);
    if (Math.abs(90 - angleToHall(approach)) <= 10) perpendicular++;
    // The join is on the fitted hall line.
    assert.ok(Math.abs(approach.at(-1)![1] - 4) <= 0.35);
  }
  assert.equal(perpendicular, doors.length);
  // A genuine corner is kept: one bend near (116, 4), straight elsewhere.
  const corner = network.routeDetails(west.id, "corner")!;
  const cornerLane = corner.points.slice(
    corner.hallwayJoins[0],
    corner.hallwayJoins[1] + 1,
  );
  const cornerTurns = turns(cornerLane);
  assert.equal(cornerTurns.filter((t) => t > 30).length, 1);
  assert.ok(cornerTurns.filter((t) => t <= 30).every((t) => t < 0.5));
  const bend = cornerLane.find(
    (_p, i) =>
      i > 0 &&
      i < cornerLane.length - 1 &&
      turn(cornerLane[i - 1], cornerLane[i], cornerLane[i + 1]) > 30,
  )!;
  assert.ok(Math.abs(bend[0] - 116) <= 1 && Math.abs(bend[1] - 4) <= 1);
  // Side corridors stay connected through their junctions.
  for (const side of ["up", "down"]) {
    const route = network.routeDetails(west.id, side)!;
    assert.ok(route && check(route.points));
  }
  assert.equal(JSON.stringify(fixture.terminals), before);
  // Deterministic in terminal order.
  const reversed = build(
    fixture,
    {},
    undefined,
    fixture.terminals.toReversed(),
  );
  assert.deepEqual(reversed.routeDetails(west.id, "corner"), corner);
});

test("both lanes around the lobby island survive run fitting; a blocked side uses the other", () => {
  const unblocked = branchedCorridorFixture();
  const network = build(unblocked);
  const side = (route: CorridorXY[]) =>
    route.slice(1).flatMap((b, i) => {
      const a = route[i];
      if (Math.min(a[0], b[0]) > -23 || Math.max(a[0], b[0]) < -23) return [];
      if (a[0] === b[0]) return [a[1], b[1]];
      return [a[1] + ((b[1] - a[1]) * (-23 - a[0])) / (b[0] - a[0])];
    });
  // Each lobby door uses its own side of the island: the loop is kept.
  const north = side(network.route("lobby-n", "s12")!),
    south = side(network.route("lobby-s", "s12")!);
  assert.ok(north.length > 0 && north.every((y) => y > 8));
  assert.ok(south.length > 0 && south.every((y) => y < 0));
  for (const blockTop of [true, false]) {
    const fixture = branchedCorridorFixture([
      rect(-31, blockTop ? 8 : -8, 16, 8),
    ]);
    const blocked = build(fixture);
    const path = blocked.route("lobby-w", "s12")!;
    assert.ok(path);
    assert.ok(clearance(fixture.parts)(path));
    const crossing = side(path);
    assert.ok(crossing.length > 0);
    assert.ok(crossing.every((y) => (blockTop ? y < 0 : y > 8)));
    assert.deepEqual(
      path[0],
      fixture.terminals.find((t) => t.id === "lobby-w")!.point,
    );
  }
});

test("a door branch that cannot be re-proposed keeps its exact checked branch on a straightened run", () => {
  const fixture = branchedCorridorFixture();
  const check = clearance(fixture.parts);
  const control = build(fixture, { straightRuns: false });
  // Only the already chosen branch of door "up" is supported.
  const chosen = JSON.stringify(control.joins.get("up")!.approach);
  const strict = (path: CorridorXY[], terminal?: string) =>
    check(path) && (terminal !== "up" || JSON.stringify(path) === chosen);
  const network = build(fixture, {}, strict);
  const runs = network.statistics().straightRuns!;
  assert.ok(runs.keptBranches >= 1, JSON.stringify(runs));
  assert.ok(runs.fittedRuns >= 3);
  const route = network.routeDetails("s12", "up")!;
  assert.ok(check(route.points));
  assert.equal(
    JSON.stringify(route.points.slice(route.hallwayJoins[1]).toReversed()),
    chosen,
  );
  // The hall is still one straight line.
  const hall = network.routeDetails("s12", "s104")!;
  const lane = hall.points.slice(
    hall.hallwayJoins[0],
    hall.hallwayJoins[1] + 1,
  );
  assert.ok(turns(lane).every((t) => t < 0.5));
});

test("a run whose straight proposal fails exact support keeps its checked geometry; neighbouring runs are still fitted", () => {
  const fixture = branchedCorridorFixture();
  const check = clearance(fixture.parts);
  // Every lane piece the unfitted network checked stays supported; any new
  // lane piece lying wholly inside the main hall is refused (a hard hall).
  const checked = new Set<string>();
  const control = build(fixture, { straightRuns: false }, (path, terminal) => {
    const valid = check(path);
    if (valid && terminal === undefined) checked.add(JSON.stringify(path));
    return valid;
  });
  const inHall = (p: CorridorXY) =>
    p[0] > 0 && p[0] < 112 && p[1] >= 0 && p[1] <= 8;
  const hard = (path: CorridorXY[], terminal?: string) =>
    check(path) &&
    (terminal !== undefined ||
      checked.has(JSON.stringify(path)) ||
      !path.every(inHall));
  const network = build(fixture, {}, hard);
  const runs = network.statistics().straightRuns!;
  assert.ok((runs.keptRuns["unsupported-run"] ?? 0) >= 1, JSON.stringify(runs));
  assert.ok(runs.fittedRuns >= 2, JSON.stringify(runs));
  // The hall and its door branches are exactly the checked ones.
  for (const [a, b] of [
    ["s12", "s104"],
    ["n17", "corner"],
  ])
    assert.deepEqual(network.routeDetails(a, b), control.routeDetails(a, b));
  // The side corridors are straight from their hall junction to their door.
  for (const side of ["up", "down"]) {
    const route = network.routeDetails("s12", side)!;
    assert.ok(check(route.points));
    const lane = route.points.slice(
      route.hallwayJoins[0],
      route.hallwayJoins[1] + 1,
    );
    const junction = lane.findLastIndex((p) => Math.abs(p[1] - 4) <= 3);
    const corridor = lane.slice(junction);
    assert.ok(corridor.length >= 2, JSON.stringify(lane));
    assert.ok(
      turns(corridor).every((t) => t < 0.5),
      JSON.stringify(lane),
    );
    const [a, b] = [corridor[0], corridor.at(-1)!];
    assert.ok(Math.abs(b[0] - a[0]) < 0.05 * Math.abs(b[1] - a[1]));
  }
});

test("run fitting is off with legacy approaches and when disabled", () => {
  const fixture = branchedCorridorFixture();
  assert.equal(
    build(fixture, { straightRuns: false }).statistics().straightRuns,
    null,
  );
  const check = clearance(fixture.parts);
  const legacy = createCorridorCenterline(
    fixture.rings,
    fixture.terminals,
    (path) => check(path),
    { shapedApproaches: false },
  );
  assert.equal(legacy.statistics().straightRuns ?? null, null);
});
