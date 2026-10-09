import {
  readIndoorProject as readDirect,
  exportIndoorProject as exportDirect,
  exportCampusViewer as viewerDirect,
  type IndoorProject,
} from "./package";
import type { WindowExportMode } from "./native-window-display";
import { readProjectFolder as folderDirect } from "./review-bundle";
import {
  isProjectImportProgress,
  type ProjectImportObserver,
  type ProjectImportProgress,
} from "./project-import-progress";

export type ProjectPackageRequest =
  | { kind: "import"; bytes: Uint8Array }
  | { kind: "folder"; files: { file: File; relativePath: string }[] }
  | { kind: "export"; project: IndoorProject }
  | {
      kind: "viewer";
      project: IndoorProject;
      options: { windows?: WindowExportMode; preparedDisplay?: boolean };
    };
export type ProjectPackageWorker = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror"
>;

/** One immutable local package job. Only the copied ZIP input is transferred;
 * callers retain their original bytes for persistence/retry. */
export function runProjectPackageJob<T>(
  request: ProjectPackageRequest,
  factory: () => ProjectPackageWorker,
  onProgress?: ProjectImportObserver,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Indoor package loading cancelled."));
      return;
    }
    let worker: ProjectPackageWorker;
    try {
      worker = factory();
    } catch (error) {
      reject(error);
      return;
    }
    let settled = false;
    const finish = (value?: T, error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      error
        ? reject(error instanceof Error ? error : new Error(String(error)))
        : resolve(value!);
    };
    const abort = () =>
      finish(undefined, new Error("Indoor package loading cancelled."));
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      kind: ProjectPackageRequest["kind"];
      result?: T;
      error?: string;
      progress?: ProjectImportProgress;
    }>) => {
      if (data.kind !== request.kind) {
        finish(
          undefined,
          new Error("Unexpected indoor package worker response."),
        );
        return;
      }
      if (settled) return;
      if (data.progress !== undefined) {
        if (
          request.kind !== "import" ||
          !isProjectImportProgress(data.progress) ||
          data.result !== undefined ||
          data.error !== undefined
        ) {
          finish(
            undefined,
            new Error("Invalid indoor import progress response."),
          );
        } else {
          try {
            onProgress?.(data.progress);
          } catch (error) {
            finish(
              undefined,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
        return;
      }
      if (data.error) finish(undefined, new Error(data.error));
      else if (data.result === undefined)
        finish(
          undefined,
          new Error("Indoor package worker returned no result."),
        );
      else finish(data.result);
    };
    worker.onerror = () =>
      finish(
        undefined,
        new Error(
          "Indoor package processing failed. Retry importing or exporting the project.",
        ),
      );
    worker.onmessageerror = () =>
      finish(
        undefined,
        new Error("Indoor package response could not be read."),
      );
    try {
      if (request.kind === "import") {
        if (!request.bytes.length || request.bytes.length > 900 * 1024 * 1024)
          throw new Error("Project ZIP exceeds the 900 MB limit.");
        const bytes = new Uint8Array(request.bytes);
        worker.postMessage({ ...request, bytes }, [bytes.buffer]);
      } else worker.postMessage(request);
    } catch (error) {
      finish(undefined, error);
    }
  });
}
const factory = () =>
  new Worker(new URL("project-package.worker.ts", import.meta.url), {
    type: "module",
  });
const supportsPackageWorker = () =>
  typeof window !== "undefined" && typeof Worker !== "undefined";
export function readIndoorProject(
  bytes: Uint8Array,
  onProgress?: ProjectImportObserver,
  signal?: AbortSignal,
): Promise<IndoorProject> {
  return supportsPackageWorker()
    ? runProjectPackageJob(
        { kind: "import", bytes },
        factory,
        onProgress,
        signal,
      )
    : readDirect(bytes, onProgress);
}
export function readProjectFolder(
  files: File[],
  signal?: AbortSignal,
): Promise<{ project: IndoorProject; fileName: string }> {
  return supportsPackageWorker()
    ? runProjectPackageJob(
        {
          kind: "folder",
          files: files.map((file) => ({
            file,
            relativePath: file.webkitRelativePath || file.name,
          })),
        },
        factory,
        undefined,
        signal,
      )
    : folderDirect(files);
}
export function exportIndoorProject(
  project: IndoorProject,
): Promise<Uint8Array> {
  return supportsPackageWorker()
    ? runProjectPackageJob({ kind: "export", project }, factory)
    : exportDirect(project);
}
export function exportCampusViewer(
  project: IndoorProject,
  options: { windows?: WindowExportMode; preparedDisplay?: boolean } = {},
): Promise<Uint8Array> {
  return supportsPackageWorker()
    ? runProjectPackageJob({ kind: "viewer", project, options }, factory)
    : viewerDirect(project, options);
}
