import { chordFitsFiniteDoor } from "./finite-door-chord";
export { chordFitsFiniteDoor } from "./finite-door-chord";
import { pathwayCirculationOwner } from "./reviewed-rotunda-role";
import type { IndoorDataset, IndoorEdge } from "./contract";
import type { PathwayArc } from "./shared-pathway-routing";
import {
  nativeCirculationExactCellParts,
  type NativeCirculationCell,
} from "./native-circulation";
import { nativeRoomDoorJunction } from "./native-room-door-junction";
import { nativeDoorClearOpening } from "./native-door-clear-opening";
import { createNativeDoorApproachQuery } from "./native-door-approach";
import { createTwoFootCorridorSupport } from "./corridor-guide-support";
import { nativeRationalPathUnionSupported } from "./native-exact-planar-topology";
import { nativeRationalOverlay } from "./native-rational-overlay";
import { createNativeTransitRefinementPolicy } from "./native-walk-transit-owners";
import { createDoorPassageQuery } from "./route-passages";
import { createIndoorExclusionQuery } from "./indoor-exclusions";
import { createNativeFloorHoleQuery } from "./walking-support";
import { routingCalculationValue } from "./routing-cache";
import {
  corridorGuideLength,
  type SharedGuidePoint as Point,
} from "./shared-corridor-guides";

const same = (a: Point, b: Point) => a.every((v, i) => v === b[i]);
const xy = (p: Point): [number, number] => [p[0], p[1]];
const sourceVertex = (id: string) => JSON.stringify([id]);
type Door = NonNullable<IndoorDataset["doors"]>[number];
type Side = {
  id: string;
  stop: Point;
  previousStop?: Point;
  portal: Point;
  cell: NativeCirculationCell;
  links: PathwayArc[];
};

/** The fixed chord uses the same longitudinal station as each admitted door
 * node. The three portions therefore meet continuously in either direction. */
export function sharedDoorChord(
  a: Point,
  b: Point,
  n: readonly number[],
  portals: Point[],
) {
  if (portals.length !== 2 || ![...portals, b].every((p) => p[2] === a[2]))
    return;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    den = dx * n[0] + dy * n[1];
  if (!Number.isFinite(den) || den === 0) return;
  const at = portals.map(
    (p) => ((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]) / den,
  );
  if (!(at[0] > 0 && at[0] < at[1] && at[1] < 1)) return;
  return at.map((t): Point => [a[0] + t * dx, a[1] + t * dy, a[2]]);
}

/** Preserve both authorized longitudinal stations, with the crossing on the
 * clear opening's center normal. Side approaches still need independent replay. */
export function centeredDoorThreshold(
  portals: Point[],
  opening: [number, number][],
  normal: readonly number[],
): Point[] | undefined {
  if (
    portals.length !== 2 ||
    opening.length !== 4 ||
    portals[0][2] !== portals[1][2]
  )
    return;
  const [x, y] = normal,
    squared = x * x + y * y;
  if (!(squared > 0) || !Number.isFinite(squared)) return;
  const cx = opening.reduce((sum, q) => sum + q[0], 0) / 4;
  const cy = opening.reduce((sum, q) => sum + q[1], 0) / 4;
  return portals.map(([px, py, z]) => {
    const d = ((px - cx) * x + (py - cy) * y) / squared;
    return [cx + d * x, cy + d * y, z];
  });
}

/** Install one geometrically identical candidate for every directed source
 * approach to a corridor door. Directed links, policies and recorded stops
 * stay authoritative. Dijkstra tests the whole candidate on first use and
 * retries on the original geometry if any check fails. */
