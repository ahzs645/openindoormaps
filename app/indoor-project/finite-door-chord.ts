import {
  nativeExactOrientation,
  nativeRationalPoint,
} from "./native-exact-planar-topology";
import { rational } from "./native-rational-overlay";
import { projectStatedTwoFootWalkingVolume } from "./native-stepped-stair-v2-walking-volume";
type Point = [number, number, number];

/** Each complete finite jamb must be outside its own edge of the exact
 * two-foot strip. This also rejects a chord whose body slips past the end
 * of a short host wall into neighboring free floor. */
export function chordFitsFiniteDoor(
  a: Point,
  b: Point,
  opening: [number, number][],
  normal: readonly number[],
) {
  if (opening.length !== 4 || a[2] !== b[2] || a.every((v, i) => v === b[i]))
    return false;
  const z = rational(a[2]);
  const { unclippedStatedStripFeet: strip } = projectStatedTwoFootWalkingVolume(
    a,
    b,
    z,
    z,
    6,
  );
  const sides = opening.map((p) => {
    const q = nativeRationalPoint(p);
    if (nativeExactOrientation(strip[0], strip[1], q) >= 0n) return 1;
    if (nativeExactOrientation(strip[3], strip[2], q) <= 0n) return -1;
    return 0;
  });
  if (sides.includes(0) || sides.filter((x) => x === 1).length !== 2)
    return false;
  let jambs = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (sides[i] !== sides[j]) continue;
    const dx = opening[j][0] - opening[i][0],
      dy = opening[j][1] - opening[i][1];
    if (
      Math.abs(dx * normal[0] + dy * normal[1]) <=
      Math.abs(dx * normal[1] - dy * normal[0])
    )
      return false;
    jambs++;
  }
  return jambs === 2;
}
