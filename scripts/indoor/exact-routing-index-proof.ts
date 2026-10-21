import assert from "node:assert/strict";
import type { NativeExactTopologyIndex } from "../../app/indoor-project/native-exact-planar-topology";
import type { NativeRationalParts } from "../../app/indoor-project/native-rational-overlay";
/** Rational.toJSON deliberately refuses IEEE coercion. Walk exact scalars
 * BEFORE serialization; a JSON replacer runs after toJSON and is insufficient. */
export function assertExactRoutingIndexParity(
  normal: NativeExactTopologyIndex,
  hydrated: NativeExactTopologyIndex,
) {
  const wire = (parts: NativeRationalParts | undefined) =>
    parts?.map((part) =>
      part.map((ring) =>
        ring.map((point) => point.map((q) => [String(q.n), String(q.d)])),
      ),
    );
  assert.deepEqual(hydrated.binding, normal.binding);
  assert.equal(hydrated.geometrySha256, normal.geometrySha256);
  assert.deepEqual(hydrated.ids(), normal.ids());
  for (const id of normal.ids())
    assert.deepEqual(wire(hydrated.parts(id)), wire(normal.parts(id)), id);
  return normal.ids().length;
}
