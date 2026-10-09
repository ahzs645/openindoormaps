import {
  deriveNativeExplore,
  nativeExploreWallFeatures,
} from "./native-explore";
import { floorMemoryCostBytes } from "./floor-memory-cost";
import { loadPreparedDisplayAsset } from "./prepared-display-loader";
import type { NativeExploreRequest } from "./native-explore-client";
const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent<NativeExploreRequest>) => void;
  postMessage: (value: unknown) => void;
};
worker.onmessage = ({ data }) => {
  void (async () => {
    const saved = await loadPreparedDisplayAsset(
      data.data,
      data.levelIds,
      data.building,
      data.preparedDisplay,
    );
    if (saved) {
      worker.postMessage({
        result: saved.nativeFaces,
        complete: true,
        memoryCostBytes: floorMemoryCostBytes(saved.nativeFaces),
      });
      return;
    }
    const result = await deriveNativeExplore(
      data.data,
      data.levelIds,
      data.building,
      {
        includeWalls: false,
      },
    );
    if (!data.data.nativeMaterialSections) {
      worker.postMessage({
        result,
        complete: true,
        memoryCostBytes: floorMemoryCostBytes(result),
      });
      return;
    }
    // Release the verified floor drawing to the map before constructing fine
    // wall detail. The same worker owns the same validated source snapshot.
    worker.postMessage({ result, complete: false });
    try {
      const walls = nativeExploreWallFeatures(
        data.data,
        result.levelIds,
        result.exactTopologies?.map((entry) => entry.levelId) ?? [],
      );
      worker.postMessage({
        walls,
        complete: true,
        memoryCostBytes: floorMemoryCostBytes({ ...result, walls }),
      });
    } catch (error) {
      worker.postMessage({
        complete: true,
        error: `Native wall detail failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  })().catch((error) =>
    worker.postMessage({
      error: error instanceof Error ? error.message : String(error),
    }),
  );
};
