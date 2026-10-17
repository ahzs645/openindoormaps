import type { IndoorDataset } from "../../app/indoor-project/contract";
import { originalBlockedArrivalEvidence } from "./pathway-candidate-audit";

/** A source-bound arrival-loss exception never relies on a metadata alias.
 * Keep this final-QA veto independent from the frozen regeneration helper. */
export function strictOriginalBlockedArrivalEvidence(
  data: IndoorDataset,
  roomKey: string,
  blockers: ReadonlySet<string>,
) {
  const original = originalBlockedArrivalEvidence(data, roomKey, blockers),
    nodes = new Map(data.nodes.map((node) => [node.id, node])),
    incidentIds = new Set(
      original.enabledIncidentEdges.map((edge) => edge.edgeId),
    ),
    stationaryIncidentEdgeIds = data.edges
      .filter((edge) => {
        if (!incidentIds.has(edge.id)) return false;
        const a = nodes.get(edge.from),
          b = nodes.get(edge.to);
        return (
          edge.lengthMetres === 0 ||
          (!!a && !!b && a.pointFeet.every((n, i) => n === b.pointFeet[i])) ||
          edge.pointsFeet.length < 2 ||
          edge.pointsFeet.every((point) =>
            point.every((n, i) => n === edge.pointsFeet[0][i]),
          )
        );
      })
      .map((edge) => edge.id);
  return {
    ...original,
    stationaryIncidentEdgeIds,
    allOriginalApproachesPhysicallyRefused:
      original.allOriginalApproachesPhysicallyRefused &&
      stationaryIncidentEdgeIds.length === 0,
  };
}
