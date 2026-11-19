import { verifyOpenBayDrawing } from "../../app/indoor-project/reviewed-open-bay";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  applyReviewedCirculationLinks,
  validateReviewedCirculationLinks,
} from "../../app/indoor-project/reviewed-circulation-links";

/** Replay extra source-bound reviews only after the base compiler's guards pass.
 * Stage changes on a copy so a refused link cannot leave a partially edited graph. */
export function datasetWithReviewedLinks(
  dataset: IndoorDataset,
  input: unknown,
  drawing?: unknown,
) {
  validateReviewedCirculationLinks(input, dataset.source.modelSha256);
  for (const link of input?.links ?? [])
    if (link.openBay) verifyOpenBayDrawing(link.openBay, drawing);
  if (!input?.links.length)
    throw new Error("Expected at least one reviewed circulation link.");
  validateReviewedCirculationLinks(
    dataset.reviewedCirculationLinks,
    dataset.source.modelSha256,
  );
  const links = [...(dataset.reviewedCirculationLinks?.links ?? [])];
  for (const link of input.links) {
    const from = dataset.nodes.find((node) => node.id === link.fromNodeId);
    const to = dataset.nodes.find((node) => node.id === link.toNodeId);
    if (
      !from ||
      !to ||
      from.levelId !== to.levelId ||
      from.pointFeet[2] !== to.pointFeet[2]
    )
      throw new Error(
        "A reviewed circulation link must connect existing nodes on the same floor plane.",
      );
    const previous = links.find((item) => item.id === link.id);
    if (previous) {
      assert.deepEqual(
        previous,
        link,
        `Reviewed circulation link ${link.id} conflicts with the existing review.`,
      );
    } else {
      links.push(link);
    }
  }
  const reviewedCirculationLinks = { ...input, links };
  validateReviewedCirculationLinks(
    reviewedCirculationLinks,
    dataset.source.modelSha256,
  );
  const updated = { ...dataset, reviewedCirculationLinks };
  const { applied, rejected } = applyReviewedCirculationLinks(updated);
  if (rejected.length)
    throw new Error(`Reviewed links refused: ${JSON.stringify(rejected)}`);
  assert.equal(applied.length, links.length);
  return updated;
}
