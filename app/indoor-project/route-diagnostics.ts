import { createIndoorExclusionQuery } from "./indoor-exclusions";
import type { IndoorDataset, IndoorEdge } from "./contract";
import { projectRoutingGraph } from "./routing-graph";
import { findProjectRoute, projectRouteFloorFailure } from "./routing";
import { createNativeFloorHoleQuery } from "./walking-support";
import type { RouteBlocker } from "./route-policy";

export type ProjectRouteDiagnostic = {
  kind: "connected" | "missing-entrance" | "source-gap" | "blocked";
  message: string;
  blockers: RouteBlocker[];
  /** A diagnostic witness, never a route offered to the visitor. */
  sourceEdgeIds: string[];
  reviewRoomKey?: string;
  reviewEdgeId?: string;
};
type Link = {
  to: string;
  edge: IndoorEdge;
  blockers: RouteBlocker[];
};
type State = { id: string; blocked: number; metres: number };
const less = (a: State, b: State) =>
  a.blocked < b.blocked || (a.blocked === b.blocked && a.metres < b.metres);

/** Build once per dataset/profile for audits. Choose a source path with the
 * fewest blocked links, then shortest distance; report that witness honestly,
 * without claiming every possible path has the same cause. */
export function createProjectRouteDiagnostics(
  data: IndoorDataset,
  mode: "public" | "accessible" = "public",
) {
  const { records, allAdjacency: adjacency } = projectRoutingGraph(data, mode);
  const roomLabel = (key: string) => {
    const r = records.get(key);
    return r ? `${r.number} · ${r.name}` : key;
  };
  const deduplicate = (blockers: RouteBlocker[]) => [
    ...new Map(
      blockers.map((b) => [JSON.stringify([b.kind, b.edgeId, b.roomKey]), b]),
    ).values(),
  ];
  const result = (
    kind: ProjectRouteDiagnostic["kind"],
    message: string,
    blockers: RouteBlocker[] = [],
    sourceEdgeIds: string[] = [],
    fallback?: string,
  ): ProjectRouteDiagnostic => ({
    kind,
    message,
    blockers: deduplicate(blockers),
    sourceEdgeIds,
    reviewEdgeId: blockers.find(
      (b) =>
        ["disabled", "direction", "step-free"].includes(b.kind) &&
        data.edges.some((e) => e.id === b.edgeId),
    )?.edgeId,
    reviewRoomKey:
      blockers.find((b) => b.roomKey && records.has(b.roomKey))?.roomKey ??
      blockers
        .flatMap(
          (b) => data.edges.find((e) => e.id === b.edgeId)?.roomKeys ?? [],
        )
        .find((key) => records.has(key)) ??
      fallback,
  });
  const linkBlockers = (link: Link, _start: string, _end: string) =>
    link.blockers;
  function inspect(startKey: string, endKey: string): ProjectRouteDiagnostic {
    // A retained inspector must observe a door closure or metadata edit even
    // when callers mutate the reviewed dataset in place.
    if (projectRoutingGraph(data, mode).allAdjacency !== adjacency)
      return createProjectRouteDiagnostics(data, mode).inspect(
        startKey,
        endKey,
      );
    const nativeFloorHoleCrossings = createNativeFloorHoleQuery(data);
    const start = records.get(startKey),
      end = records.get(endKey);
    if (!start?.arrivalNodeId || !end?.arrivalNodeId)
      return result(
        "missing-entrance",
        "This location has no prepared entrance connection. Open source review to check its entrance.",
        [],
        [],
        start?.arrivalNodeId ? endKey : startKey,
      );
    const outside = createIndoorExclusionQuery(data);
    for (const room of [start, end]) {
      const node = data.nodes.find((n) => n.id === room.arrivalNodeId);
      const excluded = node ? outside([node.pointFeet]) : [];
      if (excluded.length) {
        const offLimits = excluded.some((id) =>
          data.indoorExclusions?.areas.some(
            (area) => area.id === id && area.reason === "off-limits",
          ),
        );
        return result(
          "blocked",
          offLimits
            ? `${roomLabel(room.key)} is in a reviewed non-traversable footprint excluded from selection and directions.`
            : `${roomLabel(room.key)} is in a confirmed outdoor area excluded from indoor directions. Outdoor routing is not available yet.`,
          [
            {
              kind: offLimits ? "off-limits" : "outdoor",
              edgeId: "",
              roomKey: room.key,
            },
          ],
        );
      }
      if (!room.walkable || room.access === "staff") {
        const kind = room.walkable ? "staff" : "non-walkable";
        return result(
          "blocked",
          `The map marks ${roomLabel(room.key)} as ${kind === "staff" ? "staff-only" : "not walkable"}. Review this location’s routing metadata.`,
          [{ kind, edgeId: "", roomKey: room.key }],
        );
      }
    }
    const best = new Map<string, State>();
    const previous = new Map<
      string,
      { from: string; link: Link; blockers: RouteBlocker[] }
    >();
    const heap: State[] = [];
    const push = (state: State) => {
      heap.push(state);
      let i = heap.length - 1;
      while (i) {
        const parent = (i - 1) >> 1;
        if (!less(heap[i], heap[parent])) break;
        [heap[i], heap[parent]] = [heap[parent], heap[i]];
        i = parent;
      }
    };
    const pop = () => {
      const first = heap[0],
        last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const left = i * 2 + 1,
            right = left + 1;
          let child = i;
          if (left < heap.length && less(heap[left], heap[child])) child = left;
          if (right < heap.length && less(heap[right], heap[child]))
            child = right;
          if (child === i) break;
          [heap[i], heap[child]] = [heap[child], heap[i]];
          i = child;
        }
      }
      return first;
    };
    const initial = { id: start.arrivalNodeId, blocked: 0, metres: 0 };
    best.set(initial.id, initial);
    push(initial);
    while (heap.length > 0) {
      const current = pop();
      if (best.get(current.id) !== current) continue;
      if (current.id === end.arrivalNodeId) break;
      for (const link of adjacency.get(current.id) ?? []) {
        const blockers = linkBlockers(link, startKey, endKey);
        const candidate = {
          id: link.to,
          blocked: current.blocked + Number(blockers.length > 0),
          metres: current.metres + Math.max(0, link.edge.lengthMetres),
        };
        const prior = best.get(candidate.id);
        if (prior && !less(candidate, prior)) continue;
        best.set(candidate.id, candidate);
        previous.set(candidate.id, { from: current.id, link, blockers });
        push(candidate);
      }
    }
    if (!best.has(end.arrivalNodeId)) {
      // Compilation deliberately omits circulation through authored restricted
      // rooms. Native doorway inventory can explain that omission without
      // inventing a graph path or treating every disconnected network as staff.
      for (const room of [start, end]) {
        const entrances = (data.doors ?? []).filter((d) =>
          d.roomKeys.includes(room.key),
        );
        const restricted = entrances.flatMap((door) => {
          if (door.state !== "connected") return [];
          return door.roomKeys
            .filter((key) => key !== room.key)
            .flatMap((key) => {
              const other = records.get(key);
              return other && (!other.walkable || other.access === "staff")
                ? [
                    {
                      kind: (other.walkable
                        ? "staff"
                        : "non-walkable") as RouteBlocker["kind"],
                      roomKey: key,
                      edgeId: door.id,
                      nativeElementId: door.nativeElementId,
                    },
                  ]
                : [];
            });
        });
        if (
          entrances.length > 0 &&
          entrances.every(
            (door) =>
              door.state === "connected" &&
              door.roomKeys.some((key) => key !== room.key) &&
              door.roomKeys
                .filter((key) => key !== room.key)
                .every((key) => {
                  const other = records.get(key);
                  return other && (!other.walkable || other.access === "staff");
                }),
          )
        ) {
          const names = [
            ...new Set(restricted.map((b) => roomLabel(b.roomKey))),
          ];
          return result(
            "blocked",
            `The recorded entrances for ${roomLabel(room.key)} lead into ${names.join(", ")}, marked ${restricted.every((b) => b.kind === "staff") ? "staff-only" : "restricted or not walkable"} in the source review. Public circulation through that area was not prepared. Review its access metadata if this is incorrect.`,
            restricted,
            [],
            room.key,
          );
        }
      }
      const locations =
        start.building === end.building
          ? "these locations"
          : `Building ${start.building} and Building ${end.building}`;
      return result(
        "source-gap",
        `The prepared map is missing a connection between ${locations}. Open source review to check the connecting doors or corridors.`,
        [],
        [],
        startKey,
      );
    }
    const path = [];
    let id = end.arrivalNodeId;
    while (id !== start.arrivalNodeId) {
      const step = previous.get(id)!;
      path.unshift(step);
      id = step.from;
    }
    const blockers = deduplicate(path.flatMap((s) => s.blockers));
    const sourceEdgeIds = path.map((s) => s.link.edge.id);
    if (blockers.length === 0) {
      if (
        data.walkingSupport &&
        path.some(
          (step) =>
            ["walk", "door", "opening"].includes(step.link.edge.kind) &&
            nativeFloorHoleCrossings(step.link.edge.pointsFeet).length > 0,
        ) &&
        !findProjectRoute(data, startKey, endKey, mode)
      ) {
        const floors = projectRouteFloorFailure(data, startKey, endKey, mode);
        if (floors.length > 0)
          return result(
            "blocked",
            "The saved walking connection crosses a native floor opening. No supported alternative could be found. Review the slab opening and connecting corridor.",
            floors.map((nativeElementId) => ({
              kind: "native-floor-hole",
              edgeId: "",
              nativeElementId,
            })),
            sourceEdgeIds,
            startKey,
          );
      }
      return result("connected", "", [], sourceEdgeIds);
    }
    const kinds = new Set(blockers.map((b) => b.kind));
    const names = (kind: RouteBlocker["kind"]) =>
      [
        ...new Set(
          blockers
            .filter((b) => b.kind === kind && b.roomKey)
            .map((b) => roomLabel(b.roomKey!)),
        ),
      ]
        .slice(0, 3)
        .join(", ");
    const clauses: string[] = [];
    if (kinds.has("outdoor"))
      clauses.push(
        "crosses a confirmed outdoor area excluded from indoor directions; outdoor routing is not available yet",
      );
    if (kinds.has("off-limits"))
      clauses.push(
        "crosses a reviewed non-traversable footprint excluded from selection and directions",
      );
    if (kinds.has("staff"))
      clauses.push(`crosses ${names("staff")}, marked staff-only in the map`);
    if (kinds.has("disabled"))
      clauses.push(
        `uses disabled entrances or connections (${[...new Set(blockers.filter((b) => b.kind === "disabled").map((b) => (b.nativeElementId ? `element ${b.nativeElementId}` : b.edgeId)))].slice(0, 3).join(", ")})`,
      );
    if (kinds.has("non-walkable"))
      clauses.push(`crosses ${names("non-walkable")}, marked not walkable`);
    if (kinds.has("missing-room"))
      clauses.push("references an area missing from the prepared map");
    if (kinds.has("direction"))
      clauses.push("crosses a connection against its saved travel direction");
    if (kinds.has("source-proof"))
      clauses.push(
        "uses a source doorway whose proof no longer matches the model, drawing registration or supporting floors",
      );
    if (kinds.has("native-circulation-proof"))
      clauses.push(
        "uses a walking connection outside its verified native floor boundaries or with stale boundary evidence",
      );
    if (kinds.has("native-floor-hole"))
      clauses.push(
        "crosses a native floor opening without supported floor geometry",
      );
    if (kinds.has("step-free"))
      clauses.push(
        "includes stairs or connections without confirmed step-free access",
      );
    const message =
      kinds.size === 1 && kinds.has("step-free")
        ? "No confirmed step-free route connects these locations. Stairs and unverified connections are excluded; try Public review or check the route in source review."
        : `No route is available under the current routing metadata. A source path ${clauses.join("; ")}. Review this connection or area.`;
    return result("blocked", message, blockers, sourceEdgeIds, startKey);
  }
  return { inspect, adjacency, linkBlockers };
}
