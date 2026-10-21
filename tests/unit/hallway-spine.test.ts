import assert from "node:assert/strict";
import test from "node:test";
import {
  hallwaySpines,
  indexSurface,
  type Rings,
  type SpineSegment,
  type XY,
} from "../../app/indoor-project/hallway-spine";

const rect = (x0: number, y0: number, x1: number, y1: number): XY[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const length = (s: SpineSegment) =>
  Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]);
/** Every emitted segment and link stays inside its surface. */
function assertInside(rings: Rings[], segments: SpineSegment[]) {
  const index = rings.map(indexSurface);
  for (const s of segments)
    for (let i = 1; i < 20; i++) {
      const t = i / 20,
        p: XY = [
          s.a[0] + (s.b[0] - s.a[0]) * t,
          s.a[1] + (s.b[1] - s.a[1]) * t,
        ];
      assert.ok(index[s.surface].inside(p), `segment leaves surface at ${p}`);
    }
}

test("a straight corridor gets one centred run and square doorway joins", () => {
  const corridor: Rings = [rect(0, 0, 60, 6)];
  const doorways = [10, 25, 40].flatMap((x, i) => [
    { id: `n${i}`, point: [x, 5.9] as XY, surface: 0 },
    { id: `s${i}`, point: [x + 3, 0.1] as XY, surface: 0 },
  ]);
  const r = hallwaySpines([{ rings: corridor, crossing: false }], [], doorways);
  assert.equal(r.unconnected.length, 0);
  const total = r.segments.reduce((t, s) => t + length(s), 0);
  assert.ok(total > 45 && total < 61, `spine length ${total}`);
  // Runs stay on the centreline and run along the corridor.
  for (const s of r.segments) {
    assert.ok(Math.abs(s.a[1] - 3) < 0.6 && Math.abs(s.b[1] - 3) < 0.6);
    assert.ok(Math.abs(s.a[1] - s.b[1]) < 0.3 * length(s) + 0.2);
  }
  assert.ok(r.segments.length <= 3, `${r.segments.length} runs`);
  assert.ok(r.links.every((l) => l.perpendicular));
  for (const l of r.links)
    assert.ok(Math.abs(l.points[0][0] - l.spinePoint[0]) < 0.05);
  assertInside([corridor], r.segments);
});

test("an L-shaped corridor bends once and never leaves the surface", () => {
  const corridor: Rings = [
    [
      [0, 0],
      [40, 0],
      [40, 6],
      [6, 6],
      [6, 40],
      [0, 40],
    ],
  ];
  const r = hallwaySpines(
    [{ rings: corridor, crossing: false }],
    [],
    [
      { id: "a", point: [38, 0.1], surface: 0 },
      { id: "b", point: [0.1, 35], surface: 0 },
    ],
  );
  assert.equal(r.unconnected.length, 0);
  assert.ok(
    r.segments.length >= 2 && r.segments.length <= 5,
    `${r.segments.length} runs`,
  );
  assertInside([corridor], r.segments);
});

test("a vestibule between two gates is one straight line from door to door", () => {
  const north: Rings = [rect(0, 20, 40, 26)];
  const vestibule: Rings = [rect(10, 8, 22, 19.5)];
  const south: Rings = [rect(14, -30, 20, 7.5)];
  const r = hallwaySpines(
    [
      { rings: north, crossing: false },
      { rings: vestibule, crossing: true },
      { rings: south, crossing: false },
    ],
    [
      {
        id: "top",
        center: [16, 19.75],
        normal: [0, 1],
        halfDepth: 0.25,
        sides: [0, 1],
      },
      {
        id: "bottom",
        center: [17, 7.75],
        normal: [0, 1],
        halfDepth: 0.25,
        sides: [1, 2],
      },
    ],
    [],
  );
  const inVestibule = r.segments.filter((s) => s.surface === 1);
  assert.equal(inVestibule.length, 1);
  assert.deepEqual(
    [inVestibule[0].a, inVestibule[0].b],
    [
      [16, 19.75],
      [17, 7.75],
    ],
  );
  assert.equal(r.stats.straightCrossings, 1);
  assert.equal(r.unconnected.length, 0);
  // Each corridor side is entered straight along the door normal.
  for (const l of r.links.filter((x) => x.surface !== 1)) {
    assert.ok(l.points.length >= 2);
    assert.ok(
      Math.abs(l.points[1][0] - l.points[0][0]) < 1e-9,
      "enters along the normal",
    );
  }
});

test("a compact open area uses straight spokes from its centre", () => {
  const lounge: Rings = [rect(0, 0, 20, 18)];
  const r = hallwaySpines(
    [{ rings: lounge, crossing: false }],
    [],
    [
      { id: "a", point: [0.1, 9], surface: 0 },
      { id: "b", point: [10, 17.9], surface: 0 },
      { id: "c", point: [19.9, 4], surface: 0 },
    ],
  );
  assert.equal(r.stats.spokeAreas, 1);
  assert.equal(r.segments.length, 3);
  const hub = r.segments[0].a;
  assert.ok(r.segments.every((s) => s.a[0] === hub[0] && s.a[1] === hub[1]));
  assert.ok(Math.abs(hub[0] - 10) < 1.5 && Math.abs(hub[1] - 9) < 1.5);
  assert.equal(r.unconnected.length, 0);
});

