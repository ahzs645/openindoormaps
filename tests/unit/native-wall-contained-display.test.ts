import test from "node:test";
import assert from "node:assert/strict";
import { nativeContainedWallDrawing } from "../../app/indoor-project/native-wall-contained-display";
import {
  Rational,
  nativeRationalOverlay,
} from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalPointInParts } from "../../app/indoor-project/native-exact-planar-topology";

test("unchanged exact convex native wall is one complete drawing polygon", () => {
  const ring: [number, number][] = [
    [0.125, 0.25],
    [2.125, 0.75],
    [2.375, 1.75],
    [0.375, 1.25],
  ];
  const source = nativeRationalOverlay("union", [[ring]]);
  const drawing = nativeContainedWallDrawing(source);
  assert.equal(drawing.length, 1);
  assert.equal(nativeRationalOverlay("xor", drawing, source).length, 0);
  for (const point of ring)
    assert.ok(
      drawing[0][0].some((p) => p[0] === point[0] && p[1] === point[1]),
    );
});

test("a non-representable generated corner cannot use the unchanged polygon shortcut", () => {
  const third = new Rational(1n, 3n);
  const source = nativeRationalOverlay("union", [
    [
      [
        [0, 0],
        [third, 0],
        [third, 1],
        [0, 1],
      ],
    ],
  ]);
  const drawing = nativeContainedWallDrawing(source);
  assert.equal(nativeRationalOverlay("difference", drawing, source).length, 0);
  assert.ok(
    nativeRationalOverlay("difference", source, drawing).length,
    "the exact generated edge remains authoritative despite a positive draw residual",
  );
});

test("concave wall and a real aperture retain their negative space", () => {
  const source = nativeRationalOverlay("union", [
    [
      [
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 2],
        [0, 2],
      ],
      [
        [0.25, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
        [0.75, 0.25],
      ],
    ],
  ]);
  const drawing = nativeContainedWallDrawing(source);
  assert.ok(drawing.length > 1);
  assert.equal(nativeRationalOverlay("difference", drawing, source).length, 0);
  const drawn = nativeRationalOverlay("union", drawing);
  assert.ok(!nativeRationalPointInParts([1.5, 1.5], drawn));
  assert.ok(!nativeRationalPointInParts([0.5, 0.5], drawn));
});
