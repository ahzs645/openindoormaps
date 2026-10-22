import test from "node:test";
import assert from "node:assert/strict";
import {
  createCorridorCenterline,
  composeCorridorCenterlineRoute,
  type CorridorXY,
} from "../../app/indoor-project/corridor-centerline";
import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import {
  nativeExactPartsForProposals,
  nativeRationalFootprintSupported,
  nativeRationalPathSupported,
} from "../../app/indoor-project/native-exact-planar-topology";
import { proposeStraightCorridorAxis } from "../../app/indoor-project/corridor-straight-axis";
import { createTwoFootCorridorSupport } from "../../app/indoor-project/corridor-guide-support";
const rect = (x: number, y: number, w: number, h: number): CorridorXY[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function clearance(parts: NativeRationalParts) {
  return (path: CorridorXY[]) =>
    path.slice(1).every((b, i) => {
      const a = path[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      if (length === 0) return nativeRationalPathSupported([a, b], parts);
      const nx = -dy / length,
        ny = dx / length;
      const footprint = nativeRationalOverlay("union", [
        [
          [
            [a[0] + nx, a[1] + ny],
            [b[0] + nx, b[1] + ny],
            [b[0] - nx, b[1] - ny],
            [a[0] - nx, a[1] - ny],
          ],
        ],
      ]);
      return nativeRationalFootprintSupported(footprint, parts);
    });
}
const terminal = (id: string, x: number, y: number) => ({
  id,
  point: [x, y] as CorridorXY,
});

test("core-only retrace cancellation retains fixed approaches and introduces no chord", () => {
  const start: CorridorXY[] = [
    [-3, 0],
    [-2, 0],
    [-3, 0],
  ];
  const core: CorridorXY[] = [
    [0, 0],
    [1, 0],
    [0, 0],
    [3, 0],
  ];
  const end: CorridorXY[] = [
    [3, 0],
    [4, 0],
    [3, 0],
  ];
  const before = JSON.stringify([start, core, end]);
  const route = composeCorridorCenterlineRoute(start, core, end);
  const [first, last] = route.hallwayJoins;
  assert.deepEqual(route.points.slice(0, first + 1), start);
  assert.deepEqual(route.points.slice(last).toReversed(), end);
  assert.deepEqual(route.points[first], start.at(-1));
  assert.deepEqual(route.points[last], end.at(-1));
  assert.deepEqual(route.points.slice(first, last + 1), [
    [-3, 0],
    [0, 0],
    [3, 0],
  ]);
  const originalCore = [start.at(-1)!, ...core];
  const originalSegments = new Set(
    originalCore
      .slice(1)
      .map((point, i) => JSON.stringify([originalCore[i], point])),
  );
  for (let i = first + 1; i <= last; i++)
    assert.ok(
      originalSegments.has(
        JSON.stringify([route.points[i - 1], route.points[i]]),
      ),
    );
  route.points[0][0] = 999;
  assert.equal(JSON.stringify([start, core, end]), before);
});

test("a genuine core cycle survives exact retrace cancellation", () => {
  const start: CorridorXY[] = [
    [-1, 0],
    [0, 0],
  ];
  const core: CorridorXY[] = [
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
    [4, 0],
  ];
  const end: CorridorXY[] = [
    [5, 0],
    [4, 0],
  ];
  const route = composeCorridorCenterlineRoute(start, core, end);
  assert.deepEqual(
    route.points.slice(route.hallwayJoins[0], route.hallwayJoins[1] + 1),
    [start.at(-1), ...core],
  );
});

test("opposite room doors use one corridor centre and retain their exact endpoints", () => {
  const rings = [rect(0, 0, 40, 10)],
    parts = nativeRationalOverlay("union", [rings]);
  const terminals = [
    terminal("a", 4, 1),
    terminal("b", 35, 9),
    terminal("c", 20, 1),
  ];
  const original = JSON.stringify([rings, terminals]);
  const network = createCorridorCenterline(rings, terminals, clearance(parts));
  assert.deepEqual(network.missing, []);
  const path = network.route("a", "b")!;
  assert.ok(path);
  assert.deepEqual(path[0], terminals[0].point);
  assert.deepEqual(path.at(-1), terminals[1].point);
  assert.ok(
    path
      .slice(1, -1)
      .filter((p) => p[0] > 6 && p[0] < 34)
      .every((p) => Math.abs(p[1] - 5) < 0.15),
  );
  assert.ok(clearance(parts)(path));
  assert.deepEqual(network.route("b", "a"), path.toReversed());
  assert.equal(JSON.stringify([rings, terminals]), original);
  const other = network.route("a", "c")!;
  assert.ok(
    other
      .slice(1, -1)
      .some((p) => path.some((q) => p[0] === q[0] && p[1] === q[1])),
  );
});

test("a T junction preserves all three corridor branches without a corner shortcut", () => {
  const parts = nativeRationalOverlay("union", [
    [rect(0, 0, 40, 8)],
    [rect(16, 0, 8, 30)],
  ]);
  const rings = nativeExactPartsForProposals(parts)[0];
  const terminals = [
    terminal("left", 3, 4),
    terminal("right", 37, 4),
    terminal("top", 20, 27),
  ];
  const network = createCorridorCenterline(rings, terminals, clearance(parts));
  assert.equal(network.statistics().straightAxisProposed, false);
  assert.deepEqual(network.missing, []);
  for (const [a, b] of [
    ["left", "right"],
    ["left", "top"],
    ["right", "top"],
  ]) {
    const route = network.route(a, b);
    assert.ok(route);
    assert.ok(clearance(parts)(route));
  }
});

test("small wall recesses are averaged into one straight axis, with separate checked doorway approaches", () => {
  const rings: CorridorXY[][] = [
    [
      [0, 0],
      [12, 0],
      [12, -0.5],
      [15, -0.5],
      [15, 0],
      [60, 0],
      [60, 10],
      [43, 10],
      [43, 10.4],
      [40, 10.4],
      [40, 10],
      [0, 10],
    ],
  ];
  const parts = nativeRationalOverlay("union", [rings]);
  const terminals = [
    terminal("a", 5, 1),
    terminal("b", 55, 9),
    terminal("c", 24, 9),
  ];
  const network = createCorridorCenterline(rings, terminals, clearance(parts));
  assert.equal(network.statistics().straightAxisProposed, true);
  const route = network.routeDetails("a", "b")!;
  assert.ok(clearance(parts)(route.points));
  assert.equal(
    route.hallwayJoins[1] - route.hallwayJoins[0],
    2,
    "the common axis retains the other complete-cell terminal join",
  );
  const axis = proposeStraightCorridorAxis(rings)!;
  const a = route.points[route.hallwayJoins[0]],
    b = route.points[route.hallwayJoins[1]];
  for (const id of ["a", "b", "c"]) {
    const p = axis.project(terminals.find((t) => t.id === id)!.point);
    assert.ok(
      Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) <
        1e-10,
    );
  }
  assert.deepEqual(network.route("b", "a"), route.points.toReversed());
  assert.deepEqual(route.points[0], terminals[0].point);
  assert.deepEqual(route.points.at(-1), terminals[1].point);
});

test("an L hallway and a curved hallway do not become one averaged diagonal", () => {
  const l = nativeExactPartsForProposals(
    nativeRationalOverlay("union", [[rect(0, 0, 60, 8)], [rect(52, 0, 8, 35)]]),
  )[0];
  assert.equal(proposeStraightCorridorAxis(l), null);
  const curve: CorridorXY[][] = [
    [
      ...Array.from(
        { length: 21 },
        (_, i): CorridorXY => [i * 3, (i * 3) ** 2 / 300],
      ),
      ...Array.from(
        { length: 21 },
        (_, i): CorridorXY => [(20 - i) * 3, ((20 - i) * 3) ** 2 / 300 + 8],
      ),
    ],
  ];
  assert.equal(proposeStraightCorridorAxis(curve), null);
});

test("both alternatives around an island survive; a newly blocked side uses the other", () => {
  const rings = [rect(0, 0, 60, 20), rect(25, 6, 10, 8)];
  const original = nativeRationalOverlay("union", [rings]);
  const terminals = [terminal("a", 4, 10), terminal("b", 56, 10)];
  for (const blockTop of [true, false]) {
    const parts = nativeRationalOverlay("difference", original, [
      [rect(24, blockTop ? 14 : 0, 12, 6)],
    ]);
    const network = createCorridorCenterline(
      rings,
      terminals,
      clearance(parts),
    );
    const path = network.route("a", "b");
    assert.ok(path);
    assert.ok(clearance(parts)(path));
    const crossing = path.slice(1).flatMap((b, i) => {
      const a = path[i];
      if (Math.min(a[0], b[0]) > 30 || Math.max(a[0], b[0]) < 30) return [];
      if (a[0] === b[0]) return [a, b];
      const t = (30 - a[0]) / (b[0] - a[0]);
      return [[30, a[1] + (b[1] - a[1]) * t]];
    });
    assert.ok(crossing.length > 0);
    assert.ok(crossing.every((p) => (blockTop ? p[1] < 6 : p[1] > 14)));
    assert.deepEqual(path[0], terminals[0].point);
    assert.deepEqual(path.at(-1), terminals[1].point);
  }
});

test("a positive sub-millimetre wall vetoes a connection even when both ends are supported", () => {
  const rings = [rect(0, 0, 40, 10)];
  const parts = nativeRationalOverlay(
    "difference",
    [rings],
    [[rect(19.999, 0, 0.001, 10)]],
  );
  const network = createCorridorCenterline(
    rings,
    [terminal("a", 4, 5), terminal("b", 36, 5)],
    clearance(parts),
  );
  assert.equal(network.route("a", "b"), null);
});

test("sampling limits, blocked terminal approaches and repeated identities fail conservatively", () => {
  const rings = [rect(0, 0, 40, 10)];
  const budget = createCorridorCenterline(
    rings,
    [terminal("a", 4, 5)],
    () => true,
    { maxSites: 4 },
  );
  assert.equal(budget.statistics().budgetExceeded, true);
  assert.equal(budget.route("a", "a"), null);
  assert.equal(budget.refusalReason("a", "a"), "sampling-budget");
  const blocked = createCorridorCenterline(
    rings,
    [terminal("a", 4, 5)],
    (_p, id) => id === undefined,
  );
  assert.deepEqual(blocked.missing, ["a"]);
  assert.equal(blocked.refusalReason("a", "a"), "terminal-attachment");
  assert.throws(
    () =>
      createCorridorCenterline(
        rings,
        [terminal("a", 4, 5), terminal("a", 5, 5)],
        () => true,
      ),
    /Duplicate/,
  );
  for (const maxSites of [Infinity, Number.NaN, 25.5, 100_001])
    assert.throws(
      () => createCorridorCenterline(rings, [], () => true, { maxSites }),
      /sampling budget/,
    );
});

test("an unanchored proposal cycle survives until checked terminal alternatives can use it", () => {
  const rings = [rect(0, 0, 60, 20), rect(25, 6, 10, 8)];
  const parts = nativeRationalOverlay("union", [rings]);
  const network = createCorridorCenterline(rings, [], clearance(parts));
  assert.ok(network.statistics().attachmentFitting.acceptedChains > 0);
  assert.equal(network.statistics().attachedTerminals, 0);
});

test("an original terminal retries a checked receiving chain after its nearest sampled fragment is severed", () => {
  const rings = [rect(0, 0, 40, 20), rect(18, 6, 4, 8)];
  // The proposal omits this exact physical seam. Its adjacent sampled chain
  // therefore fails width qualification. Only A has a separately qualified
  // finite extension; that extension can never be borrowed by the lane or B.
  const base = nativeRationalOverlay(
    "difference",
    [rings],
    [[rect(27, 0, 0.1, 20)]],
  );
  const ownExtension = nativeRationalOverlay("union", [[rect(24, 1, 14, 5)]]);
  const check = createTwoFootCorridorSupport(base, 0);
  const terminals = [terminal("a", 26, 3), terminal("b", 36, 3)];
  const before = JSON.stringify([rings, terminals]);
  const build = (ordered: typeof terminals) =>
    createCorridorCenterline(
      rings,
      ordered,
      (path, id) => check(path, id === "a" ? ownExtension : []),
      { requiredEdges: [{ id: "original-walk", from: "a", to: "b" }] },
    );
  const network = build(terminals);
  const route = network.routeDetails("a", "b")!;
  assert.ok(route);
  assert.ok(network.statistics().reattachedTerminals > 0);
  assert.equal(network.statistics().connectedRequiredEdges, 1);
  const [first, last] = route.hallwayJoins;
  assert.ok(first <= 2 && route.points.length - 1 - last <= 2);
  assert.ok(check(route.points.slice(0, first + 1), ownExtension));
  assert.ok(check(route.points.slice(first, last + 1)));
  assert.ok(check(route.points.slice(last)));
  assert.deepEqual(route.points[0], terminals[0].point);
  assert.deepEqual(route.points.at(-1), terminals[1].point);
  assert.deepEqual(network.route("b", "a"), route.points.toReversed());
  assert.deepEqual(build(terminals.toReversed()).routeDetails("a", "b"), route);
  assert.equal(JSON.stringify([rings, terminals]), before);
});
