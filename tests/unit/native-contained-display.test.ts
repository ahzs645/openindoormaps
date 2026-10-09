import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { createNativeContainedDisplay } from "../../app/indoor-project/native-contained-display";
import { createNativeContainedDisplay as sourceDisplay } from "../../../reviter/lib/reviter/native-contained-display";
import {
  Rational,
  rational,
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import { Rational as SourceRational } from "../../../reviter/lib/reviter/native-rational-overlay";
const q = (n: number) => rational(n);
const rectangle = (a: number, b: number, c: number, d: number) =>
  [
    [q(a), q(b)],
    [q(c), q(b)],
    [q(c), q(d)],
    [q(a), q(d)],
    [q(a), q(b)],
  ] as any;
function checked(parts: NativeRationalParts) {
  const out = createNativeContainedDisplay(parts);
  assert.equal(
    nativeRationalOverlay("difference", out.partsFeet, parts).length,
    0,
  );
  assert.equal(
    nativeRationalOverlay(
      "xor",
      parts,
      nativeRationalOverlay("union", out.partsFeet, out.exactResidualParts),
    ).length,
    0,
  );
  assert.deepEqual(out.exactParts, parts);
  return out;
}
test("exact holes and disconnected positive components survive contained rendering", () => {
  const p = [
    [rectangle(0, 0, 10, 10), rectangle(3, 3, 7, 7)],
    [rectangle(20, 0, 20 + Number.EPSILON * 32, 1)],
  ] as NativeRationalParts;
  const out = checked(p);
  assert.equal(out.faces.length, 2);
  assert.ok(out.faces.every((x) => x.numericPieces > 0));
  assert.equal(
    nativeRationalOverlay("intersection", out.partsFeet, [
      [rectangle(3, 3, 7, 7)],
    ]).length,
    0,
  );
  for (const point of p.flat(2))
    assert.ok(
      out.unchangedIEEEAnchorsFeet.some(
        ([x, y]) =>
          x === Number(point[0].original) && y === Number(point[1].original),
      ),
    );
});
test("a positive sub-IEEE component remains explicit exact residual without an area cutoff", () => {
  const x = new Rational(1n, 3n),
    hi = new Rational((1n << 120n) + 3n, 3n * (1n << 120n)),
    p = [
      [
        [
          [x, q(0)],
          [hi, q(0)],
          [hi, q(1)],
          [x, q(1)],
          [x, q(0)],
        ],
      ],
    ] as NativeRationalParts;
  const out = checked(p);
  assert.ok(out.exactResidualParts.length);
  assert.equal(out.partsFeet.length, 0);
  assert.equal(out.faces[0].unrepresentablePositiveCells, 1);
});
test("exact oblique source edges yield contained generated numeric chords and retained residual", () => {
  const p = [
    [
      [
        [q(0), q(0)],
        [new Rational(1n, 3n), q(0)],
        [new Rational(2n, 3n), q(1)],
        [q(0), q(1)],
        [q(0), q(0)],
      ],
    ],
  ] as NativeRationalParts;
  const out = checked(p);
  assert.ok(out.partsFeet.length);
  assert.ok(out.certificate.maximumGeneratedMovementFeet <= 1e-7);
  assert.ok(out.exactResidualParts.length);
});
test("zero render movement bound never rounds a generated point outside source", () => {
  const p = [
    [
      [
        [q(0), q(0)],
        [new Rational(1n, 3n), q(0)],
        [q(0), q(1)],
        [q(0), q(0)],
      ],
    ],
  ] as NativeRationalParts;
  const out = createNativeContainedDisplay(p, {
    maximumGeneratedMovementFeet: 0,
  });
  assert.equal(nativeRationalOverlay("difference", out.partsFeet, p).length, 0);
  assert.ok(out.exactResidualParts.length);
});
test("source/runtime parity preserves exact authority and unchanged numeric anchors", () => {
  const p = [
    [rectangle(-1, -1, 2, 2), rectangle(0, 0, 1, 1)],
  ] as NativeRationalParts;
  const a = checked(p),
    b = sourceDisplay(
      p.map((part) =>
        part.map((ring) =>
          ring.map((pt) =>
            pt.map((v) => new SourceRational(v.n, v.d, v.original)),
          ),
        ),
      ) as any,
    );
  assert.deepEqual(a.partsFeet, b.partsFeet);
  assert.deepEqual(a.unchangedIEEEAnchorsFeet, b.unchangedIEEEAnchorsFeet);
  assert.deepEqual(a.faces, b.faces);
  assert.deepEqual(a.certificate, b.certificate);
  assert.equal(
    nativeRationalOverlay(
      "xor",
      a.exactResidualParts,
      b.exactResidualParts.map((part) =>
        part.map((ring) =>
          ring.map((pt) => pt.map((v) => new Rational(v.n, v.d, v.original))),
        ),
      ) as any,
    ).length,
    0,
  );
  assert.throws(() =>
    createNativeContainedDisplay(p, { maximumGeneratedMovementFeet: -1 }),
  );
});

test("thin exact convex source cells cannot produce self-crossing numeric corner order", () => {
  const f: {
    cell: { numerator: string; denominator: string; original?: number }[][][];
  } = JSON.parse(
    fs.readFileSync(
      new URL(
        "../fixtures/native-contained-display-thin-source-cell.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const p = [
    f.cell.map((r) =>
      r.map((pt) =>
        pt.map(
          (v) =>
            new Rational(
              BigInt(v.numerator),
              BigInt(v.denominator),
              v.original ?? undefined,
            ),
        ),
      ),
    ),
  ] as NativeRationalParts;
  const out = checked(p);
  assert.ok(out.partsFeet.length);
  for (const part of out.partsFeet)
    assert.equal(nativeRationalOverlay("union", [part]).length, 1);
});
