import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import BufferParameters from "jsts/org/locationtech/jts/operation/buffer/BufferParameters.js";
import OverlayOp from "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js";
import EnhancedPrecisionOp from "jsts/org/locationtech/jts/precision/EnhancedPrecisionOp.js";
import type { IndoorDataset } from "./contract";
import {
  hallwaySpines,
  indexSurface,
  ringArea,
  surfaceArea,
  type Rings,
  type SpineDoorway,
  type SpineGate,
  type SpineSurface,
  type XY,
} from "./hallway-spine";

/** A compact walking network for the simplified visitor product.
 *
 * Hallways use straight spines over the gap-fixed native walkable cells. Room
 * interiors, door crossings and vertical links keep the compiled graph's own
 * edges, so no connection is invented: held (disabled) links stay out, and
 * staff-only spaces and step-free limits are carried as edge flags. */
export type HallwayEdgeKind =
  | "spine"
  | "gate"
  | "join"
  | "hop"
  | "walk"
  | "door"
  | "opening"
  | "stairs"
  | "local-steps"
  | "ramp"
  | "elevator"
  | "escalator";
export type HallwayNetwork = {
  version: 1;
  sourceModelSha256: string;
  /** [levelId, x, y] in plan feet. */
  nodes: [number, number, number][];
  /** [from, to, metres, kind, flags, ...optional x,y polyline between them]. */
  edges: HallwayNetworkEdge[];
  /** Room key -> node index of its arrival point. */
  arrivals: Record<string, number>;
  report: HallwayNetworkReport;
};
export type HallwayNetworkEdge = [
  number,
  number,
  number,
  HallwayEdgeKind,
  number,
  number[]?,
];
export const EDGE_STAFF = 1;
export const EDGE_STEPS = 2;
export type HallwayNetworkReport = {
  levels: number;
  surfaces: number;
  staffSurfaces: number;
  gates: number;
  joins: number;
  unconnected: { kind: string; id: string; levelId: number }[];
  unreachedSurfaces: { levelId: number; area: number; rooms: string[] }[];
  straightCrossings: number;
  spokeAreas: number;
  spineMetres: number;
  /** Replaced hallway edges kept because the spine did not join their ends. */
  restoredEdges: number;
  /** Direct links between nearby doors (see `SpineResult.hops`). */
  hops: number;
  /** Breaks inside one surface's spine closed by a bridge, and pieces left
   * separate (see `SpineResult.stats`). */
  spineBridges: number;
  looseSpineRuns: number;
};
const CROSSING_NAME = /vestibule|lobby|entr|link|bridge|crosswalk|airlock/i;
const STEPPED = new Set(["stairs", "local-steps", "escalator"]);
const VERTICAL = new Set([
  "stairs",
  "local-steps",
  "ramp",
  "elevator",
  "escalator",
]);

const dist = (a: XY, b: XY) => {
  const dx = a[0] - b[0],
    dy = a[1] - b[1];
  return Math.hypot(dx, dy);
};
/** A replaced hallway walk stays when the spine between its ends is longer
 * than this. */
const DETOUR = { factor: 1.5, metres: 3 };
/** An opening longer than this is a walk across a hallway, not a threshold. */
const OPENING_WALK_METRES = 2;
/** A binary min-heap of [distance, node] pairs. */
function heapPush(heap: [number, number][], item: [number, number]) {
  heap.push(item);
  for (let c = heap.length - 1; c > 0; ) {
    const p = (c - 1) >> 1;
    if (heap[p][0] <= heap[c][0]) break;
    [heap[p], heap[c]] = [heap[c], heap[p]];
    c = p;
  }
}
function heapPop(heap: [number, number][]) {
  const top = heap[0],
    last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    for (let i = 0; ; ) {
      const l = 2 * i + 1,
        r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      [heap[i], heap[m]] = [heap[m], heap[i]];
      i = m;
    }
  }
  return top;
}
/** Whether `to` is within `budget` of `from`: a search bounded by the budget. */
function withinDistance(
  adjacency: readonly number[][],
  edges: readonly HallwayNetworkEdge[],
  from: number,
  to: number,
  budget: number,
) {
  const best = new Map<number, number>([[from, 0]]),
    heap: [number, number][] = [[0, from]];
  while (heap.length > 0) {
    const [d, v] = heapPop(heap);
    if (v === to) return true;
    if (d > (best.get(v) ?? Infinity)) continue;
    for (const i of adjacency[v]) {
      const e = edges[i],
        w = e[0] === v ? e[1] : e[0],
        nd = d + e[2];
      if (nd <= budget && nd < (best.get(w) ?? Infinity)) {
        best.set(w, nd);
        heapPush(heap, [nd, w]);
      }
    }
  }
  return false;
}

