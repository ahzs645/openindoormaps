import type { IndoorProject } from "./package";
import { deriveNativeAreas } from "./native-area-review";
import {
  assertProposalDisplayPreviewResult,
  type ProposalDisplayPreviewPlan,
} from "./enclosure-proposals";

const scope = globalThis as unknown as {
  onmessage: (
    event: MessageEvent<{
      project: IndoorProject;
      plan: ProposalDisplayPreviewPlan;
    }>,
  ) => void;
  postMessage: (message: { verified?: boolean; error?: string }) => void;
};
scope.onmessage = async ({ data: { project, plan } }) => {
  try {
    const result = await deriveNativeAreas(
      project.dataset,
      plan.levelId,
      plan.options,
    );
    assertProposalDisplayPreviewResult(project, plan, result);
    scope.postMessage({ verified: true });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
