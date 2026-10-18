import type { IndoorProject } from "./package";

/** Visitor rendering and viewer export use the decoded dataset and metadata.
 * Retaining their original JSON buffers duplicates the largest map entry. Keep
 * source archives intact: authoring export still needs their original bytes. */
export function visitorRuntimeProject(project: IndoorProject): IndoorProject {
  return project.manifest.format === "openindoormaps-viewer"
    ? { ...project, files: {} }
    : project;
}

/** Prepared display blobs survive the visitor projection and must be moved,
 * rather than copied, even when their original archive entries were released. */
export function projectRuntimeTransfers(project: IndoorProject): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const bytes of [
    ...Object.values(project.files),
    ...Object.values(project.preparedDisplay?.blobs ?? {}),
    ...(project.scene ? [project.scene] : []),
  ])
    buffers.add(bytes.buffer as ArrayBuffer);
  return [...buffers];
}
