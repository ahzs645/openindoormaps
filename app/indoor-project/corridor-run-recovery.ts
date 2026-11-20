import type { IndoorEdge } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import { corridorChainTopologyContacts } from "./corridor-chain-fit";
import { rational } from "./vendor/native-rational-overlay-arithmetic.mjs";
import {
  corridorGuideLength,
  MAX_SHARED_CORRIDOR_APPROACH_FEET,
} from "./shared-corridor-guides";

type Guide = PreparedRouting["guides"][number];
type Point = [number, number, number];
type Anchor = { point: Point; approach: Point[] };
const key = (p: Point) => JSON.stringify(p);
const equal = (p: Point, q: Point) => p.every((v, i) => v === q[i]);

/** Compiler-local evidence for a station shared by one original doorway's
 * checked guides. Serialized metadata is descriptive only: the contact guard
 * accepts the live receipt only while all bound guides and identities match. */
export type CorridorRecoveredJunction = {
  kind: "same-original-doorway";
  terminalId: string;
  pointFeet: Point;
  approachFeet: Point[];
  incidentGuideIds: string[];
  throughGuideIds: string[];
};

const junctionProofs = new WeakMap<
  CorridorRecoveredJunction,
  {
    receipt: string;
    guides: Map<string, string>;
    edges: Map<string, string>;
    contacts: Set<string>;
  }
>();
const contactKey = (a: string, b: string, at: string) =>
  JSON.stringify({ edgeIds: [a, b].sort((x, y) => x.localeCompare(y)), at });
const pointContact = (point: Point) => {
  const p = point
    .slice(0, 2)
    .map((v) => {
      const r = rational(v);
      return `${r.n}/${r.d}`;
    })
    .join(",");
  return `${p}:${p}`;
};
const edgeIdentity = (edge: { from: string; to: string }) =>
  JSON.stringify([edge.from, edge.to]);

/** No caller-supplied claim can authorize contact. A receipt must have been
 * issued after complete-guide replay below, and every affected guide and
 * original endpoint identity must still have its exact accepted value. */
export function verifiedCorridorJunctionContacts(
  receipts: readonly CorridorRecoveredJunction[],
  guides: readonly Guide[],
  edges: ReadonlyMap<string, { from: string; to: string }>,
): Set<string> {
  const byId = new Map(guides.map((guide) => [guide.edgeId, guide]));
  const contacts = new Set<string>();
  if (byId.size !== guides.length) return contacts;
  for (const receipt of receipts) {
    const proof = junctionProofs.get(receipt);
    if (
      !proof ||
      proof.receipt !== JSON.stringify(receipt) ||
      [...proof.guides].some(
        ([id, value]) => JSON.stringify(byId.get(id)) !== value,
      ) ||
      [...proof.edges].some(([id, value]) => {
        const edge = edges.get(id);
        return !edge || edgeIdentity(edge) !== value;
      })
    )
      continue;
    for (const contact of proof.contacts) contacts.add(contact);
  }
  return contacts;
}

/** Continue a locally straight core across an existing pair of source walks sharing a doorway terminal. A proposed
 * doorway station is the intersection of its normal with the missing span.
 * Commit a pair atomically after both complete guides pass native replay. */
