import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type {
  RoomDirectoryData,
  DirectoryRoom,
} from "../../../reviter/lib/reviter/room-directory";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalFootprintSupported } from "../../app/indoor-project/native-exact-planar-topology";

type P = [number, number];
type End = Pick<
  NonNullable<IndoorDataset["doors"]>[number],
  | "nativeElementId"
  | "hostWallNativeElementId"
  | "pointFeet"
  | "footprintFeet"
  | "normalFeet"
  | "roomKeys"
>;
type Review = {
  version: 1;
  sourceModelSha256: string;
  levelId: number;
  building: string;
  key: string;
  decision: string;
  ends: [End, End];
};

/** Add an owner-reviewed identity to previously unlabelled floor between two
 * real doors. The ordinary compiler still has to admit both door approaches. */
export function roomsWithInterdoorPassage<T extends RoomDirectoryData>(
  rooms: T,
  data: IndoorDataset,
  review: Review,
): T {
  assert.equal(review.version, 1);
  assert.equal(review.sourceModelSha256, data.source.modelSha256);
  assert.equal(review.ends.length, 2);
  assert(review.decision?.trim());
  const [a, b] = review.ends;
  assert.equal(
    review.key,
    `reviewed-passage:${review.levelId}:${a.nativeElementId}:${b.nativeElementId}`,
  );
  assert(
    a.nativeElementId !== b.nativeElementId &&
      a.hostWallNativeElementId !== b.hostWallNativeElementId,
  );
  const prior = rooms.annotations.find((r) => r.key === review.key);
  const ends = review.ends.map((e) => {
    const found = data.doors?.find(
      (d) =>
        d.nativeElementId === e.nativeElementId && d.levelId === review.levelId,
    );
    assert(
      found?.footprintFeet?.length === 4 &&
        found.normalFeet &&
        (found.state === "unmatched" || (prior && found.state === "connected")),
    );
    for (const key of [
      "hostWallNativeElementId",
      "pointFeet",
      "footprintFeet",
      "normalFeet",
    ] as const)
      assert.deepEqual(
        found[key],
        e[key],
        "Source door geometry or ownership differs",
      );
    assert.equal(e.roomKeys.length, 1);
    const expectedOwners =
      found.state === "connected" ? [...e.roomKeys, review.key] : e.roomKeys;
    assert.deepEqual([...found.roomKeys].sort(), [...expectedOwners].sort());
    const owner = data.records.find(
      (r) => r.key === e.roomKeys[0] && r.levelId === review.levelId,
    );
    assert(
      owner?.walkable &&
        owner.building === review.building &&
        owner.access !== "staff",
    );
    return { door: found, owner };
  });
  const z = ends[0]!.owner.elevationFeet;
  assert.equal(z, ends[1]!.owner.elevationFeet);
  assert.notEqual(ends[0]!.owner.key, ends[1]!.owner.key);
  // The lateral strip is bounded by the overlap of both real jamb spans.
  const n = a.normalFeet!,
    u: P = [-n[1], n[0]],
    dot = (p: number[], v: number[]) => p[0]! * v[0]! + p[1]! * v[1]!;
  assert(
    Math.abs(dot(n, n) - 1) < 1e-8 &&
      Math.abs(Math.abs(dot(n, b.normalFeet!)) - 1) < 1e-8,
  );
  const ext = review.ends.map((e) => e.footprintFeet!.map((p) => dot(p, u)));
  const lo = Math.max(...ext.map((es) => Math.min(...es))),
    hi = Math.min(...ext.map((es) => Math.max(...es)));
  // Stop at the face of each threshold on the passage side. Ending at the
  // door centre would give the normal door matcher a zero-length approach.
  const direction = Math.sign(dot(b.pointFeet, n) - dot(a.pointFeet, n));
  const inwardFace = (end: End, sign: number) =>
    sign * Math.max(...end.footprintFeet!.map((p) => sign * dot(p, n)));
  const ya = inwardFace(a, direction);
  const yb = inwardFace(b, -direction);
  assert(
    hi - lo >= 2 &&
      hi - lo <= 12 &&
      direction * (yb - ya) > 1 &&
      Math.abs(ya - yb) < 25,
  );
  const xy = (x: number, y: number): P => [
    x * u[0] + y * n[0],
    x * u[1] + y * n[1],
  ];
  const polygonFeet = [xy(lo, ya), xy(hi, ya), xy(hi, yb), xy(lo, yb)],
    labelPointFeet = xy((lo + hi) / 2, (ya + yb) / 2);
  const footprint = nativeRationalOverlay("union", [[polygonFeet]]);
  const floors =
    data.walkingSupport?.floors
      .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
      .flatMap((f) => f.partsFeet ?? [f.ringsFeet]) ?? [];
  const envelopes =
    data.nativeIndoorEnvelopes?.levels
      .filter((l) => Math.abs(l.elevationFeet - z) < 0.05)
      .flatMap((l) => l.partsFeet) ?? [];
  assert(
    nativeRationalFootprintSupported(
      footprint,
      nativeRationalOverlay("intersection", [[polygonFeet]], floors, envelopes),
    ),
    "Passage requires complete original floor and envelope coverage",
  );
  const room: DirectoryRoom = {
    key: review.key,
    levelId: review.levelId,
    building: review.building,
    name: "Connecting passage",
    polygonFeet,
    labelPointFeet,
    confidence: 1,
    spaceUse: {
      kind: "hallway",
      evidence: "user-reported",
      notes: review.decision,
    },
    interdoorPassageReview: review,
  };
  const existing = rooms.annotations.find((r) => r.key === room.key);
  if (existing) assert.deepEqual(existing, room);
  const navigation: NonNullable<RoomDirectoryData["navigation"]> =
    structuredClone(
      rooms.navigation ?? { version: 1, doorLinks: [], openLinks: [] },
    );
  for (const e of review.ends) {
    const link = {
      doorId: e.nativeElementId,
      levelId: review.levelId,
      rooms: [e.roomKeys[0]!, room.key] as [string, string],
    };
    const old = navigation.doorLinks.find(
      (l) => l.doorId === link.doorId && l.levelId === link.levelId,
    );
    if (old) assert.deepEqual(old, link);
    else navigation.doorLinks.push(link);
  }
  return {
    ...rooms,
    annotations: existing ? rooms.annotations : [...rooms.annotations, room],
    navigation,
  };
}