/** How far past a hallway room's own outline its part of the walkable cell
 * reaches: across wall gaps and into doorways, short of the rooms beyond. */
const HALLWAY_REACH_FEET = 1.25;
const MIN_PART_AREA = 20;
type GeometryJSON = {
  type: string;
  coordinates?: XY[][] | XY[][][];
  geometries?: GeometryJSON[];
};
/** Polygon parts of an overlay result; touching lines and points have no area. */
const polygonsOf = (g: GeometryJSON): XY[][][] =>
  g.type === "Polygon"
    ? [g.coordinates as XY[][]]
    : g.type === "MultiPolygon"
      ? (g.coordinates as XY[][][])
      : g.type === "GeometryCollection"
        ? (g.geometries ?? []).flatMap(polygonsOf)
        : [];

/** The hallway part of a walkable cell: the cell clipped to its hallway rooms'
 * outlines grown by `HALLWAY_REACH_FEET`. Slivers that reach through a wall
 * into a neighbouring room are dropped. Falls back to the whole cell when the
 * overlay cannot be computed. */
export function hallwayParts(
  cellRings: readonly (readonly number[][])[],
  hallwayRings: readonly (readonly number[][])[],
): Rings[] {
  const close = (ring: readonly (readonly number[])[]) => {
    const q = ring.map((p) => [p[0], p[1]] as XY);
    if (q[0][0] !== q.at(-1)![0] || q[0][1] !== q.at(-1)![1]) q.push(q[0]);
    return q;
  };
  const whole = [cellRings.map((r) => r.map((p) => [p[0], p[1]] as XY))];
  // Without a usable hallway outline the whole cell is the hallway.
  if (
    hallwayRings.reduce(
      (t, r) => t + ringArea(r.map((p) => [p[0], p[1]] as XY)),
      0,
    ) < MIN_PART_AREA
  )
    return whole;
  const reader = new GeoJSONReader(),
    writer = new GeoJSONWriter();
  type Geometry = { getArea(): number };
  const read = (rings: readonly (readonly number[][])[], grid: number) =>
    rings.map((ring) =>
      close(
        grid
          ? ring.map((p) => [
              Math.round(p[0] * grid) / grid,
              Math.round(p[1] * grid) / grid,
            ])
          : ring,
      ),
    );
  let reach: unknown;
  try {
    reach = BufferOp.bufferOp(
      reader.read({
        type: "MultiPolygon",
        coordinates: read(hallwayRings, 0).map((ring) => [ring]),
      }),
      HALLWAY_REACH_FEET,
      new BufferParameters(),
    );
  } catch {
    return whole;
  }
  // Native outlines carry spikes and touching seams that defeat a plain
  // overlay (and send it into slow snapping retries). Snap the outline to a
  // fine grid and repair it with a zero buffer first: the usual, fast answer.
  // A repair counts only when it keeps the area (a zero buffer can collapse a
  // near bow-tie). Then try the raw outline, coarser grids and a
  // precision-enhanced overlay. The first overlay that succeeds is the answer.
  const outline = (grid: number) =>
    reader.read({ type: "Polygon", coordinates: read(cellRings, grid) });
  const repaired = (grid: number) => {
    const cell = outline(grid) as Geometry,
      fixed = BufferOp.bufferOp(cell, 0, new BufferParameters()) as Geometry;
    if (Math.abs(fixed.getArea() - cell.getArea()) > 0.02 * cell.getArea())
      throw new Error("repair changed the area");
    return fixed;
  };
  const attempts: (() => unknown)[] = [
    () => OverlayOp.intersection(repaired(1000), reach),
    () => OverlayOp.intersection(repaired(0), reach),
  ];
  for (const grid of [0, 1000, 100])
    attempts.push(
      () => OverlayOp.intersection(outline(grid), reach),
      () => EnhancedPrecisionOp.intersection(outline(grid), reach),
    );
  attempts.push(() => EnhancedPrecisionOp.intersection(repaired(0), reach));
  let best: Rings[] | null = null;
  for (const attempt of attempts) {
    try {
      best = polygonsOf(writer.write(attempt()) as GeometryJSON).map((rings) =>
        rings.map((ring) => ring.slice(0, -1)),
      );
      break;
    } catch {
      continue;
    }
  }
  if (best) return best.filter((rings) => surfaceArea(rings) >= MIN_PART_AREA);
  return whole;
}

