import test from "node:test";
import assert from "node:assert/strict";
import { centeredJunctions } from "../../app/indoor-project/centered-junction";
import { nativeSlabsCoverSegment } from "../../scripts/indoor/native-floor-proof";
type XY = [number, number];
const rect = (x: number, y: number, w: number, h: number): XY[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function fixture(angle: number) {
  const transform = ([x, y]: XY): XY => [
    x * Math.cos(angle) - y * Math.sin(angle) + 100,
    x * Math.sin(angle) + y * Math.cos(angle) - 50,
  ];
  const local = ([x, y]: XY): XY => [
    (x - 100) * Math.cos(angle) + (y + 50) * Math.sin(angle),
    -(x - 100) * Math.sin(angle) + (y + 50) * Math.cos(angle),
  ];
  const regions = [
    rect(0, 2, 8, 8),
    rect(6, -4, 16, 8),
    rect(16, -10, 8, 64),
  ].map((r) => [r.map(transform)]);
  const source = [
    [0, 6],
    [20, 6 - 20 * Math.tan(Math.PI / 6)],
    [20, 50],
  ].map((p) => transform(p as XY));
  const direction = transform([0, 1]).map(
    (n, i) => n - transform([0, 0])[i],
  ) as XY;
  const section = (p: XY, normal: XY) => {
    const q = local(p),
      n: XY = [
        normal[0] * Math.cos(angle) + normal[1] * Math.sin(angle),
        -normal[0] * Math.sin(angle) + normal[1] * Math.cos(angle),
      ];
    if (Math.abs(n[0]) > 1e-6 || Math.abs(n[1]) < 0.99 || q[0] < 8 || q[0] > 16)
      return null;
    return { point: transform([q[0], 0]), width: 8 };
  };
  return {
    transform,
    local,
    regions,
    source,
    direction,
    section,
    supported: (a: XY, b: XY) => nativeSlabsCoverSegment(a, b, regions),
  };
}
for (const angle of [0, 0.4, -0.8])
  test(`obtuse junction uses a proven corridor centre in both directions at rotation ${angle}`, () => {
    const f = fixture(angle),
      before = structuredClone(f.source);
    const result = centeredJunctions(
      f.source,
      [f.direction],
      f.section,
      f.supported,
    );
    assert.equal(
      result.length,
      4,
      "adds one approach bend rather than an outside obtuse elbow",
    );
    assert.ok(Math.abs(f.local(result[1])[1]) < 1e-7);
    assert.ok(Math.abs(f.local(result[2])[1]) < 1e-7);
    assert.ok(
      result.slice(1).every((p, i) => f.supported(result[i], p)),
      "every leg has continuous exact floor support",
    );
    assert.deepEqual(result[0], before[0]);
    assert.deepEqual(result.at(-1), before.at(-1));
    assert.deepEqual(
      centeredJunctions(
        [...f.source].reverse(),
        [f.direction],
        f.section,
        f.supported,
      ),
      [...result].reverse(),
    );
    assert.deepEqual(f.source, before, "source guide is unchanged");
  });
test("a floor hole or column at the proposed centre prevents the corner adjustment", () => {
  const f = fixture(0),
    hole = f.transform([15, -0.5]);
  const floors = f.regions.map((r) => [r[0], rect(hole[0], hole[1], 1, 1)]);
  assert.deepEqual(
    centeredJunctions(f.source, [f.direction], f.section, (a, b) =>
      nativeSlabsCoverSegment(a, b, floors),
    ),
    f.source,
  );
});
test("broad plazas, unstable cross sections, and non-native axes retain the guide", () => {
  const f = fixture(0);
  assert.deepEqual(
    centeredJunctions(
      f.source,
      [f.direction],
      (p) => ({ point: p, width: 40 }),
      f.supported,
    ),
    f.source,
  );
  assert.deepEqual(
    centeredJunctions(f.source, [], f.section, f.supported),
    f.source,
  );
  let count = 0;
  assert.deepEqual(
    centeredJunctions(
      f.source,
      [f.direction],
      (p) => ({
        point: f.transform([f.local(p)[0], ++count % 2 ? 0 : 2]),
        width: 8,
      }),
      f.supported,
    ),
    f.source,
  );
});
