import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeatureCollection, MultiPolygon } from "geojson";
import {
  auditWallRenderGeometry,
  wallRoomFaceRisks,
} from "../../app/indoor-project/wall-render-audit";
const geo = (points: number[][]) =>
  points.map(([x, y]) => [x / 111_319.49, y / 111_319.49]);
const rect = (x: number, y: number, w: number, h: number) =>
  geo([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ]);
const walls = (
  parts: number[][][][],
  properties?: Record<string, unknown>,
): FeatureCollection<MultiPolygon> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "wall:42",
      properties: {
        nativeElementId: 42,
        levelId: 694,
        height: 0.61,
        ...properties,
      },
      geometry: { type: "MultiPolygon", coordinates: parts },
    },
  ],
});
test("audit identifies debris on any native level and retains the measured wall without source mutation", () => {
  const input = walls([[rect(0, 0, 8, 0.2)], [rect(0, 1, 20, 0.000_001)]]),
    before = JSON.stringify(input);
  const a = auditWallRenderGeometry(input);
  assert.equal(a.cleaned.features.length, 1);
  assert.ok(
    a.repairs.some(
      (r) =>
        r.reason === "degenerate-ring" &&
        r.nativeElementId === 42 &&
        r.levelId === 694 &&
        r.part === 1,
    ),
  );
  assert.equal(a.issues.filter((i) => i.stage === "after-cleanup").length, 0);
  assert.equal(JSON.stringify(input), before);
});
test("a large invalid bow-tie is a topology finding, not an automatically certified repair", () => {
  const a = auditWallRenderGeometry(
    walls([
      [
        geo([
          [0, 0],
          [5, 5],
          [0, 5],
          [5, 0],
          [0, 0],
        ]),
      ],
    ]),
  );
  assert.ok(a.unresolved.some((i) => i.code === "self-intersection"));
  assert.ok(
    a.issues.some(
      (i) => i.code === "self-intersection" && i.stage === "before-cleanup",
    ),
  );
});
test("invalid coordinates and a detached hole carry their exact source reference", () => {
  const bad = rect(0, 0, 3, 0.2);
  bad[1][0] = Number.NaN;
  const a = auditWallRenderGeometry(walls([[bad]]));
  assert.ok(
    a.issues.some(
      (i) => i.code === "invalid-coordinate" && i.nativeElementId === 42,
    ),
  );
  assert.equal(a.cleaned.features.length, 0);
  const b = auditWallRenderGeometry(
    walls([[rect(0, 0, 3, 3), rect(5, 5, 1, 1)]]),
  );
  assert.ok(
    b.issues.some(
      (i) => i.code === "invalid-hole" && i.stage === "after-cleanup",
    ),
  );
});
test("reports a shared wall/room side but excludes surfaces on a different height", () => {
  const w = walls([[rect(0, 0, 5, 0.2)]]),
    room = walls([[rect(0, 0.2, 5, 4)]], { key: "meeting-room", height: 0.6 });
  const risks = wallRoomFaceRisks(w, room);
  assert.equal(risks.length, 1);
  assert.equal(risks[0].roomKey, "meeting-room");
  assert.ok(Math.abs(risks[0].sharedLengthMetres - 5) < 0.0001);
  assert.ok(risks[0].overlapAreaSquareMetres < 1e-6);
  assert.deepEqual(
    wallRoomFaceRisks(
      w,
      walls([[rect(0, 0.2, 5, 4)]], {
        key: "upper-room",
        base: 3,
        height: 3.6,
      }),
    ),
    [],
  );
});
test("a real doorway gap and a valid wall hole are not reported as malformed geometry", () => {
  const a = auditWallRenderGeometry(
    walls([
      [rect(0, 0, 5, 0.2), rect(2, 0.05, 0.5, 0.1)],
      [rect(6, 0, 3, 0.2)],
    ]),
  );
  assert.equal(a.cleaned.features.length, 2);
  assert.equal(a.issues.length, 0);
});
