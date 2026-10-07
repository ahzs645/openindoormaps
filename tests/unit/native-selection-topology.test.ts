import test from "node:test";
import assert from "node:assert/strict";
import pc from "polygon-clipping";
import { nativeSelectionTopology } from "../../app/indoor-project/native-selection-topology";
type Rings = [number, number][][];
const rect = (x1: number, y1: number, x2: number, y2: number): Rings => [
  [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ],
];
const area = (rs: Rings[]) =>
  rs.reduce(
    (a, r) =>
      a +
      r.reduce(
        (b, ring, i) =>
          b +
          ((i ? -1 : 1) *
            Math.abs(
              ring.reduce((sum, p, j) => {
                const q = ring[(j + 1) % ring.length];
                return sum + p[0] * q[1] - q[0] * p[1];
              }, 0),
            )) /
            2,
        0,
      ),
    0,
  );
const remainder = (floors: Rings[], masks: Rings[]) => {
  const t = nativeSelectionTopology(floors, masks);
  return pc.difference(t.ground, ...t.masks);
};
test("exact wall/slab contact does not create a strip from independent rounding", () => {
  const y = 518.0331296278046;
  const floors = [rect(48, 507, 64, y)],
    walls = [rect(59, 507, 59.4, y)];
  const before = JSON.stringify([floors, walls]);
  const result = remainder(floors, walls);
  assert.equal(result.length, 2);
  assert.ok(Math.abs(area(result) - (16 * (y - 507) - 0.4 * (y - 507))) < 1e-8);
  assert.equal(JSON.stringify([floors, walls]), before);
});
test("a real narrow gap remains connected at source precision", () => {
  const y = 518.0331296278046,
    gap = 5e-8;
  const result = remainder(
    [rect(48, 507, 64, y)],
    [rect(59, 507, 59.4, y - gap)],
  );
  assert.equal(result.length, 1);
});
test("slab apertures and a measured doorway remain open", () => {
  const ground = rect(0, 0, 20, 20);
  ground.push(rect(8, 8, 12, 12)[0]);
  const walls = [rect(5, 0, 5.5, 3), rect(5, 5, 5.5, 20)];
  const result = remainder([ground], walls);
  assert.equal(result.length, 1);
  assert.ok(result[0].length > 1);
  assert.ok(Math.abs(area(result) - 375) < 1e-8);
});
test("rotated finite native contacts preserve separation without buffering", () => {
  const transform = (r: Rings): Rings =>
    r.map((ring) =>
      ring.map(([x, y]) => [
        733.173 + x * Math.cos(0.28325) - y * Math.sin(0.28325),
        -921.613 + x * Math.sin(0.28325) + y * Math.cos(0.28325),
      ]),
    );
  const floor = transform(rect(0, 0, 20, 10));
  const wall = transform(rect(7, 0, 7.2, 10));
  const result = remainder([floor], [wall]);
  assert.equal(result.length, 2);
  assert.ok(Math.abs(area(result) - 198) < 1e-7);
});
test("shared segmented slab contacts stay connected and true plate gaps stay open", () => {
  const plate = rect(0, 0, 10, 10),
    adjacent: Rings = [
      [
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
        [10, 6],
        [10, 3],
      ],
    ];
  assert.equal(remainder([plate, adjacent], []).length, 1);
  assert.equal(remainder([plate, rect(10 + 5e-8, 0, 20, 10)], []).length, 2);
});
test("a floating-point finite diagonal contact shares a node within one source grid unit", () => {
  const transform = (r: Rings): Rings =>
    r.map((ring) =>
      ring.map(([x, y]) => [
        83.173 + x * Math.cos(0.5585) - y * Math.sin(0.5585),
        763.613 + x * Math.sin(0.5585) + y * Math.cos(0.5585),
      ]),
    );
  const floors = [transform(rect(0, 0, 20, 20))];
  const contactCopy = 1.16e-11;
  const walls = [
    transform(rect(10, 0, 10.4, 10)),
    transform(rect(0, 10 + contactCopy, 10.4, 10.4)),
  ];
  assert.equal(remainder(floors, walls).length, 2);
  const actualGap = 5e-8;
  assert.equal(
    remainder(floors, [
      transform(rect(10, 0, 10.4, 10)),
      transform(rect(0, 10 + actualGap, 10.4, 10.4)),
    ]).length,
    1,
  );
});
test("sub-nanometre endpoint and T junction seams share finite original nodes", () => {
  for (const residual of [6.73e-11, 1.07e-10, 9.47e-10]) {
    const floor = rect(0, 0, 20, 20);
    // Both a cap-to-face T junction and its adjacent cap endpoint lie just off
    // the independently extracted supporting wall. Together they enclose a room.
    const walls = [rect(10, 0, 10.4, 10), rect(0, 10 + residual, 10.4, 10.4)];
    const raw = JSON.stringify([floor, walls]);
    assert.equal(remainder([floor], walls).length, 2);
    assert.equal(JSON.stringify([floor, walls]), raw);
  }
});
test("numerical junction noding preserves nearby real gaps, apertures and doorways", () => {
  const floor = rect(0, 0, 20, 20);
  floor.push(rect(2, 2, 4, 4)[0]);
  for (const gap of [5e-8, 1e-7, 1e-5]) {
    const walls = [rect(10, 0, 10.4, 10), rect(0, 10 + gap, 10.4, 10.4)];
    const raw = JSON.stringify([floor, walls]),
      parts = remainder([floor], walls);
    assert.equal(parts.length, 1);
    assert.ok(parts[0].length > 1);
    assert.equal(JSON.stringify([floor, walls]), raw);
  }
  const doorway = remainder(
    [floor],
    [rect(10, 0, 10.4, 8), rect(10, 11, 10.4, 20)],
  );
  assert.equal(doorway.length, 1);
  assert.ok(doorway[0].length > 1);
});
