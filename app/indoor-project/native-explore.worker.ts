import { deriveNativeExplore } from "./native-explore";
import type { IndoorDataset } from "./contract";
const worker = globalThis as unknown as {
  onmessage: (
    event: MessageEvent<{
      data: IndoorDataset;
      levelIds: number[];
      building: string;
    }>,
  ) => void;
  postMessage: (value: unknown) => void;
};
worker.onmessage = ({ data }) => {
  void deriveNativeExplore(data.data, data.levelIds, data.building)
    .then((result) => worker.postMessage({ result }))
    .catch((error) =>
      worker.postMessage({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
};
