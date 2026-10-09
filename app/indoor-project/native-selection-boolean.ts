import pc from "polygon-clipping";
import { exactNativeSelectionOverlay } from "./native-selection-exact-overlay";
type Rings = [number, number][][];
type OverlayEvent = {
  operation: "difference" | "intersection";
  subject: Rings[];
  operands: Rings[][];
  stage: "sweep" | "independent";
  error: string;
};
let recorder: ((event: OverlayEvent) => void) | undefined;
/** Optional independent diagnostic capture; geometry performs no file writes. */
export function setNativeSelectionOverlayRecorder(next: typeof recorder) {
  const previous = recorder;
  recorder = next;
  return previous;
}

/** Retry failed sweeps with unchanged operands, then the independently audited
 * raw/local-contact engine. A distinct source gap or hole must survive; no
 * global rounding grid or buffered repair is available. */
export function nativeSelectionBoolean(
  operation: "difference" | "intersection",
  subject: Rings[],
  ...operands: Rings[][]
): Rings[] {
  const run = (a: Rings[], bs: Rings[][]) => pc[operation](a, ...bs) as Rings[];
  try {
    return run(subject, operands);
  } catch (originalError) {
    recorder?.({
      operation,
      subject,
      operands,
      stage: "sweep",
      error: String(originalError),
    });
    // A contact in a large operand sweep can fail even when each exact mask
    // is valid. Split the same operation before changing engines; no source
    // coordinate or actual connection is changed by operand grouping.
    let budget = Math.max(1, operands.length * 4);
    const grouped = (faces: Rings[], masks: Rings[][]): Rings[] => {
      if (!faces.length || !masks.length) return faces;
      if (--budget < 0) throw originalError;
      try {
        return run(faces, masks);
      } catch (error) {
        if (masks.length <= 1) throw error;
        const half = Math.floor(masks.length / 2);
        return grouped(grouped(faces, masks.slice(0, half)), masks.slice(half));
      }
    };
    try {
      return grouped(subject, operands);
    } catch {}
    try {
      return exactNativeSelectionOverlay(operation, subject, operands);
    } catch (error) {
      recorder?.({
        operation,
        subject,
        operands,
        stage: "independent",
        error: String(error),
      });
    }
    // A failed certified replay cannot fall through to a global rounded grid.
    // Its explicit failure remains a geometry review error.
    throw originalError;
  }
}
