import { nativeAreaDisplayParts } from "./native-area-display";
import type { GapScanPreview } from "./native-gap-scan";
import { scanNativeGaps, type GapScanOptions } from "./native-gap-scan";
import type { IndoorDataset } from "./contract";
const worker = globalThis as unknown as {
  onmessage: (e: MessageEvent<{ data: IndoorDataset; levelId: number; options: GapScanOptions; preview?: GapScanPreview }>) => void;
  postMessage: (value: unknown) => void;
};
worker.onmessage = ({ data }) => {
  if (data.preview) {
    worker.postMessage({ preview: { ...data.preview, displayParts: data.preview.parts.flatMap((rings, side) => nativeAreaDisplayParts(rings).map(ringsFeet => ({ side, ringsFeet }))) } });
    return;
  }
  void scanNativeGaps(data.data, data.levelId, data.options).then(
    result => worker.postMessage({ result }),
    error => worker.postMessage({ error: error instanceof Error ? error.message : String(error) }),
  );
};
