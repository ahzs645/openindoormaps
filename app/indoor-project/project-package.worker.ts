import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
  type IndoorProject,
} from "./package";
import type { ProjectPackageRequest } from "./project-package-client";
import { readProjectFolder } from "./review-bundle";

const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent<ProjectPackageRequest>) => void;
  postMessage: (value: unknown, transfers?: Transferable[]) => void;
};
worker.onmessage = async ({
  data: request,
}: MessageEvent<ProjectPackageRequest>) => {
  try {
    const result =
      request.kind === "import"
        ? await readIndoorProject(request.bytes, (progress) =>
            worker.postMessage({ kind: request.kind, progress }),
          )
        : request.kind === "folder"
          ? await readProjectFolder(
              request.files.map(({ file, relativePath }) => ({
                name: file.name,
                size: file.size,
                webkitRelativePath: relativePath,
                arrayBuffer: () => file.arrayBuffer(),
              })),
            )
          : request.kind === "export"
            ? await exportIndoorProject(request.project)
            : request.kind === "viewer"
              ? await exportCampusViewer(request.project, request.options)
              : (() => {
                  throw new Error("Unknown indoor package operation.");
                })();
    const buffers = new Set<ArrayBuffer>();
    if (result instanceof Uint8Array) buffers.add(result.buffer as ArrayBuffer);
    else
      for (const bytes of Object.values(
        ("project" in result ? result.project : (result as IndoorProject))
          .files,
      ))
        buffers.add(bytes.buffer as ArrayBuffer);
    worker.postMessage({ kind: request.kind, result }, [...buffers]);
  } catch (error) {
    worker.postMessage({
      kind: request.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
