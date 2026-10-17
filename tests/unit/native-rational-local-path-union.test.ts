import assert from "node:assert/strict";
import test from "node:test";
import {
  Rational,
  nativeRationalOverlay as overlay,
  type NativeRationalParts,
  type NativeRationalOverlayInput,
} from "../../app/indoor-project/native-rational-overlay";
import {
  freezeNativeRationalParts as freeze,
  nativeRationalPoint,
  nativeRationalPathUnionSupported,
  createNativeRationalPathUnionQuery,
  nativeRationalPathSupported as supported,
} from "../../app/indoor-project/native-exact-planar-topology";

const rect = (
  a: number | Rational,
  b: number | Rational,
  c: number | Rational,
  d: number | Rational,
): NativeRationalOverlayInput => [
  [
    [
      [a, b],
      [c, b],
      [c, d],
      [a, d],
    ],
  ],
];
const exact = (parts: NativeRationalOverlayInput) =>
  freeze(overlay("union", parts));
const distant = () =>
  Array.from({ length: 35 }, (_, i) =>
    rect(400 + i * 3, 400, 401 + i * 3, 401),
  ).flat();
const snapshot = (parts: NativeRationalParts) =>
  JSON.stringify(
    parts.map((part) =>
      part.map((ring) =>
        ring.map((p) => p.map((q) => [String(q.n), String(q.d)])),
      ),
    ),
  );
function check(
  face: NativeRationalParts,
  halves: NativeRationalParts,
  points: (number | Rational)[][],
) {
  const before = snapshot(face),
    halvesBefore = snapshot(halves),
    // Keep this reference mutable to disable the ordinary predicate's own
    // vertex-count localization. Compare with the full exact physical union.
    reference = overlay("union", face, halves);
  const expected = supported(points, reference),
    query = createNativeRationalPathUnionQuery();
  assert.equal(query(points, face, [...halves]), expected);
  assert.equal(query(points, face, [...halves]), expected);
  assert.equal(
    nativeRationalPathUnionSupported(points, face, halves),
    expected,
  );
  assert.equal(
    nativeRationalPathUnionSupported([...points].reverse(), face, halves),
    expected,
  );
  assert.equal(snapshot(face), before);
  assert.equal(snapshot(halves), halvesBefore);
  return expected;
}

test("checked union retains open-hole boundary refusals that raw concatenation loses", () => {
  const face = exact([[rect(0, 0, 10, 10)[0][0], rect(3, 3, 7, 7)[0][0]]]),
    half = exact(rect(3, 3, 5, 5)),
    path = [
      [5, 5],
      [4, 4],
    ];
  assert(
    supported(path, freeze([...face, ...half])),
    "documents the unsafe shortcut",
  );
  assert.equal(check(face, half, path), false);
  assert.equal(
    check(face, half, [
      [4, 4],
      [4, 4],
    ]),
    true,
  );
});

test("checked complex faces preserve overlapping holes, touching tile edges and disconnected parts", () => {
  const face = exact([
    [rect(-40, -40, 40, 40)[0][0], rect(0, 0, 8, 8)[0][0]],
    ...distant(),
  ]);
  for (const h of [rect(0, 0, 4, 4), rect(-4, 0, 4, 4), rect(0, -4, 4, 4)]) {
    const half = exact(h);
    for (const path of [
      [
        [4, 4],
        [3, 3],
      ],
      [
        [0, 4],
        [4, 4],
      ],
      [
        [-1, 0],
        [0, 0],
      ],
      [
        [0, -1],
        [0, 1],
      ],
      [
        [16, 10],
        [0, 10],
      ],
      [
        [-16, -10],
        [0, -10],
      ],
      [
        [50, 50],
        [401, 400],
      ],
    ])
      check(face, half, path);
  }
});

