import type { IndoorDataset } from "./contract";
import type { IndoorProject } from "./package";
import {
  applyReviewedAreaPartitionGroup,
  checkReviewedAreaPartition,
  reviewedAreaPartitionEvidenceHashes,
  reviewedAreaPartitionGeometrySha256,
  type ReviewedAreaPartition,
} from "./reviewed-area-partitions";

const worker = globalThis as unknown as {
  onmessage: (
    event: MessageEvent<{
      data: IndoorDataset;
      levelId: number;
      partition?: ReviewedAreaPartition;
      applyId?: string;
      applyIds?: string[];
      checkIds?: string[];
    }>,
  ) => void;
  postMessage: (value: unknown) => void;
};
worker.onmessage = ({ data: request }) => {
  void (async () => {
    const physicalHash = await reviewedAreaPartitionGeometrySha256(
      request.data,
      request.levelId,
    );
    // Each boundary is checked against the evidence it is bound to: local
    // evidence for current reviews, the level-wide digest for legacy ones.
    const evidenceDigests = await reviewedAreaPartitionEvidenceHashes(
      request.data,
      [
        ...(request.data.reviewedAreaPartitions?.partitions ?? []).filter(
          (p) => p.levelId === request.levelId,
        ),
        ...(request.partition ? [request.partition] : []),
      ],
    );
    const check = request.partition
      ? checkReviewedAreaPartition(
          request.data,
          request.partition,
          evidenceDigests[request.partition.id]!,
        )
      : undefined;
    const checks = (request.checkIds ?? []).map((id) => {
      const p = request.data.reviewedAreaPartitions?.partitions.find(
        (p) => p.id === id,
      );
      if (!p || p.levelId !== request.levelId)
        throw new Error(
          "Choose a saved area boundary on the current native floor.",
        );
      return {
        id,
        check: checkReviewedAreaPartition(
          request.data,
          p,
          evidenceDigests[p.id]!,
        ),
      };
    });
    const ids = request.applyIds ?? (request.applyId ? [request.applyId] : []);
    if (ids.length > 0) {
      for (const id of ids) {
        const partition = request.data.reviewedAreaPartitions?.partitions.find(
          (p) => p.id === id,
        );
        if (!partition || partition.levelId !== request.levelId)
          throw new Error(
            "Choose a saved area boundary on the current native floor.",
          );
      }
      // Only dataset + synchronized authoring metadata are needed for validation.
      // Never transfer model/scene bytes to the worker or return a second full dataset.
      const project = {
        dataset: request.data,
        rooms: { reviewedAreaPartitions: request.data.reviewedAreaPartitions },
      } as IndoorProject;
      const next = applyReviewedAreaPartitionGroup(
        project,
        ids,
        evidenceDigests,
      );
      worker.postMessage({
        physicalHash,
        evidenceDigests,
        check,
        checks,
        appliedPartitions: next.rooms.reviewedAreaPartitions,
      });
    } else worker.postMessage({ physicalHash, evidenceDigests, check, checks });
  })().catch((error) =>
    worker.postMessage({
      error: error instanceof Error ? error.message : String(error),
    }),
  );
};
