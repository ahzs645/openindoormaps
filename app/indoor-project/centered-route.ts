import { nativeJointBarriers } from "./native-joint-barriers";
import { createRingPointQuery } from "./ring-point-query";
import {
  nativeCirculationCells,
  nativeCirculationSurfaces,
} from "./native-circulation";
import type { IndoorDataset, IndoorEdge } from "./contract";
import { createDoorPassageQuery } from "./route-passages";
import { routeLanes } from "./route-lanes";
import { curvedCorridorPath } from "./curved-route";
import polygonClipping from "polygon-clipping";
import type { MultiPolygon } from "polygon-clipping";
import {
  routingDoorApertures,
  validatedSourceDoorProof,
} from "./routing-apertures";
import {
  validatedOpeningSpan,
  openingSpanCandidates,
  openingSpanCrossings,
  openingSpanFrame,
  type OpeningSpan,
  type SpanCrossing,
} from "./opening-span";

type XY = [number, number];
type XYZ = [number, number, number];
type Rings = XY[][];
type WalkableArea = {
  boundaries: Rings[];
  contains: (point: XY) => boolean;
  boundaryRings?: (bounds: number[]) => XY[][];
};
export type RoutePath = {
  edgeIds: string[];
  levelIds: number[];
  pointsFeet: XYZ[];
  centered: boolean;
  /** Continuous centreline support from exact model-bound native slab profiles. */
  nativeFloorSupported?: boolean;
  /** The circulation part of this path used prepared native walking cells. */
  nativeCirculationUsed?: boolean;
  /** Only the finite opening crossing and its local full-width approach. */
  openingSpanSupported?: boolean;
  shape?: "centered" | "orthogonal" | "curved";
  /** Bend ranges in resolved coordinates; curve facets are not individual turns. */
  curveRanges?: { start: number; end: number }[];
  sourceReason?:
    | "vertical-transition"
    | "centering-disabled"
    | "missing-native-geometry"
    | "nonplanar"
    | "room-interior"
    | "stair-landing"
    | "missing-native-aperture"
    | "unsupported-anchor"
    | "no-clearance-route"
    | "validated-source"
    | "native-door"
    | "source-door"
    | "doorway-policy"
    | "centering-error"
    | "source-opening"
    | "stale-floor-support";
};
const box = (rings: Rings) => {
  const points = rings.flat();
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
};
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const length = (points: readonly number[][]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
      0,
    );
let ringBounds = new WeakMap<XY[], number[]>();
let ringQueries = new WeakMap<XY[], ReturnType<typeof createRingPointQuery>>();
function boundsOfRing(ring: XY[]) {
  let bounds = ringBounds.get(ring);
  if (!bounds) {
    bounds = box([ring]);
    ringBounds.set(ring, bounds);
  }
  return bounds;
}
/** Coarse bins discard irrelevant polygons; every surviving point/segment
 * still uses the exact rings. Long envelopes use an overflow list. */
function geometryIndex<T>(items: T[], boundsOf: (item: T) => number[]) {
  const entries = items.map((item, order) => ({
    item,
    order,
    bounds: boundsOf(item),
  }));
  const bins = new Map<string, typeof entries>(),
    overflow: typeof entries = [];
  const size = 32;
  const extent = (bounds: number[]) => bounds.map((n) => Math.floor(n / size));
  for (const entry of entries) {
    const [x0, y0, x1, y1] = extent(entry.bounds);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) {
      overflow.push(entry);
      continue;
    }
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const key = `${x}:${y}`,
          bucket = bins.get(key) ?? [];
        bucket.push(entry);
        bins.set(key, bucket);
      }
  }
  return (bounds: number[]): T[] => {
    const [x0, y0, x1, y1] = extent(bounds);
    const candidates = new Set(overflow);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256)
      return entries
        .filter((e) => overlaps(e.bounds, bounds))
        .map((e) => e.item);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (const entry of bins.get(`${x}:${y}`) ?? []) candidates.add(entry);
    return [...candidates]
      .filter((e) => overlaps(e.bounds, bounds))
      .sort((a, b) => a.order - b.order)
      .map((e) => e.item);
  };
}
function indexedContains(parts: Rings[]) {
  const query = geometryIndex(parts, box);
  return (p: XY) =>
    inside(p, query([p[0] - 1e-8, p[1] - 1e-8, p[0] + 1e-8, p[1] + 1e-8]));
}
function insideRing(p: XY, ring: XY[]) {
  const bounds = boundsOfRing(ring);
  if (
    p[0] < bounds[0] - 1e-8 ||
    p[0] > bounds[2] + 1e-8 ||
    p[1] < bounds[1] - 1e-8 ||
    p[1] > bounds[3] + 1e-8
  )
    return false;
  let query = ringQueries.get(ring);
  if (!query) {
    query = createRingPointQuery(ring);
    ringQueries.set(ring, query);
  }
  return query(p);
}
const inside = (point: XY, parts: Rings[]) =>
  parts.some(
    (rings) =>
      insideRing(point, rings[0]) &&
      !rings.slice(1).some((ring) => insideRing(point, ring)),
  );
/** Split the whole segment at polygon boundaries. Midpoints then test every
 * continuous interval, including masks/columns much narrower than the raster. */
