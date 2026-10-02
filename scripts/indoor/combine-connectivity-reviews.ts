import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
type Source = { modelSha256: string; roomsSha256: string };
type OriginalReview = {
  key: string;
  number: string;
  name: string;
  building: string;
  levelId: number;
  status: string;
  reason: string;
};
type RoomStatus = {
  key: string;
  status: string;
  reachableDestinations: number;
  otherFloorDestinations: number;
};
type Evidence = Record<string, unknown> & { key?: string; roomKey?: string };
type Triage = {
  source: Source;
  reviews: OriginalReview[];
  missingEntrances: number;
  isolatedDestinations: number;
};
type Topology = {
  source: Source;
  missingEntrances: number;
  profiles: {
    mode: string;
    rooms: RoomStatus[];
    connectedRooms: number;
    roomsWithOtherFloorRoutes: number;
    unorderedReachablePairs: number;
  }[];
};
const readJSON = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;
const [
  triagePath,
  topologyPath,
  ownershipPath,
  arrivalPath,
  isolationPath,
  output,
] = process.argv.slice(2);
if (!output)
  throw new Error(
    "Usage: tsx scripts/indoor/combine-connectivity-reviews.ts original-triage.json topology.json ownership.json arrivals.json isolation.json output.json",
  );
const [triage, topology, ownership, arrival, isolation] = await Promise.all([
  readJSON<Triage>(triagePath),
  readJSON<Topology>(topologyPath),
  readJSON<{ sourceModelSha256: string; cases: Evidence[] }>(ownershipPath),
  readJSON<{ source: Source; rows: Evidence[] }>(arrivalPath),
  readJSON<{
    source: Source;
    isolation: { reviews: Evidence[] };
    lifts: unknown;
  }>(isolationPath),
]);
assert.equal(topology.source.modelSha256, triage.source.modelSha256);
assert.equal(topology.source.roomsSha256, triage.source.roomsSha256);
assert.equal(ownership.sourceModelSha256, triage.source.modelSha256);
assert.equal(arrival.source.modelSha256, triage.source.modelSha256);
assert.equal(isolation.source.modelSha256, triage.source.modelSha256);
const publicProfile = topology.profiles.find(
  (p: { mode: string }) => p.mode === "public",
);
assert.ok(publicProfile, "Public profile audit is required.");
const current = new Map<string, RoomStatus>(
  publicProfile.rooms.map((r) => [r.key, r]),
);
const maps = [ownership.cases, arrival.rows, isolation.isolation.reviews].map(
  (rows) =>
    new Map<string, Evidence>(
      rows.map((r) => {
        const key = r.key ?? r.roomKey;
        assert.ok(key, "Evidence must identify a destination.");
        return [key, r];
      }),
    ),
);
const originalKeys = new Set<string>(triage.reviews.map((r) => r.key));
assert.equal(originalKeys.size, 234, "Every original case is unique.");
const cases = triage.reviews.map((original) => {
  const now = current.get(original.key);
  assert.ok(now, `Original destination lost: ${original.key}`);
  const evidence = maps.map((m) => m.get(original.key)).filter(Boolean);
  assert.ok(
    evidence.length,
    `Original case not reviewed by any agent: ${original.key}`,
  );
  const resolved = now.status === "connected";
  const restriction = original.reason === "staff-egress-retained";
  const transit = original.reason === "ordinary-room-transit-needs-review";
  let disposition = "source-geometry-review-required";
  if (resolved) disposition = "repaired-and-route-connected";
  else if (restriction) disposition = "retained-staff-restriction";
  else if (transit) disposition = "access-and-transit-review-required";
  return {
    key: original.key,
    number: original.number,
    name: original.name,
    building: original.building,
    levelId: original.levelId,
    originalStatus: original.status,
    originalReason: original.reason,
    currentStatus: now.status,
    disposition,
    reachableDestinations: now.reachableDestinations,
    otherFloorDestinations: now.otherFloorDestinations,
    reviewEvidence: evidence,
  };
});
const newlyUnresolved = publicProfile.rooms.filter(
  (r) => r.status !== "connected" && !originalKeys.has(r.key),
);
assert.equal(
  newlyUnresolved.length,
  0,
  "Regeneration introduced a newly unresolved destination.",
);
const repaired = cases.filter((r) => r.currentStatus === "connected");
const count = (field: "disposition") =>
  Object.fromEntries(
    [...new Set(cases.map((r) => r[field]))].map((value) => [
      value,
      cases.filter((r) => r[field] === value).length,
    ]),
  );
const report = {
  version: 1,
  source: triage.source,
  scope:
    "All 234 previously missing or publicly isolated destinations, each cross-referenced to native/source evidence and final actual graph reachability. Matching a display door does not itself establish a usable graph edge. No access or elevator stops are inferred.",
  summary: {
    originalMissingEntrances: triage.missingEntrances,
    originalIsolatedDestinations: triage.isolatedDestinations,
    reviewedCases: cases.length,
    repairedAndConnected: repaired.length,
    remainingMissingEntrances: topology.missingEntrances,
    remainingIsolatedDestinations: cases.filter(
      (r) => r.currentStatus === "isolated-for-profile",
    ).length,
    connectedDestinations: publicProfile.connectedRooms,
    destinationsWithOtherFloorRoutes: publicProfile.roomsWithOtherFloorRoutes,
    reachableRoomPairs: publicProfile.unorderedReachablePairs,
    newlyUnresolved: 0,
    dispositions: count("disposition"),
  },
  repaired: repaired.map((r) =>
    Object.fromEntries(
      Object.entries(r).filter(([key]) => key !== "reviewEvidence"),
    ),
  ),
  liftEvidence: isolation.lifts,
  cases,
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
