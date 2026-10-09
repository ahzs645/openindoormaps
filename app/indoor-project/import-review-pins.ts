import type { IndoorProject } from "./package";
import { preserveReviewPins } from "./review-pins";

/** Both projects have already passed import validation. Identical authoring
 * pins require no merge or export: keep the loaded ZIP, mapping, display assets
 * and source identity intact. Actual differences use the existing merge rules.
 * This fast path is import-only, not a substitute for review-pin validation.
 */
export function preserveReviewPinsOnImport(
  loaded: IndoorProject,
  previous: IndoorProject | null,
): IndoorProject {
  const old = previous?.rooms.reviewPins;
  if (!old || JSON.stringify(old) === JSON.stringify(loaded.rooms.reviewPins))
    return loaded;
  return preserveReviewPins(loaded, previous);
}
