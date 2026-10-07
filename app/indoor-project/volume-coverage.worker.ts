import {
  auditVolumeScope,
  volumeScopes,
  type VolumeAudit,
  type VolumeView,
} from "./volume-coverage";
import type { IndoorDataset } from "./contract";
import { enclosureEvidenceText } from "./enclosure-review";

export type VolumeWorkerResponse =
  | { progress: { completed: number; total: number; name: string } }
  | { result: VolumeAudit }
  | { error: string };
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<IndoorDataset>) => void;
  postMessage: (message: VolumeWorkerResponse) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    const hash = async (text: string) =>
      [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
        ),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const datasetSha256 = await hash(JSON.stringify(data));
    const reviewEvidenceSha256 = await hash(enclosureEvidenceText(data));
    const scopes = volumeScopes(data),
      views: VolumeView[] = [];
    for (const item of scopes) {
      scope.postMessage({
        progress: {
          completed: views.length,
          total: scopes.length,
          name: item.name,
        },
      });
      views.push(auditVolumeScope(data, item));
    }
    scope.postMessage({
      result: {
        format: "openindoormaps-volume-coverage-audit",
        version: 1,
        source: data.source,
        datasetSha256,
        reviewEvidenceSha256,
        views,
      },
    });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