function breaks(
  a: XY,
  b: XY,
  parts: Rings[],
  query?: WalkableArea["boundaryRings"],
) {
  const values = [0, 1],
    dx = b[0] - a[0],
    dy = b[1] - a[1];
  const segmentBounds = [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
  ];
  for (const ring of query ? query(segmentBounds) : parts.flat()) {
    if (!overlaps(segmentBounds, boundsOfRing(ring))) continue;
    for (let i = 0; i < ring.length; i++) {
      const u = ring[i],
        v = ring[(i + 1) % ring.length],
        ex = v[0] - u[0],
        ey = v[1] - u[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-10) continue;
      const ox = u[0] - a[0],
        oy = u[1] - a[1],
        t = (ox * ey - oy * ex) / den,
        k = (ox * dy - oy * dx) / den;
      if (t > 0 && t < 1 && k >= 0 && k <= 1) values.push(t);
    }
  }
  return [...new Set(values)].sort((x, y) => x - y);
}
const interpolate = (a: XY, b: XY, t: number): XY => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const validSegment = (a: XY, b: XY, area: WalkableArea) => {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-7) return area.contains(a);
  const ts = breaks(a, b, area.boundaries, area.boundaryRings);
  return (
    ts.every((t) => area.contains(interpolate(a, b, t))) &&
    ts
      .slice(1)
      .every(
        (t, i) =>
          t - ts[i] < 1e-9 || area.contains(interpolate(a, b, (t + ts[i]) / 2)),
      )
  );
};

const polygonArea = (polys: MultiPolygon) =>
  polys.reduce(
    (total, poly) =>
      total +
      poly.reduce(
        (sum, ring, i) =>
          sum +
          (i ? -1 : 1) *
            Math.abs(
              ring.reduce(
                (s, p, j) =>
                  s +
                  p[0] * ring[(j + 1) % ring.length][1] -
                  p[1] * ring[(j + 1) % ring.length][0],
                0,
              ) / 2,
            ),
        0,
      ),
    0,
  );
function crossingStrip(
  points: XY[],
  crossing: SpanCrossing,
  width: number,
): MultiPolygon {
  const walk = (indices: number[]) => {
    const out: XY[] = [crossing.point];
    let remaining = width;
    for (const i of indices) {
      const a = out.at(-1)!,
        b = points[i],
        d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 1e-8) continue;
      if (d >= remaining) {
        out.push([
          a[0] + ((b[0] - a[0]) * remaining) / d,
          a[1] + ((b[1] - a[1]) * remaining) / d,
        ]);
        break;
      }
      out.push(b);
      remaining -= d;
    }
    return out;
  };
  const before = walk(
    Array.from({ length: crossing.index + 1 }, (_, i) => crossing.index - i),
  ).reverse();
  const after = walk(
    Array.from(
      { length: points.length - crossing.index - 1 },
      (_, i) => crossing.index + 1 + i,
    ),
  );
  const local = [...before, ...after.slice(1)],
    strips: MultiPolygon = [];
  for (let i = 1; i < local.length; i++) {
    const a = local[i - 1],
      b = local[i],
      d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d < 1e-8) continue;
    const n: XY = [
      (-(b[1] - a[1]) * width) / (2 * d),
      ((b[0] - a[0]) * width) / (2 * d),
    ];
    strips.push([
      [
        [a[0] + n[0], a[1] + n[1]],
        [b[0] + n[0], b[1] + n[1]],
        [b[0] - n[0], b[1] - n[1]],
        [a[0] - n[0], a[1] - n[1]],
      ],
    ]);
  }
  return strips.length > 0 ? polygonClipping.union(strips) : [];
}
function axes(walls: Rings[]) {
  const directions: { angle: number; weight: number }[] = [];
  for (const rings of walls)
    for (const ring of rings)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          weight = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (weight < 3) continue;
        directions.push({
          angle:
            ((Math.atan2(b[1] - a[1], b[0] - a[0]) % (Math.PI / 2)) +
              Math.PI / 2) %
            (Math.PI / 2),
          weight,
        });
      }
  const candidates = Array.from({ length: 30 }, (_, i) => (i * Math.PI) / 60)
    .map((angle) => {
      const nearby = directions.filter(
        (d) =>
          Math.abs(Math.sin(2 * (d.angle - angle))) < Math.sin(Math.PI / 15),
      );
      const weight = nearby.reduce((sum, d) => sum + d.weight, 0);
      const x = nearby.reduce(
        (sum, d) => sum + d.weight * Math.cos(4 * d.angle),
        0,
      );
      const y = nearby.reduce(
        (sum, d) => sum + d.weight * Math.sin(4 * d.angle),
        0,
      );
      return { angle: Math.atan2(y, x) / 4, weight };
    })
    .sort((a, b) => b.weight - a.weight);
  const result: number[] = [];
  for (const candidate of candidates)
    if (
      candidate.weight > 0 &&
      result.every((a) => Math.abs(Math.sin(2 * (a - candidate.angle))) > 0.1)
    ) {
      result.push(candidate.angle);
      if (result.length === 3) break;
    }
  return result;
}
function center(
  point: XY,
  axis: XY,
  area: WalkableArea,
  span: number,
): { point: XY; width: number } | null {
  const a: XY = [point[0] - axis[0] * span, point[1] - axis[1] * span],
    b: XY = [point[0] + axis[0] * span, point[1] + axis[1] * span];
  const ts = breaks(a, b, area.boundaries, area.boundaryRings),
    intervals: [number, number][] = [];
  for (let i = 1; i < ts.length; i++) {
    if (
      ts[i] - ts[i - 1] < 1e-9 ||
      !area.contains(interpolate(a, b, (ts[i - 1] + ts[i]) / 2))
    )
      continue;
    const previous = intervals.at(-1);
    if (previous && Math.abs(previous[1] - ts[i - 1]) < 1e-9)
      previous[1] = ts[i];
    else intervals.push([ts[i - 1], ts[i]]);
  }
  for (const [lo, hi] of intervals)
    if (lo <= 0.5 && hi >= 0.5)
      return {
        point: interpolate(a, b, (lo + hi) / 2),
        width: (hi - lo) * 2 * span,
      };
  return null;
}
const inFrame = (p: XY, u: XY, v: XY): XY => [
  p[0] * u[0] + p[1] * u[1],
  p[0] * v[0] + p[1] * v[1],
];
const fromFrame = (p: XY, u: XY, v: XY): XY => [
  p[0] * u[0] + p[1] * v[0],
  p[0] * u[1] + p[1] * v[1],
];
function centeredPoint(
  p: XY,
  u: XY,
  v: XY,
  area: WalkableArea,
  span: number,
): XY {
  // The shorter cross-section gives the corridor width. Wide plazas retain
  // their arrival point rather than inventing a corridor centreline.
  const options = [center(p, u, area, span), center(p, v, area, span)]
    .filter(
      (c): c is NonNullable<typeof c> => !!c && c.width >= 1 && c.width <= 24,
    )
    .sort((a, b) => a.width - b.width);
  return options[0]?.point ?? p;
}

