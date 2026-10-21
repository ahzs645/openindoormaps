import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeNativeExactTopology,
  freezeNativeRationalParts,
  nativeRationalPathSupported,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay as overlay,
  Rational,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import { hydratePublishedTopology } from "../../app/indoor-project/published-routing-hydration";
import {
  restorePublishedSupportTiles,
  supportTileBounds,
  type SupportTileParent,
} from "../../app/indoor-project/published-support-tiles";
import { producePublishedSupportTiles } from "../../scripts/indoor/published-support-tile-producer";
import { createNativeRationalSupportTileQuery } from "../../app/indoor-project/native-rational-support-tiles";
import { createTwoFootCorridorSupport } from "../../app/indoor-project/corridor-guide-support";
const rect = (
  a: number | Rational,
  b: number,
  c: number | Rational,
  d: number,
): NativeRationalParts =>
  overlay("union", [
    [
      [
        [a, b],
        [c, b],
        [c, d],
        [a, d],
      ],
    ],
  ]);
const wire = (p: NativeRationalParts) =>
  p.map((a) =>
    a.map((r) => r.map((v) => v.map((q) => [String(q.n), String(q.d)]))),
  );
function setup(parts: NativeRationalParts[]) {
  const parents: SupportTileParent[] = parts.map((p, i) => ({
    id: "cell-" + i,
    z: 12,
    parts: freezeNativeRationalParts(p),
  }));
  const topology = encodeNativeExactTopology(
      {
        sourceModelSha256: "1".repeat(64),
        sourceGeometryKey: "unit-source",
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      parents.map((p) => ({ id: p.id, parts: p.parts })),
    ),
    supported = hydratePublishedTopology(topology),
    value = producePublishedSupportTiles(supported, parents),
    restore = (v = value) =>
      restorePublishedSupportTiles(
        v,
        hydratePublishedTopology(v.topology),
        topology.geometrySha256,
        parents,
      );
  return { parents, value, restore };
}
test("published intermediate tiles preserve full strips, holes, negative boundaries, overlapping parents and own extra halves", () => {
  const floor = overlay(
      "difference",
      rect(-70, -20, 70, 20),
      rect(31, -2, 33, 2),
    ),
    overlap = rect(40, -20, 100, 20),
    { parents, restore } = setup([floor, overlap]),
    extra = rect(31, -1, 33, 1),
    base = overlay("union", floor, overlap, extra),
    provider = restore()(parents, extra, 12)!;
  assert(provider);
  const ordinary = createNativeRationalSupportTileQuery(base),
    published = createNativeRationalSupportTileQuery(base, undefined, provider);
  for (const half of [
    rect(-65, -4, -31, 4),
    rect(30, -3, 34, 3),
    rect(31, -1, 33, 1),
    rect(32, -2, 65, 2),
    rect(-90, -3, 110, 3),
    rect(120, 0, 121, 1),
  ]) {
    assert.deepEqual(wire(published(half)), wire(ordinary(half)));
    assert.deepEqual(wire(published(half)), wire(ordinary(half)));
  }
  const a = createTwoFootCorridorSupport(base, 12),
    b = createTwoFootCorridorSupport(base, 12, provider);
  for (const path of [
    [
      [-60, 0],
      [60, 0],
    ],
    [
      [30, 0],
      [34, 0],
    ],
    [
      [30, 1.5],
      [34, 1.5],
    ],
    [
      [90, 0],
      [110, 0],
    ],
  ])
    assert.equal(b(path as [number, number][]), a(path as [number, number][]));
});
test("sub-IEEE positive gaps and holes remain refusals; touching atomic edges do not expand support", () => {
  const d = 10n ** 90n,
    lo = new Rational(32n * d - 1n, d),
    hi = new Rational(32n * d + 1n, d),
    floors = [...rect(-64, -10, lo, 10), ...rect(hi, -10, 64, 10)],
    { parents, restore } = setup([floors]),
    provider = restore()(parents, [], 12)!,
    a = createTwoFootCorridorSupport(floors, 12),
    b = createTwoFootCorridorSupport(floors, 12, provider);
  assert.equal(
    a([
      [30, 0],
      [34, 0],
    ]),
    false,
  );
  assert.equal(
    b([
      [30, 0],
      [34, 0],
    ]),
    false,
  );
  for (const path of [
    [
      [-32, 0],
      [0, 0],
    ],
    [
      [32, 0],
      [33, 0],
    ],
    [
      [63, 0],
      [65, 0],
    ],
  ])
    assert.equal(b(path as [number, number][]), a(path as [number, number][]));
  assert.deepEqual(supportTileBounds(rect(-32.5, 0, -32, 1)), [
    -2n,
    0n,
    -1n,
    0n,
  ]);
});
test("missing, duplicate, stale, foreign or wrong-plane parents never confer a prepared query", () => {
  const { parents, value, restore } = setup([rect(0, 0, 64, 4)]),
    factory = restore();
  assert.equal(factory(parents, [], 13), undefined);
  assert.equal(
    factory(
      [{ ...parents[0], parts: overlay("union", parents[0].parts) }],
      [],
      12,
    ),
    undefined,
  );
  assert.equal(factory([{ ...parents[0], id: "foreign" }], [], 12), undefined);
  assert.equal(factory([...parents, ...parents], [], 12), undefined);
  assert.equal(factory([], [], 12), undefined);
  const clone = () => structuredClone(value);
  let bad = clone();
  bad.supportedTopologySha256 = "0".repeat(64);
  assert.throws(() => restore(bad), /binding/);
  bad = clone();
  bad.parents[0].z = 13;
  assert.throws(() => restore(bad), /parent/);
  bad = clone();
  bad.parents[0].bounds[0] = "-1";
  assert.throws(() => restore(bad), /parent/);
  bad = clone();
  bad.topology.faces.pop();
  assert.throws(() => restore(bad), /Incomplete/);
  bad = clone();
  bad.empty.push(bad.topology.faces[0].id);
  assert.throws(() => restore(bad), /ambiguous/);
  bad = clone();
  bad.parents = [];
  assert.throws(() => restore(bad), /omit/);
});
test("missing optimization and a failed geometry provider keep the ordinary exact kernel", () => {
  const base = rect(-40, -5, 40, 5),
    half = rect(-33, -1, 33, 1),
    expected = createNativeRationalSupportTileQuery(base)(half);
  assert.deepEqual(
    wire(
      createNativeRationalSupportTileQuery(base, undefined, () => {
        // eslint-disable-next-line unicorn/no-useless-undefined
        return undefined;
      })(half),
    ),
    wire(expected),
  );
  assert.deepEqual(
    wire(
      createNativeRationalSupportTileQuery(base, undefined, () => {
        throw new Error("damaged optimization");
      })(half),
    ),
    wire(expected),
  );
});
test("prepared32ft atoms reproduce original16ft path clips, including partial negative tiles and cut hole boundaries", () => {
  const shell: [number, number][] = [
      [-64, -10],
      [64, -10],
      ...Array.from({ length: 257 }, (_, i): [number, number] => [
        64 - i / 2,
        10 + (i % 2) / 10,
      ]),
    ],
    source = overlay(
      "difference",
      overlay("union", [[shell]]),
      rect(-16, -2, 16, 2),
    ),
    { parents, restore } = setup([source]),
    provider = restore()(parents, [], 12)!;
  assert(source.flat(2).length > 128);
  let calls = 0;
  for (const path of [
    [
      [-33, 5],
      [-31, 5],
    ],
    [
      [-17, 0],
      [-15, 0],
    ],
    [
      [-17, 2],
      [-15, 2],
    ],
    [
      [15, 5],
      [17, 5],
    ],
    [
      [-64, 0],
      [-63, 0],
    ],
    [
      [63, 0],
      [65, 0],
    ],
  ]) {
    const actual = nativeRationalPathSupported(
        path,
        parents[0].parts,
        (tile, bounds) => {
          calls++;
          return provider(tile, bounds);
        },
      ),
      independent = freezeNativeRationalParts(overlay("union", source));
    assert.equal(actual, nativeRationalPathSupported(path, independent));
  }
  assert(calls > 0);
});
