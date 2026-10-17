import test from "node:test";
import assert from "node:assert/strict";
import {
  createCorridorCenterline,
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
    const crossing = path.filter((p) => p[0] > 25 && p[0] < 35);
    assert.ok(crossing.length > 0);
    assert.ok(crossing.every((p) => (blockTop ? p[1] < 6 : p[1] > 14)));
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
  const blocked = createCorridorCenterline(
    rings,
    [terminal("a", 4, 5)],
    (_p, id) => id === undefined,
  );
  assert.deepEqual(blocked.missing, ["a"]);
  assert.throws(
    () =>
      createCorridorCenterline(
        rings,
        [terminal("a", 4, 5), terminal("a", 5, 5)],
        () => true,
      ),
    /Duplicate/,
  );
});
