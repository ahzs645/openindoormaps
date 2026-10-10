import * as DMath from "./deterministic-math";
import type { IndoorDataset, IndoorEdge } from "./contract";
type XY = [number, number];
type XYZ = [number, number, number];
export type OpeningSpan = {
  version: 1;
  sourceModelSha256: string;
  levelId: number;
  pointsFeet: [XYZ, XYZ];
  apertureFeet: XY[];
  nativeFloorElementIds: number[];
  walkingStripWidthFeet: number;
};
export type SpanCrossing = { point: XY; index: number; forward: boolean };

/** A span is a source-derived finite aperture, never an inferred free doorway. */
export function validatedOpeningSpan(
  data: IndoorDataset,
  edge: IndoorEdge,
): OpeningSpan | undefined {
  const span = (edge as IndoorEdge & { openingSpan?: OpeningSpan }).openingSpan;
  if (
    !span ||
    edge.kind !== "opening" ||
    span.version !== 1 ||
    span.sourceModelSha256 !== data.source.modelSha256 ||
    !data.walkingSupport ||
    data.walkingSupport.sourceModelSha256 !== span.sourceModelSha256
  )
    return;
  if (
    !Array.isArray(span.pointsFeet) ||
    span.pointsFeet.length !== 2 ||
    !span.pointsFeet.every((p) => p.length === 3 && p.every(Number.isFinite)) ||
    !Array.isArray(span.apertureFeet) ||
    span.apertureFeet.length !== 4 ||
    !span.apertureFeet.every(
      (p) => p.length === 2 && p.every(Number.isFinite),
    ) ||
    !Number.isFinite(span.walkingStripWidthFeet) ||
    span.walkingStripWidthFeet < 2
  )
    return;
  const [a, b] = span.pointsFeet;
  if (
    DMath.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6 ||
    Math.abs(a[2] - b[2]) > 0.01
  )
    return;
  const delta = [
    edge.pointsFeet.at(-1)![0] - edge.pointsFeet[0][0],
    edge.pointsFeet.at(-1)![1] - edge.pointsFeet[0][1],
  ];
  if (Math.abs(delta[0] * (a[1] - b[1]) + delta[1] * (b[0] - a[0])) < 1e-8)
    return;
  const nodes = [edge.from, edge.to].map((id) =>
    data.nodes.find((n) => n.id === id),
  );
  if (
    nodes.some(
      (n) =>
        !n ||
        n.levelId !== span.levelId ||
        Math.abs(n.pointFeet[2] - a[2]) > 0.01,
    )
  )
    return;
  if (
    !Array.isArray(span.nativeFloorElementIds) ||
    span.nativeFloorElementIds.length === 0 ||
    !span.nativeFloorElementIds.every(
      (id) =>
        Number.isInteger(id) &&
        id > 0 &&
        data.walkingSupport!.floors.some(
          (f) =>
            f.nativeElementId === id && Math.abs(f.elevationFeet - a[2]) < 0.05,
        ),
    )
  )
    return;
  return span;
}

export function openingSpanFrame(edge: IndoorEdge, span: OpeningSpan) {
  const [a, b] = span.pointsFeet,
    length = DMath.hypot(b[0] - a[0], b[1] - a[1]);
  const u: XY = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  let n: XY = [-u[1], u[0]];
  const first = edge.pointsFeet[0],
    last = edge.pointsFeet.at(-1)!;
  if ((last[0] - first[0]) * n[0] + (last[1] - first[1]) * n[1] < 0)
    n = [-n[0], -n[1]];
  const side = (p: readonly number[]) =>
    (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1];
  const tangent = (p: readonly number[]) =>
    (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
  return { a, b, u, n, length, side, tangent };
}

export function openingSpanCrossings(
  edge: IndoorEdge,
  span: OpeningSpan,
  points: readonly (readonly number[])[],
): SpanCrossing[] {
  const f = openingSpanFrame(edge, span),
    out: SpanCrossing[] = [];
  let prior = -1;
  for (let i = 0; i < points.length; i++) {
    const s = f.side(points[i]);
    if (Math.abs(s) < 1e-8) continue;
    if (prior >= 0) {
      const before = f.side(points[prior]);
      if (before * s < 0) {
        const a = points[prior],
          b = points[i],
          t = before / (before - s);
        const p: XY =
          i === prior + 1
            ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
            : [points[i - 1][0], points[i - 1][1]];
        const lateral = f.tangent(p);
        if (lateral >= -1e-7 && lateral <= f.length + 1e-7)
          out.push({ point: p, index: i - 1, forward: before < 0 });
      }
    }
    prior = i;
  }
  return out;
}

/** Offer alternate centers only inside the exact finite source span. Native
 * geometry and per-angle body proof still decide whether a candidate is usable. */
export function openingSpanCandidates(
  edge: IndoorEdge,
  span: OpeningSpan,
  points: XY[],
): XY[][] {
  const f = openingSpanFrame(edge, span),
    crossings = openingSpanCrossings(edge, span, points);
  // The old sample can lie outside a newly proved, safer center range. Locate
  // its crossing of the same native plane before testing permitted centers.
  if (crossings.length === 0)
    for (let i = 1; i < points.length; i++) {
      const a = f.side(points[i - 1]),
        b = f.side(points[i]);
      if (a * b < 0) {
        const t = a / (a - b),
          p: XY = [
            points[i - 1][0] + t * (points[i][0] - points[i - 1][0]),
            points[i - 1][1] + t * (points[i][1] - points[i - 1][1]),
          ];
        if (
          f.tangent(p) > -span.walkingStripWidthFeet * 2 &&
          f.tangent(p) < f.length + span.walkingStripWidthFeet * 2
        )
          crossings.push({ point: p, index: i - 1, forward: a < 0 });
      }
    }
  const out: XY[][] = [];
  for (const c of crossings)
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      let left = c.index,
        right = c.index + 1;
      while (
        left > 0 &&
        Math.abs(f.side(points[left])) < span.walkingStripWidthFeet &&
        Math.abs(f.tangent(points[left]) - f.tangent(c.point)) <
          f.length + span.walkingStripWidthFeet
      )
        left--;
      while (
        right < points.length - 1 &&
        Math.abs(f.side(points[right])) < span.walkingStripWidthFeet &&
        Math.abs(f.tangent(points[right]) - f.tangent(c.point)) <
          f.length + span.walkingStripWidthFeet
      )
        right++;
      out.push([
        ...points.slice(0, left + 1),
        [f.a[0] + t * (f.b[0] - f.a[0]), f.a[1] + t * (f.b[1] - f.a[1])],
        ...points.slice(right),
      ]);
      // A finite normal band can support a crossing without supporting every
      // oblique approach. Offer a normal entry/exit too; all added segments and
      // their local body strips still require independent native clearance.
      const center: XY = [
        f.a[0] + t * (f.b[0] - f.a[0]),
        f.a[1] + t * (f.b[1] - f.a[1]),
      ];
      const depth =
        Math.max(...span.apertureFeet.map((p) => Math.abs(f.side(p)))) +
        span.walkingStripWidthFeet;
      const sign = c.forward ? -1 : 1;
      out.push([
        ...points.slice(0, left + 1),
        [center[0] + sign * f.n[0] * depth, center[1] + sign * f.n[1] * depth],
        [center[0] - sign * f.n[0] * depth, center[1] - sign * f.n[1] * depth],
        ...points.slice(right),
      ]);
    }
  return out;
}
