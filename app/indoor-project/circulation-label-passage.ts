import type { IndoorDataset } from "./contract";
import type { PathwayArc } from "./shared-pathway-routing";
import type { SharedGuidePoint as Point } from "./shared-corridor-guides";
import { corridorGuideLength } from "./shared-corridor-guides";
import { isHorizontalCirculationAnnotation } from "./horizontal-circulation-annotations";

const same = (a: Point, b: Point) => a.every((n, i) => n === b[i]);

/** A degree-two label terminal is an identity shared by two original,
 * policy-admitted guides. Both sides of that logical junction can meet on
 * the straight hallway segment. The source graph and directionality survive. */
export function prepareCirculationLabelPassages(
  data: IndoorDataset,
  outgoing: Map<string, PathwayArc[]>,
  incoming: Map<string, PathwayArc[]>,
  guideIds: ReadonlySet<string>,
  certify: (arc: PathwayArc[], original: Point[][], next: Point[][]) => boolean,
  scale: number,
) {
  const checks = new WeakMap<PathwayArc, () => boolean>();
  // A held walk or connector might share the source identity even when its
  // directed arc is absent from this public graph.
  const protectedIds = new Set(
    data.edges
      .filter(
        (edge) =>
          !edge.enabled || edge.kind !== "walk" || !guideIds.has(edge.id),
      )
      .flatMap((edge) => [edge.from, edge.to]),
  );
  for (const room of data.records)
    if (room.arrivalNodeId && !isHorizontalCirculationAnnotation(data, room))
      protectedIds.add(room.arrivalNodeId);
  for (const room of data.records) {
    const id = room.arrivalNodeId;
    if (
      !id ||
      protectedIds.has(id) ||
      !room.walkable ||
      room.access === "staff" ||
      !isHorizontalCirculationAnnotation(data, room)
    )
      continue;
    const vertex = JSON.stringify([id]);
    const arcs = [
      ...new Set([
        ...(incoming.get(vertex) ?? []),
        ...(outgoing.get(vertex) ?? []),
      ]),
    ];
    if (!arcs.length) continue;
    const nodes = new Map<string, Point>();
    const cell = arcs[0].link.edge.nativeCellId;
    if (
      !cell ||
      !arcs.every((arc) => {
        const { edge, requiredRooms, passages } = arc.link;
        if (
          !guideIds.has(edge.id) ||
          edge.nativeCellId !== cell ||
          edge.kind !== "walk" ||
          requiredRooms.length ||
          passages.length ||
          arc.sourceFrom !== id ||
          arc.sourceTo !== id ||
          arc.points.length < 2
        )
          return false;
        const incoming = arc.to === vertex;
        const other = incoming ? arc.from : arc.to;
        const p = incoming ? arc.points[0] : arc.points.at(-1)!;
        if (nodes.has(other) && !same(nodes.get(other)!, p)) return false;
        nodes.set(other, p);
        return true;
      })
    )
      continue;
    if (nodes.size === 1) {
      // This leaf served only its label. The doorway guide, room stations
      // and their already-admitted arcs on the shared core remain available.
      const removed = new Set(arcs);
      for (const arc of arcs) {
        outgoing.set(
          arc.from,
          (outgoing.get(arc.from) ?? []).filter((a) => !removed.has(a)),
        );
        incoming.set(
          arc.to,
          (incoming.get(arc.to) ?? []).filter((a) => !removed.has(a)),
        );
      }
      continue;
    }
    if (nodes.size !== 2) continue;
    const [a, b] = [...nodes.values()];
    if (a[2] !== b[2] || same(a, b)) continue;
    const centre: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]];
    const original = arcs.map((arc) => arc.points);
    const next = arcs.map((arc) =>
      arc.to === vertex
        ? [nodes.get(arc.from)!, centre]
        : [centre, nodes.get(arc.to)!],
    );
    const metres = arcs.map((arc) => arc.metres);
    // Every possible admitted pairing should be at least as short. Comparing
    // full end-to-end lengths avoids dependence on where the label was placed.
    const via = [...nodes.keys()].map((k) =>
      Math.min(
        ...arcs
          .filter((arc) => arc.to === k || arc.from === k)
          .map((arc) => arc.metres),
      ),
    );
    if (corridorGuideLength([a, b]) * scale >= via[0] + via[1] - 1e-8) continue;
    let result: boolean | undefined;
    const check = () => {
      if (result !== undefined) return true;
      try {
        result = certify(arcs, original, next);
      } catch {
        result = false;
      }
      if (result) return true;
      for (const [i, arc] of arcs.entries()) {
        arc.points = original[i];
        arc.metres = metres[i];
        checks.delete(arc);
      }
      return false;
    };
    for (const [i, arc] of arcs.entries()) {
      arc.points = next[i];
      arc.metres = corridorGuideLength(next[i]) * scale;
      checks.set(arc, check);
    }
  }
  return (arc: PathwayArc) => checks.get(arc)?.() ?? true;
}
