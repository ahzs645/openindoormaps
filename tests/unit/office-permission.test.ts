import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRooms } from "../../app/indoor-project/package";
import {
  applyOfficePermission,
  type ReviewedOfficePermission,
} from "../../scripts/indoor/apply-office-permission";

const review: ReviewedOfficePermission = JSON.parse(readFileSync(new URL(
  "../../docs/continuation/unbc-20261117/main-rebuild/REVIEWED-OFFICE-PERMISSION.json",
  import.meta.url,
), "utf8"));

function fixture() {
  const { edgeId, roomKeys, nativeDoorId, levelId } = review;
  const edge = {
    id: edgeId, kind: "door", enabled: true, nativeElementId: nativeDoorId,
    from: review.fromNodeId, to: review.toNodeId, roomKeys,
    pointsFeet: review.pointsFeet,
  };
  const data = {
    source: { modelSha256: review.sourceModelSha256 },
    doors: [{ id: edgeId, roomKeys, levelId, state: "connected", nativeElementId: nativeDoorId,
      hostWallNativeElementId: review.sourceHostWallId }],
    edges: [edge, { ...edge, id: "another-door" }],
    records: roomKeys.map((key, i) => ({ key, number: review.roomNumbers[i] })),
  } as unknown as IndoorDataset;
  const rooms = { indoorReviews: { version: 1, records: {}, edges: {
    "another-door": { enabled: true, notes: "Existing review" },
  } } } as unknown as ProjectRooms;
  return { data, rooms };
}

test("office permission closes one visitor edge and persists across repeat applications", () => {
  const { data, rooms } = fixture();
  const door = structuredClone(data.doors);
  const other = data.edges[1];
  applyOfficePermission(data, rooms, review);
  const first = structuredClone({ data, rooms });
  applyOfficePermission(data, rooms, review);
  assert.deepEqual({ data, rooms }, first);
  assert.equal(data.edges[0].enabled, false);
  assert.equal(rooms.indoorReviews?.edges[review.edgeId].enabled, false);
  assert.deepEqual(data.doors, door);
  assert.equal(data.edges[1], other);
  assert.deepEqual(rooms.indoorReviews?.edges["another-door"], { enabled: true, notes: "Existing review" });
});

test("stale office permission evidence leaves both authoring and routing data untouched", () => {
  const changes: Partial<ReviewedOfficePermission>[] = [
    { sourceModelSha256: "old" }, { sourceHostWallId: 0 }, { levelId: 0 }, { nativeDoorId: 0 },
    { roomKeys: [...review.roomKeys].reverse() }, { roomNumbers: [...review.roomNumbers].reverse() },
    { fromNodeId: review.toNodeId }, { pointsFeet: [[0,0,0],[1,1,0]] }, { notes: "" },
  ];
  for (const change of changes) {
    const { data, rooms } = fixture();
    const before = structuredClone({ data, rooms });
    assert.throws(() => applyOfficePermission(data, rooms, { ...review, ...change }));
    assert.deepEqual({ data, rooms }, before);
  }
});
