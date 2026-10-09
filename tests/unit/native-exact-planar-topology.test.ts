import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  Rational,
  rational,
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import {
  encodeNativeExactTopology,
  createNativeExactTopologyIndex,
  freezeNativeRationalParts,
  nativeRationalPointInParts,
  nativeRationalPointInRing,
  nativeRationalPathSupported,
  nativeRationalFootprintSupported,
} from "../../app/indoor-project/native-exact-planar-topology";
import { nativeRationalPointInRing as sourcePointInRing } from "../../../reviter/lib/reviter/native-exact-planar-topology";
const binding = {
  sourceModelSha256: "a".repeat(64),
  sourceGeometryKey: "input-v1",
  kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
};
const box = (a: number, b: number, c: number, d: number) =>
  [
    [
      [
        [a, b],
        [c, b],
        [c, d],
        [a, d],
        [a, b],
      ],
    ],
  ] as [number, number][][][];
const exact = (p: [number, number][][][]) => nativeRationalOverlay("union", p);
test("exact tile broadphase retains tangent shells, negative tiles and every positive hole in runtime and compiler", async () => {
  const source = await import(
    "../../../reviter/lib/reviter/native-exact-planar-topology"
  );
  const sourceOverlay = await import(
    "../../../reviter/lib/reviter/native-rational-overlay"
  );
  const q = (n: number) => new Rational(BigInt(n));
  const ring = (a: Rational, b: Rational, c: Rational, d: Rational) =>
    [
      [a, b],
      [c, b],
      [c, d],
      [a, d],
    ] as [Rational, Rational][];
  const gap = new Rational(1n, 10n ** 520n),
    afterTwo = new Rational(2n * gap.d + gap.n, gap.d);
  const parts = freezeNativeRationalParts([
    [ring(q(0), q(0), q(16), q(16)), ring(q(2), q(2), afterTwo, q(3))],
    [ring(q(16), q(0), q(17), q(1))],
    [ring(q(-32), q(-32), q(-16), q(-16))],
    ...Array.from({ length: 40 }, (_, i) => [
      ring(q(100 + i * 2), q(100), q(101 + i * 2), q(101)),
    ]),
  ]);
  for (const [api, overlay, R] of [
    [
      { nativeRationalPathSupported, nativeRationalFootprintSupported },
      nativeRationalOverlay,
      Rational,
    ],
    [source, sourceOverlay.nativeRationalOverlay, sourceOverlay.Rational],
  ] as const) {
    const ownParts = freezeNativeRationalParts(
      parts.map((part) =>
        part.map((ring) =>
          ring.map(
            (point) =>
              point.map((v) => new R(v.n, v.d)) as [Rational, Rational],
          ),
        ),
      ),
    );
    assert.equal(
      api.nativeRationalPathSupported(
        [
          [1, 1],
          [10, 1],
        ],
        ownParts,
      ),
      true,
    );
    assert.equal(
      api.nativeRationalPathSupported(
        [
          [1, 2.5],
          [3, 2.5],
        ],
        ownParts,
      ),
      false,
      "sub-fixed-point hole cannot disappear from the tile",
    );
    assert.equal(
      api.nativeRationalPathSupported(
        [
          [16, 0],
          [17, 0],
        ],
        ownParts,
      ),
      true,
      "exact tangent tile shell stays present",
    );
    assert.equal(
      api.nativeRationalPathSupported(
        [
          [-30, -30],
          [-20, -20],
        ],
        ownParts,
      ),
      true,
    );
    assert.equal(
      api.nativeRationalPathSupported(
        [
          [16, 16],
          [17, 16],
        ],
        ownParts,
      ),
      false,
    );
    for (const numeric of [
      box(1, 1, 10, 1.5),
      box(1, 2.4, 3, 2.6),
      box(16, 0, 17, 1),
      box(-30, -30, -20, -20),
    ]) {
      const footprint = overlay("union", numeric);
      assert.equal(
        api.nativeRationalFootprintSupported(footprint, ownParts),
        overlay("difference", footprint, ownParts).length === 0,
      );
    }
  }
});
function rehash(value: any) {
  const { geometrySha256: _, ...p } = value;
  value.geometrySha256 = bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(p))),
  );
  return value;
}
test("exact carrier preserves true narrow positive gaps and rejects crossing routes", () => {
  const parts = nativeRationalOverlay(
    "union",
    box(0, 0, 1, 1),
    box(1 + Number.EPSILON, 0, 2, 1),
  );
  const carrier = encodeNativeExactTopology(binding, [{ id: "face", parts }]);
  const index = createNativeExactTopologyIndex(
    JSON.parse(JSON.stringify(carrier)),
    binding,
  );
  assert.equal(index.parts("face")!.length, 2);
  assert.equal(
    nativeRationalPathSupported(
      [
        [0.5, 0.5],
        [1.5, 0.5],
      ],
      index.parts("face")!,
    ),
    false,
  );
  assert.equal(
    nativeRationalPathSupported(
      [
        [0.5, 0.5],
        [0.5, 0.5],
      ],
      index.parts("face")!,
    ),
    true,
  );
  assert.equal(
    nativeRationalPathSupported(
      [
        [3, 3],
        [3, 3],
      ],
      index.parts("face")!,
    ),
    false,
  );
});
test("exact rational intersections survive serialization without IEEE corner skins", () => {
  const parts = nativeRationalOverlay("intersection", box(0, 0, 2, 2), [
    [
      [
        [0, 0],
        [2, 1],
        [0, 2],
        [0, 0],
      ],
    ],
  ]);
  const carrier = encodeNativeExactTopology(binding, [
    { id: "triangle", parts },
  ]);
  const decoded = createNativeExactTopologyIndex(carrier, binding).parts(
    "triangle",
  )!;
  assert.throws(() => JSON.stringify(decoded));
  assert.equal(
    nativeRationalPointInParts([rational(1), rational(0.5)], decoded),
    true,
  );
  assert.equal(
    nativeRationalPointInParts(
      [rational(1), rational(0.5 - Number.EPSILON)],
      decoded,
    ),
    false,
  );
});
test("positive tiny true hole blocks a complete footprint and every trace interval", () => {
  const parts = nativeRationalOverlay(
    "difference",
    box(0, 0, 1, 1),
    box(0.5, 0.5, 0.5 + Number.EPSILON, 0.5 + Number.EPSILON),
  );
  const decoded = createNativeExactTopologyIndex(
    encodeNativeExactTopology(binding, [{ id: "holed", parts }]),
    binding,
  ).parts("holed")!;
  assert.equal(decoded[0].length, 2);
  assert.equal(
    nativeRationalFootprintSupported(
      exact(box(0.49, 0.49, 0.51, 0.51)),
      decoded,
    ),
    false,
  );
  assert.equal(
    nativeRationalPathSupported(
      [
        [0.4, 0.5],
        [0.6, 0.5],
      ],
      decoded,
    ),
    false,
  );
});
test("stale, tampered, noncanonical and unknown carrier data fails closed", () => {
  const c = encodeNativeExactTopology(binding, [
    { id: "a", parts: exact(box(0, 0, 1, 1)) },
  ]);
  assert.throws(() =>
    createNativeExactTopologyIndex(c, {
      ...binding,
      sourceGeometryKey: "other",
    }),
  );
  const changed = structuredClone(c);
  changed.coordinates[0].x[0] = "3";
  assert.throws(() => createNativeExactTopologyIndex(changed, binding));
  const noncanonical = structuredClone(c);
  noncanonical.coordinates[0].x = ["0", "2"];
  assert.throws(() =>
    createNativeExactTopologyIndex(rehash(noncanonical), binding),
  );
  const unknown = { ...structuredClone(c), notes: "private" };
  assert.throws(() => createNativeExactTopologyIndex(rehash(unknown), binding));
  const duplicate = structuredClone(c);
  duplicate.faces.push(duplicate.faces[0]);
  assert.throws(() =>
    createNativeExactTopologyIndex(rehash(duplicate), binding),
  );
});
test("encoder binding retains only the three declared physical keys", () => {
  const first = encodeNativeExactTopology(binding, [
    { id: "a", parts: exact(box(0, 0, 1, 1)) },
  ]);
  const next = encodeNativeExactTopology(
    { ...first, privateNote: "not a binding" } as any,
    [{ id: "a", parts: exact(box(0, 0, 1, 1)) }],
  );
  assert.deepEqual(next, first);
  assert.deepEqual(
    createNativeExactTopologyIndex(next, {
      ...first,
      privateNote: "not a binding",
    } as any).binding,
    binding,
  );
});