test("pre-union localization cannot close an excluded hole boundary on a tile edge", () => {
  const hole: number[][] = [];
  for (let i = 0; i < 40; i++) hole.push([-5 + i / 4, 0]);
  for (let i = 0; i < 32; i++) hole.push([5, i / 4]);
  for (let i = 0; i < 40; i++) hole.push([5 - i / 4, 8]);
  for (let i = 0; i < 32; i++) hole.push([-5, 8 - i / 4]);
  const face = freeze([
      [
        rect(-10, -10, 30, 30)[0][0].map(nativeRationalPoint),
        hole.map(nativeRationalPoint),
      ],
    ]),
    half = exact(rect(20, 20, 21, 21));
  assert.equal(face.flat(2).length, 148);
  assert(overlay("union", face, half).flat(2).length < 128);
  assert.equal(
    check(face, half, [
      [0, 0],
      [0, -1],
    ]),
    false,
  );

  // The local normalized result may also remain above the clipping threshold.
  // It must not be clipped a second time onto this same artificial tile edge.
  const holes = Array.from({ length: 40 }, (_, i) => {
      const x = 8 + (i % 8) * 0.75,
        y = 1 + Math.floor(i / 8) * 0.75;
      return rect(x, y, x + 0.25, y + 0.25)[0][0];
    }),
    dense = exact([
      [rect(-10, -10, 30, 30)[0][0], rect(-5, 0, 5, 8)[0][0], ...holes],
    ]);
  assert(overlay("union", dense, half).flat(2).length > 128);
  assert.equal(
    check(dense, half, [
      [0, 0],
      [0, -1],
    ]),
    false,
  );
});

test("rational gaps narrower than IEEE precision stay blocked and exact covered joins stay supported", () => {
  const denominator = 2n ** 520n,
    afterFour = new Rational(4n * denominator + 1n, denominator),
    face = exact([...rect(0, 0, 4, 2), ...distant()]);
  const path = [
    [3, 1],
    [5, 1],
  ];
  assert.equal(check(face, exact(rect(afterFour, 0, 6, 2)), path), false);
  assert.equal(check(face, exact(rect(4, 0, 6, 2)), path), true);
  assert.equal(check(freeze([]), freeze([]), path), false);
  assert.equal(check(freeze([]), exact(rect(0, 0, 6, 2)), path), true);
  assert.equal(check(face, exact(rect(4, 0, 6, 2)), []), false);
});

test("local boundary samples retain global hole topology beyond the containing tile", () => {
  const wideHole = exact([
      [rect(-200, -200, 200, 200)[0][0], rect(-100, 0, 100, 8)[0][0]],
      ...distant(),
    ]),
    half = exact(rect(150, 150, 151, 151));
  assert(wideHole.flat(2).length > 128);
  assert.equal(
    check(wideHole, half, [
      [0, 0],
      [0, -1],
    ]),
    false,
  );
  assert.equal(
    check(wideHole, freeze([]), [
      [0, 0],
      [0, -1],
    ]),
    false,
    "a canonical face without extensions keeps its global excluded hole boundary",
  );
  const longHole = exact([
    [rect(-200, -200, 200, 2000)[0][0], rect(-5, 0, 5, 1000)[0][0]],
    ...distant(),
  ]);
  assert(longHole.flat(2).length > 128);
  assert.equal(
    check(longHole, half, [
      [-10, 0],
      [10, 0],
    ]),
    false,
    "a boundary interval midpoint replays the full union even with interior endpoints",
  );
  const openBay = exact([
      [
        [
          [-100, -100],
          [100, -100],
          [100, -10],
          [-10, -10],
          [-10, 10],
          [100, 10],
          [100, 100],
          [-100, 100],
        ],
      ],
      ...distant(),
    ]),
    bridge = exact(rect(80, -15, 90, 15));
  assert.equal(
    check(openBay, bridge, [
      [0, -10],
      [0, -11],
    ]),
    false,
  );
  assert.equal(
    check(openBay, bridge, [
      [0, -11],
      [0, -12],
    ]),
    true,
  );
});