function multiTurn(
  source: XYZ[],
  a: XY,
  b: XY,
  u: XY,
  v: XY,
  area: WalkableArea,
  span: number,
  budget: number,
): XY[] | null {
  const al = inFrame(a, u, v),
    bl = inFrame(b, u, v);
  const xs = [al[0], bl[0]],
    ys = [al[1], bl[1]];
  const spacing = Math.max(3, length(source) / 96);
  for (let i = 1; i < source.length; i++) {
    const first: XY = [source[i - 1][0], source[i - 1][1]],
      last: XY = [source[i][0], source[i][1]],
      steps = Math.max(1, Math.ceil(length([first, last]) / spacing));
    for (let j = 0; j <= steps; j++) {
      const p = interpolate(first, last, j / steps);
      const cross = [center(p, u, area, span), center(p, v, area, span)];
      const axis =
        cross[0] && (!cross[1] || cross[0].width < cross[1].width) ? 0 : 1;
      const section = cross[axis];
      if (section && section.width >= 1 && section.width <= 24) {
        const local = inFrame(section.point, u, v);
        (axis === 0 ? xs : ys).push(local[axis]);
      } else if (j === 0 || j === steps) {
        // Open plazas have no narrow corridor axis; retain source guide lanes.
        const local = inFrame(p, u, v);
        xs.push(local[0]);
        ys.push(local[1]);
      }
    }
  }
  const lanes = (values: number[], fixed: number[]) => {
    const result = [...new Set(fixed)];
    for (const value of values.sort((x, y) => x - y))
      if (result.every((p) => Math.abs(p - value) > 0.05)) result.push(value);
    return result.sort((x, y) => x - y);
  };
  const path = routeLanes(
    lanes(xs, [al[0], bl[0]]),
    lanes(ys, [al[1], bl[1]]),
    al,
    bl,
    (first, last) =>
      validSegment(fromFrame(first, u, v), fromFrame(last, u, v), area),
    budget,
  );
  return path?.map((p) => fromFrame(p, u, v)) ?? null;
}

/** A verified door can span the small gap between recovered room boundaries.
 * Extend only to its approved graph anchors, retaining its native clear width.
 * This joins room coverage; native wall cuts still use the original footprint. */
function doorCoverage(footprint: XY[], edge: IndoorEdge, normal?: XY): Rings {
  if (footprint.length !== 4) return [footprint];
  let longest = 0,
    axis: XY = [1, 0];
  footprint.forEach((a, i) => {
    const b = footprint[(i + 1) % footprint.length],
      d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > longest) {
      longest = d;
      axis = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
    }
  });
  if (normal) axis = [-normal[1], normal[0]];
  const u = footprint.map((p) => p[0] * axis[0] + p[1] * axis[1]);
  const v = [...footprint, ...edge.pointsFeet].map(
    (p) => -p[0] * axis[1] + p[1] * axis[0],
  );
  const lo = Math.min(...u),
    hi = Math.max(...u),
    bottom = Math.min(...v),
    top = Math.max(...v);
  return [
    [
      [lo, bottom],
      [hi, bottom],
      [hi, top],
      [lo, top],
    ].map(
      ([x, y]) => [x * axis[0] - y * axis[1], x * axis[1] + y * axis[0]] as XY,
    ),
  ];
}

/** A recovered seam between two semantic corridor records is not a doorway
 * when a current native cell proves continuous floor through both anchors.
 * Real doors, access changes, directed openings and disconnected cells retain
 * their finite thresholds. The graph edge and its access metadata stay intact. */
function nativeCellSeam(data: IndoorDataset, edge: IndoorEdge): boolean {
  if (
    edge.kind !== "opening" ||
    !edge.enabled ||
    !edge.id.startsWith("opening:recovered-circulation-seam:") ||
    (edge.direction && edge.direction !== "both") ||
    !validatedOpeningSpan(data, edge) ||
    edge.roomKeys.length !== 2
  )
    return false;
  const owners = edge.roomKeys.map((key) =>
    data.records.find((r) => r.key === key),
  );
  if (
    owners.some(
      (r) => !r?.circulation || !r.walkable || r.access === "staff",
    ) ||
    owners[0]!.access !== owners[1]!.access
  )
    return false;
  return nativeCirculationCells(data).some(
    (cell) =>
      edge.roomKeys.every((key) => cell.roomKeys.includes(key)) &&
      owners.every((r) => cell.levelIds.includes(r!.levelId)) &&
      edge.pointsFeet.every(
        (p) => Math.abs(p[2] - cell.elevationFeet) < 0.01,
      ) &&
      edge.pointsFeet.slice(1).every((p, i) => {
        const a: XY = [edge.pointsFeet[i][0], edge.pointsFeet[i][1]],
          b: XY = [p[0], p[1]];
        const ts = breaks(a, b, [cell.ringsFeet]);
        return (
          inside(a, [cell.ringsFeet]) &&
          inside(b, [cell.ringsFeet]) &&
          ts
            .slice(1)
            .every((t, j) =>
              inside(interpolate(a, b, (t + ts[j]) / 2), [cell.ringsFeet]),
            )
        );
      }),
  );
}

