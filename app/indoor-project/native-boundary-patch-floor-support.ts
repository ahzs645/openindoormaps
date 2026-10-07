import pc from "polygon-clipping";
import { nativeBarrierTopology } from "./native-barrier-topology";
import {
  validNativeContinuation,
  type NativeBoundaryPatch,
} from "./native-boundary-patches";

type Point = [number, number];
type Rings = Point[][];
const area = (parts: Rings[]) =>
  parts.reduce(
    (sum, rings) =>
      sum +
      rings.reduce(
        (a, ring, i) =>
          a +
          ((i ? -1 : 1) *
            Math.abs(
              ring.reduce((s, p, j) => {
                const q = ring[(j + 1) % ring.length];
                return s + p[0] * q[1] - q[0] * p[1];
              }, 0),
            )) /
            2,
        0,
      ),
    0,
  );

/** A supported wall gap may meet a slab perimeter at the original inside wall
 * face. Permit only its tiny contact penetration into that existing solid,
 * never unsupported new barrier material or a native slab hole. The caller
 * must first validate current original wall evidence and retain every door,
 * opening and foreign obstacle veto over the complete patch. */
export function nativeBoundaryPatchFloorSupport(
  patch: NativeBoundaryPatch,
  parts: Rings[],
): { supported: boolean; originalContactAllowance: boolean } {
  if (!parts.length)
    return { supported: false, originalContactAllowance: false };
  const ground = pc.union(parts[0], ...parts.slice(1));
  if (area(pc.difference(patch.ringsFeet, ground)) <= 1e-8)
    return { supported: true, originalContactAllowance: false };
  const proof = patch.continuationProof;
  if (
    !proof ||
    proof.targetContactPathFeet ||
    patch.wallEvidence.length !== 2 ||
    patch.wallEvidence.some((w) => w.ringsFeet.length !== 1) ||
    !validNativeContinuation(patch)
  )
    return { supported: false, originalContactAllowance: false };
  const [a, b] = proof.sourceCapFeet,
    [c, d] = proof.targetContactFeet;
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tangent: Point = [(b[0] - a[0]) / width, (b[1] - a[1]) / width];
  const normal: Point = [-tangent[1], tangent[0]];
  if ((c[0] - a[0]) * normal[0] + (c[1] - a[1]) * normal[1] < 0) {
    normal[0] = -normal[0];
    normal[1] = -normal[1];
  }
  const project = (p: Point): Point => [
    (p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1],
    (p[0] - a[0]) * tangent[0] + (p[1] - a[1]) * tangent[1],
  ];
  const cp = project(c),
    dp = project(d);
  // These are bounded original-axis contact penetrations, not an area tolerance.
  // The independent continuation validator certifies the complete cap, first
  // target face, unchanged width/axis and the exact four patch corners.
  if (
    patch.ringsFeet[0].some((p) => {
      const [depth, lateral] = project(p);
      const contact =
        cp[0] + ((dp[0] - cp[0]) * (lateral - cp[1])) / (dp[1] - cp[1]);
      return depth < -0.000200001 || depth > contact + 0.000200001;
    })
  )
    return { supported: false, originalContactAllowance: false };
  const local = (rings: Rings): Rings =>
    rings.map((r) => r.map(project));
  const core: Rings = [[a, b, d, c]];
  const originals = patch.wallEvidence.map((w) => local(w.ringsFeet));
  const [p, gap, ...rest] = nativeBarrierTopology(
    [local(patch.ringsFeet), local(core), ...parts.map(local), ...originals],
    1e8,
    [0, 0],
    1e-10,
  );
  const floors = rest.slice(0, parts.length);
  const originalFaces = rest.slice(parts.length);
  const floor = pc.union(floors[0], ...floors.slice(1));
  // Even a hole coincident with an original solid contact remains protected.
  const holes = floors.flatMap((rs) => rs.slice(1).map((r) => [r]));
  if (
    holes.some((h) => area(pc.intersection(p, h)) > 1e-8) ||
    area(pc.difference(gap, floor)) > 1e-8
  )
    return { supported: false, originalContactAllowance: false };
  const solids = pc.union(originalFaces[0], ...originalFaces.slice(1));
  // The gap core was independently certified on floor and all penetration
  // depths bounded above. Union coverage avoids manufacturing a thin residual
  // by subtracting/reintersecting already rounded shared contact edges.
  if (area(pc.difference(p, pc.union(floor, solids))) > 1e-10)
    return { supported: false, originalContactAllowance: false };
  return { supported: true, originalContactAllowance: true };
}
