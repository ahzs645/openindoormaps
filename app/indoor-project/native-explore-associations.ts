import {
  Rational,
  nativeRationalOverlay,
  nativeRationalScalarToIEEE,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";
import {
  nativeRationalArea,
  nativeRationalPointInParts,
  nativeExactPartsForProposals,
} from "./native-exact-planar-topology";
import { nativeAreaDisplayParts } from "./native-area-display";
import { pointInNativeArea } from "./native-area-review";
import { nativeRoomIdentityRings } from "./native-floor-opening-ownership";
import type { IndoorDataset, IndoorRecord } from "./contract";
import type { NativeAreaRegion } from "./native-area-review";
import { nativeSelectionBoolean } from "./native-selection-boolean";
import { nativeStairLandingAssociation } from "./native-stair-landing-association";

type Rings = [number, number][][];
const ringArea = (r: [number, number][]) =>
  Math.abs(
    r.reduce((a, p, i) => {
      const q = r[(i + 1) % r.length];
      return a + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
const area = (rings: Rings) =>
  Math.max(
    0,
    ringArea(rings[0]) - rings.slice(1).reduce((a, r) => a + ringArea(r), 0),
  );
const bounds = (rings: Rings) => {
  const p = rings[0];
  return [
    Math.min(...p.map((p) => p[0])),
    Math.min(...p.map((p) => p[1])),
    Math.max(...p.map((p) => p[0])),
    Math.max(...p.map((p) => p[1])),
  ];
};
export type NativeRoomAssociation = {
  roomKey: string;
  coverage: number;
  /** Exact majority fraction for strict native faces; numeric coverage is explanatory. */
  coverageRatio?: [string, string];
  method: "majority-overlap" | "seed-fallback" | "native-stair-landing";
  labelPointFeet?: [number, number];
};
/** Original named outlines identify destinations, never define native edges or
 * authorize a new route. A strict majority can belong to only one component. */
export function associateNativeRooms(
  regions: NativeAreaRegion[],
  records: IndoorRecord[],
  data?: IndoorDataset,
  exactPartsByRegion?: ReadonlyMap<string, NativeRationalParts>,
) {
  const result = regions.map((r) => ({
    ...r,
    roomKeys: [] as string[],
    associations: [] as NativeRoomAssociation[],
  }));
  const boxes = regions.map((r) => bounds(r.ringsFeet));
  for (const room of records) {
    const identity = data
      ? nativeRoomIdentityRings(data, room)
      : room.ringsFeet;
    const exactOpening = identity !== room.ringsFeet;
    const total = area(identity);
    const b = bounds(identity);
    const exactTotal = exactPartsByRegion
      ? nativeRationalArea(nativeRationalOverlay("union", [identity]))
      : undefined;
    let bestExact = new Rational(0n);
    let bestExactOverlap: NativeRationalParts | undefined;
    let best = -1,
      coverage = 0;
    for (let i = 0; i < regions.length; i++) {
      const c = boxes[i];
      if (b[0] > c[2] || b[2] < c[0] || b[1] > c[3] || b[3] < c[1]) continue;
      try {
        if (exactPartsByRegion && exactTotal) {
          const face = exactPartsByRegion.get(regions[i].id);
          if (!face)
            throw new Error("Missing exact native room association face.");
          const exactOverlap = nativeRationalOverlay(
            "intersection",
            nativeRationalIntersectionOperand([identity], face),
            [identity],
          );
          const overlap = nativeRationalArea(exactOverlap);
          if (
            exactTotal.n > 0n &&
            overlap.n * bestExact.d > bestExact.n * overlap.d
          ) {
            best = i;
            bestExact = overlap;
            bestExactOverlap = exactOverlap;
            coverage = nativeRationalScalarToIEEE(
              new Rational(overlap.n * exactTotal.d, overlap.d * exactTotal.n),
            );
          }
        } else {
          const overlap = nativeSelectionBoolean(
            "intersection",
            [identity],
            [regions[i].ringsFeet],
          ).reduce((a, r) => a + area(r), 0);
          const fraction = total > 0 ? Math.min(1, overlap / total) : 0;
          if (fraction > coverage) {
            best = i;
            coverage = fraction;
          }
        }
      } catch (error) {
        if (exactPartsByRegion) throw error;
        /* Legacy identity associations retain their explicit uncertainty. */
      }
    }
    const majority =
      best >= 0 &&
      (exactTotal
        ? 2n * bestExact.n * exactTotal.d > exactTotal.n * bestExact.d
        : coverage > 0.5 + 1e-8);
    const landing =
      !majority && data
        ? nativeStairLandingAssociation(data, room, regions)
        : undefined;
    const index = majority
      ? best
      : landing
        ? landing.index
        : exactOpening || data?.nativeIndoorEnvelopes
          ? -1
          : regions.findIndex((r) => r.roomKeys.includes(room.key));
    if (index < 0) continue;
    let labelPointFeet: [number, number] | undefined = landing?.labelPointFeet;
    if (majority) {
      const exactOverlap = exactPartsByRegion ? bestExactOverlap : undefined;
      const parts = exactOverlap
        ? nativeExactPartsForProposals(exactOverlap)
        : nativeSelectionBoolean(
            "intersection",
            [identity],
            [regions[index].ringsFeet],
          );
      const centre: [number, number] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      if (
        exactOverlap
          ? nativeRationalPointInParts(centre, exactOverlap)
          : parts.some((r) => pointInNativeArea(centre, r))
      )
        labelPointFeet = centre;
      else {
        const largest = parts.sort((a, b) => area(b) - area(a))[0];
        const triangle =
          largest &&
          nativeAreaDisplayParts(largest).sort(
            (a, b) => area(b) - area(a),
          )[0]?.[0];
        if (triangle) {
          const candidate: [number, number] = [
            triangle.reduce((a, p) => a + p[0], 0) / triangle.length,
            triangle.reduce((a, p) => a + p[1], 0) / triangle.length,
          ];
          if (
            !exactOverlap ||
            nativeRationalPointInParts(candidate, exactOverlap)
          )
            labelPointFeet = candidate;
        }
      }
    }
    result[index].roomKeys.push(room.key);
    result[index].associations.push({
      roomKey: room.key,
      ...(labelPointFeet ? { labelPointFeet } : {}),
      coverage: majority ? coverage : (landing?.coverage ?? 0),
      ...(majority && exactTotal
        ? (() => {
            const q = new Rational(
              bestExact.n * exactTotal.d,
              bestExact.d * exactTotal.n,
            );
            return {
              coverageRatio: [String(q.n), String(q.d)] as [string, string],
            };
          })()
        : {}),
      method: majority
        ? "majority-overlap"
        : landing
          ? "native-stair-landing"
          : "seed-fallback",
    });
  }
  return result;
}