export type HallwayNetworkOptions = {
  /** Called with each replaced edge the spine could not carry. */
  onRestore?: (edgeId: string) => void;
};
export function buildHallwayNetwork(
  data: IndoorDataset,
  options: HallwayNetworkOptions = {},
): HallwayNetwork {
  const records = new Map(data.records.map((r) => [r.key, r]));
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const isCorridor = (key: string) => {
    const r = records.get(key);
    return !!r && r.circulation && !r.stair;
  };
  const cells = (data.circulationGeometry?.cells ?? []).filter((c) =>
    c.roomKeys.some(isCorridor),
  );
  const corridorCellIds = new Set(cells.map((c) => c.id));
  // The compiler's walking unit is an elevation plane: a cell can carry two
  // level ids at one height (Floor 1 and Floor 1.25), so group by height.
  const planeKey = (z: number) => Math.round(z * 100);
  const planes = [...new Set(cells.map((c) => planeKey(c.elevationFeet)))];
  const out: [number, number, number][] = [];
  const nodeIndex = new Map<string, number>();
  const nodeAt = (levelId: number, p: XY, key?: string) => {
    const k =
      key ?? `${levelId}:${Math.round(p[0] * 1000)}:${Math.round(p[1] * 1000)}`;
    let i = nodeIndex.get(k);
    if (i === undefined) {
      i = out.length;
      out.push([levelId, p[0], p[1]]);
      nodeIndex.set(k, i);
    }
    return i;
  };
  const compiledNode = (id: string) => {
    const n = nodes.get(id)!;
    return nodeAt(n.levelId, [n.pointFeet[0], n.pointFeet[1]], `node:${id}`);
  };
  const edges: HallwayNetworkEdge[] = [];
  const report: HallwayNetworkReport = {
    levels: planes.length,
    surfaces: 0,
    staffSurfaces: 0,
    gates: 0,
    joins: 0,
    unconnected: [],
    unreachedSurfaces: [],
    straightCrossings: 0,
    spokeAreas: 0,
    spineMetres: 0,
    restoredEdges: 0,
    hops: 0,
    spineBridges: 0,
    looseSpineRuns: 0,
  };
  const metres = (pts: XY[]) => {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
    return total * data.alignment.horizontalMetresPerFoot;
  };
  const replacedEdges = new Set<string>();
  const anchoredNodes = new Set<string>();

  // Compiled edges that are joined to the spine where they meet a hallway.
  const kept = data.edges.filter(
    (e) => e.enabled && nodes.has(e.from) && nodes.has(e.to),
  );

  for (const plane of planes) {
    const onLevel = cells.filter((c) => planeKey(c.elevationFeet) === plane);
    const levelId = onLevel[0].levelIds[0];
    const onPlane = (n: { pointFeet: number[] }) =>
      planeKey(n.pointFeet[2]) === plane;
    // Staff-only cells stay separate surfaces so public routes cannot cross them.
    const staffCell = (c: (typeof onLevel)[number]) =>
      !!c.accessZoneId ||
      c.roomKeys
        .filter(isCorridor)
        .every((k) => records.get(k)!.access === "staff");
    // A walkable cell also holds the rooms that open onto it. The spine runs
    // only in its hallway part; each part is its own surface, and touching
    // parts connect only where the compiled graph has a door or opening
    // between them (a gate): a shared boundary may be a level change or a
    // barrier, never a free walk.
    const surfaces: (SpineSurface & {
      staff: boolean;
      rooms: string[];
      cell: string;
    })[] = onLevel.flatMap((c) =>
      hallwayParts(
        c.ringsFeet,
        c.roomKeys
          .filter(isCorridor)
          .flatMap((k) => records.get(k)!.ringsFeet ?? []),
      ).map((rings) => ({
        rings,
        staff: staffCell(c),
        rooms: c.roomKeys.filter(isCorridor),
        cell: c.id,
        crossing:
          surfaceArea(rings) < 450 ||
          c.roomKeys.some(
            (k) => isCorridor(k) && CROSSING_NAME.test(records.get(k)!.name),
          ),
      })),
    );
    report.surfaces += surfaces.length;
    report.staffSurfaces += surfaces.filter((s) => s.staff).length;
    const indexes = surfaces.map((s) => indexSurface(s.rings));
    const surfaceAt = (p: XY, cell: string, tolerance = 0.5) => {
      let best = -1,
        bestDistance = Infinity;
      for (const [i, surface] of surfaces.entries()) {
        if (surface.cell !== cell) continue;
        if (indexes[i].inside(p)) return i;
        const d = indexes[i].distanceToEdge(p);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      return bestDistance <= tolerance ? best : -1;
    };

    // Hallway walks are replaced by the spine; a walk that leaves the hallway
    // (into a room of the same cell) is kept. Only the nodes the compiler
    // walks along a hallway join its spine: a door portal it never walks to
    // there (a closed-off room, a door into a wall gap) stays unconnected.
    const onHallway = new Map<string, number>();
    // A long "opening" lying wholly on a hallway part (for example from a ramp
    // landing across a hall) is a hallway walk too, not a threshold crossing.
    const hallwayWalk = (e: (typeof kept)[number]) =>
      e.kind === "walk" ||
      (e.kind === "opening" && e.lengthMetres > OPENING_WALK_METRES);
    const cellOf = (e: (typeof kept)[number]) =>
      e.nativeCellId ??
      onLevel.find((c) =>
        e.pointsFeet.every((p) =>
          surfaces.some(
            (s, i) =>
              s.cell === c.id &&
              (indexes[i].inside([p[0], p[1]]) ||
                indexes[i].distanceToEdge([p[0], p[1]]) <= 0.5),
          ),
        ),
      )?.id;
    for (const e of kept) {
      const cell = hallwayWalk(e) ? cellOf(e) : undefined;
      if (
        !cell ||
        !corridorCellIds.has(cell) ||
        !onPlane(nodes.get(e.from)!) ||
        !onPlane(nodes.get(e.to)!)
      )
        continue;
      const plan = e.pointsFeet.map((p) => [p[0], p[1]] as XY);
      // The whole walk must stay on one hallway part.
      const part = surfaceAt(plan[0], cell);
      let along = part >= 0;
      for (let i = 1; i < plan.length && along; i++) {
        const steps = Math.max(1, Math.ceil(dist(plan[i - 1], plan[i])));
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const p: XY = [
            plan[i - 1][0] + (plan[i][0] - plan[i - 1][0]) * t,
            plan[i - 1][1] + (plan[i][1] - plan[i - 1][1]) * t,
          ];
          if (surfaceAt(p, cell) !== part) {
            along = false;
            break;
          }
        }
      }
      if (!along) continue;
      replacedEdges.add(e.id);
      onHallway.set(e.from, part);
      onHallway.set(e.to, part);
    }

    const gates: SpineGate[] = [],
      doorways: SpineDoorway[] = [],
      gateAt = new Map<string, string>(),
      gatePortals: [string, string, string][] = [];
    const anchor = (id: string, p: XY, s: number) => {
      if (anchoredNodes.has(id)) return;
      anchoredNodes.add(id);
      doorways.push({ id, point: p, surface: s });
    };
    const doorEnds = new Set<string>();
    for (const e of kept) {
      if (
        (e.kind !== "door" && e.kind !== "opening") ||
        replacedEdges.has(e.id)
      )
        continue;
      const a = nodes.get(e.from)!,
        b = nodes.get(e.to)!;
      if (!onPlane(a) || !onPlane(b)) continue;
      const pa: XY = [a.pointFeet[0], a.pointFeet[1]],
        pb: XY = [b.pointFeet[0], b.pointFeet[1]];
      const sa = onHallway.get(e.from) ?? -1,
        sb = onHallway.get(e.to) ?? -1;
      if (sa >= 0 && sb >= 0 && sa !== sb) {
        replacedEdges.add(e.id);
        const c: XY = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2],
          l = dist(pa, pb);
        const door = data.doors?.find(
          (x) =>
            x.nativeElementId === e.nativeElementId && x.levelId === levelId,
        );
        const n: XY =
          l > 1e-6
            ? [(pb[0] - pa[0]) / l, (pb[1] - pa[1]) / l]
            : (door?.normalFeet ?? [0, 0]);
        const halfDepth = Math.max(
          l / 2,
          ...(door?.footprintFeet ?? []).map((p) =>
            Math.abs((p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1]),
          ),
        );
        const key = `${Math.round(c[0] * 10)},${Math.round(c[1] * 10)}`;
        // The door's own portals stay reachable through the gate's centre:
        // other compiled links (rooms, lifts) may still end at them.
        gatePortals.push([gateAt.get(key) ?? e.id, e.from, e.to]);
        if (!gateAt.has(key)) {
          gateAt.set(key, e.id);
          gates.push({
            id: e.id,
            center: c,
            normal: n,
            halfDepth,
            sides: [sb, sa],
          });
        }
      } else if (sa >= 0 || sb >= 0) {
        // Anchor the end that lies on the hallway; both ends can sit within
        // tolerance of it, so prefer the inside one, then the deeper one.
        const s = sa >= 0 ? sa : sb;
        const depth = (p: XY) =>
          (indexes[s].inside(p) ? 1 : -1) * indexes[s].distanceToEdge(p);
        const fromSide = sa === s && (sb !== s || depth(pa) >= depth(pb));
        anchor(fromSide ? e.from : e.to, fromSide ? pa : pb, s);
        doorEnds.add(e.from);
        doorEnds.add(e.to);
      }
    }
    // Destinations, lifts, stair landings and room walks that meet a hallway.
    // A landing whose only links are held has no kept edge and stays off it.
    const ends = new Set<string>();
    for (const r of data.records)
      if (r.arrivalNodeId) ends.add(r.arrivalNodeId);
    for (const e of kept)
      if (
        !replacedEdges.has(e.id) &&
        e.kind !== "door" &&
        e.kind !== "opening"
      ) {
        ends.add(e.from);
        ends.add(e.to);
      }
    for (const id of ends) {
      const n = nodes.get(id);
      if (!n || !onPlane(n) || anchoredNodes.has(id)) continue;
      // A doorway's shallow end reaches the hallway through its deeper end.
      if (doorEnds.has(id) && n.kind === "portal") continue;
      const s = onHallway.get(id) ?? -1;
      if (s >= 0) anchor(id, [n.pointFeet[0], n.pointFeet[1]], s);
    }

    const result = hallwaySpines(surfaces, gates, doorways);
    report.gates += gates.length;
    report.straightCrossings += result.stats.straightCrossings;
    report.spokeAreas += result.stats.spokeAreas;
    report.spineBridges += result.stats.bridges;
    report.looseSpineRuns += result.stats.looseRuns;
    for (const u of result.unconnected)
      report.unconnected.push({ ...u, levelId });
    for (const i of result.unreached)
      report.unreachedSurfaces.push({
        levelId,
        area: Math.round(surfaceArea(surfaces[i].rings)),
        rooms: surfaces[i].rooms.map((k) => records.get(k)?.number || k),
      });

    // Split each spine segment where links attach, then emit its pieces.
    const stops = result.segments.map((s) => [s.a, s.b]);
    for (const l of result.links) stops[l.segment].push(l.spinePoint);
    result.segments.forEach((s, i) => {
      const along = (p: XY) => dist(s.a, p);
      const pts = stops[i]
        .slice()
        .sort((p, q) => along(p) - along(q))
        .filter((p, k, all) => k === 0 || dist(p, all[k - 1]) > 1e-6);
      const flags = surfaces[s.surface].staff ? EDGE_STAFF : 0;
      for (let k = 1; k < pts.length; k++) {
        const m = metres([pts[k - 1], pts[k]]);
        report.spineMetres += m;
        edges.push([
          nodeAt(levelId, pts[k - 1]),
          nodeAt(levelId, pts[k]),
          m,
          "spine",
          flags,
        ]);
      }
    });
    for (const l of result.links) {
      const from =
        l.kind === "gate"
          ? nodeAt(levelId, l.points[0], `gate:${plane}:${l.id}`)
          : compiledNode(l.id);
      const pts = [...l.points, l.spinePoint].filter(
        (p, k, all) => k === 0 || dist(p, all[k - 1]) > 1e-6,
      );
      if (pts.length < 2) {
        edges.push([
          from,
          nodeAt(levelId, l.spinePoint),
          0,
          l.kind === "gate" ? "gate" : "join",
          surfaces[l.surface].staff ? EDGE_STAFF : 0,
        ]);
        continue;
      }
      if (l.kind === "doorway") report.joins++;
      edges.push([
        from,
        nodeAt(levelId, l.spinePoint),
        metres(pts),
        l.kind === "gate" ? "gate" : "join",
        surfaces[l.surface].staff ? EDGE_STAFF : 0,
        pts.slice(1, -1).flat(),
      ]);
    }
    // Nearby doors whose way through the spine would be an out-and-back.
    const linkNode = (l: (typeof result.links)[number]) =>
      l.kind === "gate"
        ? nodeAt(levelId, l.points[0], `gate:${plane}:${l.id}`)
        : compiledNode(l.id);
    for (const hop of result.hops) {
      const a = result.links[hop.a],
        b = result.links[hop.b];
      report.hops++;
      edges.push([
        linkNode(a),
        linkNode(b),
        metres(hop.points),
        "hop",
        surfaces[a.surface].staff ? EDGE_STAFF : 0,
        hop.points.slice(1, -1).flat(),
      ]);
    }
    for (const [gate, ...portals] of gatePortals) {
      const centre = nodeAt(levelId, [0, 0], `gate:${plane}:${gate}`),
        side = gates.find((g) => g.id === gate)!,
        staff = side.sides.some((i) => surfaces[i].staff) ? EDGE_STAFF : 0;
      for (const id of portals) {
        const n = nodes.get(id)!;
        edges.push([
          compiledNode(id),
          centre,
          metres([[n.pointFeet[0], n.pointFeet[1]], side.center]),
          "gate",
          staff,
        ]);
      }
    }
  }

  // Compiled edges outside the hallway surfaces: room interiors, door crossings,
  // vertical links. Hallway walks are replaced by the spine.
  const staffRoom = (keys: string[] = []) =>
    keys.some((k) => records.get(k)?.access === "staff");
  const flagsOf = (e: (typeof kept)[number]) =>
    (staffRoom(e.roomKeys) ? EDGE_STAFF : 0) |
    (STEPPED.has(e.kind) ? EDGE_STEPS : 0);
  const emit = (e: (typeof kept)[number]) => {
    const plan = e.pointsFeet.map((p) => [p[0], p[1]] as XY);
    const length = VERTICAL.has(e.kind)
      ? (e.lengthMetres ?? metres(plan))
      : metres(plan);
    edges.push([
      compiledNode(e.from),
      compiledNode(e.to),
      length,
      e.kind as HallwayEdgeKind,
      flagsOf(e),
      plan.slice(1, -1).flat(),
    ]);
  };
  for (const e of kept) if (!replacedEdges.has(e.id)) emit(e);
  // The spine must never lose a connection the compiled graph has, nor turn a
  // short hallway walk into a long way round (a spine that only meets itself
  // around a loop). Where the spine does not join the two ends of a replaced
  // edge within `DETOUR` of its length, under that edge's own limits, the
  // compiled edge stays.
  const replaced = kept.filter((e) => replacedEdges.has(e.id));
  for (const limit of [EDGE_STAFF | EDGE_STEPS, EDGE_STEPS]) {
    const adjacency: number[][] = out.map(() => []);
    const link = (i: number) => {
      while (adjacency.length < out.length) adjacency.push([]);
      if (edges[i][4] & limit) return;
      adjacency[edges[i][0]].push(i);
      adjacency[edges[i][1]].push(i);
    };
    edges.forEach((_, i) => link(i));
    for (const e of replaced) {
      if (flagsOf(e) & limit || !replacedEdges.has(e.id)) continue;
      const from = compiledNode(e.from),
        to = compiledNode(e.to);
      while (adjacency.length < out.length) adjacency.push([]);
      const budget = DETOUR.factor * e.lengthMetres + DETOUR.metres;
      if (withinDistance(adjacency, edges, from, to, budget)) continue;
      replacedEdges.delete(e.id);
      report.restoredEdges++;
      options.onRestore?.(e.id);
      emit(e);
      link(edges.length - 1);
    }
  }
  const arrivals: Record<string, number> = {};
  for (const r of data.records)
    if (r.arrivalNodeId && nodes.has(r.arrivalNodeId))
      arrivals[r.key] = compiledNode(r.arrivalNodeId);
  return {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    nodes: out,
    edges,
    arrivals,
    report,
  };
}

