import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeRationalOverlay,
  type NativeRationalOverlayInput,
} from "../../app/indoor-project/native-rational-overlay";
import {
  indexNativeOpaqueDrawing,
  nativeVisibleDrawingParts,
} from "../../app/indoor-project/native-render-visibility";
type Point = [number, number];
const box = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function check(
  sourceInput: NativeRationalOverlayInput,
  opaqueInput: NativeRationalOverlayInput,
) {
  const source = nativeRationalOverlay("union", sourceInput),
    opaque = nativeRationalOverlay("union", opaqueInput);
  const snapshot = () =>
    [source, opaque].map((parts) =>
      parts.map((part) =>
        part.map((ring) =>
          ring.map((point) => point.map((value) => `${value.n}/${value.d}`)),
        ),
      ),
    );
  const before = snapshot();
  const expected = nativeRationalOverlay("difference", source, opaque);
  const actual = nativeVisibleDrawingParts(source, [
    indexNativeOpaqueDrawing(opaque),
  ]);
  assert.deepEqual(nativeRationalOverlay("xor", expected, actual), []);
  assert.deepEqual(snapshot(), before);
  return actual;
}
test("native opaque bounds fully cover a tread without altering source", () => {
  assert.deepEqual(
    check(
      [[box(2, 2, 1, 1)]],
      [[box(0, 0, 10, 10), box(8, 8, 1, 1)], [box(20, 20, 10, 10)]],
    ),
    [],
  );
});
test("native local clipping retains a narrow positive hole and touching boundaries", () => {
  const opaque: NativeRationalOverlayInput = [
    [box(0, 0, 10, 10), box(2.5, 1, 0.0000002, 3), box(8, 8, 1, 1)],
  ];
  assert.notEqual(check([[box(2, 2, 1, 1)]], opaque).length, 0);
  check([[box(10, 2, 1, 1)]], opaque);
  check([[box(9.5, 2, 1, 1)]], opaque);
});
test("boundary free test rejects a tread bbox surrounding an interior hole or concavity", () => {
  check([[box(1, 1, 8, 8)]], [[box(0, 0, 10, 10), box(4, 4, 1, 1)]]);
  check(
    [[box(1, 1, 8, 8)]],
    [
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [8, 10],
          [8, 2],
          [2, 2],
          [2, 10],
          [0, 10],
        ],
      ],
    ],
  );
});
test("native local visibility matches full operands across overlapping components", () => {
  const source = nativeRationalOverlay("union", [
    [box(2, 2, 5, 4)],
    [box(20, 2, 2, 2)],
  ]);
  const a = nativeRationalOverlay("union", [
    [box(0, 0, 5, 5), box(3, 3, 0.0000002, 1)],
  ]);
  const b = nativeRationalOverlay("union", [
    [box(4, 1, 3, 3)],
    [box(30, 0, 3, 3)],
  ]);
  const actual = nativeVisibleDrawingParts(source, [
    indexNativeOpaqueDrawing(a),
    indexNativeOpaqueDrawing(b),
  ]);
  assert.deepEqual(
    nativeRationalOverlay(
      "xor",
      actual,
      nativeRationalOverlay("difference", source, a, b),
    ),
    [],
  );
});
