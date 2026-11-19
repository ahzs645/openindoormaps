import type { IndoorDataset, IndoorEdge } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import { isHorizontalCirculationAnnotation } from "./horizontal-circulation-annotations";

type Guide = PreparedRouting["guides"][number];
type XYZ = Guide["pointsFeet"][number];

/** A door leading to another public passage doesn't need a separate branch
 * to the passage label. Move only a private split on a label-to-door guide,
 * as far as its very next shared core vertex. All raw coordinates survive
 * until the existing door checker replays a physically shorter chord. */
export function circulationDoorGuideJoins(
  data: IndoorDataset,
  guides: ReadonlyMap<string, Guide>,
  edges: ReadonlyMap<string, IndoorEdge>,
) {
  const labels = data.records.filter(
    (r) =>
      r.walkable &&
      r.access !== "staff" &&
      isHorizontalCirculationAnnotation(data, r),
  );
  const owners = new Set(labels.map((r) => r.key));
  const arrivals = new Set(labels.map((r) => r.arrivalNodeId).filter(Boolean));
  const terminals = new Set<string>();
  for (const door of data.doors ?? []) {
    const e = edges.get(door.id);
    if (
      !e?.enabled ||
      e.kind !== "door" ||
      door.state !== "connected" ||
      !door.hostWallNativeElementId ||
      door.roomKeys.length !== 2 ||
      !door.roomKeys.every((k) => owners.has(k))
    )
      continue;
    terminals.add(e.from);
    terminals.add(e.to);
  }
  const pointId = (e: IndoorEdge, p: XYZ) =>
    JSON.stringify([e.nativeCellId, ...p]);
  const seen = new Map<string, string | null>();
  const cores = new Map<string, string | null>();
  const record = (map: Map<string, string | null>, k: string, edge: string) => {
    const before = map.get(k);
    if (before === undefined) map.set(k, edge);
    else if (before !== edge) map.set(k, null);
  };
  const incident = new Map<string, number>();
  for (const [id, g] of guides) {
    const edge = edges.get(id)!;
    const [a, b] = g.hallwayJoins!;
    for (const terminal of [edge.from, edge.to])
      incident.set(terminal, 1 + (incident.get(terminal) ?? 0));
    for (const [i, p] of g.pointsFeet.entries()) {
      const k = pointId(edge, p);
      record(seen, k, id);
      if (a !== b && i >= a && i <= b) record(cores, k, id);
    }
  }
  const result = new Map<string, { guide: Guide; previous: XYZ }>();
  for (const [id, g] of guides) {
    const edge = edges.get(id)!;
    const [a, b] = g.hallwayJoins!;
    if (a === b) continue;
    const forward = terminals.has(edge.from) && arrivals.has(edge.to);
    if (!forward && !(terminals.has(edge.to) && arrivals.has(edge.from)))
      continue;
    const terminal = forward ? edge.from : edge.to;
    const old = g.pointsFeet[forward ? a : b];
    const next = g.pointsFeet[forward ? a + 1 : b - 1];
    if (
      incident.get(terminal) !== 1 ||
      seen.get(pointId(edge, old)) !== id ||
      cores.get(pointId(edge, next)) !== null
    )
      continue;
    result.set(id, {
      guide: { ...g, hallwayJoins: forward ? [a + 1, b] : [a, b - 1] },
      previous: old,
    });
  }
  return result;
}
