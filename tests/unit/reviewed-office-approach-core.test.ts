import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reviewedOfficeApproachCore } from "../../app/indoor-project/reviewed-office-approach-core";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { PathwayArc } from "../../app/indoor-project/shared-pathway-routing";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";

test("the corridor-core review needs the original model identity", () => {
  assert.equal(
    reviewedOfficeApproachCore({
      source: { modelSha256: "different" },
    } as IndoorDataset),
    undefined,
  );
});
const input = process.env.UNBC_CORRIDOR_CORE_DATASET;
test(
  "the 10-2006 hallway core clears the office and its door stays held",
  { skip: !input },
  async () => {
    await initializeNativeExactGeosOverlay();
    const data: IndoorDataset & { preparedRouting: PreparedRouting } =
      JSON.parse(readFileSync(input!, "utf8"));
    createImmutableRoutingSession(data)(() => {
      const id =
        "native-cell:14.435696:669:walk:door:694:1499373:1|door:694:1499404:1";
      const edge = data.edges.find((e) => e.id === id)!;
      const guide = data.preparedRouting.guides.find((g) => g.edgeId === id)!;
      const [i, j] = guide.hallwayJoins!;
      const owner = data.records.find((r) => r.number === "10-2006")!.key;
      const link = {
        edge,
        to: edge.to,
        requiredRooms: [owner],
        blockers: [],
        passages: [],
      };
      const arc: PathwayArc = {
        link,
        points: guide.pointsFeet.slice(i, j + 1),
        metres: 0,
        sourceFrom: edge.from,
        sourceTo: edge.to,
        from: "start",
        to: "finish",
      };
      const core = reviewedOfficeApproachCore(data)!;
      assert.equal(core(arc).validateReviewedRun?.(), true);
      assert.deepEqual(link.requiredRooms, [owner]);
      const extra = {
        ...arc,
        link: { ...link, requiredRooms: [owner, "some-other-room"] },
      };
      assert.equal(core(extra), extra);
      const shifted = {
        ...arc,
        points: [
          ...arc.points,
          [168.3, 849.9, arc.points[0][2]] as [number, number, number],
        ],
      };
      assert.equal(core(shifted).validateReviewedRun?.(), false);
    });
  },
);
