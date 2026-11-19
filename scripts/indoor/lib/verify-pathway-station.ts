import assert from "node:assert/strict";
import type { PreparedRouting } from "../../../app/indoor-project/prepared-routing";
import type { SharedPathwayStop } from "../../../app/indoor-project/shared-pathway-routing";

type Guide = PreparedRouting["guides"][number];

/** Independently reconstruct a published room stop from its bound source guide. */
export function createPathwayStopVerifier(
  guides: ReadonlyMap<string, Guide>,
  cellOf: (edgeId: string) => string | undefined,
  hasVertex: (cellId: string, point: SharedPathwayStop["pointFeet"]) => boolean,
) {
  return (stop: SharedPathwayStop) => {
    assert.equal(cellOf(stop.guideEdgeId), stop.cellId);
    assert.equal(stop.stopId, JSON.stringify([stop.cellId, ...stop.pointFeet]));
    const station = stop.station;
    if (!station) {
      assert(hasVertex(stop.cellId, stop.pointFeet), stop.stopId);
      return;
    }
    const {
      guideEdgeId,
      segment,
      fraction,
      previousPointFeet,
      previousStopId,
    } = station;
    const guide = guides.get(guideEdgeId);
    assert.equal(cellOf(guideEdgeId), stop.cellId);
    assert(
      guide?.hallwayJoins &&
        Number.isInteger(segment) &&
        segment >= guide.hallwayJoins[0] &&
        segment < guide.hallwayJoins[1],
    );
    assert(Number.isFinite(fraction) && fraction >= 0 && fraction <= 1);
    const a = guide.pointsFeet[segment],
      b = guide.pointsFeet[segment + 1];
    assert(a[0] !== b[0] || a[1] !== b[1]);
    assert.equal(a[2], b[2]);
    assert(hasVertex(stop.cellId, a) && hasVertex(stop.cellId, b));
    const q =
      fraction === 0
        ? a
        : fraction === 1
          ? b
          : [
              a[0] + fraction * (b[0] - a[0]),
              a[1] + fraction * (b[1] - a[1]),
              a[2],
            ];
    assert.deepEqual(
      stop.pointFeet,
      q,
      "Station is off its cited hallway segment",
    );
    assert.equal(
      previousStopId,
      JSON.stringify([stop.cellId, ...previousPointFeet]),
    );
    assert(hasVertex(stop.cellId, previousPointFeet));
  };
}
