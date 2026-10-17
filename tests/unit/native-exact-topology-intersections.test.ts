import test from "node:test";
import assert from "node:assert/strict";
import {
  Rational,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  type NativeRationalParts,
  type NativeRationalPoint,
} from "../../app/indoor-project/native-rational-overlay";
import * as runtime from "../../app/indoor-project/native-exact-planar-topology";
import * as compiler from "../../../reviter/lib/reviter/native-exact-planar-topology";

const binding = {
  sourceModelSha256: "b".repeat(64),
  sourceGeometryKey: "synthetic-exact-intersection-regression",
  kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
};
const q = (n: number) => new Rational(BigInt(n));
const ring = (points: [number, number][]) =>
  points.map(([x, y]) => [q(x), q(y)] as NativeRationalPoint);
const shell = () =>
  ring([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]);

function verify(parts: NativeRationalParts, accepted: boolean) {
  const original = parts.map((part) =>
    part.map((r) =>
      r.map(([x, y]) => [String(x.n), String(x.d), String(y.n), String(y.d)]),
    ),
  );
  for (const reversed of [false, true]) {
    const input = reversed
      ? parts.map((part) => part.map((r) => [...r].reverse()))
      : parts;
    let sourceFailure: string | undefined;
    for (const [name, api] of [
      ["compiler", compiler],
      ["runtime", runtime],
    ] as const) {
      let failure: string | undefined;
      try {
        const encoded = api.encodeNativeExactTopology(binding, [
          { id: "face", parts: input },
        ]);
        const decoded = api
          .createNativeExactTopologyIndex(encoded, binding)
          .parts("face");
        assert(decoded);
        assert.deepEqual(
          api.encodeNativeExactTopology(binding, [
            { id: "face", parts: decoded },
          ]),
          encoded,
        );
      } catch (error) {
        failure = String(error);
      }
      assert.equal(
        failure === undefined,
        accepted,
        `${name}: ${reversed ? "reversed" : "forward"} ring acceptance`,
      );
      if (name === "compiler") sourceFailure = failure;
      else
        assert.equal(
          failure,
          sourceFailure,
          "Exact source compiler and runtime reject the same intersection",
        );
    }
  }
  assert.deepEqual(
    parts.map((part) =>
      part.map((r) =>
        r.map(([x, y]) => [String(x.n), String(x.d), String(y.n), String(y.d)]),
      ),
    ),
    original,
    "Validation never edits original rings",
  );
}

test("exact carrier keeps isolated shell/hole and hole/hole endpoint contacts", () => {
  verify(
    [
      [
        shell(),
        ring([
          [0, 5],
          [2, 4],
          [2, 6],
        ]),
      ],
    ],
    true,
  );
  verify(
    [
      [
        shell(),
        ring([
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
        ]),
        ring([
          [4, 4],
          [6, 5],
          [5, 6],
        ]),
      ],
    ],
    true,
  );
});

test("exact carrier rejects positive crossings and shared collinear hole edges", () => {
  verify(
    [
      [
        ring([
          [0, 0],
          [4, 4],
          [0, 4],
          [3, 0],
        ]),
      ],
    ],
    false,
  );
  verify(
    [
      [
        shell(),
        ring([
          [0, 4],
          [2, 4],
          [2, 6],
          [0, 6],
        ]),
      ],
    ],
    false,
  );
  verify(
    [
      [
        shell(),
        ring([
          [-1, 4],
          [2, 4],
          [2, 6],
          [-1, 6],
        ]),
      ],
    ],
    false,
  );
  verify(
    [
      [
        shell(),
        ring([
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
        ]),
        ring([
          [4, 2],
          [6, 2],
          [6, 4],
          [4, 4],
        ]),
      ],
    ],
    false,
  );
});

test("sub-IEEE shell gaps and crossing holes retain every rational bit", () => {
  const epsilon = new Rational(1n, 1n << 520n);
  const hole = (x: Rational): NativeRationalPoint[] => [
    [x, q(1)],
    [q(2), q(1)],
    [q(2), q(3)],
    [x, q(3)],
  ];
  verify([[shell(), hole(epsilon)]], true);
  verify([[shell(), hole(new Rational(-epsilon.n, epsilon.d))]], false);
  verify([[shell(), hole(q(0))]], false);
});