test("carrier rejects positive bowties, outside holes and exact out-of-domain coordinates after rehash", () => {
  const valid = encodeNativeExactTopology(binding, [
    { id: "face", parts: exact(box(0, 0, 4, 4)) },
  ]);
  const bow = structuredClone(valid);
  bow.faces[0].parts[0][0] = [0, 2, 1, 3, 0];
  assert.throws(() => createNativeExactTopologyIndex(rehash(bow), binding));
  const outside = encodeNativeExactTopology(binding, [
    { id: "a", parts: exact(box(0, 0, 4, 4)) },
    { id: "b", parts: exact(box(8, 8, 9, 9)) },
  ]);
  outside.faces[0].parts[0].push(outside.faces[1].parts[0][0]);
  assert.throws(() => createNativeExactTopologyIndex(rehash(outside), binding));
  const far = structuredClone(valid);
  far.coordinates[0].x = ["10000000000000000000000001", "1000000000000000000"];
  assert.throws(() => createNativeExactTopologyIndex(rehash(far), binding));
});
test("area majority uses exact ordering rather than rounded half coverage", async () => {
  const { Rational } = await import(
    "../../app/indoor-project/native-rational-overlay"
  );
  const { nativeRationalAreaCompare } = await import(
    "../../app/indoor-project/native-exact-planar-topology"
  );
  const q = new Rational(500000000000000000000001n, 1000000000000000000000000n);
  const slightlyMore = nativeRationalOverlay("union", [
    [
      [
        [rational(0), rational(0)],
        [q, rational(0)],
        [q, rational(1)],
        [rational(0), rational(1)],
      ],
    ],
  ]);
  assert.equal(
    nativeRationalAreaCompare(slightlyMore, exact(box(0, 0, 1, 1)), 2n),
    1,
  );
  assert.equal(
    nativeRationalAreaCompare(
      exact(box(0, 0, 0.5, 1)),
      exact(box(0, 0, 1, 1)),
      2n,
    ),
    0,
  );
});
test("exact area ordering retains a hole far below every fixed-point interval", async () => {
  const { nativeRationalAreaCompare: runtime } = await import(
    "../../app/indoor-project/native-exact-planar-topology"
  );
  const { nativeRationalAreaCompare: source } = await import(
    "../../../reviter/lib/reviter/native-exact-planar-topology"
  );
  const den = 10n ** 520n,
    lo = new Rational(1n, 4n),
    hi = new Rational(den + 4n, 4n * den);
  const unit = exact(box(0, 0, 1, 1));
  const withHole: import("../../app/indoor-project/native-rational-overlay").NativeRationalParts =
    [
      [
        unit[0][0],
        [
          [lo, lo],
          [hi, lo],
          [hi, hi],
          [lo, hi],
        ],
      ],
    ];
  for (const compare of [runtime, source]) {
    assert.equal(compare(withHole, unit), -1);
    assert.equal(compare(unit, withHole), 1);
    assert.equal(compare(withHole, withHole), 0);
    assert.equal(compare([[withHole[0][1]]], []), 1);
  }
});
test("immutable exact routing geometry cannot retain mutable coordinate scalars", () => {
  const parts = freezeNativeRationalParts(exact(box(0, 0, 1, 1)));
  assert.equal(Object.isFrozen(parts[0][0][0][0]), true);
  assert.throws(() => {
    (parts[0][0][0][0] as any).n = 999n;
  });
  assert.throws(() => {
    parts[0][0][0][0] = rational(999);
  });
  assert.equal(
    nativeRationalPathSupported(
      [
        [0.2, 0.2],
        [0.8, 0.8],
      ],
      parts,
    ),
    true,
  );
});

