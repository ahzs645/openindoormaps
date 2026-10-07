import {
  deriveNativeAreas,
  type NativeAreaOptions,
} from "./native-area-review";
import type { IndoorDataset } from "./contract";
import { enclosureEvidenceText } from "./enclosure-review";
const worker = globalThis as unknown as {
  onmessage: (
    e: MessageEvent<{
      data: IndoorDataset;
      levelId: number;
      options?: NativeAreaOptions;
    }>,
  ) => void;
  postMessage: (value: unknown) => void;
};
worker.onmessage = ({ data }) => {
  void deriveNativeAreas(data.data, data.levelId, data.options)
    .then(async (result) => {
      result.reviewEvidenceSha256 = [
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(enclosureEvidenceText(data.data)),
          ),
        ),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      worker.postMessage({ result });
    })
    .catch((error) =>
      worker.postMessage({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
};
