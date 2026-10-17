import assert from "node:assert/strict";
import test from "node:test";
import { createExactDisplayBoundaryProof } from "../../app/indoor-project/native-exact-display-boundary-proof";
import {
  encodeNativeExactTopology,
  createNativeExactTopologyIndex,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  rational,
  Rational,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
const binding = {
  sourceModelSha256: "a".repeat(64),
  sourceGeometryKey: "actual-exact-operands-no-declared-certificates",
  kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
};
const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const exact = (parts: (number | Rational)[][][][]): NativeRationalParts =>
  parts.map((part) =>
    part.map((ring) => ring.map((p) => [rational(p[0]), rational(p[1])])),
  );
const topology = (id: string, parts: NativeRationalParts) =>
  encodeNativeExactTopology(binding, parts.length ? [{ id, parts }] : []);
const proof = (
  source: NativeRationalParts,
  residual: NativeRationalParts = [],
) =>
  createExactDisplayBoundaryProof(
    topology("source", source),
    topology("source:render-residual", residual),
    binding,
  );

test("normalized exact boundary events certify collinear splitting, reversed winding and shared internal edges", () => {
  const source = exact([[rect(0, 0, 10, 10)]]),
    check = proof(source);
  assert(check("source", [[rect(0, 0, 3, 10)], [rect(3, 0, 10, 10)]]).proved);
  assert(
    check("source", [
      [rect(0, 0, 3, 10).reverse()],
      [rect(3, 0, 10, 10).reverse()],
    ]).proved,
  );
  assert.equal(check("foreign", [[rect(0, 0, 10, 10)]]).proved, false);
});
test("arbitrary validated positive residual polygons retain their holes and exact fractional slivers", () => {
  const source = exact([[rect(0, 0, 10, 10)]]),
    residual = exact([[rect(0, 0, 10, 10), rect(2, 2, 8, 8)]]);
  assert(proof(source, residual)("source", [[rect(2, 2, 8, 8)]]).proved);
  const third = new Rational(1n, 3n),
    fractional = exact([
      [
        [
          [0, 0],
          [1, 0],
          [1, third],
          [0, third],
        ],
      ],
    ]),
    strip = exact([
      [
        [
          [0, 0.25],
          [1, 0.25],
          [1, third],
          [0, third],
        ],
      ],
    ]);
  assert(proof(fractional, strip)("source", [[rect(0, 0, 1, 0.25)]]).proved);
  assert.equal(
    proof(fractional)("source", [[rect(0, 0, 1, 0.25)]]).proved,
    false,
  );
});
test("every positive floor hole, tiny gap and tiny residual survives, with no numeric snapping", () => {
  const tiny = 2 ** -40,
    source = exact([[rect(0, 0, 10, 10), rect(4, 4, 4 + tiny, 6)]]),
    pieces = [
      [rect(0, 0, 4, 10)],
      [rect(4 + tiny, 0, 10, 10)],
      [rect(4, 0, 4 + tiny, 4)],
      [rect(4, 6, 4 + tiny, 10)],
    ];
  assert(proof(source)("source", pieces).proved);
  assert.equal(proof(source)("source", [[rect(0, 0, 10, 10)]]).proved, false);
  const square = exact([[rect(0, 0, 1, 1)]]),
    core = [[rect(0, 0, 1 - tiny, 1)]],
    residual = exact([[rect(1 - tiny, 0, 1, 1)]]);
  assert(proof(square, residual)("source", core).proved);
  assert.equal(proof(square)("source", core).proved, false);
  const tampered = structuredClone(pieces);
  tampered[0][0][1][0] -= tiny;
  assert.equal(proof(source)("source", tampered).proved, false);
});
test("duplicate, overlapping, foreign and oppositely wound pieces cannot cancel positive multiplicity", () => {
  const source = exact([[rect(0, 0, 10, 10)]]),
    whole = [rect(0, 0, 10, 10)],
    check = proof(source);
  for (const pieces of [
    [whole, whole],
    [whole, [rect(2, 2, 3, 3)]],
    [whole, [rect(2, 2, 3, 3).reverse()]],
    [[rect(0, 0, 6, 10)], [rect(4, 0, 10, 10)]],
    [[rect(20, 0, 30, 10)]],
  ])
    assert.equal(check("source", pieces).proved, false);
  const overlappingResidual = exact([[rect(0, 0, 10, 10)], [rect(2, 2, 3, 3)]]);
  assert.equal(proof(source, overlappingResidual)("source", []).proved, false);
});
test("numeric validity independently rejects star crossings, degenerate rings, duplicate vertices, holes and nonfinite values", () => {
  const check = proof(exact([[rect(0, 0, 10, 10)]]));
  const star = [
      [5, 0],
      [8, 9],
      [0, 3],
      [10, 3],
      [2, 9],
    ],
    duplicates = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 0],
      [0, 10],
    ];
  for (const part of [
    [star],
    [duplicates],
    [
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    ],
    [rect(0, 0, 10, 10), rect(2, 2, 3, 3)],
    [
      [
        [0, 0],
        [Infinity, 0],
        [0, 1],
      ],
    ],
  ])
    assert.equal(check("source", [part]).proved, false);
});
test("whole-edge hole containment closes the existing index vertex-contact limitation before chain equality can grant a proof", () => {
  const outer = [
      [0, 0],
      [6, 0],
      [6, 6],
      [4, 6],
      [4, 2],
      [2, 2],
      [2, 6],
      [0, 6],
    ],
    hole = [
      [2, 6],
      [4, 6],
      [3.2, 2],
      [3, 1],
      [2.8, 2],
    ],
    invalid = exact([[outer, hole]]),
    wire = topology("source", invalid);
  assert.doesNotThrow(
    () => createNativeExactTopologyIndex(wire, binding),
    "current index checks vertices and isolated endpoint contacts",
  );
  const checked = proof(invalid, invalid)("source", []);
  assert.equal(checked.proved, false);
  assert.equal(checked.reason, "hole-edge-leaves-shell");
});
test("source or residual outside holes, nested holes, self crossings and checksum tampering never become positive authority", () => {
  const shell = rect(0, 0, 10, 10);
  for (const parts of [
    exact([[shell, rect(20, 20, 21, 21)]]),
    exact([[shell, rect(2, 2, 8, 8), rect(3, 3, 4, 4)]]),
    exact([
      [
        [
          [0, 0],
          [10, 10],
          [0, 10],
          [10, 0],
        ],
      ],
    ]),
  ]) {
    assert.throws(() => proof(parts));
    assert.throws(() => proof(exact([[shell]]), parts));
  }
  const wire = topology("source", exact([[shell]]));
  wire.geometrySha256 = "f".repeat(64);
  assert.throws(
    () =>
      createExactDisplayBoundaryProof(
        wire,
        topology("source:render-residual", []),
        binding,
      ),
    /checksum/,
  );
  assert.equal(
    proof(exact([[shell], [rect(2, 2, 3, 3)]]))("source", [[shell]]).proved,
    false,
    "overlapping source components require original fallback",
  );
});
test("resource limits refuse conservatively and never change source operands", () => {
  const source = exact([[rect(0, 0, 10, 10)]]),
    check = proof(source),
    before = topology("source", source).geometrySha256;
  assert.equal(
    check("source", [[rect(0, 0, 10, 10)]], { edges: 1 }).proved,
    false,
  );
  assert.equal(
    check("source", [[rect(0, 0, 10, 10)]], { numericRingVertices: 2 }).proved,
    false,
  );
  assert.equal(topology("source", source).geometrySha256, before);
  assert.equal(
    check("source", [[rect(0, 0, 10, 10)]], { scalarCharacters: 1 }).reason,
    "scalar-budget",
  );
  assert.equal(
    check("source", [[rect(0, 0, 10, 10)]], { keyCharacters: 1 }).reason,
    "line-key-budget",
  );
  const withHole = proof(exact([[rect(0, 0, 10, 10), rect(2, 2, 3, 3)]]));
  assert.equal(
    withHole("source", [], { holeEdgeChecks: 1 }).reason,
    "hole-containment-budget",
  );
});

