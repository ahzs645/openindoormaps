import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeRationalArea,
  nativeRationalPoint,
  nativeRationalPointInParts,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import {
  NATIVE_SELECTION_POINT_CONTACT_VERSION,
  splitNativeSelectionPointContacts,
} from "../../app/indoor-project/native-selection-point-contacts";

const parts = (...ps: number[][][][]): NativeRationalParts =>
  ps.map((p) => p.map((r) => r.map(nativeRationalPoint)));
const sameArea = (a: NativeRationalParts, b: NativeRationalParts) => {
  const x = nativeRationalArea(a),
    y = nativeRationalArea(b);
  return x.n * y.d === y.n * x.d;
};
const at = (p: NativeRationalParts, x: number, y: number) =>
  p.findIndex((q) => nativeRationalPointInParts([x, y], [q]));

test("a point-touch pair (pinched ring) separates exactly", () => {
  const input = parts([
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
  ]);
  const r = splitNativeSelectionPointContacts(input);
  assert.equal(r.splitParts, 1);
  assert.equal(r.parts.length, 2);
  assert.ok(sameArea(input, r.parts));
  assert.notEqual(at(r.parts, 1, 1), at(r.parts, 3, 3));
  assert.ok(at(r.parts, 1, 1) >= 0 && at(r.parts, 3, 3) >= 0);
});

test("a hole touching the outer ring at two points disconnects; at one point it does not", () => {
  const twoPoint = parts([
    [
      [0, 0],
      [4, 0],
      [4, 2],
      [4, 4],
      [0, 4],
      [0, 2],
      [0, 0],
    ],
    [
      [0, 2],
      [2, 3],
      [4, 2],
      [2, 1],
      [0, 2],
    ],
  ]);
  const r = splitNativeSelectionPointContacts(twoPoint);
  assert.equal(r.parts.length, 2);
  assert.ok(sameArea(twoPoint, r.parts));
  assert.equal(at(r.parts, 2, 2), -1, "the hole stays excluded");
  const onePoint = parts([
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 2],
      [0, 0],
    ],
    [
      [0, 2],
      [2, 3],
      [2, 1],
      [0, 2],
    ],
  ]);
  const s = splitNativeSelectionPointContacts(onePoint);
  assert.equal(s.splitParts, 0);
  assert.equal(s.parts, onePoint, "unchanged object when still connected");
  assert.equal(at(s.parts, 1, 2), -1, "hole retained");
});

test("a shared edge of positive length stays connected; ordinary holes are untouched", () => {
  const shared = nativeRationalOverlay(
    "union",
    [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    ],
    [
      [
        [
          [1, 0],
          [2, 0],
          [2, 1],
          [1, 1],
        ],
      ],
    ],
  );
  const r = splitNativeSelectionPointContacts(shared);
  assert.equal(r.splitParts, 0);
  assert.equal(r.parts, shared);
  // floor with a stair hole and a closed door footprint removed: unchanged
  const withHoleAndDoor = nativeRationalOverlay(
    "difference",
    [
      [
        [
          [0, 0],
          [6, 0],
          [6, 4],
          [0, 4],
        ],
      ],
    ],
    [
      [
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
        ],
      ],
    ],
    [
      [
        [
          [3, 0],
          [3.1, 0],
          [3.1, 4],
          [3, 4],
        ],
      ],
    ],
  );
  const s = splitNativeSelectionPointContacts(withHoleAndDoor);
  assert.equal(s.splitParts, 0);
  assert.equal(s.parts, withHoleAndDoor);
  assert.equal(at(s.parts, 1.5, 1.5), -1);
});

test("a positive-width seam is not covered by the point rule", () => {
  // Lobes sharing only a 1e-12 ft long boundary segment: positive length, one area.
  const neck = nativeRationalOverlay(
    "union",
    [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    ],
    [
      [
        [
          [1, 1 - 1e-12],
          [2, 1 - 1e-12],
          [2, 2],
          [1, 2],
        ],
      ],
    ],
    [
      [
        [
          [0.5, 1 - 1e-12],
          [1.5, 1 - 1e-12],
          [1.5, 1],
          [0.5, 1],
        ],
      ],
    ],
  );
  const r = splitNativeSelectionPointContacts(neck);
  assert.equal(r.splitParts, 0);
});

test("the exact overlay engine already separates simple corner touches (no change)", () => {
  const corner = nativeRationalOverlay(
    "difference",
    [
      [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
        ],
      ],
    ],
    [
      [
        [
          [2, 0],
          [4, 0],
          [4, 2],
          [2, 2],
        ],
      ],
    ],
    [
      [
        [
          [0, 2],
          [2, 2],
          [2, 4],
          [0, 4],
        ],
      ],
    ],
  );
  assert.equal(corner.length, 2);
  const r = splitNativeSelectionPointContacts(corner);
  assert.equal(r.splitParts, 0);
  assert.match(
    NATIVE_SELECTION_POINT_CONTACT_VERSION,
    /point-contact-split-v1$/,
  );
});
