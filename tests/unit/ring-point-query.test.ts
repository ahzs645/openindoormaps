import test from "node:test";
import assert from "node:assert/strict";
import { createRingPointQuery } from "../../app/indoor-project/ring-point-query";
type Point = [number, number];
// Independent unindexed reference. Check exact parity, including boundaries.
function reference(p: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const cross = (p[0] - a[0]) * dy - (p[1] - a[1]) * dx;
    if (
      Math.abs(cross) <= 1e-8 * Math.hypot(dx, dy) &&
      p[0] >= Math.min(a[0], b[0]) - 1e-8 &&
      p[0] <= Math.max(a[0], b[0]) + 1e-8 &&
      p[1] >= Math.min(a[1], b[1]) - 1e-8 &&
      p[1] <= Math.max(a[1], b[1]) + 1e-8
    )
      return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < (dx * (p[1] - a[1])) / dy + a[0])
      inside = !inside;
  }
  return inside;
}
test("edge index matches exact containment at concave boundaries and bucket seams", () => {
  const rings: Point[][] = [
    [
      [-8, -8],
      [32, -8],
      [32, 32],
      [-8, 32],
    ],
    Array.from({ length: 256 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 256,
        r = i % 2 ? 21 : 60;
      return [8 + r * Math.cos(a), 8 + r * Math.sin(a)];
    }),
    // A tall edge takes the memory-bounded overflow path; include duplicates.
    Array.from({ length: 40 }, (_, i) => [
      i < 20 ? -32 : 32,
      i < 20 ? i * 200 : (39 - i) * 200,
    ]),
  ];
  for (const ring of rings) {
    const query = createRingPointQuery(ring);
    for (let x = -80; x <= 80; x += 2)
      for (let y = -80; y <= 80; y += 2)
        assert.equal(query([x, y]), reference([x, y], ring), `point ${x},${y}`);
    for (const [i, a] of ring.entries()) {
      const b = ring[(i + 1) % ring.length];
      for (const t of [0, 0.5, 1])
        for (const offset of [-2e-8, -1e-8, 0, 1e-8, 2e-8]) {
          const p: Point = [
            a[0] + (b[0] - a[0]) * t + offset,
            a[1] + (b[1] - a[1]) * t + offset,
          ];
          assert.equal(query(p), reference(p, ring), `boundary ${p}`);
        }
    }
  }
});
test("rebuilding a ring query observes in-place source edits", () => {
  const ring: Point[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(createRingPointQuery(ring)([5, 5]), true);
  ring[1][0] = 2;
  ring[2][0] = 2;
  assert.equal(createRingPointQuery(ring)([5, 5]), false);
});
