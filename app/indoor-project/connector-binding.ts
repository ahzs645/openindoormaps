import * as DMath from "./deterministic-math";
import type { IndoorDataset } from "./contract";
type SourceConnectorReview = {
  version: 1;
  modelSha256: string;
  connectors: {
    id: string;
    kind: string;
    nativeElementId: number;
    evidence: string;
    accessible: string;
    direction: string;
    reviewedShaft?: unknown;
    entrances: {
      roomKey: string;
      areaKey?: string;
      levelId: number;
      pointFeet: [number, number];
    }[];
  }[];
};
/** Compiled connectors must come from the exact model-bound source review. A
 * rejected source entry may be absent from the graph, but not the reverse. */
export function validateConnectorBinding(
  data: IndoorDataset,
  value: unknown,
  reviews?: {
    edges: Record<string, { accessible?: string; geometryKey?: string }>;
  },
) {
  if (!data.connectors?.length) return;
  const source = value as SourceConnectorReview;
  if (
    !source ||
    source.version !== 1 ||
    source.modelSha256 !== data.source.modelSha256 ||
    !Array.isArray(source.connectors)
  )
    throw new Error(
      "Prepared connectors have no matching source model review.",
    );
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  for (const connector of data.connectors) {
    const original = source.connectors.find((c) => c.id === connector.id);
    if (
      !original ||
      ["kind", "nativeElementId", "evidence", "accessible", "direction"].some(
        (field) =>
          original[field as keyof typeof original] !==
          connector[field as keyof typeof connector],
      ) ||
      JSON.stringify(original.reviewedShaft) !==
        JSON.stringify(connector.reviewedShaft) ||
      !Array.isArray(original.entrances) ||
      original.entrances.length !== connector.entrances.length ||
      connector.entrances.some((entry, index) => {
        const s = original.entrances[index],
          node = nodes.get(entry.nodeId);
        return (
          !s ||
          !node ||
          s.roomKey !== entry.roomKey ||
          s.areaKey !== entry.areaKey ||
          s.levelId !== entry.levelId ||
          entry.nodeId !== `connector:${connector.id}:${index}` ||
          !Array.isArray(s.pointFeet) ||
          s.pointFeet.length !== 2 ||
          s.pointFeet.some((p) => !Number.isFinite(p)) ||
          DMath.hypot(
            node.pointFeet[0] - s.pointFeet[0],
            node.pointFeet[1] - s.pointFeet[1],
          ) > 1.2
        );
      })
    )
      throw new Error(
        `Prepared connector does not match source served entrances: ${connector.id}`,
      );
    for (const edge of data.edges.filter(
      (e) =>
        e.connectorId === connector.id && e.accessible !== connector.accessible,
    )) {
      const review = reviews?.edges[edge.id];
      const geometryKey = JSON.stringify([
        data.source.modelSha256,
        edge.from,
        edge.to,
        edge.roomKeys,
        edge.pointsFeet,
      ]);
      if (
        !review ||
        review.accessible !== edge.accessible ||
        review.geometryKey !== geometryKey
      )
        throw new Error(
          `Connector accessibility review does not match its current geometry: ${edge.id}`,
        );
    }
  }
}
