import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  nativePlanarPathSupported,
  nativePlanarPointInParts,
} from "../../app/indoor-project/native-planar-path-support";
import { nativePlanarPathSupported as sourcePath } from "../../../reviter/lib/reviter/native-planar-path-support.ts";
type P = [number, number];
const rect = (a: number, b: number, c: number, d: number): P[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
test("original finite edge contacts retain full Float64 coordinates; a rounded face cannot supply a portal fringe", () => {
  const edge = 9.1234564,
    original = [[rect(0, 0, edge, 5)]],
    rounded = [[rect(0, 0, 9.123456, 5)]],
    path: P[] = [
      [1, 2],
      [edge, 2],
    ];
  assert.ok(nativePlanarPathSupported(path, original));
  assert.equal(nativePlanarPathSupported(path, rounded), false);
  assert.ok(sourcePath(path, original));
});
test("all positive path intervals reject genuinely thin gaps and holes", () => {
  const gap = 1e-8,
    path: P[] = [
      [1, 2],
      [9, 2],
    ];
  assert.equal(
    nativePlanarPathSupported(path, [
      [rect(0, 0, 5, 5)],
      [rect(5 + gap, 0, 10, 5)],
    ]),
    false,
  );
  assert.equal(
    nativePlanarPathSupported(path, [
      [rect(0, 0, 10, 5), rect(5, 1, 5 + gap, 3)],
    ]),
    false,
  );
  assert.ok(
    nativePlanarPathSupported(path, [[rect(0, 0, 5, 5)], [rect(5, 0, 10, 5)]]),
  );
});
test("degenerate traces still require genuine native point support and cannot enter a floor hole", () => {
  const parts = [[rect(0, 0, 10, 5), rect(4, 1, 6, 3)]];
  assert.ok(
    nativePlanarPathSupported(
      [
        [1, 2],
        [1, 2],
      ],
      parts,
    ),
  );
  assert.equal(
    nativePlanarPathSupported(
      [
        [5, 2],
        [5, 2],
      ],
      parts,
    ),
    false,
  );
  assert.equal(nativePlanarPointInParts([10 + 1e-8, 2], parts), false);
});
test("source and runtime analytical predicates remain byte-identical", () => {
  assert.equal(
    readFileSync(
      new URL(
        "../../app/indoor-project/native-planar-path-support.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFileSync(
      new URL(
        "../../../reviter/lib/reviter/native-planar-path-support.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
