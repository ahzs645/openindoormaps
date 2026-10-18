import { tryReadPublishedProject } from "./published-project";
import { readIndoorProject } from "./package";
import { initializeNativeExactGeosOverlay } from "./native-exact-geos-overlay";
import type { ProjectPackageRequest } from "./project-package-client";
import {
  visitorRuntimeProject,
  projectRuntimeTransfers,
} from "./visitor-project-runtime";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<ProjectPackageRequest>) => void;
  postMessage: (value: unknown, transfers?: Transferable[]) => void;
};
scope.onmessage = async ({ data: request }) => {
  try {
    if (request.kind !== "import")
      throw new Error("Unsupported published map request.");
    let bytes: Uint8Array | undefined = request.bytes;
    (request as { bytes?: Uint8Array }).bytes = undefined;
    const progress = (progress: unknown) =>
      scope.postMessage({ kind: "import", progress });
    let result = await tryReadPublishedProject(bytes, progress, undefined, {
      retainArchiveFiles: false,
    });
    if (!result) {
      await initializeNativeExactGeosOverlay();
      result = { project: await readIndoorProject(bytes, progress) };
    }
    bytes = undefined;
    result.project = visitorRuntimeProject(result.project);
    scope.postMessage(
      { kind: "import", result },
      projectRuntimeTransfers(result.project),
    );
  } catch (error) {
    scope.postMessage({
      kind: "import",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
