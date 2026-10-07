import {
  affectedComparisonRegions,
  type PinComparisonResult,
} from "./pin-comparison";
import pc from "polygon-clipping";
import type { IndoorDataset } from "./contract";
import type { NativeBoundaryPatch } from "./native-boundary-patches";
import {
  deriveExactBoundaryPatchPreview,
  deriveExactBoundaryPatchGroupPreview,
} from "./enclosure-proposals";
import {
  deriveNativeAreas,
  type NativeAreaOptions,
  type NativeAreaResult,
} from "./native-area-review";
const scope = globalThis as unknown as {
  onmessage: (
    event: MessageEvent<{
      data: IndoorDataset;
      levelId: number;
      roomKey: string;
      options: NativeAreaOptions;
      patch?: NativeBoundaryPatch;
      patches?: NativeBoundaryPatch[];
    }>,
  ) => void;
  postMessage: (message: {
    result?: NativeAreaResult;
    comparison?: PinComparisonResult;
    error?: string;
  }) => void;
};
scope.onmessage = async ({ data: request }) => {
  try {
    const result = request.patches
      ? await deriveExactBoundaryPatchGroupPreview(
          request.data,
          request.levelId,
          request.patches,
          request.options,
        )
      : request.patch
        ? await deriveExactBoundaryPatchPreview(
            request.data,
            request.levelId,
            request.patch,
            request.options,
          )
        : await deriveNativeAreas(
            request.data,
            request.levelId,
            request.options,
          );
    // Clipping partitions are useful for native rendering, but internal triangle
    // edges are not room boundaries. Union only the selected comparison on this worker.
    for (const region of result.regions) {
      if (
        region.roomKeys.includes(request.roomKey) &&
        region.displayPartsFeet?.length
      )
        region.displayPartsFeet = pc.union(
          region.displayPartsFeet[0],
          ...region.displayPartsFeet.slice(1),
        );
    }
    const patches = request.patches ?? (request.patch ? [request.patch] : []);
    const patchIds = new Set(patches.map((p) => p.id));
    const beforeData = {
      ...request.data,
      walls: request.data.walls.filter(
        (w) => !w.reviewPatchId || !patchIds.has(w.reviewPatchId),
      ),
    };
    const original = await deriveNativeAreas(beforeData, request.levelId, {
      mode: "connected",
      maxGapFeet: 0,
    });
    const current = original.regions.find((r) =>
      r.roomKeys.includes(request.roomKey),
    );
    const updated = result.regions.find((r) =>
      r.roomKeys.includes(request.roomKey),
    );
    const comparison: PinComparisonResult = {
      current,
      updated,
      patches,
      beforeAppliedPatch: request.data.walls.some(
        (w) => !!w.reviewPatchId && patchIds.has(w.reviewPatchId),
      ),
      currentRegions: current ? [current] : [],
      updatedRegions: affectedComparisonRegions(current, result),
      targetRoomKey: request.roomKey,
      warnings: result.warnings,
    };
    scope.postMessage({ result, comparison });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
