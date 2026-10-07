import { test } from "node:test";
import assert from "node:assert/strict";
import pc from "polygon-clipping";
import { nativeBarrierTopology } from "../../app/indoor-project/native-barrier-topology";
type Point = [number, number];
type Rings = Point[][];
const rectangle = (x: number, y: number, w: number, h: number): Rings => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
];
const angle = 0.5585993153435624,
  c = Math.cos(angle),
  s = Math.sin(angle),
  rotate = (p: Point): Point => [
    82.62174043436168 + c * p[0] - s * p[1],
    855.0731263463049 + s * p[0] + c * p[1],
  ];
const transform = (r: Rings) => r.map((r) => r.map(rotate));
const round = (r: Rings, grid = 1e6) =>
  r.map((r) =>
    r.map(
      ([x, y]) =>
        [Math.round(x * grid) / grid, Math.round(y * grid) / grid] as Point,
    ),
  );
const inside = (p: Point, r: Point[]) => {
  let n = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (
      r[i][1] > p[1] !== r[j][1] > p[1] &&
      p[0] <
        ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]
    )
      n = !n;
  return n;
};
const regionAt = (parts: Rings[], p: Point) =>
  parts.findIndex(
    (rs) => inside(p, rs[0]) && !rs.slice(1).some((r) => inside(p, r)),
  );
const barriers = (gap = 0) =>
  [
    rectangle(0, 0, 20, 0.4),
    rectangle(0, 10, 20, 0.4),
    rectangle(0, 0, 0.4, 10.4),
    rectangle(20, 0, 0.4, 10.4),
    rectangle(8, 0.4 + gap, 0.4, 9.6 - gap),
  ].map(transform);
const ground = round(transform(rectangle(-3, -3, 26, 16)));
test("rotated T contacts survive grid reduction without changing source faces", () => {
  const walls = barriers(),
    original = structuredClone(walls),
    normalized = nativeBarrierTopology(walls),
    free = pc.difference(ground, ...normalized);
  const left = regionAt(free, rotate([4, 5])),
    right = regionAt(free, rotate([12, 5]));
  assert.ok(left >= 0 && right >= 0);
  assert.notEqual(left, right);
  assert.deepEqual(walls, original);
  // The support face receives the partition cap nodes, not a buffered strip.
  assert.ok(normalized[0][0].length > walls[0][0].length);
});
test("a real one-foot unfinished partition stays open", () => {
  const walls = barriers(1),
    free = pc.difference(ground, ...nativeBarrierTopology(walls));
  assert.equal(regionAt(free, rotate([4, 5])), regionAt(free, rotate([12, 5])));
});
test("numerical contact noding does not cross a nearby real small gap or fill an inner hole", () => {
  const walls = barriers(0.00001),
    hole = transform(rectangle(2, 2, 1, 1));
  const result = pc.difference(
    ground,
    ...nativeBarrierTopology(walls),
    round(hole),
  );
  assert.equal(
    regionAt(result, rotate([4, 5])),
    regionAt(result, rotate([12, 5])),
  );
  assert.equal(regionAt(result, rotate([2.5, 2.5])), -1);
});
test("compiler precision and shifted origin retain source contacts", () => {
  const walls = barriers(),
    origin: Point = [82, 854],
    normalized = nativeBarrierTopology(walls, 1e4, origin),
    free = pc.difference(ground, ...normalized);
  assert.notEqual(
    regionAt(free, rotate([4, 5])),
    regionAt(free, rotate([12, 5])),
  );
});

test("drawn wall repairs cannot duplicate a gap already occupied by a native column", async () => {
  const { project } = await import("../fixtures/native-area-project");
  const { deriveNativeAreas } = await import(
    "../../app/indoor-project/native-area-review"
  );
  const p = await project(),
    d = p.dataset;
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: rectangle(0, 0, 30, 20),
      },
    ],
  };
  d.walls = [
    {
      kind: "wall",
      nativeElementId: 200,
      levelId: 1,
      ringsFeet: rectangle(0, 10, 6, 0.4),
    },
    {
      kind: "wall",
      nativeElementId: 201,
      levelId: 1,
      ringsFeet: rectangle(8, 10, 6, 0.4),
    },
    {
      kind: "column",
      nativeElementId: 202,
      levelId: 1,
      ringsFeet: rectangle(6, 10, 2, 0.4),
    },
  ];
  await assert.rejects(
    deriveNativeAreas(d, 1, {
      manualGapPoints: [
        [6, 10.2],
        [8, 10.2],
      ],
    }),
    /already covered/,
  );
});

test("true oblique edge crossings share exact grid nodes, while a nearby real gap stays open", () => {
  const walls = [
    transform(rectangle(0, 0, 12, 0.4)),
    transform([
      [
        [6, -2],
        [6.4, -2],
        [8.4, 2],
        [8, 2],
      ],
    ]),
  ];
  const original = structuredClone(walls),
    noded = nativeBarrierTopology(walls);
  const shared = noded[0][0].filter((p) =>
    noded[1][0].some((q) => q[0] === p[0] && q[1] === p[1]),
  );
  assert.equal(
    shared.length,
    4,
    "Both polygons must receive the same four actual crossing vertices.",
  );
  assert.deepEqual(walls, original);
  const gapWalls = barriers(0.00001),
    free = pc.difference(ground, ...nativeBarrierTopology(gapWalls));
  assert.equal(regionAt(free, rotate([4, 5])), regionAt(free, rotate([12, 5])));
});