for (const [name, classify] of [
  ["runtime", nativeRationalPointInRing],
  ["source", sourcePointInRing],
] as const) {
  test(`${name}: spatial indexes never cache a shallow-frozen large ring with mutable points`, () => {
    const ring = Array.from({ length: 64 }, (_, i) => {
      const side = Math.floor(i / 16),
        t = (i % 16) / 16;
      const [x, y] = [
        [t, 0],
        [1, t],
        [1 - t, 1],
        [0, 1 - t],
      ][side]!;
      return [rational(x!), rational(y!)] as [
        ReturnType<typeof rational>,
        ReturnType<typeof rational>,
      ];
    });
    Object.freeze(ring);
    assert.equal(classify([rational(0.5), rational(0.5)], ring), 1);
    for (const p of ring) p[1] = rational(Number(p[1].n) / Number(p[1].d) + 10);
    assert.equal(classify([rational(0.5), rational(10.5)], ring), 1);
    assert.equal(classify([rational(0.5), rational(0.5)], ring), 0);
    assert.equal(classify([rational(0), rational(10.5)], ring), -1);
  });

  test(`${name}: frozen tuples alone cannot memoize bounds of mutable rational scalars`, () => {
    const ring = Array.from({ length: 64 }, (_, i) => {
      const side = Math.floor(i / 16),
        t = (i % 16) / 16;
      const [x, y] = [
        [t, 0],
        [1, t],
        [1 - t, 1],
        [0, 1 - t],
      ][side]!;
      const rx = rational(x!),
        ry = rational(y!);
      return [new Rational(rx.n, rx.d), new Rational(ry.n, ry.d)] as [
        Rational,
        Rational,
      ];
    });
    ring.forEach((p) => Object.freeze(p));
    Object.freeze(ring);
    assert.equal(classify([rational(0.5), rational(0.5)], ring), 1);
    for (const p of ring) (p[1] as any).n += 10n * p[1].d;
    assert.equal(classify([rational(0.5), rational(10.5)], ring), 1);
    assert.equal(classify([rational(0.5), rational(0.5)], ring), 0);
  });
}
