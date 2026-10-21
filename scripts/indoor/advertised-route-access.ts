import { isDeepStrictEqual } from "node:util";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import {
  projectRoutingOptionsKey,
  type ProjectRoutingOptions,
} from "../../app/indoor-project/routing-options";

/** Matches the existing systemic-pathways case file. These are requests, never
 * externally asserted route results or access grants. */
export type AdvertisedRouteCase = {
  id: string;
  from: string;
  to: string;
  mode: "public" | "accessible";
  options?: ProjectRoutingOptions;
};

export function validateAdvertisedRouteCases(
  value: unknown,
): asserts value is AdvertisedRouteCase[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000)
    throw new Error(
      "Supply a nonempty list of at most 1000 advertised routes.",
    );
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      ids.has(item.id) ||
      typeof item.from !== "string" ||
      !item.from ||
      typeof item.to !== "string" ||
      !item.to ||
      !["public", "accessible"].includes(item.mode)
    )
      throw new Error(
        "Invalid or duplicate advertised-route identity/profile.",
      );
    ids.add(item.id);
    if (
      item.options !== undefined &&
      (!item.options ||
        Array.isArray(item.options) ||
        typeof item.options !== "object" ||
        Object.keys(item.options).some(
          (key) =>
            ![
              "endpointMode",
              "preferHallways",
              "allowOtherRoomTransit",
              "excludedNativeStairIds",
              "useSharedCorridorGuides",
            ].includes(key),
        ))
    )
      throw new Error("Unsupported advertised-route options.");
    projectRoutingOptionsKey(item.options);
  }
}

const edgePolicyIdentity = (edge: IndoorEdge) => ({
  id: edge.id,
  from: edge.from,
  to: edge.to,
  kind: edge.kind,
  roomKeys: edge.roomKeys,
  accessible: edge.accessible,
  enabled: edge.enabled,
  direction: edge.direction,
  nativeElementId: edge.nativeElementId,
});

/** An additional refusal gate for confirmed-public advertising. Normal runtime
 * routing and its unknown-access disclosures are unchanged. Geometry is still
 * checked by the existing calculator, not certified by this access report. */
export function auditAdvertisedRouteAccess(
  data: IndoorDataset,
  requests: AdvertisedRouteCase[],
) {
  validateAdvertisedRouteCases(requests);
  const records = new Map(data.records.map((room) => [room.key, room]));
  const edges = new Map(data.edges.map((edge) => [edge.id, edge]));
  let calculate: ReturnType<typeof createWorkerRouteCalculator> | undefined;
  const results = requests.map((request) => {
    const problems: { kind: string; key: string }[] = [];
    const roomKeys = new Set([request.from, request.to]);
    for (const key of roomKeys) {
      const room = records.get(key);
      if (room) {
        if (room.access !== "public")
          problems.push({ kind: `${room.access}-endpoint-access`, key });
        if (!room.walkable)
          problems.push({ kind: "non-walkable-endpoint", key });
        if (!room.arrivalNodeId)
          problems.push({ kind: "missing-endpoint-entrance", key });
      } else {
        problems.push({ kind: "missing-endpoint", key });
      }
    }
    if (request.from === request.to)
      problems.push({ kind: "same-endpoint", key: request.from });
    // Unknown endpoints already disqualify the advertised route. Avoid warming
    // an expensive campus graph merely to establish this independent refusal.
    const calculated =
      problems.length > 0
        ? undefined
        : (calculate ??= createWorkerRouteCalculator(data))(
            request.from,
            request.to,
            request.mode,
            request.options,
          );
    const route = calculated?.route;
    const sourceEdges = new Map<string, IndoorEdge>();
    if (calculated && !route)
      problems.push({ kind: "normal-calculator-refused", key: request.id });
    if (route) {
      for (const edge of route.edges) {
        const source = edges.get(edge.id);
        if (
          !source ||
          !isDeepStrictEqual(
            edgePolicyIdentity(source),
            edgePolicyIdentity(edge),
          )
        )
          problems.push({ kind: "unbound-route-edge-policy", key: edge.id });
        else sourceEdges.set(source.id, source);
      }
      // Centered walks can contain physical door dependencies that are absent
      // from the selected graph edges. Their original owners remain required.
      for (const id of route.doorEdgeIds ?? []) {
        const edge = edges.get(id);
        if (edge) {
          sourceEdges.set(id, edge);
        } else {
          problems.push({ kind: "missing-door-dependency", key: id });
        }
      }
      for (const edge of sourceEdges.values()) {
        if (edge.roomKeys.length === 0)
          problems.push({ kind: "unowned-source-edge-access", key: edge.id });
        if (!edge.enabled)
          problems.push({ kind: "disabled-source-edge", key: edge.id });
        if (
          request.mode === "accessible" &&
          (edge.accessible !== "yes" ||
            ["stairs", "local-steps", "escalator"].includes(edge.kind))
        )
          problems.push({ kind: "unconfirmed-step-free-edge", key: edge.id });
        for (const key of edge.roomKeys) roomKeys.add(key);
      }
      for (const key of route.unknownAccessAreas) roomKeys.add(key);
      for (const key of roomKeys) {
        const room = records.get(key);
        if (!room) problems.push({ kind: "missing-source-owner", key });
        else if (room.access !== "public")
          problems.push({ kind: `${room.access}-source-owner-access`, key });
        if (room && !room.walkable)
          problems.push({ kind: "non-walkable-source-owner", key });
      }
      if (request.mode === "accessible" && route.unknownAccessibilityEdges > 0)
        problems.push({
          kind: "calculator-step-free-uncertainty",
          key: request.id,
        });
    }
    return {
      ...request,
      routeComputed: !!calculated,
      routeAvailable: calculated ? !!route : null,
      confirmedAccessForAdvertisedProfile: !!route && problems.length === 0,
      problems,
      sourceOwnerKeys: [...roomKeys].sort(),
      sourceEdgeIds: [...sourceEdges.keys()].sort(),
      unknownAccessAreas: route?.unknownAccessAreas ?? [],
      unknownAccessibilityEdges: route?.unknownAccessibilityEdges ?? null,
      diagnostic: calculated?.diagnostic,
    };
  });
  return {
    format: "advertised-route-access-audit-v1",
    source: data.source,
    advertisedAccessPassed: results.every(
      (result) => result.confirmedAccessForAdvertisedProfile,
    ),
    geometryAuthority: false,
    operationalHoursAuthority: false,
    physicalDeviceAuthority: false,
    routesComputed: results.filter((result) => result.routeComputed).length,
    routes: results,
  };
}
