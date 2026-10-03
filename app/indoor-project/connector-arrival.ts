import type { IndoorDataset, IndoorRecord } from "./contract";
/** An explicitly reviewed shaft destination ends at its native-verified lobby.
 * Never shorten that route against the original shaft/room drawing outline. */
export function isConnectorLobbyDestination(
  data: IndoorDataset,
  record: IndoorRecord,
) {
  if (!record.walkable || record.access === "staff" || !record.arrivalNodeId)
    return false;
  return (
    data.connectors?.some(
      (c) =>
        c.sourceModelSha256 === data.source.modelSha256 &&
        c.reviewedShaft &&
        c.entrances.some((e) => {
          const lobby = data.records.find((r) => r.key === e.roomKey),
            node = data.nodes.find((n) => n.id === e.nodeId);
          return (
            e.areaKey === record.key &&
            e.nodeId === record.arrivalNodeId &&
            e.levelId === record.levelId &&
            lobby?.walkable &&
            lobby.access !== "staff" &&
            node?.roomKey === e.roomKey &&
            Math.abs(node.pointFeet[2] - record.elevationFeet) < 0.05
          );
        }),
    ) ?? false
  );
}
