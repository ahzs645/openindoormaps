import type { IndoorEdge } from "./contract";
import { createNativeDoorApproachQuery } from "./native-door-approach";
import {
  createNativeRationalPathUnionQuery,
  freezeNativeRationalParts,
} from "./native-exact-planar-topology";
import {
  nativeRationalOverlay,
  rational,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { createNativeRationalSupportTileQuery } from "./native-rational-support-tiles";
import { projectStatedTwoFootWalkingVolume } from "./native-stepped-stair-v2-walking-volume";
import type { CorridorXY } from "./corridor-centerline";

/** The strip's rational normal encloses the complete stated width. Exact
 * floor/extension subtraction retains positive holes and sub-ULP gaps. The
 * query belongs to one immutable physical scope and makes no access decision.
 */
export function createTwoFootCorridorSupport(
  base: NativeRationalParts,
  elevationFeet: number,
) {
  const tiled = createNativeRationalSupportTileQuery(base);
  const unionPath = createNativeRationalPathUnionQuery();
  return (path: CorridorXY[], extra: NativeRationalParts = []) => {
    if (!unionPath(path, base, extra)) return false;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const { unclippedStatedStripFeet: strip } =
        projectStatedTwoFootWalkingVolume(
          [a[0], a[1], elevationFeet],
          [b[0], b[1], elevationFeet],
          rational(elevationFeet),
          rational(elevationFeet),
          6,
        );
      const footprint = [[strip]];
      const covered = tiled(footprint);
      if (
        nativeRationalOverlay("difference", footprint, covered, extra).length >
        0
      )
        return false;
    }
    return true;
  };
}

/** Exact planar two-foot demand in the current physical cell, plus only an
 * original terminal's own checked finite doorway half. This does not certify
 * headroom, accessibility, another door or a vertical transition. */
export function createCorridorGuideSupport(
  face: NativeRationalParts,
  elevationFeet: number,
  edges: readonly IndoorEdge[],
  doorApproach: ReturnType<typeof createNativeDoorApproachQuery>,
) {
  const base = freezeNativeRationalParts(face);
  const check = createTwoFootCorridorSupport(base, elevationFeet);
  const extensions = new Map<string, NativeRationalParts>();
  const incident = new Map<string, IndoorEdge>();
  for (const edge of edges)
    for (const id of [edge.from, edge.to])
      if (!incident.has(id)) incident.set(id, edge);
  const ownHalf = (id: string) => {
    let parts = extensions.get(id);
    if (parts) return parts;
    const edge = incident.get(id);
    parts = freezeNativeRationalParts(
      edge
        ? doorApproach(edge, new Set([id]))
            .filter((a) => a.z === elevationFeet)
            .flatMap((a) => a.exactParts ?? [])
        : [],
    );
    extensions.set(id, parts);
    return parts;
  };
  const core = new Map<string, boolean>();
  return {
    supported(path: CorridorXY[], terminalId?: string): boolean {
      if (terminalId) return check(path, ownHalf(terminalId));
      const key = JSON.stringify(path);
      let saved = core.get(key);
      if (saved === undefined) {
        saved = check(path, []);
        core.set(key, saved);
      }
      return saved;
    },
    /** Final edge replay retains precisely these two original terminal halves. */
    edgeSupported(path: CorridorXY[], from: string, to: string): boolean {
      return check(path, [...ownHalf(from), ...ownHalf(to)]);
    },
  };
}