function refine(
  data: IndoorDataset,
  path: RoutePath,
  edges: IndoorEdge[],
  firstId: string,
  lastId: string,
  passageQuery: ReturnType<typeof createDoorPassageQuery>,
  portalEdges: IndoorEdge[] = [],
): RoutePath {
  // Accessibility confirmations apply to the saved edge geometry. The caller
  // preserves that geometry for the confirmed step-free profile.
  const source = (reason: RoutePath["sourceReason"]): RoutePath => ({
    ...path,
    sourceReason: reason,
  });
  if (
    path.levelIds.length !== 1 ||
    edges.some((e) =>
      ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
        e.kind,
      ),
    )
  )
    return source("vertical-transition");
  if (
    path.pointsFeet.some((p) => Math.abs(p[2] - path.pointsFeet[0][2]) >= 0.01)
  )
    return source("nonplanar");
  if (edges.some((e) => validatedSourceDoorProof(data, e)))
    return source("source-door");
  // A recovered doorless opening keeps its proven threshold anchors. Walking
  // legs on either side can centre without moving that source connection.
  const openingEdges = edges.filter(
    (e) => e.kind === "opening" && !nativeCellSeam(data, e),
  );
  const openingSpans = openingEdges.map((edge) => ({
    edge,
    span: validatedOpeningSpan(data, edge),
  }));
  if (openingSpans.some(({ span }) => !span)) return source("source-opening");
  if (!data.doors || data.walls.some((w) => w.kind === undefined))
    return source("missing-native-geometry");
  const levelId = path.levelIds[0],
    keys = new Set(edges.flatMap((e) => e.roomKeys));
  const records = data.records.filter(
    (r) => r.levelId === levelId && keys.has(r.key),
  );
  if (records.length === 0) return source("missing-native-geometry");
  if (!records.some((r) => r.circulation) && records.some((r) => r.stair))
    return source("stair-landing");
  const nativeSurfaces = nativeCirculationSurfaces(data, records);
  const bounds = box(nativeSurfaces.rings.flat());
  const walls = [...data.walls, ...nativeJointBarriers(data, levelId)].filter(
    (w) => w.levelId === levelId && overlaps(bounds, box(w.ringsFeet)),
  );
  const apertureEdges = new Map(
    [...edges, ...portalEdges].map((e) => [e.id, e]),
  );
  const selectedDoors = routingDoorApertures(data).filter((d) => {
    if (d.levelId !== levelId || d.state !== "connected" || !d.footprintFeet)
      return false;
    if (apertureEdges.has(d.id)) return true;
    // The prepared circulation graph can span an internal doorway with a walk
    // edge. Recover only an enabled native aperture already crossed by this
    // source leg, between the same allowed rooms; do not open nearby side doors.
    if (d.roomKeys.length !== 2 || !d.roomKeys.every((key) => keys.has(key)))
      return false;
    const edge = data.edges.find(
      (e) => e.id === d.id && e.kind === "door" && e.enabled,
    );
    if (!edge) return false;
    const aperture: Rings[] = [[d.footprintFeet]];
    const crossed = path.pointsFeet.slice(1).some((p, i) => {
      const a: XY = [path.pointsFeet[i][0], path.pointsFeet[i][1]],
        b: XY = [p[0], p[1]],
        ts = breaks(a, b, aperture);
      return ts
        .slice(1)
        .some((t, j) => inside(interpolate(a, b, (t + ts[j]) / 2), aperture));
    });
    if (crossed) apertureEdges.set(d.id, edge);
    return crossed;
  });
  // Never refine a connection whose native aperture has not been recovered.
  if (
    edges.some(
      (e) =>
        !["walk", "opening"].includes(e.kind) &&
        !selectedDoors.some((d) => d.id === e.id),
    )
  )
    return source("missing-native-aperture");
  try {
    const apertures = selectedDoors.map((d) => [d.footprintFeet!] as Rings);
    const surfaces = nativeSurfaces.rings;
    const allowed = [
      ...surfaces,
      ...openingSpans.map(({ span }) => [span!.apertureFeet] as Rings),
      ...selectedDoors.map((d) =>
        doorCoverage(d.footprintFeet!, apertureEdges.get(d.id)!, d.normalFeet),
      ),
    ];
    const masks = data.records
      .filter(
        (r) =>
          r.levelId === levelId &&
          !keys.has(r.key) &&
          (!r.walkable ||
            r.access === "staff" ||
            (!r.circulation && !r.stair)) &&
          overlaps(bounds, box(r.ringsFeet)),
      )
      .map((r) => r.ringsFeet);
    const holes = data.records
      .filter(
        (r) => r.levelId === levelId && overlaps(bounds, box(r.ringsFeet)),
      )
      .flatMap((r) => r.ringsFeet.slice(1).map((h) => [h] as Rings));
    const support = data.walkingSupport;
    if (
      support &&
      (support.version !== 1 ||
        support.sourceModelSha256 !== data.source.modelSha256)
    )
      return source("stale-floor-support");
    // Physical elevation, not directory level identity, selects a slab. An
    // unassociated native floor can support several directory level labels.
    // Keep complete profiles (including holes); no bounding-box substitutes.
    const supportedFloors = support?.floors
      .filter(
        (floor) =>
          Math.abs(floor.elevationFeet - path.pointsFeet[0][2]) <= 0.05 &&
          overlaps(bounds, box(floor.ringsFeet)),
      )
      .map((floor) => floor.ringsFeet);
    const boundaries = [
      ...(supportedFloors ?? []),
      ...allowed,
      ...masks,
      ...holes,
      ...walls.map((w) => w.ringsFeet),
      ...apertures,
    ];
    const allowedPoint = indexedContains(allowed),
      floorPoint = supportedFloors
        ? indexedContains(supportedFloors)
        : undefined,
      maskedPoint = indexedContains(masks),
      holePoint = indexedContains(holes),
      aperturePoint = indexedContains(apertures),
      nearbyWalls = geometryIndex(walls, (w) => box(w.ringsFeet));
    const free: WalkableArea = {
      boundaries,
      boundaryRings: geometryIndex(boundaries.flat(), boundsOfRing),
      contains: (point) =>
        allowedPoint(point) &&
        (!floorPoint || floorPoint(point)) &&
        !maskedPoint(point) &&
        !holePoint(point) &&
        !nearbyWalls([
          point[0] - 1e-8,
          point[1] - 1e-8,
          point[0] + 1e-8,
          point[1] + 1e-8,
        ]).some(
          (w) =>
            inside(point, [w.ringsFeet]) &&
            (w.kind === "column" || !aperturePoint(point)),
        ),
    };
    const openingBodySupported = (
      edge: IndoorEdge,
      span: OpeningSpan,
      points: XY[],
      crossing: SpanCrossing,
    ) => {
      try {
        if (!supportedFloors?.length) return false;
        const strip = crossingStrip(
          points,
          crossing,
          span.walkingStripWidthFeet,
        );
        if (strip.length === 0) return false;
        const stripBounds = box(strip.flat());
        // Check the finite swept footprint itself. Constructing a campus-wide
        // free polygon introduces irrelevant coincident edges and permits a
        // failed subtraction to leave an incomplete cached region.
        const relevant = (regions: MultiPolygon) =>
          regions.filter((r) => overlaps(stripBounds, box(r)));
        if (
          polygonArea(polygonClipping.difference(strip, relevant(allowed))) >
            1e-7 ||
          polygonArea(
            polygonClipping.difference(strip, relevant(supportedFloors)),
          ) > 1e-7
        )
          return false;
        const blocked = relevant([...masks, ...holes]);
        if (
          blocked.length > 0 &&
          polygonArea(polygonClipping.intersection(strip, blocked)) > 1e-7
        )
          return false;
        for (const wall of walls) {
          if (!overlaps(stripBounds, box(wall.ringsFeet))) continue;
          const overlap = polygonClipping.intersection(strip, wall.ringsFeet);
          const solid =
            wall.kind === "column" || apertures.length === 0
              ? overlap
              : polygonClipping.difference(overlap, relevant(apertures));
          if (polygonArea(solid) > 1e-7) return false;
        }
        // The oblique body footprint inside the source's normal crossing band
        // must fit its finite certified aperture, including its reserved margins.
        const frame = openingSpanFrame(edge, span),
          normal = span.apertureFeet.map(frame.side),
          lo = Math.min(...normal),
          hi = Math.max(...normal);
        const extent = Math.max(
          10,
          frame.length + span.walkingStripWidthFeet * 4,
        );
        const point = (t: number, n: number): XY => [
          frame.a[0] + t * frame.u[0] + n * frame.n[0],
          frame.a[1] + t * frame.u[1] + n * frame.n[1],
        ];
        const band: Rings = [
          [
            point(-extent, lo),
            point(frame.length + extent, lo),
            point(frame.length + extent, hi),
            point(-extent, hi),
          ],
        ];
        const footprint = polygonClipping.intersection(strip, band);
        const apertureMissing = polygonArea(
          polygonClipping.difference(footprint, [span.apertureFeet]),
        );
        return apertureMissing <= 1e-7;
      } catch {
        // A clipping failure cannot certify this body's support. Reject only
        // this candidate; fixed thresholds still allow the adjacent walking
        // runs to be refined independently below.
        return false;
      }
    };
    const start: XY = [path.pointsFeet[0][0], path.pointsFeet[0][1]],
      end: XY = [path.pointsFeet.at(-1)![0], path.pointsFeet.at(-1)![1]];
    // Fixed portal/stair anchors outside this continuous region cannot be
    // repaired by searching more lanes. Keep their source connection intact.
    if (!free.contains(start) || !free.contains(end))
      return source("unsupported-anchor");
    const span = Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) + 1;
    const sourceLength = length(path.pointsFeet);
    const arrival = (id: string) => {
      const node = data.nodes.find((n) => n.id === id);
      return (
        node?.kind === "arrival" &&
        data.records.some(
          (r) => r.key === node.roomKey && r.circulation && !r.stair,
        )
      );
    };
    const candidates: XY[][] = [];
    const frames: { a: XY; b: XY; u: XY; v: XY }[] = [];
    for (const angle of axes(
      walls.filter((w) => w.kind === "wall").map((w) => w.ringsFeet),
    )) {
      const u: XY = [Math.cos(angle), Math.sin(angle)],
        v: XY = [-u[1], u[0]];
      const a = centeredPoint(start, u, v, free, span),
        b = centeredPoint(end, u, v, free, span);
      const al = inFrame(a, u, v),
        bl = inFrame(b, u, v);
      const framePaths = [
        [a, fromFrame([al[0], bl[1]], u, v), b],
        [a, fromFrame([bl[0], al[1]], u, v), b],
      ];
      frames.push({ a, b, u, v });
      for (const framePath of framePaths) {
        const points = [
          ...(arrival(firstId) ? [] : [start]),
          ...framePath,
          ...(arrival(lastId) ? [] : [end]),
        ].filter(
          (p, i, all) =>
            !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-6,
        );
        if (
          points.slice(1).every((p, i) => validSegment(points[i], p, free)) &&
          length(points) <= sourceLength * 1.15 + 0.6
        )
          candidates.push(points);
      }
    }
    // Try simple routes in all native frames first. Multi-turn search then uses
    // the strongest valid wall frame, avoiding expensive searches at wrong angles.
    if (candidates.length === 0)
      for (const frame of frames) {
        const complex = multiTurn(
          path.pointsFeet,
          frame.a,
          frame.b,
          frame.u,
          frame.v,
          free,
          span,
          sourceLength * 1.15 + 0.6,
        );
        if (!complex) continue;
        const points = [
          ...(arrival(firstId) ? [] : [start]),
          ...complex,
          ...(arrival(lastId) ? [] : [end]),
        ].filter(
          (p, i, all) =>
            !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-6,
        );
        if (
          points.slice(1).every((p, i) => validSegment(points[i], p, free)) &&
          length(points) <= sourceLength * 1.15 + 0.6
        ) {
          candidates.push(points);
          break;
        }
      }
    // A doorway's shortest cross-section can point along the doorway rather
    // than across the corridor. If snapping its anchor makes the lead-in
    // invalid, search the centre lanes from the actual fixed anchors instead.
    if (candidates.length === 0)
      for (const frame of frames) {
        const complex = multiTurn(
          path.pointsFeet,
          start,
          end,
          frame.u,
          frame.v,
          free,
          span,
          sourceLength * 1.15 + 0.6,
        );
        if (complex) {
          candidates.push(complex);
          break;
        }
      }
    // Large regions can exceed the sparse-lane limit even when their saved
    // source guide has continuous native clearance. Use that guide as a basis
    // for orthogonal simplification, rather than silently retaining its raster
    // elbows. This cannot authorize a gap or repair an unsupported source leg.
    let sourceGuide = false;
    if (
      candidates.length === 0 &&
      edges.every((e) => e.kind === "walk" || !!validatedOpeningSpan(data, e))
    ) {
      const guide = path.pointsFeet
        .map<XY>((p) => [p[0], p[1]])
        .filter(
          (p, i, all) =>
            !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-6,
        );
      if (guide.slice(1).every((p, i) => validSegment(guide[i], p, free))) {
        candidates.push(guide);
        sourceGuide = true;
      }
    }
    // A sparse lane search can retain short alternating elbows inherited from
    // raster boundaries. Try longer orthogonal runs in the same native wall
    // frame, through the exact same supported rooms and selected apertures.
    // Every replacement segment is checked continuously; vertical legs never
    // enter this function and fixed staircase/door anchors remain endpoints.
    const originalCandidates = [...candidates];
    for (const original of originalCandidates)
      for (const frame of frames) {
        const simplified: XY[] = [original[0]];
        for (let cursor = 0; cursor < original.length - 1; ) {
          let next = cursor + 1,
            replacement: XY[] | null = null;
          for (let end = original.length - 1; end > cursor + 1; end--) {
            const a = original[cursor],
              b = original[end];
            const au = a[0] * frame.u[0] + a[1] * frame.u[1],
              av = a[0] * frame.v[0] + a[1] * frame.v[1];
            const bu = b[0] * frame.u[0] + b[1] * frame.u[1],
              bv = b[0] * frame.v[0] + b[1] * frame.v[1];
            const elbows: XY[] = [
              [
                bu * frame.u[0] + av * frame.v[0],
                bu * frame.u[1] + av * frame.v[1],
              ],
              [
                au * frame.u[0] + bv * frame.v[0],
                au * frame.u[1] + bv * frame.v[1],
              ],
            ];
            const candidate = elbows
              .map((elbow) =>
                [a, elbow, b].filter(
                  (point, i, all) =>
                    !i ||
                    Math.hypot(
                      point[0] - all[i - 1][0],
                      point[1] - all[i - 1][1],
                    ) > 1e-6,
                ),
              )
              .find(
                (parts) =>
                  parts
                    .slice(1)
                    .every((point, i) => validSegment(parts[i], point, free)) &&
                  length(parts) <=
                    length(original.slice(cursor, end + 1)) + 1e-6,
              );
            if (candidate) {
              next = end;
              replacement = candidate.slice(1);
              break;
            }
          }
          simplified.push(...(replacement ?? [original[next]]));
          cursor = next;
        }
        if (
          simplified.length < original.length &&
          simplified
            .slice(1)
            .every((point, i) => validSegment(simplified[i], point, free))
        )
          candidates.push(simplified);
      }
    // Campus corridors can change their construction axis at an intersection
    // (for example a diagonal Agora wing joining an orthogonal washroom wing).
    // A single frame forces extra elbows there. Join supported native axes at
    // their intersection, keeping the same anchors, region and door policy.
    const directions = frames.flatMap(({ u, v }) => [u, v]);
    for (const original of [...candidates]
      .sort((a, b) => a.length - b.length || length(a) - length(b))
      .slice(0, 3)) {
      const simplified: XY[] = [original[0]];
      for (let cursor = 0; cursor < original.length - 1; ) {
        let next = cursor + 1;
        let replacement: XY[] | null = null;
        for (let end = original.length - 1; end > cursor + 1; end--) {
          const a = original[cursor],
            b = original[end];
          const options: XY[][] = [];
          for (const incoming of directions)
            for (const outgoing of directions) {
              const cross =
                incoming[0] * outgoing[1] - incoming[1] * outgoing[0];
              if (Math.abs(cross) < 1e-6) continue;
              const t =
                ((b[0] - a[0]) * outgoing[1] - (b[1] - a[1]) * outgoing[0]) /
                cross;
              const elbow: XY = [
                a[0] + t * incoming[0],
                a[1] + t * incoming[1],
              ];
              const parts = [a, elbow, b].filter(
                (point, i, all) =>
                  !i ||
                  Math.hypot(
                    point[0] - all[i - 1][0],
                    point[1] - all[i - 1][1],
                  ) > 1e-6,
              );
              if (
                length(parts) <=
                  length(original.slice(cursor, end + 1)) + 1e-6 &&
                parts
                  .slice(1)
                  .every((point, i) => validSegment(parts[i], point, free))
              )
                options.push(parts);
            }
          options.sort((a, b) => a.length - b.length || length(a) - length(b));
          if (options.length > 0) {
            next = end;
            replacement = options[0].slice(1);
            break;
          }
        }
        simplified.push(...(replacement ?? [original[next]]));
        cursor = next;
      }
      if (simplified.length < original.length) candidates.push(simplified);
    }
    // Snapping beside a portal can overshoot its fixed anchor and then double
    // back along the same lane. Remove that detour only when the replacement
    // segment still has continuous native clearance.
    for (const points of candidates)
      for (let i = 1; i < points.length - 1; ) {
        const a = points[i - 1],
          b = points[i],
          c = points[i + 1],
          cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross) < 1e-7 && validSegment(a, c, free)) {
          points.splice(i, 1);
          if (i > 1) i--;
        } else i++;
      }
    const originalPassages = passageQuery(levelId, path.pointsFeet),
      permitted = new Set([
        ...edges.filter((e) => e.kind === "door").map((e) => e.id),
        ...originalPassages.map((p) => p.edge.id),
      ]);
    const mandatoryDoors = edges
      .filter((edge) => edge.kind === "door")
      .map((edge) => edge.id);
    for (const { edge, span } of openingSpans) {
      const extra = candidates.flatMap((points) =>
        openingSpanCandidates(edge, span!, points),
      );
      for (const points of extra)
        if (
          length(points) <= sourceLength + 1e-7 &&
          points.slice(1).every((p, i) => validSegment(points[i], p, free))
        )
          candidates.push(points);
    }
    const policyAllowed = (points: XY[]) => {
      const crossings = passageQuery(
        levelId,
        points.map((p): XYZ => [p[0], p[1], path.pointsFeet[0][2]]),
      );
      // A shortcut may not leave through a different, unprepared open front
      // and retain the selected doorway only as a fictitious graph dependency.
      // Preserve every saved native threshold, including its travel direction.
      return (
        mandatoryDoors.every((id) => crossings.some((p) => p.edge.id === id)) &&
        originalPassages.every((saved) =>
          crossings.some(
            (p) => p.edge.id === saved.edge.id && p.forward === saved.forward,
          ),
        ) &&
        crossings.every(
          ({ edge, forward }) =>
            permitted.has(edge.id) &&
            edge.enabled &&
            (edge.direction !== "from-to" || forward) &&
            (edge.direction !== "to-from" || !forward),
        ) &&
        openingSpans.every(({ edge, span }) => {
          const index = edges.indexOf(edge);
          let node = firstId;
          for (let i = 0; i < index; i++)
            node = edges[i].from === node ? edges[i].to : edges[i].from;
          const forward = edge.from === node;
          return openingSpanCrossings(edge, span!, points).some(
            (c) =>
              c.forward === forward &&
              openingBodySupported(edge, span!, points, c),
          );
        })
      );
    };
    const policyCandidates = candidates.filter(policyAllowed);
    if (candidates.length > 0 && policyCandidates.length === 0)
      return source("doorway-policy");
    candidates.splice(0, candidates.length, ...policyCandidates);
    candidates.sort((a, b) => a.length - b.length || length(a) - length(b));
    if (candidates.length === 0) return source("no-clearance-route");
    const curved = curvedCorridorPath(
      candidates[0],
      nativeSurfaces.cells.length > 0
        ? nativeSurfaces.cells.flatMap((cell) => cell.ringsFeet)
        : records
            .filter((record) => record.circulation && !record.stair)
            .flatMap((record) => record.ringsFeet),
      (point, normal) => center(point, normal, free, span),
      (a, b) => validSegment(a, b, free),
      Math.min(sourceLength * 1.15 + 0.6, length(candidates[0]) * 1.2 + 0.6),
    );
    const substantialTurns = (
      points: XY[],
      ranges: RoutePath["curveRanges"] = [],
    ) =>
      points.slice(1, -1).filter((p, i) => {
        if (ranges?.some((range) => i + 1 >= range.start && i + 1 < range.end))
          return false;
        const a = points[i],
          b = points[i + 2],
          u: XY = [p[0] - a[0], p[1] - a[1]],
          v: XY = [b[0] - p[0], b[1] - p[1]];
        return (
          Math.abs(
            Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]),
          ) >
          (25 * Math.PI) / 180
        );
      }).length;
    // Native-axis routes already describe straight and diagonal wings. Curve
    // guidance must remove actual substantial elbows rather than replacing a
    // simpler safe route merely because a nearby boundary has curved facets.
    if (
      curved &&
      substantialTurns(curved.points, curved.ranges) <
        substantialTurns(candidates[0]) &&
      policyAllowed(curved.points)
    )
      candidates.unshift(curved.points);
    const isCurved = candidates[0] === curved?.points;
    if (
      !isCurved &&
      openingSpans.length === 0 &&
      nativeSurfaces.cells.length === 0 &&
      sourceGuide &&
      candidates[0].length >= path.pointsFeet.length
    )
      return source("validated-source");
    return {
      ...path,
      centered: true,
      nativeFloorSupported: !!supportedFloors,
      nativeCirculationUsed: nativeSurfaces.cells.length > 0,
      openingSpanSupported: openingSpans.length > 0 ? true : undefined,
      shape: isCurved ? "curved" : sourceGuide ? "orthogonal" : "centered",
      curveRanges: isCurved ? curved?.ranges : undefined,
      sourceReason: undefined,
      pointsFeet: candidates[0].map((p) => [p[0], p[1], path.pointsFeet[0][2]]),
    };
  } catch {
    return source("centering-error");
  }
}

