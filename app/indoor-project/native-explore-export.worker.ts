import {
  compileNativeExploreMapping,
  validatePublishedNativeExploreMappingInProcess,
} from "./native-explore-mapping";
import type { IndoorDataset } from "./contract";
const worker = globalThis as unknown as {
  onmessage: (
    e: MessageEvent<{
      data: IndoorDataset;
      datasetGeometrySha256: string;
      validation?: boolean;
    }>,
  ) => void;
  postMessage: (v: unknown) => void;
};
worker.onmessage = ({ data }) => {
  if (data.validation) {
    void validatePublishedNativeExploreMappingInProcess(data.data)
      .then(() => worker.postMessage({}))
      .catch((error) =>
        worker.postMessage({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return;
  }
  void compileNativeExploreMapping(data.data, data.datasetGeometrySha256)
    .then((result) => worker.postMessage({ result }))
    .catch((error) =>
      worker.postMessage({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
};
