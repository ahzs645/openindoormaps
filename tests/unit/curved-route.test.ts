import assert from "node:assert/strict";
import test from "node:test";
import { curvedCorridorPath } from "../../app/indoor-project/curved-route";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRoute } from "../../app/indoor-project/routing";
type XY = [number, number];
const mix = (a: XY, b: XY, t: number): XY => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const arc = (radius: number): XY[] =>
  Array.from({ length: 33 }, (_, i) => [
    radius * Math.cos((i * Math.PI) / 64),
    radius * Math.sin((i * Math.PI) / 64),
  ]);
const boundary = [...arc(30), ...arc(20).reverse()];
const source: XY[] = [
  [25, 0],
  [25, 10],
  [22, 10],
  [22, 15],
  [18, 15],
  [18, 20],
  [12, 20],
  [12, 25],
  [0, 25],
];
const contains = (p: XY) =>
  p[0] >= -1e-7 &&
  p[1] >= -1e-7 &&
  Math.hypot(...p) >= 20 - 1e-7 &&
  Math.hypot(...p) <= 30 + 1e-7;
// Analytic whole-segment annulus test, independent of the routing implementation.
const valid = (a: XY, b: XY) => {
  if (!contains(a) || !contains(b)) return false;
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(...mix(a, b, t)) >= 20 - 1e-7;
};
function section(p: XY, normal: XY) {
  if (!contains(p)) return null;
  const dot = p[0] * normal[0] + p[1] * normal[1];
  const ts: number[] = [];
  for (const radius of [20, 30]) {
    const disc = dot * dot - p[0] * p[0] - p[1] * p[1] + radius * radius;
    if (disc >= 0) ts.push(-dot - Math.sqrt(disc), -dot + Math.sqrt(disc));
  }
  for (const axis of [0, 1])
    if (Math.abs(normal[axis]) > 1e-8) ts.push(-p[axis] / normal[axis]);
  ts.sort((a, b) => a - b);
  const at = (t: number): XY => [p[0] + t * normal[0], p[1] + t * normal[1]];
  for (let i = 1; i < ts.length; i++)
    if (ts[i - 1] <= 0 && ts[i] >= 0 && contains(at((ts[i - 1] + ts[i]) / 2)))
      return { point: at((ts[i - 1] + ts[i]) / 2), width: ts[i] - ts[i - 1] };
  return null;
}
test("curved corridor trace follows the middle of an annular corridor and preserves both anchors", () => {
  const original = JSON.stringify(source);
  const curved = curvedCorridorPath(source, [boundary], section, valid, 60);
  assert.ok(curved);
  const route = curved.points;
  assert.deepEqual(route[0], source[0]);
  assert.deepEqual(route.at(-1), source.at(-1));
  assert.ok(
    route.slice(1).every((p, i) => valid(route[i], p)),
    "no chord crosses the inner void",
  );
  assert.ok(
    route.every((p) => Math.abs(Math.hypot(...p) - 25) < 0.8),
    "the route follows the centre, not the shortest inner wall",
  );
  assert.ok(route.length > 10, "the bend has a dense curved shape");
  assert.equal(JSON.stringify(source), original);
  const reverseCurve = curvedCorridorPath(
    [...source].reverse(),
    [boundary],
    section,
    valid,
    60,
  );
  assert.ok(reverseCurve);
  const reverse = reverseCurve.points;
  assert.equal(reverse.length, route.length);
  for (let i = 0; i < route.length; i++)
    assert.ok(
      Math.hypot(
        route[i][0] - reverse.at(-i - 1)![0],
        route[i][1] - reverse.at(-i - 1)![1],
      ) < 1e-7,
    );
});
test("a straight corridor and raster right angles do not trigger curved routing", () => {
  const rect: XY[] = [
    [0, 0],
    [40, 0],
    [40, 10],
    [0, 10],
  ];
  assert.equal(
    curvedCorridorPath(
      [
        [1, 5],
        [39, 5],
      ],
      [rect],
      () => ({ point: [20, 5], width: 10 }),
      () => true,
      50,
    ),
    null,
  );
  const stairs: XY[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [20, 10],
    [20, 20],
    [0, 20],
  ];
  assert.equal(
    curvedCorridorPath(
      [
        [1, 1],
        [19, 19],
      ],
      [stairs],
      () => ({ point: [10, 10], width: 10 }),
      () => true,
      50,
    ),
    null,
  );
});
test("thin obstacles, unsupported chords and the walking budget retain the original route", () => {
  assert.equal(
    curvedCorridorPath(source, [boundary], section, valid, 10),
    null,
  );
  const blocked = (a: XY, b: XY) => {
    if (!valid(a, b)) return false;
    // A 0.002-ft vertical barrier blocks the entire annular passage.
    return Math.max(a[0], b[0]) < 17.001 || Math.min(a[0], b[0]) > 17.003;
  };
  assert.equal(
    curvedCorridorPath(source, [boundary], section, blocked, 60),
    null,
  );
  assert.equal(
    curvedCorridorPath(source, [boundary], () => null, valid, 60),
    null,
  );
});

