/** Exact intermediate support geometry, never a successful-route witness.
 * Only the compiled, source-bound published-cache decoder installs its factory.
 * Every strip still executes the ordinary centerline and exact subtraction.
 */
import {
  type NativeExactPlanarTopology,
  type NativeExactTopologyIndex,
  freezeNativeRationalParts,
} from "./native-exact-planar-topology";
import {
  Rational,
  nativeRationalOverlay,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";
import type { NativeSupportTileProvider } from "./native-rational-support-tiles";
// Math.min/max coerce or reject BigInts, losing the exact negative grid index.
const minimum = (a: bigint, b: bigint) => {
  if (a < b) return a;
  return b;
};
const maximum = (a: bigint, b: bigint) => {
  if (a > b) return a;
  return b;
};
const atomicCell = (feet: bigint) => {
  const quotient = feet / 32n;
  return feet < 0n && feet % 32n ? quotient - 1n : quotient;
};

export type PublishedSupportTiles = {
  version: 1;
  tileFeet: 32;
  /** Exact normally validated supported-cell topology, including its owners. */
  supportedTopologySha256: string;
  parents: {
    id: string;
    z: number;
    /** Inclusive atomic tile indices, mathematical floor (also for negatives). */
    bounds: [string, string, string, string];
  }[];
  empty: string[];
  topology: NativeExactPlanarTopology;
};
export type SupportTileParent = {
  id: string;
  z: number;
  parts: NativeRationalParts;
};
export type PublishedSupportTileFactory = (
  parents: readonly SupportTileParent[],
  extra: NativeRationalParts,
  z: number,
) => NativeSupportTileProvider | undefined;
export const supportTileId = (id: string, x: bigint, y: bigint) =>
  JSON.stringify([id, String(x), String(y)]);
const floorCell = (q: Rational) => {
  const denominator = q.d * 32n,
    quotient = q.n / denominator;
  return q.n < 0n && q.n % denominator ? quotient - 1n : quotient;
};
/** Exact index bounds of all source coordinates. No IEEE bound or tolerance. */
export function supportTileBounds(
  parts: NativeRationalParts,
): [bigint, bigint, bigint, bigint] | undefined {
  let bounds: [bigint, bigint, bigint, bigint] | undefined;
  for (const part of parts)
    for (const ring of part)
      for (const [x, y] of ring) {
        const a = floorCell(x),
          b = floorCell(y);
        if (bounds) {
          if (a < bounds[0]) bounds[0] = a;
          if (b < bounds[1]) bounds[1] = b;
          if (a > bounds[2]) bounds[2] = a;
          if (b > bounds[3]) bounds[3] = b;
        } else {
          bounds = [a, b, a, b];
        }
      }
  return bounds;
}
export function supportTileRectangle(
  x: bigint,
  y: bigint,
): NativeRationalParts {
  return [
    [
      [
        [new Rational(x * 32n), new Rational(y * 32n)],
        [new Rational((x + 1n) * 32n), new Rational(y * 32n)],
        [new Rational((x + 1n) * 32n), new Rational((y + 1n) * 32n)],
        [new Rational(x * 32n), new Rational((y + 1n) * 32n)],
      ],
    ],
  ];
}
/** Admission is the caller's responsibility. This checks complete metadata
 * against the exact immutable parent objects and the decoded tile inventory.
 */
export function restorePublishedSupportTiles(
  value: PublishedSupportTiles,
  index: NativeExactTopologyIndex,
  supportedTopologySha256: string,
  parents: readonly SupportTileParent[],
): PublishedSupportTileFactory {
  if (
    value.version !== 1 ||
    value.tileFeet !== 32 ||
    value.supportedTopologySha256 !== supportedTopologySha256 ||
    value.parents.length > 100_000 ||
    value.empty.length > 100_000 ||
    index.geometrySha256 !== value.topology.geometrySha256
  )
    throw new Error("Invalid published support tile binding");
  const original = new Map(parents.map((p) => [p.id, p])),
    rows = new Map<
      string,
      { parent: SupportTileParent; bounds: [bigint, bigint, bigint, bigint] }
    >(),
    empty = new Set(value.empty),
    remaining = new Set(index.ids());
  if (original.size !== parents.length || empty.size !== value.empty.length)
    throw new Error("Duplicate published support tile identity");
  let count = 0;
  for (const row of value.parents) {
    const parent = original.get(row.id),
      exact = parent && supportTileBounds(parent.parts);
    if (
      !parent ||
      !exact ||
      parent.z !== row.z ||
      !Number.isFinite(row.z) ||
      rows.has(row.id) ||
      !Array.isArray(row.bounds) ||
      row.bounds.length !== 4 ||
      row.bounds.some((v, i) => typeof v !== "string" || v !== String(exact[i]))
    )
      throw new Error(
        "Published support tile parent does not match its source",
      );
    rows.set(row.id, { parent, bounds: exact });
    for (let x = exact[0]; x <= exact[2]; x++)
      for (let y = exact[1]; y <= exact[3]; y++) {
        if (++count > 100_000)
          throw new Error("Published support tile inventory too large");
        const id = supportTileId(row.id, x, y),
          present = remaining.delete(id),
          absent = empty.delete(id);
        if (present === absent)
          throw new Error("Incomplete or ambiguous published support tiles");
      }
  }
  if (
    rows.size !== parents.filter((p) => p.parts.length).length ||
    empty.size > 0 ||
    remaining.size > 0
  )
    throw new Error("Published support tiles omit or add source geometry");
  return (selected, extra, z) => {
    const unique = new Set<string>(),
      selectedRows: {
        id: string;
        bounds: [bigint, bigint, bigint, bigint];
      }[] = [];
    for (const p of selected) {
      const admitted = rows.get(p.id)?.parent;
      if (
        !admitted ||
        admitted.parts !== p.parts ||
        admitted.z !== z ||
        p.z !== z ||
        unique.has(p.id)
      )
        return;
      unique.add(p.id);
      selectedRows.push({ id: p.id, bounds: rows.get(p.id)!.bounds });
    }
    if (selected.length === 0) return;
    // Copy only this refinement's original checked doorway halves. They remain
    // separate from the published source-cell geometry and retain all holes.
    const ownExtra = freezeNativeRationalParts(
      extra.map((part) =>
        part.map((ring) =>
          ring.map(([x, y]) => [
            new Rational(x.n, x.d),
            new Rational(y.n, y.d),
          ]),
        ),
      ),
    );
    return (tile, [x0, y0, x1, y1]) => {
      if ([x0, y0, x1, y1].some((v) => v % 16n) || x1 <= x0 || y1 <= y0) return;
      const pieces: NativeRationalParts = [];
      for (const p of selectedRows) {
        const { bounds: b } = p;
        const a = maximum(atomicCell(x0), b[0]),
          c = maximum(atomicCell(y0), b[1]),
          d = minimum(atomicCell(x1 - 1n), b[2]),
          e = minimum(atomicCell(y1 - 1n), b[3]);
        for (let x = a; x <= d; x++)
          for (let y = c; y <= e; y++)
            pieces.push(...(index.parts(supportTileId(p.id, x, y)) ?? []));
      }
      const half =
        ownExtra.length > 0
          ? nativeRationalOverlay(
              "intersection",
              tile,
              nativeRationalIntersectionOperand(tile, ownExtra),
            )
          : [];
      // 32ft atoms partition a32ft-aligned T. A16ft local-path query is
      // contained by the retrieved atoms and retains its original exact tile
      // intersection below. Do not return the larger atom as its authority.
      const combined = nativeRationalOverlay("union", pieces, half);
      return freezeNativeRationalParts(
        [x0, y0, x1, y1].every((v) => v % 32n === 0n)
          ? combined
          : nativeRationalOverlay(
              "intersection",
              tile,
              nativeRationalIntersectionOperand(tile, combined),
            ),
      );
    };
  };
}
