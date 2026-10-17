import { runProjectPackageJob } from "./project-package-client";
import type { ProjectImportObserver } from "./project-import-progress";
import type { PublishedProjectImport } from "./published-project";

export function readPublishedProject(
  bytes: Uint8Array,
  onProgress?: ProjectImportObserver,
  signal?: AbortSignal,
) {
  return runProjectPackageJob<PublishedProjectImport>(
    { kind: "import", bytes },
    () =>
      new Worker(new URL("published-project.worker.ts", import.meta.url), {
        type: "module",
      }),
    onProgress,
    signal,
  );
}