test("a curved corridor gives one follow instruction and keeps the real turn at its exit", () => {
  const points = [[35, 0], ...arc(25), [0, 40]].map(
    (p) => [p[0], p[1], 0] as [number, number, number],
  );
  const data = {
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [0, 0],
      projectionLatitude: 0,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    floors: [{ name: "Floor 1", levelIds: [1] }],
    nativeLevels: [],
    nodes: [
      { id: "a", levelId: 1, building: "A" },
      { id: "b", levelId: 1, building: "A" },
    ],
  } as unknown as IndoorDataset;
  const route = {
    nodeIds: ["a", "b"],
    edges: [{ id: "walk", kind: "walk", from: "a", to: "b" }],
    paths: [
      {
        edgeIds: ["walk"],
        levelIds: [1],
        pointsFeet: points,
        curveRanges: [{ start: 1, end: 33 }],
        shape: "curved",
        centered: true,
      },
    ],
  } as unknown as ProjectRoute;
  const steps = projectNavigationSteps(data, route, "Start", "End");
  assert.equal(
    steps.filter((s) => s.message === "Follow the curved corridor").length,
    1,
  );
  assert.equal(steps.filter((s) => s.type === "turn").length, 1);
  assert.equal(steps.find((s) => s.type === "turn")!.turnDirection, "right");
  assert.equal(
    steps.find((s) => s.message === "Follow the curved corridor")!.pointsFeet
      .length,
    33,
  );
  assert.deepEqual(steps.at(-1)!.pointsFeet, [points.at(-1)]);
});

test("circular construction geometry prevents a side outlet from pulling the walking lane sideways", () => {
  const f = { source, rings: [boundary], section, valid };
  const outletSection = (p: XY, n: XY) => {
    const cross = f.section(p, n);
    if (!cross) return null;
    const angle = Math.atan2(cross.point[1], cross.point[0]);
    // An adjoining lobby widens a short section of an otherwise circular hall.
    if (angle > 0.65 && angle < 0.85) {
      const r = Math.hypot(...cross.point);
      return { point: cross.point.map((v) => (v * 28) / r) as XY, width: 16 };
    }
    return cross;
  };
  const forward = curvedCorridorPath(
    f.source,
    f.rings,
    outletSection,
    f.valid,
    100,
  )!;
  const reverse = curvedCorridorPath(
    [...f.source].reverse(),
    f.rings,
    outletSection,
    f.valid,
    100,
  )!;
  assert.ok(forward);
  assert.ok(
    forward.points.every((p) => Math.abs(Math.hypot(...p) - 25) < 0.15),
  );
  assert.ok(
    forward.points.slice(1).every((p, i) => f.valid(forward.points[i], p)),
  );
  assert.deepEqual(forward.points[0], f.source[0]);
  assert.deepEqual(forward.points.at(-1), f.source.at(-1));
  assert.equal(reverse.points.length, forward.points.length);
  [...reverse.points]
    .reverse()
    .forEach((p, i) =>
      assert.ok(
        Math.hypot(p[0] - forward.points[i][0], p[1] - forward.points[i][1]) <
          1e-7,
      ),
    );
});
