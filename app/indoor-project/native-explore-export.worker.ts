import { compileNativeExploreMapping } from "./native-explore-mapping";
import type { IndoorDataset } from "./contract";
const worker = globalThis as unknown as {
  onmessage: (
    e: MessageEvent<{ data: IndoorDataset; datasetGeometrySha256: string }>,
  ) => void;
  postMessage: (v: unknown) => void;
};
worker.onmessage = ({ data }) => {
  void compileNativeExploreMapping(data.data, data.datasetGeometrySha256)
    .then((result) => worker.postMessage({ result }))
    .catch((error) =>
      worker.postMessage({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
};
