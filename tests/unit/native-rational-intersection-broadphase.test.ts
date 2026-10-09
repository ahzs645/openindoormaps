import assert from "node:assert/strict";
import test from "node:test";
import { nativeRationalIntersectionOperand as filter } from "../../app/indoor-project/native-rational-intersection-broadphase";
import {
  nativeRationalOverlay,
  Rational,
  type NativeRationalOverlayInput as Parts,
} from "../../app/indoor-project/native-rational-overlay";
import { freezeNativeRationalParts } from "../../app/indoor-project/native-exact-planar-topology";
const rect = (
  x: number | Rational,
  y: number | Rational,
  w: number | Rational,
  h: number | Rational,
): Parts => [
  [
    [
      [x, y],
      [w, y],
      [w, h],
      [x, h],
      [x, y],
    ],
  ],
];
const encoded = (parts: ReturnType<typeof nativeRationalOverlay>): string =>
  JSON.stringify(
    parts.map((p) =>
      p.map((r) =>
        r.map((point) => point.map((q) => [String(q.n), String(q.d)])),
      ),
    ),
  );
function equal(subject: Parts, operand: Parts): void {
  const before = operand.map((p) => p.map((r) => r.map((q) => [...q])));
  assert.equal(
    encoded(
      nativeRationalOverlay("intersection", subject, filter(subject, operand)),
    ),
    encoded(nativeRationalOverlay("intersection", subject, operand)),
  );
  assert.deepEqual(operand, before);
}
test("disjoint components and holes are removed; overlapping and touching rings retain identity", () => {
  const subject = rect(0, 0, 2, 2),
    outer = rect(-10, -10, 10, 10)[0]![0]!;
  const nearHole = rect(0.25, 0.25, 0.75, 0.75)[0]![0]!,
    farHole = rect(5, 5, 6, 6)[0]![0]!;
  const touching = rect(2, 0, 3, 2)[0]!,
    far = rect(50, 50, 51, 51)[0]!;
  const operand: Parts = [[outer, nearHole, farHole], touching, far];
  const selected = filter(subject, operand);
  assert.equal(selected.length, 2);
  assert.deepEqual(selected[0], [outer, nearHole]);
  assert.equal(selected[1], touching);
  assert.equal(selected[0]![0], outer);
  assert.equal(selected[0]![1], nearHole);
  equal(subject, operand);
});
test("a hole enclosing the subject and multi-shell subjects remain exact", () => {
  equal(rect(0, 0, 1, 1), [
    [
      rect(-10, -10, 10, 10)[0]![0]!,
      rect(-2, -2, 2, 2)[0]![0]!,
      rect(5, 5, 6, 6)[0]![0]!,
    ],
  ]);
  const subject = [...rect(-5, -5, -4, -4), ...rect(10, 10, 11, 11)];
  equal(subject, [
    ...rect(-6, -6, 0, 0),
    ...rect(9, 9, 12, 12),
    ...rect(50, 50, 51, 51),
  ]);
});
test("sub-IEEE positive slivers at huge offsets are never removed or rounded", () => {
  const scale = 10n ** 90n,
    den = 10n ** 120n;
  const one = new Rational(scale),
    tiny = new Rational(scale * den + 1n, den),
    two = new Rational(scale + 1n);
  const subject = rect(one, 0, two, 1),
    operand = [
      ...rect(one, 0, tiny, 1),
      ...rect(new Rational(scale + 2n), 0, new Rational(scale + 3n), 1),
    ];
  const selected = filter(subject, operand);
  assert.equal(selected.length, 1);
  assert.equal(selected[0], operand[0]);
  equal(subject, operand);
  assert.equal(
    nativeRationalOverlay("intersection", subject, selected).length,
    1,
  );
});
test("generated diagonal intersections, narrow holes and negative coordinates are byte equal", () => {
  const subject: Parts = [
    [
      [
        [-8, -4],
        [4, -3],
        [3, 8],
        [-9, 7],
        [-8, -4],
      ],
    ],
  ];
  const diagonal: Parts = [
    [
      [
        [-7, -10],
        [1, 12],
        [3, 12],
        [-5, -10],
        [-7, -10],
      ],
    ],
  ];
  const authority = nativeRationalOverlay(
    "difference",
    rect(-20, -20, 20, 20),
    [
      ...diagonal,
      ...rect(9, 9, 10, 10),
      ...rect(-6, 0, -6 + Number.EPSILON * 4, 2),
    ],
  );
  equal(subject, authority);
});
test("mutable or partly frozen coordinate edits never reuse stale bounds", () => {
  const subject = rect(0, 0, 2, 2),
    operand = rect(5, 0, 6, 1);
  assert.equal(filter(subject, operand).length, 0);
  operand[0]![0]!.forEach((q) => {
    q[0] = Number(q[0]) - 5;
  });
  equal(subject, operand);
  assert.equal(filter(subject, operand).length, 1);
  const part = rect(5, 0, 6, 1);
  Object.freeze(part[0]![0]);
  filter(subject, part);
  part[0]![0]!.forEach((q) => {
    q[0] = Number(q[0]) - 5;
  });
  assert.equal(filter(subject, part).length, 1);
  equal(subject, part);
  const frozen = freezeNativeRationalParts(
    nativeRationalOverlay("union", operand),
  );
  equal(subject, frozen);
  equal(subject, frozen);
  const mutableScalars = rect(5, 0, 6, 1).map((p) =>
    p.map((r) =>
      r.map((q) => {
        const point = q.map((v) => new Rational(BigInt(v as number))) as [
          Rational,
          Rational,
        ];
        Object.freeze(point);
        return point;
      }),
    ),
  );
  Object.freeze(mutableScalars[0]![0]);
  assert.equal(filter(subject, mutableScalars).length, 0);
  mutableScalars[0]![0]!.forEach((point) => {
    Object.assign(point[0], { n: point[0].n - 5n });
  });
  assert.equal(filter(subject, mutableScalars).length, 1);
  equal(subject, mutableScalars);
});
test("deterministic varied valid rectangle components agree with full overlay", () => {
  for (let i = 0; i < 80; i++) {
    const x = (i % 11) - 5,
      y = (i % 7) - 3,
      subject = rect(x + 0.1, y + 0.2, x + 2.7, y + 2.3);
    const operand = Array.from({ length: 15 }, (_, j) =>
      rect(j - 8.3, (j % 4) - 2.1, j - 7.2, (j % 4) - 0.3),
    ).flat();
    equal(subject, operand);
  }
});