export function recoverCorridorRuns(
  edges: readonly IndoorEdge[],
  saved: Guide[],
  missing: ReadonlySet<string>,
  doorNormal: (terminal: string) => readonly number[] | undefined,
  qualifies: (edge: IndoorEdge, guide: Guide) => boolean,
): Guide[] {
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const stops = new Map<string, Map<string, Anchor>>();
  const neighbors = new Map<string, Map<string, Point>>();
  function join(from: Point, to: Point) {
    if (equal(from, to)) return;
    const id = key(from),
      adj = neighbors.get(id) ?? new Map<string, Point>();
    adj.set(key(to), to);
    neighbors.set(id, adj);
  }
  for (const guide of saved) {
    const edge = edgeById.get(guide.edgeId);
    if (!edge || !guide.hallwayJoins) continue;
    const [a, b] = guide.hallwayJoins,
      p = guide.pointsFeet;
    for (let i = a; i < b; i++) {
      join(p[i], p[i + 1]);
      join(p[i + 1], p[i]);
    }
    for (const [node, approach] of [
      [edge.from, p.slice(0, a + 1)],
      [edge.to, p.slice(b).reverse()],
    ] as const) {
      const point = approach.at(-1)!,
        choices = stops.get(node) ?? new Map<string, Anchor>();
      if (!choices.has(key(point)))
        choices.set(key(point), { point, approach });
      stops.set(node, choices);
    }
  }
  const components = new Map<string, string>();
  for (const root of neighbors.keys()) {
    if (components.has(root)) continue;
    const queue = [root];
    components.set(root, root);
    for (const id of queue)
      for (const next of neighbors.get(id)!.keys())
        if (!components.has(next)) {
          components.set(next, root);
          queue.push(next);
        }
  }
  function anchor(id: string) {
    const options = stops.get(id);
    if (options?.size !== 1) return;
    const value = options.values().next().value!;
    return neighbors.get(key(value.point))?.size === 1 ? value : undefined;
  }
  function continues(a: Point, b: Point) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    // Continuity is a proposal heuristic. Both whole strips and their
    // authorized doorway approaches must pass the exact physical predicate.
    return (
      len > 0 &&
      [...(neighbors.get(key(a))?.values() ?? [])].some((p) => {
        const x = a[0] - p[0],
          y = a[1] - p[1];
        return x * dx + y * dy >= 0.9 * Math.hypot(x, y) * len;
      })
    );
  }
  function gap(a: Anchor, b: Anchor) {
    return (
      components.get(key(a.point)) !== components.get(key(b.point)) &&
      continues(a.point, b.point) &&
      continues(b.point, a.point)
    );
  }
  function doorwayJoin(
    p: Point,
    first: Point,
    last: Point,
    normal: readonly number[],
  ) {
    const dx = last[0] - first[0],
      dy = last[1] - first[1];
    const denominator = dx * normal[1] - dy * normal[0];
    if (Math.abs(denominator) < 1e-10) return;
    const u =
      ((p[0] - first[0]) * normal[1] - (p[1] - first[1]) * normal[0]) /
      denominator;
    if (!(u > 0 && u < 1)) return;
    const point: Point = [first[0] + u * dx, first[1] + u * dy, first[2]];
    if (corridorGuideLength([p, point]) > MAX_SHARED_CORRIDOR_APPROACH_FEET)
      return;
    return point;
  }
  function propose(edge: IndoorEdge, a: Anchor, b: Anchor): Guide | undefined {
    if (equal(a.point, b.point)) return;
    const pointsFeet = [...a.approach, ...b.approach.slice().reverse()];
    if (
      !equal(pointsFeet[0], edge.pointsFeet[0]) ||
      !equal(pointsFeet.at(-1)!, edge.pointsFeet.at(-1)!)
    )
      return;
    if (
      corridorGuideLength(pointsFeet) >
      1.15 * corridorGuideLength(edge.pointsFeet) +
        0.6 +
        2 * MAX_SHARED_CORRIDOR_APPROACH_FEET
    )
      return;
    const guide: Guide = {
      edgeId: edge.id,
      kind: "shared-corridor",
      pointsFeet,
      hallwayJoins: [a.approach.length - 1, a.approach.length],
    };
    return qualifies(edge, guide) ? guide : undefined;
  }
  const found = new Map<string, Guide>();
  // Two independently prepared ends at the same original doorway terminal can
  // force a through walker off the hallway and back. Give both ends the same
  // junction, retaining the old hallway vertices and the real door approach.
  const sourceGuides = new Map<string, Guide[]>();
  for (const guide of saved) {
    const edge = edgeById.get(guide.edgeId);
    if (!edge || !guide.hallwayJoins) continue;
    for (const terminal of [edge.from, edge.to]) {
      const list = sourceGuides.get(terminal) ?? [];
      list.push(guide);
      sourceGuides.set(terminal, list);
    }
  }
  for (const [id, choices] of stops) {
    if (choices.size !== 2) continue;
    const [a, b] = [...choices.values()];
    if (
      neighbors.get(key(a.point))?.size !== 1 ||
      neighbors.get(key(b.point))?.size !== 1 ||
      !gap(a, b) ||
      !equal(a.approach[0], b.approach[0])
    )
      continue;
    const normal = doorNormal(id),
      terminal = a.approach[0];
    if (!normal) continue;
    const common = doorwayJoin(terminal, a.point, b.point, normal);
    if (!common) continue;
    const group = sourceGuides.get(id)!;
    const checked: Guide[] = [];
    for (const initial of group) {
      const guide = found.get(initial.edgeId) ?? initial;
      const edge = edgeById.get(initial.edgeId)!;
      const [first, last] = guide.hallwayJoins!;
      if (first === last || edge.from === edge.to) break;
      const from = edge.from === id;
      const points = from
        ? [terminal, common, ...guide.pointsFeet.slice(first)]
        : [...guide.pointsFeet.slice(0, last + 1), common, terminal];
      const next: Guide = {
        ...guide,
        pointsFeet: points,
        hallwayJoins: from ? [1, 2 + last - first] : [first, last + 1],
      };
      if (
        corridorGuideLength(points) >
          1.15 * corridorGuideLength(edge.pointsFeet) +
            0.6 +
            2 * MAX_SHARED_CORRIDOR_APPROACH_FEET ||
        !qualifies(edge, next)
      )
        break;
      checked.push(next);
    }
    if (checked.length === group.length)
      for (const next of checked) found.set(next.edgeId, next);
  }
  const incident = new Map<string, { edge: IndoorEdge; known: Anchor }[]>();
  for (const e of edges) {
    if (!missing.has(e.id) || !e.enabled) continue;
    const a = anchor(e.from),
      b = anchor(e.to);
    if (Boolean(a) !== Boolean(b)) {
      const id = a ? e.to : e.from,
        rows = incident.get(id) ?? [];
      rows.push({ edge: e, known: (a ?? b)! });
      incident.set(id, rows);
    }
  }
  for (const [id, rows] of incident) {
    const normal = doorNormal(id);
    if (!normal || stops.has(id)) continue;
    const pairs = [];
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i],
          b = rows[j];
        if (!gap(a.known, b.known)) continue;
        pairs.push({
          a,
          b,
          length: corridorGuideLength([a.known.point, b.known.point]),
        });
      }
    pairs.sort((u, v) => u.length - v.length);
    for (const { a, b } of pairs) {
      const p =
        a.edge.pointsFeet[
          a.edge.from === id ? 0 : a.edge.pointsFeet.length - 1
        ];
      const point = doorwayJoin(p, a.known.point, b.known.point, normal);
      if (!point) continue;
      const mid = { point, approach: equal(p, point) ? [p] : [p, point] };
      const fit = (r: typeof a) =>
        r.edge.from === id
          ? propose(r.edge, mid, r.known)
          : propose(r.edge, r.known, mid);
      const left = fit(a),
        right = fit(b);
      if (left && right) {
        found.set(left.edgeId, left);
        found.set(right.edgeId, right);
        break;
      }
    }
  }
  return [...found.values()];
}

