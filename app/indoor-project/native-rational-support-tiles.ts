import {
  Rational,
  rational,
  nativeRationalOverlay,
  type NativeRationalOverlayInput,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { freezeNativeRationalParts } from "./native-exact-planar-topology";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";

const compare = (a: Rational, b: Rational): number => {
  const delta = a.n * b.d - b.n * a.d;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
};
const TILE_FEET = 32n;
export type NativeSupportTileProvider = (
  tile: NativeRationalParts,
  boundsFeet: readonly [bigint, bigint, bigint, bigint],
) => NativeRationalParts | undefined;
// BigInt division truncates toward zero. Negative physical coordinates need
// mathematical floor, and every generated rational bit must affect the cell.
const cell = (q: Rational): bigint => {
  const denominator = q.d * TILE_FEET,
    quotient = q.n / denominator;
  return q.n < 0n && q.n % denominator ? quotient - 1n : quotient;
};
function snapshot(input: NativeRationalOverlayInput): NativeRationalParts {
  return freezeNativeRationalParts(
    input.map((part) =>
      part.map((ring) =>
        ring.map(([x, y]) => {
          const a = rational(x),
            b = rational(y);
          // Copy rather than freeze caller-owned rational coordinates.
          return [
            new Rational(a.n, a.d, a.original),
            new Rational(b.n, b.d, b.original),
          ];
        }),
      ),
    ),
  );
}

/** One immutable calculation and physical level must own each query. Source
 * floor and envelope polygons are copied exactly, without unioning adjacent
 * slabs or changing their holes. The final intersection is the original half
 * intersected with its cached tile support: H ∩ ((T ∩ F) ∩ E) = (H ∩ F) ∩ E,
 * because the rectangle T contains every original rational coordinate of H.
 * Door ownership, host/mask checks and access guards remain the caller's job.
 */
export function createNativeRationalSupportTileQuery(
  floors: NativeRationalOverlayInput,
  envelopes?: NativeRationalOverlayInput,
  prepared?: NativeSupportTileProvider,
) {
  const floorSource = snapshot(floors),
    envelopeSource = envelopes === undefined ? undefined : snapshot(envelopes),
    tiles = new Map<string, NativeRationalParts | undefined>();
  return (half: NativeRationalOverlayInput): NativeRationalParts => {
    const points = half.flatMap((part) => part[0] ?? []);
    if (points.length === 0) return [];
    let minX = rational(points[0][0]),
      maxX = minX,
      minY = rational(points[0][1]),
      maxY = minY;
    for (const [x, y] of points) {
      const a = rational(x),
        b = rational(y);
      if (compare(a, minX) < 0) minX = a;
      if (compare(a, maxX) > 0) maxX = a;
      if (compare(b, minY) < 0) minY = b;
      if (compare(b, maxY) > 0) maxY = b;
    }
    const x0 = cell(minX) * TILE_FEET,
      y0 = cell(minY) * TILE_FEET,
      x1 = (cell(maxX) + 1n) * TILE_FEET,
      y1 = (cell(maxY) + 1n) * TILE_FEET,
      key = `${x0},${y0},${x1},${y1}`;
    // Eviction only repeats the same exact computation. Keep one calculation's
    // support memory bounded even when a very large level visits many tiles.
    if (tiles.size >= 256 && !tiles.has(key))
      tiles.delete(tiles.keys().next().value!);
    const direct = () => {
      const supported = nativeRationalOverlay(
        "intersection",
        half,
        nativeRationalIntersectionOperand(half, floorSource),
      );
      return envelopeSource
        ? nativeRationalOverlay(
            "intersection",
            supported,
            nativeRationalIntersectionOperand(supported, envelopeSource),
          )
        : supported;
    };
    try {
      let support = tiles.get(key);
      if (!tiles.has(key)) {
        const tile: NativeRationalParts = [
          [
            [
              [new Rational(x0), new Rational(y0)],
              [new Rational(x1), new Rational(y0)],
              [new Rational(x1), new Rational(y1)],
              [new Rational(x0), new Rational(y1)],
            ],
          ],
        ];
        // A publisher may supply this exact intermediate geometry. Missing
        // entries retain the ordinary kernel; [] is a present empty result.
        support =
          (envelopeSource ? undefined : prepared?.(tile, [x0, y0, x1, y1])) ??
          nativeRationalOverlay(
            "intersection",
            tile,
            nativeRationalIntersectionOperand(tile, floorSource),
          );
        support = freezeNativeRationalParts(
          envelopeSource
            ? nativeRationalOverlay(
                "intersection",
                support,
                nativeRationalIntersectionOperand(support, envelopeSource),
              )
            : support,
        );
        tiles.set(key, support);
      }
      if (support !== undefined)
        return nativeRationalOverlay(
          "intersection",
          half,
          nativeRationalIntersectionOperand(half, support),
        );
    } catch {
      // A larger tile can expose a sweep failure absent from the original
      // finite half. Retry that unchanged exact operation and remember the
      // failed optimization locally; its normal rejection policy is retained.
      tiles.set(key, undefined);
    }
    return direct();
  };
}
