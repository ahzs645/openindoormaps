import type { IndoorDataset } from "./contract";
import { createNativeContainedDisplay } from "./native-contained-display";
import {
  nativeCirculationCells,
  nativeCirculationExactIndex,
} from "./native-circulation";
import {
  nativeRationalOverlay,
  type NativeRationalOverlayInput,
  type NativeRationalParts,
} from "./native-rational-overlay";

/** Drawing only: cut the original exact circulation face by the complete
 * exclusion polygons, including their holes. Rounded cell outlines never
 * become boolean operands or replace the retained source topology. */
export function nativeHallwayContainedDisplay(
  face: NativeRationalParts,
  exclusions: NativeRationalOverlayInput,
) {
  return createNativeContainedDisplay(
    exclusions.length
      ? nativeRationalOverlay("difference", face, exclusions)
      : face,
  );
}

/** Keep the existing source/access validation of circulation cells. A missing
 * or stale exact face yields no strict hallway drawing, not an outline fallback.
 * This does not modify the source face, floor holes, portals or navigation. */
export function nativeExactHallwayDisplayParts(
  data: IndoorDataset,
  levelId: number,
  exclusions: NativeRationalOverlayInput,
): [number, number][][][] {
  const cells = nativeCirculationCells(data).filter((cell) =>
    cell.levelIds.includes(levelId),
  );
  if (!cells.length) return [];
  const index = nativeCirculationExactIndex(data);
  if (!index) return [];
  return cells.flatMap((cell) => {
    const face = cell.exactFaceId && index.parts(cell.exactFaceId);
    return face
      ? nativeHallwayContainedDisplay(face, exclusions).partsFeet
      : [];
  });
}
