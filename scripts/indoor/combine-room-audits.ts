import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const [output, ...inputs] = process.argv.slice(2);
if (!output || inputs.length === 0)
  throw new Error(
    "Usage: tsx scripts/indoor/combine-room-audits.ts output.json shard-0.json shard-1.json ...",
  );
const reports = await Promise.all(
  inputs.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);
const base = reports[0];
assert.equal(reports.length, base.shard[1], "Supply every shard once");
assert.deepEqual(
  reports.map((r) => r.shard[0]).sort((a, b) => a - b),
  Array.from({ length: reports.length }, (_, i) => i),
);
const counts = [
  "testedPaths",
  "centeredPaths",
  "orthogonalPaths",
  "corridorCenterlinePaths",
  "sourcePaths",
  "stairTransitions",
];
const verification: Record<string, unknown> = Object.fromEntries(
  counts.map((key) => [key, 0]),
);
const reasons: Record<string, number> = {},
  review = new Map();
for (const report of reports) {
  assert.deepEqual(report.source, base.source);
  assert.deepEqual(report.profiles, base.profiles);
  assert.equal(report.verification.sourceDatasetUnchanged, true);
  for (const key of counts)
    verification[key] = Number(verification[key]) + report.verification[key];
  for (const [key, value] of Object.entries(report.verification.sourceReasons))
    reasons[key] = (reasons[key] ?? 0) + Number(value);
  for (const section of report.geometryReview)
    review.set(JSON.stringify([section.reason, section.edgeIds]), section);
}
const expected = base.profiles.reduce(
  (
    total: number,
    p: {
      rooms: {
        sameFloorDestinations: number;
        otherFloorDestinations: number;
      }[];
    },
  ) =>
    total +
    p.rooms.reduce(
      (n, r) =>
        n +
        Number(r.sameFloorDestinations > 0) +
        Number(r.otherFloorDestinations > 0),
      0,
    ),
  0,
);
assert.equal(
  verification.testedPaths,
  expected,
  "Realise both route classes wherever reachable, for every eligible endpoint and profile",
);
Object.assign(verification, {
  sourceDatasetUnchanged: true,
  sourceReasons: reasons,
  geometryReviewSections: review.size,
});
const report = {
  ...base,
  shard: undefined,
  shards: reports.length,
  verification,
  geometryReview: [...review.values()],
  examples: reports.flatMap((r) => r.examples).slice(0, 16),
};
await writeFile(output, JSON.stringify(report, null, 2));
const geometry = (
  await Promise.all(
    inputs.map(async (input) =>
      JSON.parse(
        await readFile(
          input.replace(/\.json$/, ".geometry-input.json"),
          "utf8",
        ),
      ),
    ),
  )
).flat();
assert.equal(geometry.length, expected);
await writeFile(
  output.replace(/\.json$/, ".geometry-input.json"),
  JSON.stringify(geometry),
);
console.log(
  JSON.stringify(
    {
      eligibleDestinations: report.eligibleDestinations,
      missingEntrances: report.missingEntrances,
      profiles: report.profiles.map(
        ({ rooms, ...p }: { rooms: unknown[] }) => p,
      ),
      verification,
    },
    null,
    2,
  ),
);