export type HallwayProfile = "walking" | "step-free";
export type HallwayRoute = { metres: number; nodes: number[]; edges: number[] };

/** Shortest path on the network. Staff-only edges are never used; step-free
 * also excludes stairs, local steps and escalators. */
export function createHallwayRouter(network: HallwayNetwork) {
  const adjacency: number[][] = network.nodes.map(() => []);
  network.edges.forEach(([a, b], i) => {
    adjacency[a].push(i);
    adjacency[b].push(i);
  });
  return (
    startRoom: string,
    endRoom: string,
    profile: HallwayProfile,
  ): HallwayRoute | null => {
    const start = network.arrivals[startRoom],
      end = network.arrivals[endRoom];
    if (start === undefined || end === undefined) return null;
    const blocked =
      profile === "step-free" ? EDGE_STAFF | EDGE_STEPS : EDGE_STAFF;
    const best = new Float64Array(network.nodes.length).fill(Infinity),
      via = new Int32Array(network.nodes.length).fill(-1);
    const heap: [number, number][] = [[0, start]];
    best[start] = 0;
    while (heap.length > 0) {
      const [d, v] = heapPop(heap);
      if (d > best[v]) continue;
      if (v === end) break;
      for (const i of adjacency[v]) {
        const e = network.edges[i];
        if (e[4] & blocked) continue;
        const w = e[0] === v ? e[1] : e[0],
          nd = d + e[2];
        if (nd < best[w]) {
          best[w] = nd;
          via[w] = i;
          heapPush(heap, [nd, w]);
        }
      }
    }
    if (!Number.isFinite(best[end])) return null;
    const path = [end],
      used: number[] = [];
    for (let v = end; v !== start; ) {
      const i = via[v];
      used.push(i);
      const e = network.edges[i];
      v = e[0] === v ? e[1] : e[0];
      path.push(v);
    }
    return { metres: best[end], nodes: path.reverse(), edges: used.reverse() };
  };
}

