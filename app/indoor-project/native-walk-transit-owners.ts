import type { IndoorDataset, IndoorEdge, IndoorRecord } from "./contract";
import { nativeRoomIdentityRings } from "./native-floor-opening-ownership";
import { nativeRationalOverlay, rational } from "./native-rational-overlay";
import {
  nativeRationalAreaCompare,
  nativeRationalPointInParts,
} from "./native-exact-planar-topology";
import { routingCalculationValue } from "./routing-cache";
import { projectStatedTwoFootWalkingVolume } from "./native-stepped-stair-v2-walking-volume";
import { hasReviewedThroughNavigation } from "./through-navigation";
import { isProjectDestination } from "./route-policy";

/** A native cell may carry many ordinary room identities. Cell membership alone
 * is not transit through each room. This only refines the ordinary-room routing
 * PREFERENCE: staff, non-walkable, physical, doorway and direction vetoes still
 * use EVERY original owner. End owners and explicit door crossings stay required.
 * The complete two-foot strip, not a centre sample, tests positive exact overlap.
 */
export function nativeWalkTouchesTransitRoom(
  data: IndoorDataset,
  edge: IndoorEdge,
  room: IndoorRecord,
): boolean {
  if (
    edge.kind !== "walk" ||
    !edge.nativeCellId ||
    !data.nativeIndoorEnvelopes ||
    !data.circulationGeometry?.exactTopology
  )
    return true;
  const cache = routingCalculationValue(
    data,
    "native-walk-transit-owner-query",
    () => ({
      nodes: new Map(data.nodes.map((n) => [n.id, n])),
      rooms: new Map<
        string,
        { rings: IndoorRecord["ringsFeet"]; bounds: number[] }
      >(),
      results: new WeakMap<IndoorEdge, Map<string, boolean>>(),
    }),
  );
  if (
    [edge.from, edge.to].some((id) => cache.nodes.get(id)?.roomKey === room.key)
  )
    return true;
  const previous = cache.results.get(edge)?.get(room.key);
  if (previous !== undefined) return previous;
  let touches = true;
  try {
    let identity = cache.rooms.get(room.key);
    if (!identity) {
      const rings = nativeRoomIdentityRings(data, room),
        points = rings.flat();
      identity = {
        rings,
        bounds: [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      };
      cache.rooms.set(room.key, identity);
    }
    touches = false;
    for (let i = 1; i < edge.pointsFeet.length; i++) {
      const a = edge.pointsFeet[i - 1],
        b = edge.pointsFeet[i];
      const box = identity.bounds;
      const margin =
        1 +
        1e-9 +
        32 *
          Number.EPSILON *
          Math.max(1, ...[...a, ...b, ...box].map(Math.abs));
      if (
        Math.max(a[0], b[0]) + margin < box[0] ||
        Math.min(a[0], b[0]) - margin > box[2] ||
        Math.max(a[1], b[1]) + margin < box[1] ||
        Math.min(a[1], b[1]) - margin > box[3]
      )
        continue;
      if (a[0] === b[0] && a[1] === b[1]) {
        if (
          nativeRationalPointInParts(
            a,
            nativeRationalOverlay("union", [identity.rings]),
          )
        ) {
          touches = true;
          break;
        }
        continue;
      }
      const { unclippedStatedStripFeet: strip } =
        projectStatedTwoFootWalkingVolume(
          a,
          b,
          rational(a[2]),
          rational(a[2]),
          6,
        );
      if (
        nativeRationalAreaCompare(
          nativeRationalOverlay("intersection", [[strip]], [identity.rings]),
          [],
        ) > 0
      ) {
        touches = true;
        break;
      }
    }
  } catch {
    touches = true;
  }
  const byRoom = cache.results.get(edge) ?? new Map<string, boolean>();
  byRoom.set(room.key, touches);
  cache.results.set(edge, byRoom);
  return touches;
}

/** Refinement cannot add ordinary-room transit to a source hallway path.
 * Keep the original owner/access lists and compare the complete body strips,
 * including prepared guides, compact vestibules and curved/junction trials.
 */
export function createNativeTransitRefinementPolicy(
  data: IndoorDataset,
  edges: IndoorEdge[],
  original: [number, number, number][],
) {
  const first = edges.find((e) => e.kind === "walk" && e.nativeCellId);
  if (!first || !data.nativeIndoorEnvelopes) return () => true;
  const keys = new Set(edges.flatMap((e) => e.roomKeys));
  const source = {
    ...first,
    from: edges[0].from,
    to: edges.at(-1)!.to,
    pointsFeet: original,
  };
  const protectedRooms = data.records.filter(
    (r) =>
      keys.has(r.key) &&
      isProjectDestination(r) &&
      !r.circulation &&
      !r.stair &&
      !hasReviewedThroughNavigation(r, data.source.modelSha256) &&
      !nativeWalkTouchesTransitRoom(data, source, r),
  );
  return (points: [number, number, number][]) =>
    protectedRooms.every(
      (r) =>
        !nativeWalkTouchesTransitRoom(
          data,
          { ...source, pointsFeet: points },
          r,
        ),
    );
}