/** Resolve continuous walking legs after graph search, preserving source edge
 * identities and actual floor transitions. Unused side-door anchors are not turns. */
export function centeredRoutePaths(
  data: IndoorDataset,
  edges: IndoorEdge[],
  nodeIds: string[],
  enabled = true,
): RoutePath[] {
  // Reviews can edit an existing ring array in place. Bounds are reusable
  // inside one synchronous resolution, never across changed geometry.
  ringBounds = new WeakMap();
  ringQueries = new WeakMap();
  const passageQuery = createDoorPassageQuery(data);
  const paths: RoutePath[] = [],
    groups: { edges: IndoorEdge[]; first: string; last: string }[] = [];
  const flatKind = (edge: IndoorEdge) =>
    (["walk", "door"].includes(edge.kind) &&
      !validatedSourceDoorProof(data, edge)) ||
    (edge.kind === "opening" &&
      (nativeCellSeam(data, edge) || !!validatedOpeningSpan(data, edge)));
  edges.forEach((edge, i) => {
    const from = data.nodes.find((n) => n.id === nodeIds[i])!,
      to = data.nodes.find((n) => n.id === nodeIds[i + 1])!;
    const levels = [...new Set([from.levelId, to.levelId])];
    const points = (
      edge.from === from.id ? edge.pointsFeet : [...edge.pointsFeet].reverse()
    ).map((p) => [...p] as XYZ);
    const previous = paths.at(-1),
      group = groups.at(-1);
    const flat =
      flatKind(edge) &&
      levels.length === 1 &&
      points.every((p) => Math.abs(p[2] - points[0][2]) < 0.01);
    if (
      flat &&
      previous &&
      previous.levelIds.length === 1 &&
      previous.levelIds[0] === levels[0] &&
      previous.pointsFeet.every((p) => Math.abs(p[2] - points[0][2]) < 0.01) &&
      group!.edges.every(flatKind)
    ) {
      previous.edgeIds.push(edge.id);
      previous.pointsFeet.push(...points.slice(1));
      group!.edges.push(edge);
      group!.last = to.id;
    } else {
      paths.push({
        edgeIds: [edge.id],
        levelIds: levels,
        pointsFeet: points,
        centered: false,
      });
      groups.push({ edges: [edge], first: from.id, last: to.id });
    }
  });
  return paths.flatMap((path, i) => {
    if (!enabled)
      return [
        {
          ...path,
          sourceReason: groups[i].edges.some((e) =>
            ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
              e.kind,
            ),
          )
            ? ("vertical-transition" as const)
            : ("centering-disabled" as const),
        },
      ];
    const group = groups[i];
    const resolved = refine(
      data,
      path,
      group.edges,
      group.first,
      group.last,
      passageQuery,
      edges.filter(
        (e) =>
          validatedSourceDoorProof(data, e) &&
          [e.from, e.to].some((id) => id === group.first || id === group.last),
      ),
    );
    if (
      (resolved.centered &&
        !group.edges.some(
          (e) => e.kind === "opening" && !nativeCellSeam(data, e),
        )) ||
      !group.edges.some((e) => ["door", "opening"].includes(e.kind)) ||
      !data.doors ||
      group.edges.some(
        (e) =>
          !["walk", "opening"].includes(e.kind) &&
          !data.doors!.some(
            (d) => d.id === e.id && d.state === "connected" && d.footprintFeet,
          ),
      )
    )
      return [resolved];
    // One awkward doorway must not force every corridor on this floor to retain
    // a raster zigzag. Preserve each doorway exactly and refine the walking runs
    // on either side independently. Unverified apertures retain the entire leg.
    const parts: RoutePath[] = [];
    let run: IndoorEdge[] = [];
    let runFirst = group.first;
    let runLast = group.first;
    let points: XYZ[] = [];
    const flush = () => {
      if (run.length === 0) return;
      parts.push(
        refine(
          data,
          {
            edgeIds: run.map((e) => e.id),
            levelIds: path.levelIds,
            pointsFeet: points,
            centered: false,
          },
          run,
          runFirst,
          runLast,
          passageQuery,
          group.edges.filter(
            (e) =>
              e.kind === "door" &&
              [e.from, e.to].some((id) => id === runFirst || id === runLast),
          ),
        ),
      );
      run = [];
      points = [];
    };
    for (const edge of group.edges) {
      const from = runLast;
      const to = edge.from === from ? edge.to : edge.from;
      const oriented = (
        edge.from === from ? edge.pointsFeet : [...edge.pointsFeet].reverse()
      ).map((p) => [...p] as XYZ);
      if (
        edge.kind === "door" ||
        (edge.kind === "opening" && !nativeCellSeam(data, edge))
      ) {
        flush();
        parts.push({
          edgeIds: [edge.id],
          levelIds: path.levelIds,
          pointsFeet: oriented,
          centered: false,
          sourceReason: edge.kind === "door" ? "native-door" : "source-opening",
        });
        runFirst = to;
      } else {
        if (run.length === 0) runFirst = from;
        run.push(edge);
        points.push(...(points.length > 0 ? oriented.slice(1) : oriented));
      }
      runLast = to;
    }
    flush();
    if (resolved.centered) {
      const quality = (paths: RoutePath[]) => {
        const points = paths.flatMap((p, i) =>
          i ? p.pointsFeet.slice(1) : p.pointsFeet,
        );
        let turns = 0;
        for (let i = 1; i < points.length - 1; i++) {
          const a = points[i - 1],
            b = points[i],
            c = points[i + 1];
          const incoming = Math.atan2(b[1] - a[1], b[0] - a[0]),
            outgoing = Math.atan2(c[1] - b[1], c[0] - b[0]);
          const delta = Math.abs(
            Math.atan2(
              Math.sin(outgoing - incoming),
              Math.cos(outgoing - incoming),
            ),
          );
          if (delta > (25 * Math.PI) / 180) turns++;
        }
        return { turns, distance: length(points) };
      };
      const original = quality([resolved]),
        fixed = quality(parts);
      if (
        fixed.turns >= original.turns ||
        fixed.distance > original.distance * 1.15 + 0.6
      )
        return [resolved];
    }
    return parts;
  });
}
