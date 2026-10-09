import { nativeDoorFloorBlockers } from "./native-door-floor-support";
import { nativeStairRouteQualified } from "./native-source-stair";
import { createIndoorExclusionQuery } from "./indoor-exclusions";
import { routingCalculationValue } from "./routing-cache";
import { hasReviewedThroughNavigation } from "./through-navigation";
import type { IndoorEdge, IndoorRecord, IndoorDataset } from "./contract";
import { validatedSourceDoorProof } from "./routing-apertures";
import { validatedNativeRampSurface } from "./native-ramp-surface";
import {
  nativeCirculationCells,
  nativeCirculationWalkBlockers,
} from "./native-circulation";
import type { WalkPassage } from "./route-passages";

export type RouteBlockerKind =
  | "outdoor"
  | "off-limits"
  | "disabled"
  | "staff"
  | "non-walkable"
  | "missing-room"
  | "direction"
  | "step-free"
  | "native-floor-hole"
  | "source-proof"
  | "native-circulation-proof";
export type RouteBlocker = {
  kind: RouteBlockerKind;
  edgeId: string;
  roomKey?: string;
  nativeElementId?: number;
};
export const isProjectDestination = (room: IndoorRecord) =>
  room.walkable &&
  room.access !== "staff" &&
  // Generated floor approaches are graph infrastructure, not broken visitor
  // places. A demonstrated arrival keeps a named approach selectable.
  (room.properties.generatedLanding !== true || !!room.arrivalNodeId);

/** Shared by routing and diagnostics. Diagnostics never authorize a blocked link. */
export function projectLinkPolicy(
  records: Map<string, IndoorRecord>,
  edge: IndoorEdge,
  passages: WalkPassage[],
  forward: boolean,
  mode: "public" | "accessible",
  modelSha256: string,
  data: IndoorDataset,
  nativeCellIds?: Set<string>,
  nativeWalkBlockers?: Set<string>,
) {
  const policies = routingCalculationValue(
    data,
    "routing-link-policies",
    () =>
      new WeakMap<
        IndoorEdge,
        Map<
          boolean,
          {
            public: { blockers: RouteBlocker[]; requiredRooms: string[] };
            accessible: { blockers: RouteBlocker[]; requiredRooms: string[] };
          }
        >
      >(),
  );
  const previous = policies.get(edge)?.get(forward);
  if (previous) return previous[mode];
  const dependencies = [edge, ...passages.map((p) => p.edge)];
  const roomKeys = [...new Set(dependencies.flatMap((e) => e.roomKeys))];
  const blockers: RouteBlocker[] = [];
  const add = (kind: RouteBlockerKind, dependency = edge, roomKey?: string) =>
    blockers.push({
      kind,
      edgeId: dependency.id,
      roomKey,
      nativeElementId: dependency.nativeElementId,
    });
  if ((nativeWalkBlockers ?? nativeCirculationWalkBlockers(data)).has(edge.id))
    add("native-circulation-proof");
  if (
    edge.nativeCellId &&
    !(
      nativeCellIds ?? new Set(nativeCirculationCells(data).map((c) => c.id))
    ).has(edge.nativeCellId)
  )
    add("native-circulation-proof");
  const outside = routingCalculationValue(data, "indoor-exclusion-query", () =>
    createIndoorExclusionQuery(data),
  );
  const nodePoints = routingCalculationValue(
    data,
    "routing-node-points",
    () => new Map(data.nodes.map((n) => [n.id, n.pointFeet])),
  );
  const doorFloorBlockers = routingCalculationValue(
    data,
    "native-door-floor-blockers",
    () => nativeDoorFloorBlockers(data),
  );
  for (const dependency of dependencies) {
    if (doorFloorBlockers.has(dependency.id))
      add("native-floor-hole", dependency);
    if (!nativeStairRouteQualified(data, dependency))
      add("source-proof", dependency);
    if (
      (dependency.nativeRampSurface ||
        (data.nativeIndoorEnvelopes && dependency.kind === "ramp")) &&
      !validatedNativeRampSurface(data, dependency)
    )
      add("source-proof", dependency);
    const exclusions = new Set([
      ...outside.forEdge(dependency.pointsFeet, dependency),
      ...[dependency.from, dependency.to].flatMap((id) => {
        const point = nodePoints.get(id);
        return point ? outside([point]) : [];
      }),
    ]);
    const reasons = new Set(
      [...exclusions].map(
        (id) =>
          data.indoorExclusions?.areas.find((area) => area.id === id)?.reason ??
          "outdoor",
      ),
    );
    for (const reason of reasons) add(reason, dependency);
    if (
      dependency.sourceDoorProof &&
      !validatedSourceDoorProof(data, dependency)
    )
      add("source-proof", dependency);
    if (!dependency.enabled) add("disabled", dependency);
    if (dependency.accessible !== "yes") add("step-free", dependency);
  }
  if (["stairs", "local-steps", "escalator"].includes(edge.kind))
    add("step-free");
  for (const key of roomKeys) {
    const room = records.get(key);
    if (!room) add("missing-room", edge, key);
    else if (!room.walkable) add("non-walkable", edge, key);
    else if (room.access === "staff") add("staff", edge, key);
  }
  const contrary = (e: IndoorEdge, dir: boolean) =>
    (e.direction === "from-to" && !dir) || (e.direction === "to-from" && dir);
  if (contrary(edge, forward)) add("direction");
  for (const passage of passages)
    if (contrary(passage.edge, forward ? passage.forward : !passage.forward))
      add("direction", passage.edge);
  const requiredRooms = roomKeys.filter((key) => {
    const room = records.get(key);
    return (
      room &&
      isProjectDestination(room) &&
      !room.circulation &&
      !hasReviewedThroughNavigation(room, modelSha256) &&
      !room.stair &&
      !["elevator", "escalator"].includes(edge.kind)
    );
  });
  // Physical/access proof is identical in both profiles. Retain its exact
  // ordered blockers once; the public profile omits only step-free vetoes.
  // Authoring calculations still discard this map after each edit/check.
  const result = {
    public: {
      blockers: blockers.filter((b) => b.kind !== "step-free"),
      requiredRooms,
    },
    accessible: { blockers, requiredRooms },
  };
  const directions = policies.get(edge) ?? new Map();
  directions.set(forward, result);
  policies.set(edge, directions);
  return result[mode];
}
