import type { IndoorDataset } from "./contract";

const calculations = new WeakMap<IndoorDataset, Map<string, unknown>>();

/** Only for a privately cloned worker snapshot, which is never edited in place.
 * Source-review callers still use the per-calculation guards below. Replacing
 * the worker's snapshot creates a new session and discards every cached binding. */
export function createImmutableRoutingSession(data: IndoorDataset) {
  const values = new Map<string, unknown>();
  return <T>(run: () => T): T => {
    if (calculations.has(data)) return run();
    calculations.set(data, values);
    try {
      return run();
    } finally {
      calculations.delete(data);
    }
  };
}

/** Reuse exact bindings only within one synchronous calculation. A later
 * request always rechecks the dataset, including in-place door/access edits. */
export function withRoutingCalculation<T>(
  data: IndoorDataset,
  run: () => T,
): T {
  if (calculations.has(data)) return run();
  calculations.set(data, new Map());
  try {
    return run();
  } finally {
    calculations.delete(data);
  }
}
export function routingCalculationValue<T>(
  data: IndoorDataset,
  key: string,
  read: () => T,
): T {
  const values = calculations.get(data);
  if (!values) return read();
  if (!values.has(key)) values.set(key, read());
  return values.get(key) as T;
}

/** Exact snapshots avoid stale permissions after an in-place source review.
 * Array identity also matters: equivalent imports must bind their own objects.
 * Do not use dataset/hash identity alone; closing a door does not change either. */
export function routingSnapshot(data: IndoorDataset): string {
  return routingCalculationValue(data, "policy-snapshot", () =>
    JSON.stringify([
      data.source.modelSha256,
      data.records.map((r) => [
        r.key,
        r.number,
        r.name,
        r.building,
        r.levelId,
        r.arrivalNodeId,
        r.walkable,
        r.access,
        r.circulation,
        r.stair,
        r.ringsFeet,
        r.properties.throughNavigationReview,
        r.properties.generatedLanding,
        r.properties.dwg,
      ]),
      data.nodes.map((n) => [n.id, n.levelId, n.roomKey, n.kind, n.pointFeet]),
      data.edges,
      data.doors,
      data.connectors,
      data.walkingSupport,
      ...(data.indoorExclusions ? [data.indoorExclusions] : []),
      data.circulationGeometry,
      ...(data.nativeIndoorEnvelopes ? ["native-indoor-envelope-v1", data.nativeIndoorEnvelopes] : []),
    ]),
  );
}
export const routingArrays = (data: IndoorDataset) =>
  [data.records, data.nodes, data.edges, data.doors] as const;
export const sameRoutingArrays = (
  a: ReturnType<typeof routingArrays>,
  b: ReturnType<typeof routingArrays>,
) => a.every((array, i) => array === b[i]);
