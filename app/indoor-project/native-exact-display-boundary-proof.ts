/** Render-only exact positive proof. Unknown/over-budget inputs return false;
 * callers must retain the original exact polygon checks as their fallback. */
import {
  createNativeExactTopologyIndex,
  nativeRationalPathSupported,
  type NativeExactPlanarTopology,
  type NativeExactPlanarBinding,
} from "./native-exact-planar-topology";
import {
  rational,
  type NativeRationalParts,
  type NativeRationalPoint,
} from "./native-rational-overlay";

type NumericParts = readonly (readonly (readonly (readonly number[])[])[])[];
type Limits = {
  edges: number;
  numericRingVertices: number;
  scalarCharacters: number;
  keyCharacters: number;
  holeEdgeChecks: number;
  milliseconds: number;
};
const defaults: Limits = {
  edges: 200000,
  numericRingVertices: 64,
  scalarCharacters: 4096,
  keyCharacters: 64 * 1024 * 1024,
  holeEdgeChecks: 8000000,
  milliseconds: 15000,
};
type H = [bigint, bigint, bigint];
const sign = (v: bigint) => (v < 0n ? -1 : v > 0n ? 1 : 0),
  abs = (v: bigint) => (v < 0n ? -v : v);
function gcd(a: bigint, b: bigint) {
  a = abs(a);
  b = abs(b);
  while (b) {
    const c = a % b;
    a = b;
    b = c;
  }
  return a;
}
const cmp = (a: { n: bigint; d: bigint }, b: { n: bigint; d: bigint }) =>
  sign(a.n * b.d - b.n * a.d);
const same = (a: NativeRationalPoint, b: NativeRationalPoint) =>
  cmp(a[0], b[0]) === 0 && cmp(a[1], b[1]) === 0;
const open = (ring: NativeRationalPoint[]) =>
  ring.length > 1 && same(ring[0], ring.at(-1)!) ? ring.slice(0, -1) : ring;

/** Original index validity checks ring simplicity and pairwise hole overlap,
 * but its vertex-only shell containment permits exterior hole chords through
 * boundary-contact vertices. Every complete hole edge is additionally checked
 * against its shell here, with the original exact segment-cut algorithm. Source
 * has exactly one part; residual parts may overlap before proof because each
 * is independently nonnegative. Chain equality then rules out positive overlap.
 * No serialized declaration or display certificate establishes these facts. */
