import type { IndoorDataset } from "./contract";
import type { ProjectRoute } from "./viewer-routing";
import type { ProjectRouteArrival } from "./route-arrival";
import { preparedSharedCorridorJoins } from "./prepared-routing";
import * as DMath from "./deterministic-math";

type XYZ = [number, number, number];
const same = (a: XYZ, b: XYZ) => a.every((v, k) => v === b[k]);

/** Shorten only the two outer doorway branches of an already physically and
 * policy checked shared route. The original edges, nodes, door identities and
 * full approach geometry remain available. Inner doorways and floor changes
 * are never trimmed. No new coordinate or connection is inferred here. */
export function centerHallwayRouteEndpoints(
  data: IndoorDataset,
  route: ProjectRoute,
): ProjectRoute {
  if (route.paths.length === 0) return route;
  const joins = preparedSharedCorridorJoins(data);
  const endpoint = (start: boolean) => {
    const arrival = start ? route.departure : route.arrival;
    const edge = start ? route.edges[0] : route.edges.at(-1);
    const path = start ? route.paths[0] : route.paths.at(-1)!;
    if (
      !arrival ||
      !edge ||
      !path.sharedCorridorGuideUsed ||
      !path.edgeIds.includes(edge.id)
    )
      return null;
    const pair = joins.get(edge.id);
    if (!pair) return null;
    const forward = start
      ? route.nodeIds[0] === edge.from
      : route.nodeIds.at(-1) === edge.to;
    const point = pair[start === forward ? 0 : 1];
    const outer = start ? path.pointsFeet[0] : path.pointsFeet.at(-1)!;
    if (!same(outer, arrival.pointFeet)) return null;
    const index = start
      ? path.pointsFeet.findIndex((p) => same(p, point))
      : path.pointsFeet.findLastIndex((p) => same(p, point));
    if (index < 0 || (start ? index : path.pointsFeet.length - index - 1) > 2)
      return null;
    const approach = start
      ? path.pointsFeet.slice(0, index + 1)
      : path.pointsFeet.slice(index).toReversed();
    const metadata: ProjectRouteArrival = {
      ...arrival,
      pointFeet: [...point],
      hallwayCenter: {
        doorPointFeet: [...arrival.pointFeet],
        approachPointsFeet: approach.map((p) => [...p]),
      },
    };
    return { index, metadata };
  };
  const first = endpoint(true),
    last = endpoint(false);
  if (!first && !last) return route;
  if (
    route.paths.length === 1 &&
    (first?.index ?? 0) >= (last?.index ?? route.paths[0].pointsFeet.length - 1)
  )
    return route;
  const paths = route.paths.map((path, i) => ({
    ...path,
    pointsFeet: path.pointsFeet.slice(
      i === 0 ? (first?.index ?? 0) : 0,
      i === route.paths.length - 1 && last ? last.index + 1 : undefined,
    ),
  }));
  const length = (points: XYZ[]) =>
    points
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum +
          DMath.hypot(p[0] - points[i][0], p[1] - points[i][1]) *
            data.alignment.horizontalMetresPerFoot,
        0,
      );
  const removed =
    (first ? length(first.metadata.hallwayCenter!.approachPointsFeet) : 0) +
    (last ? length(last.metadata.hallwayCenter!.approachPointsFeet) : 0);
  return {
    ...route,
    paths,
    departure: first?.metadata ?? route.departure,
    arrival: last?.metadata ?? route.arrival,
    distanceMetres: Math.max(0, route.distanceMetres - removed),
  };
}
