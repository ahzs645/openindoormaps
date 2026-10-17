import type { IndoorDataset } from "./contract";
import { createNativeRoutingMaterialQuery } from "./native-routing-material";
import { createNativeExactBoundaryMaterialQuery } from "./native-boundary-material";
import { createNativeIndoorEnvelopeIndex } from "./native-indoor-envelopes";
import { indoorExclusionParts } from "./indoor-exclusions";
import {
  nativeRationalOverlay,
  type NativeRationalOverlayInput,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";
import { createNativeRationalSupportTileQuery } from "./native-rational-support-tiles";
import { freezeNativeRationalParts } from "./native-exact-planar-topology";
import { nativeAuthoredStairTreads } from "./native-authored-stair-treads";
import { nativeWalkingFloorsWithSlabJoins } from "./native-slab-join-closures";
import { routingCalculationValue } from "./routing-cache";
/** Recheck current original physical facts independently of a prepared face's
 * declared checksum. This is operation-local; no mutable dataset is cached. */
export function createNativeExactRoutingAuthority(data: IndoorDataset) {
  const materialQuery = routingCalculationValue(
      data,
      "native-route-material-query",
      () => createNativeRoutingMaterialQuery(data),
    ),
    boundaryQuery = createNativeExactBoundaryMaterialQuery(data),
    envelopes = createNativeIndoorEnvelopeIndex(
      data.nativeIndoorEnvelopes,
      data.source.modelSha256,
    );
  const authored = nativeAuthoredStairTreads(
    data.nativeSourceStairMaterials?.authoredTreadRoles,
    data.source.modelSha256,
  );
  const treads = [...authored.values()].flat();
  // Unrecovered native cache inventory remains a conservative physical veto,
  // matching the compiler. It never certifies a walking surface or full flight.
  if (data.stairDisplay?.sourceModelSha256 === data.source.modelSha256)
    for (const f of data.stairDisplay.sourceFlights ?? [])
      for (const t of f.treads)
        if (!authored.has(t.runElementId)) treads.push(t);
  const levels = new Map<
    number,
    {
      support: NativeRationalParts;
      intersectSupport: ReturnType<typeof createNativeRationalSupportTileQuery>;
      masks: NativeRationalOverlayInput;
      full?: NativeRationalParts;
      scoped: WeakMap<NativeRationalParts, NativeRationalParts>;
    }
  >();
  return (z: number, scope?: NativeRationalParts): NativeRationalParts => {
    let level = levels.get(z);
    if (level) {
      const saved = scope ? level.scoped.get(scope) : level.full;
      if (saved) return saved;
    }
    if (
      !data.nativeIndoorEnvelopes ||
      data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256
    )
      return [];
    if (!level) {
      const floors = data.walkingSupport.floors
        .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
        .flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
      const envelope = envelopes.parts(z);
      // Empty flat support cannot admit a cell. No material obstacle is waived:
      // ramp/body certification uses its separate physical barrier query.
      // Numerical joins between distinct original slab profiles stay walkable
      // (native-slab-join-closures).
      const support = freezeNativeRationalParts(
        nativeWalkingFloorsWithSlabJoins(floors, envelope),
      );
      if (support.length === 0) {
        const empty = freezeNativeRationalParts([]);
        levels.set(z, {
          support: empty,
          intersectSupport: createNativeRationalSupportTileQuery(empty),
          masks: [],
          full: empty,
          scoped: new WeakMap(),
        });
        return empty;
      }
      const material = materialQuery(z),
        ids = new Set(
          data.nativeLevels
            .filter((l) => Math.abs(l.elevationFeet - z) < 0.05)
            .map((l) => l.id),
        );
      const masks: NativeRationalOverlayInput = [
        ...(material.derivedParts ?? []),
        ...material.parts.map((p) => p.rings),
        ...data.walls
          .filter(
            (w) =>
              ids.has(w.levelId) &&
              (!material.known.has(w.nativeElementId) ||
                (w.reviewPatchId && material.present.has(w.nativeElementId))),
          )
          .flatMap((w) => boundaryQuery(w)),
        ...(data.circulationGeometry?.fixtures ?? [])
          .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
          .map((f) => f.ringsFeet),
        // Qualified positive roles replace the current native cache mask. Explicit
        // reference faces and historicalPreparedTreads never supply this veto.
        ...treads
          .filter((t) => t.elevationFeet > z + 0.05 && t.elevationFeet < z + 6)
          .map((t) => [t.ringFeet]),
        ...indoorExclusionParts(data, z),
        ...(data.doors ?? [])
          .filter((d) => ids.has(d.levelId) && d.footprintFeet)
          .map((d) => [d.footprintFeet!]),
      ];
      level = {
        support,
        // Scope ∩ (tile ∩ support) is the same exact set as scope ∩ support:
        // the rational tile encloses the complete original scope. The query
        // keeps original floor/envelope/slab joins and falls back to the direct
        // original intersection on any optimization failure.
        intersectSupport: createNativeRationalSupportTileQuery(support),
        masks,
        scoped: new WeakMap(),
      };
      levels.set(z, level);
    }
    // A connector anchor needs only its independently decoded exact cell. Do
    // not subtract every campus wall from the entire level before checking it.
    // Floor/envelope intersections and numerical slab joins above stay global.
    let free: NativeRationalParts;
    if (scope) {
      const inside = level.intersectSupport(scope);
      const masks = nativeRationalIntersectionOperand(inside, level.masks);
      free =
        inside.length === 0
          ? []
          : masks.length > 0
            ? nativeRationalOverlay("difference", inside, masks)
            : inside;
    } else
      free = nativeRationalOverlay("difference", level.support, level.masks);
    free = freezeNativeRationalParts(free);
    if (scope) level.scoped.set(scope, free);
    else level.full = free;
    return free;
  };
}
