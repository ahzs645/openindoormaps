import pc from "polygon-clipping";
import { nativeAreaDisplayParts } from "./native-area-display";
import { pointInNativeArea } from "./native-area-review";
import type { IndoorRecord } from "./contract";
import type { NativeAreaRegion } from "./native-area-review";

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
  method: "majority-overlap" | "seed-fallback";
  labelPointFeet?: [number, number];
};
/** Original named outlines identify destinations, never define native edges or
 * authorize a new route. A strict majority can belong to only one component. */
export function associateNativeRooms(
  regions: NativeAreaRegion[],
  records: IndoorRecord[],
) {
  const result = regions.map((r) => ({
    ...r,
    roomKeys: [] as string[],
    associations: [] as NativeRoomAssociation[],
  }));
  const boxes = regions.map((r) => bounds(r.ringsFeet));
  for (const room of records) {
    const total = area(room.ringsFeet);
    const b = bounds(room.ringsFeet);
    let best = -1,
      coverage = 0;
    for (let i = 0; i < regions.length; i++) {
      const c = boxes[i];
      if (b[0] > c[2] || b[2] < c[0] || b[1] > c[3] || b[3] < c[1]) continue;
      try {
        const overlap = pc
          .intersection(room.ringsFeet, regions[i].ringsFeet)
          .reduce((a, r) => a + area(r), 0);
        const fraction = total > 0 ? Math.min(1, overlap / total) : 0;
        if (fraction > coverage) {
          best = i;
          coverage = fraction;
        }
      } catch {
        /* Retain the original identity association as explicitly uncertain. */
      }
    }
    const majority = best >= 0 && coverage > 0.5 + 1e-8;
    const index = majority
      ? best
      : regions.findIndex((r) => r.roomKeys.includes(room.key));
    if (index < 0) continue;
    let labelPointFeet: [number, number] | undefined;
    if (majority) {
      const parts = pc.intersection(room.ringsFeet, regions[index].ringsFeet);
      const centre: [number, number] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      if (parts.some((r) => pointInNativeArea(centre, r)))
        labelPointFeet = centre;
      else {
        const largest = parts.sort((a, b) => area(b) - area(a))[0];
        const triangle =
          largest &&
          nativeAreaDisplayParts(largest).sort(
            (a, b) => area(b) - area(a),
          )[0]?.[0];
        if (triangle)
          labelPointFeet = [
            triangle.reduce((a, p) => a + p[0], 0) / triangle.length,
            triangle.reduce((a, p) => a + p[1], 0) / triangle.length,
          ];
      }
    }
    result[index].roomKeys.push(room.key);
    result[index].associations.push({
      roomKey: room.key,
      ...(labelPointFeet ? { labelPointFeet } : {}),
      coverage: majority ? coverage : 0,
      method: majority ? "majority-overlap" : "seed-fallback",
    });
  }
  return result;
}
