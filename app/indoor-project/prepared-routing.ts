import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { IndoorDataset } from "./contract";
import { routingCalculationValue, routingSnapshot } from "./routing-cache";
import { routeWorkerDataset } from "./route-worker-dataset";
export const ROUTING_GUIDE_VERSION = "native-walking-guides-1";
export type PreparedRouting = {
  version: 1;
  resolverVersion: string;
  sourceModelSha256: string;
  sourceGeometryKey: string;
  guides: { edgeId: string; pointsFeet: [number, number, number][] }[];
};
type PreparedDataset = IndoorDataset & { preparedRouting?: PreparedRouting };
const bindings = new WeakMap<
  IndoorDataset,
  { snapshot: string; digest: string }
>();
/** The routing-physical projection that master, route worker and campus viewer
 * share. It removes ONLY fields that no route policy, blocker or guide
 * calculation reads: render tessellation (circulation containedDisplay and
 * displayResidualTopology, stair/ramp display bodies, explore mapping, windows),
 * authoring note text on indoor exclusions and superseded cached stair treads.
 * Every physical/policy input (records, nodes, edges, doors, walls, material,
 * envelopes, seals, frame returns, exclusion footprints, walking support,
 * exact circulation topology and cells) stays in the binding, so any physical
 * or permission edit still invalidates the prepared guides. Validation of the
 * removed render fields is unchanged and still runs on their own paths. */
export function preparedRoutingBindingDataset(
  data: IndoorDataset,
): IndoorDataset {
  const worker = routeWorkerDataset(data);
  return {
    ...worker,
    indoorExclusions: worker.indoorExclusions && {
      ...worker.indoorExclusions,
      areas: worker.indoorExclusions.areas.map(({ notes: _, ...area }) => area),
    },
    stairDisplay: worker.stairDisplay && {
      ...worker.stairDisplay,
      flights: [],
      sourceFlights: worker.stairDisplay.sourceFlights?.map(
        ({ historicalPreparedTreads: _, ...flight }) => flight,
      ),
    },
  } as IndoorDataset;
}
/** Includes policy as well as geometry: a source edit may change which door
 * an otherwise identical walking branch is allowed to cross. The digest is
 * computed over the shared routing-physical projection, so the same prepared
 * guides bind in the authoring master, the route worker and the viewer. */
export function preparedRoutingKey(data: IndoorDataset): string {
  return routingCalculationValue(data, "prepared-routing-binding", () => {
    const binding = preparedRoutingBindingDataset(data);
    const snapshot = JSON.stringify([
      routingSnapshot(binding),
      binding.walls,
      binding.alignment,
      binding.nodes,
    ]);
    const previous = bindings.get(data);
    if (previous?.snapshot === snapshot) return previous.digest;
    const digest = bytesToHex(sha256(new TextEncoder().encode(snapshot)));
    bindings.set(data, { snapshot, digest });
    return digest;
  });
}
export function validatePreparedRouting(data: IndoorDataset): void {
  const prepared = (data as PreparedDataset).preparedRouting;
  if (prepared === undefined) return;
  const ids = new Set<string>();
  if (
    !prepared ||
    prepared.version !== 1 ||
    typeof prepared.resolverVersion !== "string" ||
    prepared.resolverVersion.length > 128 ||
    typeof prepared.sourceModelSha256 !== "string" ||
    prepared.sourceModelSha256.length > 128 ||
    typeof prepared.sourceGeometryKey !== "string" ||
    !/^[a-f0-9]{64}$/.test(prepared.sourceGeometryKey) ||
    !Array.isArray(prepared.guides) ||
    prepared.guides.length > data.edges.length ||
    prepared.guides.some((g) => {
      if (
        !g ||
        typeof g.edgeId !== "string" ||
        g.edgeId.length > 4096 ||
        ids.has(g.edgeId) ||
        !Array.isArray(g.pointsFeet) ||
        g.pointsFeet.length < 2 ||
        g.pointsFeet.length > 10_000 ||
        g.pointsFeet.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 3 ||
            p.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e8),
        )
      )
        return true;
      ids.add(g.edgeId);
      return false;
    })
  )
    throw new Error("Invalid prepared walking guides.");
}
export function preparedWalkingGuides(data: IndoorDataset) {
  return routingCalculationValue(data, "prepared-walking-guides", () => {
    const p = (data as PreparedDataset).preparedRouting;
    if (
      !p ||
      p.version !== 1 ||
      p.resolverVersion !== ROUTING_GUIDE_VERSION ||
      p.sourceModelSha256 !== data.source.modelSha256 ||
      p.sourceGeometryKey !== preparedRoutingKey(data)
    )
      return new Map<string, [number, number, number][]>();
    const edges = new Map(data.edges.map((e) => [e.id, e]));
    return new Map(
      p.guides
        .filter((g) => {
          const edge = edges.get(g.edgeId);
          return (
            edge?.kind === "walk" &&
            g.pointsFeet.length >= 2 &&
            [0, g.pointsFeet.length - 1].every((index, j) =>
              g.pointsFeet[index].every(
                (v, k) =>
                  Math.abs(
                    v - edge.pointsFeet[j ? edge.pointsFeet.length - 1 : 0][k],
                  ) <= 1e-7,
              ),
            ) &&
            g.pointsFeet.every(
              (p) => Math.abs(p[2] - edge.pointsFeet[0][2]) < 0.01,
            )
          );
        })
        .map((g) => [g.edgeId, g.pointsFeet]),
    );
  });
}
export function withPreparedRouting(
  data: IndoorDataset,
  preparedRouting: PreparedRouting,
): IndoorDataset {
  return { ...data, preparedRouting } as PreparedDataset;
}