test("a space no doorway reaches gets no spine and is reported", () => {
  const big: Rings = [rect(0, 0, 10, 10)],
    sliver: Rings = [rect(20, 0, 22, 3)];
  const r = hallwaySpines(
    [
      { rings: big, crossing: false },
      { rings: sliver, crossing: false },
    ],
    [],
    [],
  );
  assert.equal(r.segments.length, 0);
  assert.deepEqual(r.unreached, [0]);
});

test("holes such as columns are kept clear", () => {
  const hall: Rings = [rect(0, 0, 60, 12), rect(28, 5, 32, 7)];
  const r = hallwaySpines(
    [{ rings: hall, crossing: false }],
    [],
    [
      { id: "w", point: [0.1, 6], surface: 0 },
      { id: "e", point: [59.9, 6], surface: 0 },
    ],
  );
  const index = indexSurface(hall);
  for (const s of r.segments)
    for (let i = 0; i <= 20; i++) {
      const t = i / 20,
        p: XY = [
          s.a[0] + (s.b[0] - s.a[0]) * t,
          s.a[1] + (s.b[1] - s.a[1]) * t,
        ];
      assert.ok(index.inside(p));
      assert.ok(
        !(p[0] > 28 && p[0] < 32 && p[1] > 5 && p[1] < 7),
        "crosses the column",
      );
    }
});

test("corridors of any length and width get an exact centreline", () => {
  for (const [length, width] of [
    [20, 6],
    [28, 6],
    [33, 6],
    [40, 4],
    [40, 8],
    [40, 10],
  ]) {
    const r = hallwaySpines(
      [{ rings: [rect(0, 0, length, width)], crossing: false }],
      [],
      [{ id: "d", point: [length / 2, width - 0.1], surface: 0 }],
    );
    assert.equal(
      r.segments.length,
      1,
      `${length}x${width}: ${r.segments.length} runs`,
    );
    for (const p of [r.segments[0].a, r.segments[0].b])
      assert.ok(
        Math.abs(p[1] - width / 2) < 0.05,
        `${length}x${width} off centre at ${p}`,
      );
  }
});

test("nearby doors on one wall hop straight across instead of out and back", () => {
  // A 16 ft wide hall: the centreline is 8 ft from either wall.
  const hall: Rings = [rect(0, 0, 60, 16)];
  const r = hallwaySpines(
    [{ rings: hall, crossing: false }],
    [],
    [
      { id: "a", point: [20, 15.6], surface: 0 },
      { id: "b", point: [25, 15.6], surface: 0 },
      { id: "far", point: [50, 0.4], surface: 0 },
    ],
  );
  assert.equal(r.hops.length, 1);
  const hop = r.hops[0];
  assert.deepEqual([r.links[hop.a].id, r.links[hop.b].id].sort(), ["a", "b"]);
  // It stays by the wall, well short of the 16 ft trip via the centreline.
  const length = hop.points
    .slice(1)
    .reduce(
      (t, p, i) =>
        t + Math.hypot(p[0] - hop.points[i][0], p[1] - hop.points[i][1]),
      0,
    );
  assert.ok(length < 8, `${length} ft`);
  assertInside(
    [hall],
    hop.points.slice(1).map((p, i) => ({ surface: 0, a: hop.points[i], b: p })),
  );
});

test("doors facing each other across a corridor keep their centreline joins", () => {
  const r = hallwaySpines(
    [{ rings: [rect(0, 0, 60, 6)], crossing: false }],
    [],
    [
      { id: "n", point: [20, 5.9], surface: 0 },
      { id: "s", point: [21, 0.1], surface: 0 },
    ],
  );
  assert.equal(r.hops.length, 0);
});

test("a doorway in a recess joins the spine with one bend", () => {
  // A corridor along y 0–6 with a recess at x 30–33 reaching up to y 9. The
  // doorway sits in the recess's corner, where a pier at x 33–36, y 6–9
  // blocks no straight view but the recess wall at x 30 does for a shallow
  // angle; whatever the line, it must stay inside and reach the spine.
  const corridor: Rings = [
    [
      [0, 0],
      [60, 0],
      [60, 6],
      [33, 6],
      [33, 12],
      [30, 12],
      [30, 6],
      [0, 6],
    ],
  ];
  const r = hallwaySpines(
    [{ rings: corridor, crossing: false }],
    [],
    [
      { id: "deep", point: [32.6, 11.6], surface: 0 },
      { id: "w", point: [5, 5.9], surface: 0 },
    ],
  );
  assert.equal(r.unconnected.length, 0);
  const deep = r.links.find((l) => l.id === "deep")!;
  const line = deep.points
    .slice(1)
    .map((p, i) => ({ surface: 0, a: deep.points[i], b: p }));
  assertInside([corridor], line);
});