test("native selection at compiler precision preserves a measured millimetre wall gap and slab void", async () => {
  const { project } = await import("../fixtures/native-area-project");
  const { deriveNativeAreas, pointInNativeArea } = await import(
    "../../app/indoor-project/native-area-review"
  );
  const p = await project(),
    d = p.dataset;
  d.records = [];
  d.nodes = [];
  d.doors = [];
  d.edges = [];
  delete d.circulationGeometry;
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [
          ...transform(rectangle(-3, -3, 26, 16)),
          ...transform(rectangle(2, 2, 1, 1)),
        ],
      },
    ],
  };
  const run = async (gap: number) => {
    d.walls = barriers(gap).map((ringsFeet, i) => ({
      kind: "wall",
      levelId: 1,
      nativeElementId: 200 + i,
      approximate: false,
      ringsFeet,
    }));
    return deriveNativeAreas(d, 1);
  };
  const open = await run(1 / 304.8),
    closed = await run(0);
  const index = (r: typeof open, point: Point) =>
    r.regions.findIndex((g) => pointInNativeArea(point, g.ringsFeet));
  assert.equal(index(open, rotate([4, 5])), index(open, rotate([12, 5])));
  assert.notEqual(
    index(closed, rotate([4, 5])),
    index(closed, rotate([12, 5])),
  );
  assert.equal(index(open, rotate([2.5, 2.5])), -1);
});

test("native slab union keeps slanted shared-edge contact, real fine gaps and original inner openings", async () => {
  const { project } = await import("../fixtures/native-area-project");
  const { deriveNativeAreas, pointInNativeArea } = await import(
    "../../app/indoor-project/native-area-review"
  );
  const p = await project(),
    d = p.dataset;
  d.records = [];
  d.nodes = [];
  d.doors = [];
  d.edges = [];
  d.walls = [];
  delete d.circulationGeometry;
  const run = async (gap: number) => {
    const lower = [
        ...transform(rectangle(0, 0, 20, 10)),
        ...transform(rectangle(2, 2, 1, 1)),
      ],
      upper = transform(rectangle(4, 10 + gap, 12, 10));
    d.walkingSupport = {
      version: 1,
      sourceModelSha256: d.source.modelSha256,
      floors: [
        { nativeElementId: 100, elevationFeet: 0, ringsFeet: lower },
        { nativeElementId: 101, elevationFeet: 0, ringsFeet: upper },
      ],
    };
    const originals = structuredClone(d.walkingSupport),
      trace = await deriveNativeAreas(d, 1);
    assert.deepEqual(d.walkingSupport, originals);
    const at = (point: Point) =>
      trace.regions.findIndex((r) =>
        pointInNativeArea(rotate(point), r.ringsFeet),
      );
    assert.equal(
      at([2.5, 2.5]),
      -1,
      "A real inner slab opening must remain excluded.",
    );
    assert(at([8, 5]) >= 0 && at([8, 15]) >= 0);
    if (gap === 0)
      assert.equal(
        at([8, 5]),
        at([8, 15]),
        "Original shared slanted plate contact must stay continuous.",
      );
    else {
      assert.notEqual(
        at([8, 5]),
        at([8, 15]),
        "A true nonzero plate gap must stay separate.",
      );
      assert.equal(
        at([8, 10 + gap / 2]),
        -1,
        "Do not fill the actual narrow floor gap.",
      );
    }
  };
  await run(0);
  await run(1 / 304.8);
  await run(1e-7);
});
test("opt-in endpoint clusters cannot drift through a transitive contact chain", () => {
  const limit = 1e-9;
  const walls = [
    rectangle(0, 0, 1, 1),
    rectangle(1 + 8e-10, 0, 1, 1),
    rectangle(1 + 16e-10, 0, 1, 1),
  ];
  const raw = JSON.stringify(walls),
    normalized = nativeBarrierTopology(walls, 1e12, [0, 0], 1e-12, limit);
  // The first two endpoints may share an original anchor. The third one must
  // not join that anchor merely because it is close to the second original.
  assert(normalized[0][0].some((p) => p[0] === 1 && p[1] === 0));
  assert(!normalized[2][0].some((p) => p[0] === 1 && p[1] === 0));
  for (const [bi, rings] of walls.entries())
    for (const point of rings[0]) {
      const nearest = normalized[bi][0].reduce(
        (n, q) => Math.min(n, Math.hypot(q[0] - point[0], q[1] - point[1])),
        Infinity,
      );
      assert(nearest <= limit + 1e-12);
    }
  assert.equal(JSON.stringify(walls), raw);
  assert.throws(
    () => nativeBarrierTopology(walls, 1e10, [0, 0], 1e-10, 1e-8),
    /bounded/,
  );
});
test("default compiler topology remains byte-for-byte equivalent to the sibling implementation", async () => {
  const { nativeBarrierTopology: compiler } = await import(
    "../../../reviter/lib/reviter/native-barrier-topology.ts"
  );
  for (const gap of [0, 9.47e-10, 5e-8, 1e-5, 1]) {
    const source = barriers(gap);
    assert.deepEqual(nativeBarrierTopology(source), compiler(source));
  }
});
test("a clustered vertex outside a finite edge bound cannot re-enter through legacy contact noding", () => {
  const walls = [
    rectangle(0, -0.4, 20, 0.4),
    rectangle(10, 9e-11, 0.4, 10),
    rectangle(10 - 1e-10, 1.04e-9, 1, 11),
  ];
  const normalized = nativeBarrierTopology(walls, 1e12, [0, 0], 1e-10, 1e-9);
  assert(normalized[0][0].every((p) => p[1] <= 1e-9));
  assert(!normalized[0][0].some((p) => p[1] === 1.04e-9));
});