test("the production proof's elapsed-time budget falls back conservatively", (t) => {
  const check = proof(exact([[rect(0, 0, 10, 10)]]));
  let clock = 0;
  t.mock.method(performance, "now", () => (clock += 10));
  const checked = check("source", [[rect(0, 0, 10, 10)]], { milliseconds: 1 });
  assert.equal(checked.proved, false);
  assert.equal(checked.reason, "time-budget");
});

test("positive boundary proofs agree with the original difference/XOR obligations on independently constructed holed grid partitions", () => {
  for (const size of [3, 4, 5])
    for (const offset of [0, 1]) {
      const source = exact([[rect(0, 0, size, size), rect(1, 1, 2, 2)]]),
        numeric: [number, number][][][] = [],
        remaining: [number, number][][][] = [];
      for (let x = 0; x < size; x++)
        for (let y = 0; y < size; y++) {
          if (x === 1 && y === 1) continue;
          const cell = [rect(x, y, x + 1, y + 1)];
          if ((x + y + offset) % 2) numeric.push(cell);
          else remaining.push(cell);
        }
      const residual = exact(remaining),
        accepted = proof(source, residual)("source", numeric);
      assert(accepted.proved);
      const original = (r: NativeRationalParts) =>
        !nativeRationalOverlay("difference", numeric, source).length &&
        !nativeRationalOverlay(
          "xor",
          nativeRationalOverlay("difference", source, numeric),
          r,
        ).length;
      assert(
        original(residual),
        "an accepted chain proof must meet the untouched original overlay obligations",
      );
      const missing = residual.slice(1);
      assert.equal(proof(source, missing)("source", numeric).proved, false);
      assert.equal(original(missing), false);
    }
});