/** A route's drawing: one plan polyline per run on a level, in order, with
 * the level changes between them. */
export type HallwayRouteDrawing = {
  runs: { levelId: number; points: XY[] }[];
  changes: { kind: HallwayEdgeKind; from: number; to: number }[];
};
/** Turns sharper than this, on a leg shorter than `SPIKE_FEET`, are drawn
 * as a straight line: a doorway join meeting the spine right beside the next
 * one, or a hop arriving at a door whose own join doubles back. Display only;
 * the route's length and links are unchanged. */
const SPIKE_DEGREES = 35;
const SPIKE_FEET = 8;

/** Draw a route from the network's points and edge polylines. */
export function drawHallwayRoute(
  network: HallwayNetwork,
  route: HallwayRoute,
): HallwayRouteDrawing {
  const runs: HallwayRouteDrawing["runs"] = [],
    changes: HallwayRouteDrawing["changes"] = [];
  let at = route.nodes[0];
  const point = (i: number): XY => [network.nodes[i][1], network.nodes[i][2]];
  let run = { levelId: network.nodes[at][0], points: [point(at)] };
  for (const i of route.edges) {
    const e = network.edges[i],
      next = e[0] === at ? e[1] : e[0];
    if (network.nodes[next][0] === run.levelId) {
      const mid: XY[] = [];
      for (let k = 0; k < (e[5]?.length ?? 0); k += 2)
        mid.push([e[5]![k], e[5]![k + 1]]);
      if (e[0] !== at) mid.reverse();
      run.points.push(...mid, point(next));
    } else {
      runs.push(run);
      changes.push({
        kind: e[3],
        from: run.levelId,
        to: network.nodes[next][0],
      });
      run = { levelId: network.nodes[next][0], points: [point(next)] };
    }
    at = next;
  }
  runs.push(run);
  for (const r of runs) r.points = smoothRun(r.points);
  return { runs, changes };
}
function smoothRun(input: XY[]) {
  const points = input.filter(
    (p, k) => k === 0 || dist(p, input[k - 1]) > 1e-6,
  );
  const cosLimit = Math.cos((SPIKE_DEGREES * Math.PI) / 180);
  for (let changed = true; changed; ) {
    changed = false;
    for (let k = 1; k < points.length - 1; k++) {
      const [p, q, n] = [points[k - 1], points[k], points[k + 1]];
      const lu = dist(p, q),
        lv = dist(q, n);
      const cos =
        ((p[0] - q[0]) * (n[0] - q[0]) + (p[1] - q[1]) * (n[1] - q[1])) /
        (lu * lv);
      if (cos > cosLimit && Math.min(lu, lv) < SPIKE_FEET) {
        points.splice(k, 1);
        changed = true;
        break;
      }
    }
  }
  return points;
}
