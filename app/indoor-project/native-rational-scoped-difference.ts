import {
  nativeRationalOverlay,
  type NativeRationalOverlayInput,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";

/** Exact distributive restriction: Q ∩ (S \ M) = (Q ∩ S) \ M.
 * Only strictly disjoint rational bounds are pruned. In the second broad phase
 * the same intersection filtering is valid because subtracting M from the
 * restricted support can only observe M inside that support. Touching rings,
 * enclosing holes and sub-IEEE positive pieces still reach the exact kernel.
 * The input rings, holes and coordinates are never modified or rounded. */
export function nativeRationalScopedDifference(
  scope: NativeRationalOverlayInput,
  support: NativeRationalOverlayInput,
  masks: NativeRationalOverlayInput,
): NativeRationalParts {
  if (scope.length === 0 || support.length === 0) return [];
  const nearbySupport = nativeRationalIntersectionOperand(scope, support);
  if (nearbySupport.length === 0) return [];
  const inside = nativeRationalOverlay("intersection", scope, nearbySupport);
  if (inside.length === 0) return [];
  const nearbyMasks = nativeRationalIntersectionOperand(inside, masks);
  return nearbyMasks.length > 0
    ? nativeRationalOverlay("difference", inside, nearbyMasks)
    : inside;
}