test("operation-local full unions cannot retain mutable extension geometry by identity", () => {
  const face = exact([
      [
        [
          [-100, -100],
          [100, -100],
          [100, -10],
          [-10, -10],
          [-10, 10],
          [100, 10],
          [100, 100],
          [-100, 100],
        ],
      ],
    ]),
    extension = overlay("union", rect(150, 150, 151, 151)),
    query = createNativeRationalPathUnionQuery(),
    path = [
      [0, -10],
      [0, -11],
    ];
  assert.equal(query(path, face, extension), true);
  extension[0][0].splice(
    0,
    extension[0][0].length,
    ...rect(80, -15, 90, 15)[0][0].map(nativeRationalPoint),
  );
  assert.equal(supported(path, overlay("union", face, extension)), false);
  assert.equal(query(path, face, extension), false);
});

for (const [name, createCheck] of [
  ["stateless", () => nativeRationalPathUnionSupported],
  ["operation-local", createNativeRationalPathUnionQuery],
] as const) {
  for (const mutableFace of [false, true])
    test(`${name} boundary replay preserves caller mutability and observes in-place rational edits (${mutableFace ? "face" : "extension"})`, () => {
      const openBay: NativeRationalOverlayInput = [
        [
          [
            [-100, -100],
            [100, -100],
            [100, -10],
            [-10, -10],
            [-10, 10],
            [100, 10],
            [100, 100],
            [-100, 100],
          ],
        ],
      ];
      // Caller-owned scalars must be independent of rational(number)'s global
      // original-coordinate cache, so an edit cannot affect another test.
      const fresh = (parts: NativeRationalOverlayInput): NativeRationalParts =>
        parts.map((part) =>
          part.map((ring) =>
            ring.map(([x, y]) => [
              new Rational(BigInt(x as number)),
              new Rational(BigInt(y as number)),
            ]),
          ),
        );
      const face = mutableFace ? fresh(openBay) : exact(openBay),
        extension = mutableFace
          ? exact(rect(150, 150, 151, 151))
          : fresh(rect(150, 150, 151, 151)),
        caller = mutableFace ? face : extension,
        query = createCheck(),
        path = [
          [0, -10],
          [0, -11],
        ],
        frozenStates = (parts: NativeRationalParts) => [
          Object.isFrozen(parts),
          ...parts.flatMap((part) => [
            Object.isFrozen(part),
            ...part.flatMap((ring) => [
              Object.isFrozen(ring),
              ...ring.flatMap((point) => [
                Object.isFrozen(point),
                ...point.map((q) => Object.isFrozen(q)),
              ]),
            ]),
          ]),
        ],
        before = snapshot(caller),
        beforeFrozen = frozenStates(caller);
      assert.equal(query(path, face, extension), true);
      assert.equal(snapshot(caller), before);
      assert.deepEqual(frozenStates(caller), beforeFrozen);
      if (mutableFace) {
        // Move the bay's lower edge down one foot. The original path now
        // starts in the exterior bay and must be rejected on this same query.
        for (const point of face[0][0])
          if (point[1].n === -10n) Object.assign(point[1], { n: -11n });
      } else {
        // The same mutable extension identity now closes the bay into a hole.
        // The original path's first point lies on that excluded hole boundary.
        const bridge = fresh(rect(80, -15, 90, 15));
        extension[0][0].forEach((point, i) =>
          point.forEach((q, axis) =>
            Object.assign(q, {
              n: bridge[0][0][i][axis].n,
              d: bridge[0][0][i][axis].d,
            }),
          ),
        );
      }
      const afterEdit = snapshot(caller);
      assert.notEqual(afterEdit, before);
      assert.equal(supported(path, overlay("union", face, extension)), false);
      assert.equal(query(path, face, extension), false);
      assert.equal(snapshot(caller), afterEdit);
      assert.deepEqual(frozenStates(caller), beforeFrozen);
    });
}