export function prepareSharedDoorCrossings(
  data: IndoorDataset,
  cells: Map<string, NativeCirculationCell>,
  outgoing: Map<string, PathwayArc[]>,
  incoming: Map<string, PathwayArc[]>,
  guideIds: ReadonlySet<string>,
  scale: number,
  previousJoins: ReadonlyMap<string, Point> = new Map(),
) {
  const records = new Map(data.records.map((r) => [r.key, r])),
    edges = new Map(data.edges.map((e) => [e.id, e]));
  const held = new Set<string>();
  const checks = new WeakMap<PathwayArc, () => boolean>(),
    originals = new WeakMap<PathwayArc, Point[]>();
  const outside = createIndoorExclusionQuery(data),
    holes = createNativeFloorHoleQuery(data),
    passage = createDoorPassageQuery(data);
  function candidate(door: Door, edge: IndoorEdge) {
    const normal = door.normalFeet,
      opening = door.footprintFeet;
    if (
      !normal ||
      !opening ||
      door.state !== "connected" ||
      !door.hostWallNativeElementId ||
      edge.nativeElementId !== door.nativeElementId ||
      !edge.enabled ||
      edge.kind !== "door" ||
      edge.pointsFeet.length !== 2 ||
      edge.roomKeys.length !== 2 ||
      door.roomKeys.length !== 2 ||
      !edge.roomKeys.every((k) => door.roomKeys.includes(k))
    )
      return;
    if (
      !door.roomKeys.every((k) => {
        const r = records.get(k);
        return (
          r?.walkable &&
          pathwayCirculationOwner(data, r) &&
          !r.stair &&
          r.access !== "staff"
        );
      })
    )
      return;
    const finite =
      nativeDoorClearOpening(data, door, edge.pointsFeet[0][2]) ?? opening;
    const rawFits = chordFitsFiniteDoor(
      edge.pointsFeet[0],
      edge.pointsFeet[1],
      finite,
      normal,
    );
    if (!rawFits) held.add(edge.id);
    const gate = new Set<PathwayArc>(),
      sides: Side[] = [];
    for (const [index, id] of [edge.from, edge.to].entries()) {
      const vertex = sourceVertex(id),
        attached = new Set([
          ...(incoming.get(vertex) ?? []),
          ...(outgoing.get(vertex) ?? []),
        ]);
      const links: PathwayArc[] = [];
      let stop: Point | undefined, cell: NativeCirculationCell | undefined;
      for (const a of attached) {
        if (
          a.link.requiredRooms.length > 0 ||
          a.link.passages.some((p) => p.edge.id !== edge.id)
        )
          return;
        if (a.link.edge.id === edge.id) {
          gate.add(a);
          continue;
        }
        if (
          !guideIds.has(a.link.edge.id) ||
          a.link.passages.length > 0 ||
          a.link.edge.kind !== "walk" ||
          a.points.length < 2 ||
          a.sourceFrom !== id ||
          a.sourceTo !== id
        )
          return;
        const near = a.from === vertex ? a.points[0] : a.points.at(-1)!,
          far = a.from === vertex ? a.points.at(-1)! : a.points[0];
        if (!same(near, edge.pointsFeet[index]) || (stop && !same(stop, far)))
          return;
        const here = cells.get(a.link.edge.nativeCellId ?? "");
        if (!here || (cell && here.id !== cell.id)) return;
        stop = far;
        cell = here;
        links.push(a);
      }
      if (!stop || !cell || links.length === 0) return;
      sides.push({
        id,
        stop,
        previousStop: previousJoins.get(links[0].link.edge.id),
        portal: edge.pointsFeet[index],
        links,
        cell,
      });
    }
    if (gate.size === 0) return;
    const [a, b] = sides;
    const extended = sides.some((s) => s.previousStop);
    // The shorter candidate may fail the finite jamb or a native side. Then
    // replay the previously admitted splits, keeping the extra lead intact.
    for (const retain of extended ? [false, true] : [false]) {
      const stops = sides.map((s) => (retain && s.previousStop) || s.stop);
      const straight = sharedDoorChord(stops[0], stops[1], normal, [
        a.portal,
        b.portal,
      ]);
      if (straight && install(straight, true, retain)) return;
    }
    if (!rawFits) {
      const centered = centeredDoorThreshold(
        [a.portal, b.portal],
        finite,
        normal,
      );
      if (centered) install(centered, false, extended);
    }

    function install(chord: Point[], straight: boolean, retain: boolean) {
      const [u, v] = chord;
      const sidesToPortal = sides.map((s, i) =>
        retain && s.previousStop
          ? [s.stop, s.previousStop, chord[i]]
          : [s.stop, chord[i]],
      );
      const points = [...sidesToPortal[0], ...sidesToPortal[1].toReversed()];
      const z = u[2];
      const previous = [...a.links, ...b.links, ...gate].map((arc) => ({
        arc,
        points: arc.points,
        metres: arc.metres,
      }));
      const oldLength = (s: Side) =>
        Math.min(...s.links.map((l) => corridorGuideLength(l.points)));
      if (
        rawFits &&
        corridorGuideLength(points) >=
          oldLength(a) +
            corridorGuideLength(edge.pointsFeet) +
            oldLength(b) -
            1e-8
      )
        return;
      const writes = new Map<PathwayArc, Point[]>();
      for (const [i, s] of sides.entries())
        for (const arc of s.links)
          writes.set(
            arc,
            arc.from === sourceVertex(s.id)
              ? sidesToPortal[i].toReversed()
              : sidesToPortal[i],
          );
      for (const arc of gate)
        writes.set(arc, arc.sourceFrom === edge.from ? [u, v] : [v, u]);
      function fit() {
        if (
          !chordFitsFiniteDoor(
            straight ? sidesToPortal[0].at(-2)! : u,
            straight ? sidesToPortal[1].at(-2)! : v,
            finite,
            normal!,
          )
        )
          return false;
        const halves = routingCalculationValue(
          data,
          "native-door-approach-query",
          () => createNativeDoorApproachQuery(data),
        );
        const areas = sides.map((s) =>
          nativeCirculationExactCellParts(data, s.cell),
        );
        if (!areas[0]?.length || !areas[1]?.length) return false;
        const parts = sides.map((s) =>
          halves(s.links[0].link.edge, new Set([s.id]))
            .filter((h) => h.z === z)
            .flatMap((h) => h.exactParts ?? []),
        );
        if (parts[0].length === 0 || parts[1].length === 0) return false;
        const body = createTwoFootCorridorSupport(
          nativeRationalOverlay(
            "union",
            areas[0],
            areas[1],
            parts[0],
            parts[1],
          ),
          z,
        );
        const both = points.map(xy);
        let seam: ReturnType<typeof nativeRoomDoorJunction> = [];
        if (!body(both)) {
          seam = nativeRoomDoorJunction(
            data,
            finite,
            normal!,
            a.cell,
            b.cell,
            true,
          );
          if (seam.length === 0 || !body(both, seam)) return false;
        }
        const sameGate = (ps: Point[], forward: boolean) => {
          const p = passage(door.levelId, ps);
          return (
            p.length === 1 &&
            p[0].edge.id === edge.id &&
            p[0].forward === forward
          );
        };
        if (
          outside(points).length > 0 ||
          holes(points).length > 0 ||
          !sameGate(points, true) ||
          !sameGate(points.toReversed(), false)
        )
          return false;
        for (const [i, s] of sides.entries()) {
          const sameSide = nativeRationalOverlay("union", areas[i]!, parts[i]);
          const own = createTwoFootCorridorSupport(sameSide, z);
          const attachment = [s.portal, chord[i]];
          // Both graph positions refer to this same side of the approved door.
          // A sideways two-foot footprint can straddle its open threshold even
          // when its entire centerline stays on this side and crosses no door.
          if (
            !nativeRationalPathUnionSupported(
              attachment.map(xy),
              sameSide,
              seam,
            ) ||
            passage(door.levelId, attachment).length > 0 ||
            !body(attachment.map(xy), seam) ||
            !own(sidesToPortal[i].map(xy), seam)
          )
            return false;
        }
        for (const { arc, points: old } of previous) {
          const next = writes.get(arc)!;
          const original = passage(door.levelId, old),
            nextDoors = passage(door.levelId, next);
          if (
            original.length !== nextDoors.length ||
            original.some(
              (p, j) =>
                p.edge.id !== nextDoors[j].edge.id ||
                p.forward !== nextDoors[j].forward,
            )
          )
            return false;
          if (
            !createNativeTransitRefinementPolicy(
              data,
              [arc.link.edge],
              old,
            )(next)
          )
            return false;
        }
        return true;
      }
      let result: boolean | undefined;
      const check = () => {
        if (result !== undefined) return true;
        try {
          result = fit();
        } catch {
          result = false;
        }
        if (result) return true;
        for (const { arc, points, metres } of previous) {
          arc.points = points;
          arc.metres = metres;
          originals.delete(arc);
          checks.delete(arc);
        }
        return false;
      };
      // A failed raw crossing cannot be a fallback. Verify its replacement before
      // making the original directed door usable at either station.
      const eager = !rawFits || (extended && !retain);
      if (eager) {
        try {
          if (!fit()) return false;
        } catch {
          return false;
        }
        held.delete(edge.id);
      }
      for (const [arc, ps] of writes) {
        originals.set(arc, arc.points);
        arc.points = ps;
        arc.metres = corridorGuideLength(ps) * scale;
        if (!eager) checks.set(arc, check);
      }
      return true;
    }
  }
  for (const door of data.doors ?? []) {
    const edge = edges.get(door.id);
    if (edge) candidate(door, edge);
  }
  return {
    held: (edge: IndoorEdge) => held.has(edge.id),
    check: (arc: PathwayArc) => checks.get(arc)?.() ?? true,
    original: (arc: PathwayArc) => originals.get(arc) ?? arc.points,
  };
}
