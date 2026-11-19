import type { IndoorDataset } from "./contract";
import { matchingDoorSeams } from "./native-door-seams";
import {
  nativeExactPartsForProposals,
  nativeExactOrientation,
  nativeRationalPoint,
} from "./native-exact-planar-topology";
import {
  nativeCirculationExactIndex,
  type NativeCirculationCell,
} from "./native-circulation";
import { createNativeExactRoutingAuthority } from "./native-exact-routing-authority";
import { nativeRoutingAccessZonesAt } from "./native-routing-access-zones";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";
import {
  nativeRationalOverlay,
  type NativeRationalOverlayInput,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { routingCalculationValue } from "./routing-cache";

type XY = [number, number];

/** Match only full transverse caps of this finite original aperture to the
 * outer boundary of an incident exact face. Approximate vertices nominate
 * matching source endpoints. Only the recovered exact vertices enter booleans. */
export function matchedRoomDoorCaps(
  opening: XY[],
  normal: XY,
  faces: NativeRationalParts,
): NativeRationalParts {
  const seams: NativeRationalParts = [];
  for (const part of faces) {
    const source = part[0];
    if (!source?.length) continue;
    const projected = nativeExactPartsForProposals([[source]])[0][0];
    const original = new Map(projected.map((p, i) => [p, source[i]]));
    for (const [[a, b, end, start]] of matchingDoorSeams(opening, [
      [projected],
    ])) {
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const width = Math.abs(dx * normal[1] - dy * normal[0]);
      if (width < 2 || width <= Math.abs(dx * normal[0] + dy * normal[1]))
        continue;
      const e = original.get(end),
        s = original.get(start);
      if (!e || !s) continue;
      const u = nativeRationalPoint(a),
        v = nativeRationalPoint(b);
      const first = nativeExactOrientation(u, v, s),
        last = nativeExactOrientation(u, v, e);
      if ((first === 0n && last === 0n) || first * last < 0n) continue;
      seams.push(...nativeRationalOverlay("union", [[[u, v, e, s]]]));
    }
  }
  return seams;
}

/** An admitted door's two incident native faces can stop a few floating
 * units short of its source cap. Fill only the explicitly paired cap seam
 * where independently checked physical floor covers it, with every other
 * exact native face and every reviewed access zone removed. The authority
 * retains all material, even the selected host and door. */
export function nativeRoomDoorJunction(
  data: IndoorDataset,
  opening: XY[],
  normal: XY,
  room: NativeCirculationCell,
  hall: NativeCirculationCell,
  crossHall = false,
): NativeRationalParts {
  if (
    (!crossHall && room.id === hall.id) ||
    room.elevationFeet !== hall.elevationFeet ||
    !data.circulationGeometry
  )
    return [];
  const index = nativeCirculationExactIndex(data);
  if (!index || !room.exactFaceId || !hall.exactFaceId) return [];
  const roomFace = index.parts(room.exactFaceId),
    hallFace = index.parts(hall.exactFaceId);
  if (!roomFace || !hallFace) return [];
  const faces = room.id === hall.id ? hallFace : [...roomFace, ...hallFace];
  // An interior cross-hall wall can form an inner ring in one connected
  // hallway face. Only its full native cap can nominate a source seam.
  const caps = crossHall
    ? faces.flatMap((part) => part.map((ring) => [ring]))
    : faces;
  const candidates = matchedRoomDoorCaps(opening, normal, caps);
  if (candidates.length === 0) return [];
  const z = hall.elevationFeet;
  const authority = routingCalculationValue(
    data,
    "native-exact-routing-authority",
    () => createNativeExactRoutingAuthority(data),
  );
  const floor = authority(z, candidates);
  if (floor.length === 0) return [];
  const masks: NativeRationalOverlayInput = [];
  for (const cell of data.circulationGeometry.cells) {
    if (cell.elevationFeet !== z || cell.id === room.id || cell.id === hall.id)
      continue;
    const face = cell.exactFaceId && index.parts(cell.exactFaceId);
    if (!face) return [];
    masks.push(...nativeRationalIntersectionOperand(floor, face));
  }
  for (const zone of nativeRoutingAccessZonesAt(data, z))
    masks.push(...zone.parts);
  return masks.length > 0
    ? nativeRationalOverlay("difference", floor, masks)
    : floor;
}