/** Reuse an existing through-station when another checked network ends a
 * nearby, continuing run at the same original doorway. This does not infer a
 * junction from proximity: the doorway identity, the receiving checked
 * network, and an actual through-guide at its saved station are all required.
 * Every incident guide and receiving through-guide is replayed atomically.
 */
export function reconcileCorridorDoorwayStations(
  edges: readonly IndoorEdge[],
  saved: Guide[],
  doorNormal: (terminal: string) => readonly number[] | undefined,
  qualifies: (edge: IndoorEdge, guide: Guide) => boolean,
  options: {
    origins: ReadonlyMap<string, string>;
    /** Proposal bound only; complete physical/policy replay is still required. */
    maxStationShiftFeet: number;
  },
): { guides: Guide[]; junctions: CorridorRecoveredJunction[] } {
  const found = new Map<string, Guide>();
  const junctions: CorridorRecoveredJunction[] = [];
  const bound = options.maxStationShiftFeet;
  if (!Number.isFinite(bound) || bound <= 0) return { guides: [], junctions };
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const byId = new Map(saved.map((guide) => [guide.edgeId, guide]));
  if (byId.size !== saved.length) return { guides: [], junctions };
  const stops = new Map<string, Map<string, Anchor>>();
  const incident = new Map<string, Guide[]>();
  const neighbors = new Map<string, Map<string, Point>>();
  const core = (guide: Guide) =>
    guide.hallwayJoins
      ? guide.pointsFeet.slice(guide.hallwayJoins[0], guide.hallwayJoins[1] + 1)
      : [];
  const approach = (guide: Guide, terminal: string) => {
    const edge = edgeById.get(guide.edgeId)!;
    const [first, last] = guide.hallwayJoins!;
    return edge.from === terminal
      ? guide.pointsFeet.slice(0, first + 1)
      : guide.pointsFeet.slice(last).toReversed();
  };
  const join = (a: Point, b: Point) => {
    if (equal(a, b)) return;
    const adjacent = neighbors.get(key(a)) ?? new Map<string, Point>();
    adjacent.set(key(b), b);
    neighbors.set(key(a), adjacent);
  };
  for (const guide of saved) {
    const edge = edgeById.get(guide.edgeId);
    if (!edge || !guide.hallwayJoins) continue;
    const points = core(guide);
    for (let i = 1; i < points.length; i++) {
      join(points[i - 1], points[i]);
      join(points[i], points[i - 1]);
    }
    for (const terminal of [edge.from, edge.to]) {
      const path = approach(guide, terminal),
        point = path.at(-1)!;
      const choices = stops.get(terminal) ?? new Map<string, Anchor>();
      if (!choices.has(key(point)))
        choices.set(key(point), { point, approach: path });
      stops.set(terminal, choices);
      const group = incident.get(terminal) ?? [];
      group.push(guide);
      incident.set(terminal, group);
    }
  }
  const claimed = new Set<string>();
  const headingAgrees = (a: Point, b: Point, c: Point, d: Point) => {
    const x = b[0] - a[0],
      y = b[1] - a[1],
      u = d[0] - c[0],
      v = d[1] - c[1];
    const lengths = Math.hypot(x, y) * Math.hypot(u, v);
    return lengths > 0 && x * u + y * v >= 0.9 * lengths;
  };
  for (const [terminal, choices] of [...stops].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (choices.size !== 2) continue;
    const values = [...choices.values()];
    const end = values.find(
      (value) => neighbors.get(key(value.point))?.size === 1,
    );
    const through = values.find(
      (value) => neighbors.get(key(value.point))?.size === 2,
    );
    const normal = doorNormal(terminal);
    if (
      !end ||
      !through ||
      !normal ||
      !Number.isFinite(normal[0]) ||
      !Number.isFinite(normal[1]) ||
      Math.hypot(normal[0], normal[1]) === 0 ||
      !equal(end.approach[0], through.approach[0]) ||
      corridorGuideLength([end.point, through.point]) >
        Math.min(bound, MAX_SHARED_CORRIDOR_APPROACH_FEET) ||
      end.point[2] !== through.point[2]
    )
      continue;
    const preceding = neighbors.get(key(end.point))!.values().next().value!;
    const receiving = [...neighbors.get(key(through.point))!.values()];
    // The duplicate endpoint continues toward the existing station and its
    // incoming core follows one of that station's already checked arms.
    if (
      !headingAgrees(preceding, end.point, end.point, through.point) ||
      !receiving.some((p) =>
        headingAgrees(end.point, preceding, through.point, p),
      )
    )
      continue;
    const group = incident.get(terminal)!;
    const origins = new Set(
      group.flatMap((guide) => {
        const origin = options.origins.get(guide.edgeId);
        return equal(approach(guide, terminal).at(-1)!, through.point) &&
          origin !== undefined &&
          /^(primary|legacy):\d+$/.test(origin)
          ? [origin]
          : [];
      }),
    );
    // A receiving guide must come from the same checked network AND share
    // the exact saved tail from this station to the same other original
    // terminal. An unrelated path crossing the coordinate, even one carrying
    // the same origin label, supplies no junction authority.
    const receivingGuides = saved.filter((guide) => {
      const origin = options.origins.get(guide.edgeId);
      if (origin === undefined || !origins.has(origin)) return false;
      const edge = edgeById.get(guide.edgeId);
      if (
        !edge ||
        !guide.hallwayJoins ||
        edge.from === terminal ||
        edge.to === terminal
      )
        return false;
      const [first, last] = guide.hallwayJoins!;
      return guide.pointsFeet.some((point, index) => {
        if (index <= first || index >= last || !equal(point, through.point))
          return false;
        return group.some((witness) => {
          if (
            options.origins.get(witness.edgeId) !== origin ||
            !equal(approach(witness, terminal).at(-1)!, through.point)
          )
            return false;
          const source = edgeById.get(witness.edgeId)!;
          const other = source.from === terminal ? source.to : source.from;
          const [start, finish] = witness.hallwayJoins!;
          const tail =
            source.from === terminal
              ? witness.pointsFeet.slice(start)
              : witness.pointsFeet.slice(0, finish + 1).toReversed();
          const shared =
            edge.to === other
              ? guide.pointsFeet.slice(index)
              : edge.from === other
                ? guide.pointsFeet.slice(0, index + 1).toReversed()
                : null;
          return (
            shared !== null && JSON.stringify(shared) === JSON.stringify(tail)
          );
        });
      });
    });
    if (receivingGuides.length === 0) continue;
    const affected = [
      ...new Map(
        [...group, ...receivingGuides].map((guide) => [guide.edgeId, guide]),
      ).values(),
    ];
    if (affected.some((guide) => claimed.has(guide.edgeId))) continue;
    const cell = edgeById.get(group[0].edgeId)?.nativeCellId;
    if (
      !cell ||
      affected.some((guide) => {
        const edge = edgeById.get(guide.edgeId);
        return (
          !edge ||
          !edge.enabled ||
          edge.kind !== "walk" ||
          edge.from === edge.to ||
          edge.nativeCellId !== cell ||
          guide.kind !== "shared-corridor" ||
          core(guide).length < 2 ||
          guide.pointsFeet.some((p) => p[2] !== through.point[2])
        );
      })
    )
      continue;
    const proposed = new Map<string, Guide>();
    for (const guide of group) {
      const edge = edgeById.get(guide.edgeId)!;
      const from = edge.from === terminal;
      const [first, last] = guide.hallwayJoins!;
      const lane = core(guide).map((p): Point => [...p]);
      lane[from ? 0 : lane.length - 1] = [...through.point];
      const door = through.approach.map((p): Point => [...p]);
      const pointsFeet = from
        ? [...door.slice(0, -1), ...lane, ...guide.pointsFeet.slice(last + 1)]
        : [
            ...guide.pointsFeet.slice(0, first),
            ...lane,
            ...door.toReversed().slice(1),
          ];
      const start = from ? door.length - 1 : first;
      const next: Guide = {
        ...guide,
        pointsFeet,
        hallwayJoins: [start, start + lane.length - 1],
      };
      if (JSON.stringify(next) !== JSON.stringify(guide))
        proposed.set(guide.edgeId, next);
    }
    const checked = affected.map(
      (guide) => proposed.get(guide.edgeId) ?? guide,
    );
    if (
      !checked.every((guide) => {
        const edge = edgeById.get(guide.edgeId)!;
        return (
          equal(guide.pointsFeet[0], edge.pointsFeet[0]) &&
          equal(guide.pointsFeet.at(-1)!, edge.pointsFeet.at(-1)!) &&
          corridorGuideLength(guide.pointsFeet) <=
            1.15 * corridorGuideLength(edge.pointsFeet) +
              0.6 +
              2 * MAX_SHARED_CORRIDOR_APPROACH_FEET &&
          qualifies(edge, guide)
        );
      })
    )
      continue;
    const receipt: CorridorRecoveredJunction = {
      kind: "same-original-doorway",
      terminalId: terminal,
      pointFeet: [...through.point],
      approachFeet: through.approach.map((p): Point => [...p]),
      incidentGuideIds: group.map((guide) => guide.edgeId).sort(),
      throughGuideIds: receivingGuides.map((guide) => guide.edgeId).sort(),
    };
    const contacts = new Set<string>();
    const ids = checked.map((guide) => guide.edgeId).sort();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        contacts.add(contactKey(ids[i], ids[j], pointContact(through.point)));
    const approachContacts = corridorChainTopologyContacts(
      [0, 1].map((i) => ({
        id: `approach:${i}`,
        from: terminal,
        to: `station:${terminal}`,
        points: through.approach.map(([x, y]): [number, number] => [x, y]),
      })),
    );
    for (let i = 0; i < receipt.incidentGuideIds.length; i++)
      for (let j = i + 1; j < receipt.incidentGuideIds.length; j++)
        for (const { at } of approachContacts)
          contacts.add(
            contactKey(
              receipt.incidentGuideIds[i],
              receipt.incidentGuideIds[j],
              at,
            ),
          );
    junctionProofs.set(receipt, {
      receipt: JSON.stringify(receipt),
      guides: new Map(
        checked.map((guide) => [guide.edgeId, JSON.stringify(guide)]),
      ),
      edges: new Map(
        checked.map((guide) => [
          guide.edgeId,
          edgeIdentity(edgeById.get(guide.edgeId)!),
        ]),
      ),
      contacts,
    });
    for (const guide of checked) claimed.add(guide.edgeId);
    for (const guide of proposed.values()) found.set(guide.edgeId, guide);
    junctions.push(receipt);
  }
  return { guides: [...found.values()], junctions };
}
