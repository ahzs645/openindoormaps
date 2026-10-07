import pc from "polygon-clipping";
import { nativeBarrierTopology } from "./native-barrier-topology";
export const NATIVE_SELECTION_TOPOLOGY_VERSION =
  "native-floor-wall-contact-common-source-grid-1e10-v4-bounded-junction-1e9";
export const NATIVE_SELECTION_NUMERICAL_JUNCTION_FEET = 1e-9;
type Point = [number, number];
type Rings = Point[][];
/** Selection must compare original floor and obstacle contacts in one frame.
 * Independently rounding walls to 1e4 while keeping slabs at 1e10 creates a
 * traversable strip at an exact slab/wall contact. Node actual finite contacts
 * before the common source-precision grid. Exact contacts use one grid unit;
 * selection-only vertex junctions additionally use a non-transitive 1e-9 ft bound.
 * Never buffer a wall or close a physical construction gap.
 * The returned copies do not replace any original native/source coordinates. */
export function nativeSelectionTopology(floors: Rings[], obstacles: Rings[]) {
  const origin: Point = floors[0]?.[0]?.[0] ?? [0, 0];
  const normalized = nativeBarrierTopology(
    [...floors, ...obstacles],
    1e10,
    origin,
    1e-10,
    NATIVE_SELECTION_NUMERICAL_JUNCTION_FEET,
  );
  return {
    ground: pc.union(normalized.slice(0, floors.length)),
    masks: normalized.slice(floors.length),
  };
}
