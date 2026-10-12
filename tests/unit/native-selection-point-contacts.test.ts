import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeNativeExactTopology,
  nativeRationalArea,
  nativeRationalPoint,
  nativeRationalPointInParts,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
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

const encode = (p: NativeRationalParts) =>
  encodeNativeExactTopology(
    {
      sourceModelSha256: "0".repeat(64),
      sourceGeometryKey: "t",
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    p.map((part, i) => ({ id: `native-region:1:${i}`, parts: [part] })),
  );
const ringKeys = (ring: NativeRationalParts[number][number]) =>
  ring.slice(0, -1).map((p) => `${p[0].n}/${p[0].d},${p[1].n}/${p[1].d}`);
// 8 x 4 floor; a diamond wall body touches the outline at (4,0) and (4,4), so
// the interior is two lobes meeting only at points. The left lobe also holds
// two column bodies meeting corner to corner at (2,2).
const holeMeetsHole = parts([
  [
    [0, 0],
    [4, 0],
    [8, 0],
    [8, 4],
    [4, 4],
    [0, 4],
    [0, 0],
  ],
  [
    [4, 0],
    [3, 2],
    [4, 4],
    [5, 2],
    [4, 0],
  ],
  [
    [1, 1],
    [1, 2],
    [2, 2],
    [2, 1],
    [1, 1],
  ],
  [
    [2, 2],
    [2, 3],
    [3, 3],
    [3, 2],
    [2, 2],
  ],
]);
// As above, but in the left lobe a wall stub touches the outline at (0,2).
const holeMeetsShell = parts([
  [
    [0, 0],
    [4, 0],
    [8, 0],
    [8, 4],
    [4, 4],
    [0, 4],
    [0, 2],
    [0, 0],
  ],
  [
    [4, 0],
    [3, 2],
    [4, 4],
    [5, 2],
    [4, 0],
  ],
  [
    [0, 2],
    [1, 2.5],
    [1, 1.5],
    [0, 2],
  ],
]);
for (const [name, input, body] of [
  ["hole meets hole", holeMeetsHole, [1.5, 1.5]],
  ["hole meets shell", holeMeetsShell, [0.6, 2]],
] as const) {
  test(`point-contact split of a part with ${name} at one vertex is encodable`, () => {
    assert.doesNotThrow(() => encode(input), "the input is valid topology");
    const r = splitNativeSelectionPointContacts(input);
    assert.equal(r.splitParts, 1);
    assert.equal(r.parts.length, 2);
    assert.ok(sameArea(input, r.parts), "exact area preserved");
    assert.notEqual(at(r.parts, 1, 3.5), at(r.parts, 7, 2), "separate lobes");
    assert.equal(at(r.parts, body[0], body[1]), -1, "bodies stay excluded");
    assert.doesNotThrow(() => encode(r.parts), "split pieces are encodable");
    for (const part of r.parts)
      for (const ring of part) {
        const open = ringKeys(ring);
        assert.equal(new Set(open).size, open.length, "simple rings only");
      }
  });
}

// Zero-width boundary: an edge traced once in each direction has no interior
// on either side, so lobes joined only along such edges are separate areas,
// exactly like lobes meeting at an isolated point.
const slitLobes = parts([
  [
    [0, 0],
    [1, 0],
    [1, 0.5],
    [2, 0.5],
    [2, 0],
    [3, 0],
    [3, 1],
    [2, 1],
    [2, 0.5],
    [1, 0.5],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
]);
// The same slit with an extra collinear vertex on its return side.
const slitWithVertex = parts([
  [
    [0, 0],
    [1, 0],
    [1, 0.5],
    [2, 0.5],
    [2, 0],
    [3, 0],
    [3, 1],
    [2, 1],
    [2, 0.5],
    [1.5, 0.5],
    [1, 0.5],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
]);
// A wall body (hole) meeting the outline along a whole edge at the bottom and
// at the top: the floor on either side of it is reached only along edges.
const holeAlongShell = parts([
  [
    [0, 0],
    [1.5, 0],
    [2.5, 0],
    [4, 0],
    [4, 2],
    [2.5, 2],
    [1.5, 2],
    [0, 2],
    [0, 0],
  ],
  [
    [1.5, 0],
    [1.5, 2],
    [2.5, 2],
    [2.5, 0],
    [1.5, 0],
  ],
]);
for (const [name, input, left, right, body] of [
  ["a zero-width slit", slitLobes, [0.5, 0.5], [2.5, 0.5], [1.5, 0.75]],
  [
    "a slit with a collinear vertex",
    slitWithVertex,
    [0.5, 0.5],
    [2.5, 0.5],
    [1.5, 0.75],
  ],
  [
    "a hole meeting the outline along edges",
    holeAlongShell,
    [0.5, 1],
    [3.5, 1],
    [2, 1],
  ],
] as const) {
  test(`lobes joined only along ${name} separate exactly`, () => {
    const r = splitNativeSelectionPointContacts(input);
    assert.equal(r.splitParts, 1);
    assert.equal(r.undecidedParts, 0);
    assert.equal(r.parts.length, 2);
    assert.ok(sameArea(input, r.parts), "exact area preserved");
    const a = at(r.parts, left[0], left[1]),
      b = at(r.parts, right[0], right[1]);
    assert.ok(a >= 0 && b >= 0 && a !== b, "separate lobes");
    assert.equal(at(r.parts, body[0], body[1]), -1, "outside stays outside");
    const before = new Set(
      input.flat(2).map((p) => `${p[0].n}/${p[0].d},${p[1].n}/${p[1].d}`),
    );
    for (const p of r.parts.flat(2))
      assert.ok(
        before.has(`${p[0].n}/${p[0].d},${p[1].n}/${p[1].d}`),
        "no point is moved or added",
      );
    assert.doesNotThrow(() => encode(r.parts), "split pieces are encodable");
  });
}

test("a dead-end zero-width crack inside one area changes nothing", () => {
  const crack = parts([
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [1, 2],
      [1, 1],
      [1, 2],
      [0, 2],
      [0, 0],
    ],
  ]);
  const r = splitNativeSelectionPointContacts(crack);
  assert.equal(r.splitParts, 0);
  assert.equal(r.parts, crack, "unchanged object");
});

test("a positive-width channel, however thin, keeps its lobes one area", () => {
  // Two wall bodies 2^-48 ft apart (below IEEE resolution at these
  // coordinates' scale in the real data): a channel of positive exact width,
  // closed only by reviewed contact rows, never by this topology rule.
  const w = 2 ** -48;
  const channel = nativeRationalOverlay(
    "difference",
    [
      [
        [
          [0, 0],
          [3, 0],
          [3, 2],
          [0, 2],
        ],
      ],
    ],
    [
      [
        [
          [1, 0],
          [1.5, 0],
          [1.5, 1],
          [1, 1],
        ],
      ],
    ],
    [
      [
        [
          [1, 1 + w],
          [1.5, 1 + w],
          [1.5, 2],
          [1, 2],
        ],
      ],
    ],
  );
  assert.equal(channel.length, 1);
  const r = splitNativeSelectionPointContacts(channel);
  assert.equal(r.splitParts, 0);
  assert.equal(r.parts, channel);
});
