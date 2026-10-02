import test from "node:test";
import assert from "node:assert/strict";
import { routeRibbonPositions } from "../../app/indoor-project/route-ribbon";

function covers(mesh: number[], x: number, y: number) {
  for (let i = 0; i < mesh.length; i += 9) {
    const a = [mesh[i], mesh[i + 1]],
      b = [mesh[i + 3], mesh[i + 4]],
      c = [mesh[i + 6], mesh[i + 7]];
    const determinant =
      (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(determinant) < 1e-12) continue;
    const u =
      ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / determinant;
    const v =
      ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / determinant;
    if (u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9) return true;
  }
  return false;
}

test("round right-angle joins fill the missing outer wedge without a square spike", () => {
  for (const direction of [1, -1]) {
    const mesh = routeRibbonPositions([
      [0, 0, 1],
      [1, 0, 1],
      [1, direction, 2],
    ]);
    assert(covers(mesh, 1.06, -0.06 * direction));
    assert(!covers(mesh, 1.089, -0.089 * direction));
    assert(covers(mesh, 1, 0));
  }
});

test("caps stitch adjacent paths, including a change of direction on a ramp landing", () => {
  const mesh = [
    ...routeRibbonPositions([
      [0, 0, 0],
      [1, 0, 1],
    ]),
    ...routeRibbonPositions([
      [1, 0, 1],
      [2, 1, 1],
    ]),
  ];
  assert(covers(mesh, 1.03, -0.075));
  assert(covers(mesh, -0.08, 0));
  assert(!covers(mesh, -0.1, 0));
});

test("rounding retains native heights, constant width and the original route coordinates", () => {
  const points = [
    [0, 0, 1],
    [1, 0, 2],
    [1, 1, 2],
  ] as const;
  const before = JSON.stringify(points),
    mesh = routeRibbonPositions(points);
  assert(mesh.every((n) => Number.isFinite(n)));
  for (let i = 2; i < mesh.length; i += 3)
    assert(mesh[i] === 1 || mesh[i] === 2);
  assert.equal(JSON.stringify(points), before);
  assert.deepEqual(routeRibbonPositions([]), []);
  assert.deepEqual(
    routeRibbonPositions([
      [0, 0, 1],
      [0, 0, 1],
    ]),
    [],
  );
  const repeated = routeRibbonPositions([
    [0, 0, 1],
    [0, 0, 1],
    [1, 0, 2],
  ]);
  assert.deepEqual(
    repeated,
    routeRibbonPositions([
      [0, 0, 1],
      [1, 0, 2],
    ]),
  );
});