export function createExactDisplayBoundaryProof(
  sourceTopology: NativeExactPlanarTopology,
  residualTopology: NativeExactPlanarTopology,
  binding: NativeExactPlanarBinding,
) {
  const sourceIndex = createNativeExactTopologyIndex(sourceTopology, binding),
    residualIndex = createNativeExactTopologyIndex(residualTopology, binding);
  const prove = (
    sourceId: string,
    numeric: NumericParts,
    overrides: Partial<Limits> = {},
  ) => {
    const limits = { ...defaults, ...overrides },
      started = performance.now(),
      stats = {
        edges: 0,
        numericPieces: 0,
        residualParts: 0,
        holeEdgeChecks: 0,
        keyCharacters: 0,
        remainingLineBuckets: 0,
        elapsedMs: 0,
      };
    const result = (proved: boolean, reason: string) => ({
      proved,
      reason,
      renderOnly: true as const,
      stats: { ...stats, elapsedMs: performance.now() - started },
    });
    const refuse = (reason: string): never => {
      throw Error(reason);
    };
    try {
      if (Object.values(limits).some((n) => !Number.isSafeInteger(n) || n <= 0))
        return result(false, "invalid-budget");
      const source = sourceIndex.parts(sourceId),
        residual = residualIndex.parts(sourceId + ":render-residual") ?? [];
      if (source?.length !== 1)
        return result(false, "source-must-have-one-positive-polygon-part");
      const homogeneous = new WeakMap<NativeRationalPoint, H>(),
        pointKey = (p: NativeRationalPoint) =>
          `${p[0].n}/${p[0].d},${p[1].n}/${p[1].d}`;
      const h = (p: NativeRationalPoint): H => {
        let saved = homogeneous.get(p);
        if (saved) return saved;
        if (
          p.some(
            (q) =>
              q.d <= 0n ||
              q.n.toString().length + q.d.toString().length >
                limits.scalarCharacters,
          )
        )
          refuse("scalar-budget");
        saved = [p[0].n * p[1].d, p[1].n * p[0].d, p[0].d * p[1].d];
        homogeneous.set(p, saved);
        return saved;
      };
      const turn = (
        a: NativeRationalPoint,
        b: NativeRationalPoint,
        c: NativeRationalPoint,
      ) => {
        const [ax, ay, aw] = h(a),
          [bx, by, bw] = h(b),
          [cx, cy, cw] = h(c);
        return sign(
          ax * (by * cw - bw * cy) -
            ay * (bx * cw - bw * cx) +
            aw * (bx * cy - by * cx),
        );
      };
      const orientation = (ring: NativeRationalPoint[]) => {
        let at = 0;
        for (let i = 1; i < ring.length; i++)
          if (
            cmp(ring[i][0], ring[at][0]) < 0 ||
            (cmp(ring[i][0], ring[at][0]) === 0 &&
              cmp(ring[i][1], ring[at][1]) < 0)
          )
            at = i;
        for (let d = 1; d < ring.length; d++) {
          const v = turn(
            ring[(at - d + ring.length) % ring.length],
            ring[at],
            ring[(at + d) % ring.length],
          );
          if (v) return v;
        }
        return 0;
      };
      const checkTime = () => {
        if (performance.now() - started > limits.milliseconds)
          refuse("time-budget");
      };
      const positiveParts = (parts: NativeRationalParts) => {
        for (const part of parts) {
          for (const ring of part) for (const p of ring) h(p);
          const shell = open(part[0]);
          for (const input of part.slice(1)) {
            const hole = open(input);
            stats.holeEdgeChecks += shell.length * hole.length;
            if (stats.holeEdgeChecks > limits.holeEdgeChecks)
              refuse("hole-containment-budget");
            checkTime();
            // This fresh, unfrozen wrapper deliberately avoids localExactParts'
            // optional tile overlay. The original finite exact segment cuts apply.
            if (!nativeRationalPathSupported([...hole, hole[0]], [[shell]]))
              refuse("hole-edge-leaves-shell");
          }
        }
      };
      positiveParts(source);
      positiveParts(residual);
      stats.residualParts = residual.length;
      const chains = new Map<string, Map<string, number>>();
      const addRing = (
        input: NativeRationalPoint[],
        weight: number,
        hole: boolean,
      ) => {
        const ring = open(input),
          direction = orientation(ring);
        if (!direction) refuse("zero-area-ring");
        const windingFactor = direction === (hole ? -1 : 1) ? 1 : -1;
        for (let i = 0; i < ring.length; i++) {
          if (++stats.edges > limits.edges) refuse("edge-budget");
          if ((stats.edges & 127) === 0) checkTime();
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          if (same(a, b)) refuse("duplicate-edge");
          const [ax, ay, aw] = h(a),
            [bx, by, bw] = h(b);
          let A = ay * bw - aw * by,
            B = aw * bx - ax * bw,
            C = ax * by - ay * bx;
          const divisor = gcd(gcd(A, B), C);
          if (!divisor) refuse("zero-line");
          A /= divisor;
          B /= divisor;
          C /= divisor;
          if (A < 0n || (A === 0n && B < 0n)) {
            A = -A;
            B = -B;
            C = -C;
          }
          const key = `${A},${B},${C}`;
          stats.keyCharacters += key.length;
          if (stats.keyCharacters > limits.keyCharacters)
            refuse("line-key-budget");
          const axis = B === 0n ? 1 : 0,
            qa = a[axis],
            qb = b[axis],
            ascending = cmp(qa, qb) < 0,
            lo = ascending ? qa : qb,
            hi = ascending ? qb : qa,
            coefficient = weight * windingFactor * (ascending ? 1 : -1);
          const events = chains.get(key) ?? new Map<string, number>();
          const put = (q: typeof qa, delta: number) => {
            const parameter = `${q.n}/${q.d}`,
              value = (events.get(parameter) ?? 0) + delta;
            if (!Number.isSafeInteger(value)) refuse("multiplicity-budget");
            if (value) events.set(parameter, value);
            else events.delete(parameter);
          };
          put(lo, coefficient);
          put(hi, -coefficient);
          if (events.size) chains.set(key, events);
          else chains.delete(key);
        }
      };
      // Positive part winding is outer CCW, holes CW, regardless of serialized
      // ring orientation. Input piece validity is a separate condition.
      for (const part of source)
        for (const [index, ring] of part.entries())
          addRing(ring, -1, index > 0);
      for (const part of residual)
        for (const [index, ring] of part.entries()) addRing(ring, 1, index > 0);
      if (!Array.isArray(numeric)) refuse("invalid-numeric-parts");
      for (const part of numeric) {
        if (
          !Array.isArray(part) ||
          part.length !== 1 ||
          !Array.isArray(part[0]) ||
          part[0].length > limits.numericRingVertices + 1
        )
          refuse("numeric-not-bounded-hole-free-ring");
        const converted = part[0].map((point: readonly number[]) => {
            if (
              !Array.isArray(point) ||
              point.length !== 2 ||
              point.some((n) => !Number.isFinite(n) || Math.abs(n) >= 1e7)
            )
              refuse("invalid-numeric-point");
            return [
              rational(point[0]),
              rational(point[1]),
            ] as NativeRationalPoint;
          }),
          ring = open(converted);
        if (
          ring.length < 3 ||
          ring.length > limits.numericRingVertices ||
          new Set(ring.map(pointKey)).size !== ring.length
        )
          refuse("invalid-numeric-ring");
        const direction = orientation(ring);
        if (!direction) refuse("zero-area-numeric-ring");
        // Same-turn checks alone accept a pentagram. Every other vertex must
        // lie on the same interior side of EVERY directed edge instead.
        for (let i = 0; i < ring.length; i++)
          for (const p of ring)
            if (turn(ring[i], ring[(i + 1) % ring.length], p) * direction < 0)
              refuse("numeric-ring-not-convex-simple");
        addRing(ring, 1, false);
        stats.numericPieces++;
      }
      stats.remainingLineBuckets = chains.size;
      checkTime();
      return result(
        chains.size === 0,
        chains.size ? "boundary-chains-differ" : "exact-positive-partition",
      );
    } catch (error) {
      return result(
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  };
  // These are the original independently validated frozen indices. The caller
  // retains its existing metadata/anchor/binding checks without validating
  // the same topologies twice or trusting a serialized validity flag.
  return Object.freeze(Object.assign(prove, { sourceIndex, residualIndex }));
}
