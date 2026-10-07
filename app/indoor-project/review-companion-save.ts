import { deflateSync } from "fflate";
import { exportIndoorProject, type IndoorProject } from "./package";
import { validateReviewBundle } from "./review-bundle";
/** Authoring-only companion: original model and visitor dataset stay untouched. */
export async function saveReviewCompanion(project: IndoorProject, path: string, value: unknown): Promise<IndoorProject> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))].map(n => n.toString(16).padStart(2, "0")).join("");
  const compressed = deflateSync(bytes);
  let content = "";
  for (let i = 0; i < compressed.length; i += 8192) content += String.fromCharCode(...compressed.subarray(i, i + 8192));
  const old = project.rooms.reviewBundle;
  const bundle = { version: 1 as const, masterSha256: old?.masterSha256 ?? await hash(await exportIndoorProject(project)),
    files: [...(old?.files ?? []).filter(f => f.path !== path), { path, bytes: bytes.length, sha256: await hash(bytes), compressedBase64: btoa(content) }] };
  validateReviewBundle(bundle);
  return { ...project, rooms: { ...project.rooms, reviewBundle: bundle } };
}
