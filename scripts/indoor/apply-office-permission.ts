import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRooms } from "../../app/indoor-project/package";

export type ReviewedOfficePermission = {
  sourceModelSha256: string;
  nativeDoorId: number;
  sourceHostWallId: number;
  levelId: number;
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  roomKeys: string[];
  roomNumbers: string[];
  pointsFeet: number[][];
  notes: string;
};

/** Retain the physical door. Persist an owner-reviewed public routing closure
 * on the measured office/vestibule crossing, independent of room contours. */
export function applyOfficePermission(
  data: IndoorDataset,
  rooms: ProjectRooms,
  review: ReviewedOfficePermission,
) {
  assert.equal(data.source.modelSha256, review.sourceModelSha256);
  const door = data.doors?.find((d) => d.id === review.edgeId);
  const edge = data.edges.find((e) => e.id === review.edgeId);
  assert(door && edge, "The reviewed office door and its edge must exist.");
  assert.equal(door.state, "connected");
  assert.equal(door.levelId, review.levelId);
  assert.equal(door.nativeElementId, review.nativeDoorId);
  assert.equal(door.hostWallNativeElementId, review.sourceHostWallId);
  assert.equal(edge.kind, "door");
  assert.equal(edge.nativeElementId, review.nativeDoorId);
  assert.equal(edge.from, review.fromNodeId);
  assert.equal(edge.to, review.toNodeId);
  assert.deepEqual(door.roomKeys, review.roomKeys);
  assert.deepEqual(edge.roomKeys, review.roomKeys);
  assert.deepEqual(edge.pointsFeet, review.pointsFeet);
  assert.deepEqual(
    edge.roomKeys.map((k) => data.records.find((r) => r.key === k)?.number),
    review.roomNumbers,
  );
  assert.equal(review.roomKeys.length, 2);
  assert.equal(new Set(review.roomKeys).size, 2);
  assert(typeof review.notes === "string" && review.notes.trim().length > 0);
  const geometryKey = JSON.stringify([
    data.source.modelSha256, edge.from, edge.to, edge.roomKeys, edge.pointsFeet,
  ]);
  const saved = rooms.indoorReviews ?? { version: 1, records: {}, edges: {} };
  rooms.indoorReviews = {
    ...saved,
    edges: {
      ...saved.edges,
      [edge.id]: { ...saved.edges[edge.id], enabled: false, geometryKey, notes: review.notes },
    },
  };
  data.edges = data.edges.map((e) =>
    e === edge ? { ...e, enabled: false, notes: review.notes } : e,
  );
}
