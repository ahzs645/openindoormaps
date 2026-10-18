/** Fast complete-source topology diagnostic. No physical/import authority. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { savedPathwayReachability } from "./lib/saved-pathway-reachability";

const [input, casesFile, output] = process.argv.slice(2);
if (!input || !casesFile || !output)
  throw new Error(
    "Usage: audit-saved-pathway-connectivity.ts COMPLETE-SOURCE.json CASES.json NEW-OUTPUT.json",
  );
const sha = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const raw = await readFile(input);
const data = JSON.parse(raw.toString()) as IndoorDataset;
const before = sha(JSON.stringify(data));
const cases = JSON.parse(await readFile(casesFile, "utf8")) as {
  from: string;
  to: string;
  floor: string;
}[];
const started = performance.now();
const results = cases.map((item) => {
  const floor = data.floors.find((f) => f.name === item.floor);
  const owners = [item.from, item.to].map((number) =>
    data.records.filter(
      (r) => r.number === number && floor?.levelIds.includes(r.levelId),
    ),
  );
  if (!floor || owners.some((matches) => matches.length !== 1))
    throw new Error(
      `Select one original room per endpoint: ${JSON.stringify(item)}`,
    );
  const [from, to] = owners.map(([r]) => r);
  const a = from.arrivalNodeId;
  const b = to.arrivalNodeId;
  return {
    ...item,
    levelIds: floor.levelIds,
    fromRoomKey: from.key,
    toRoomKey: to.key,
    fromArrival: a,
    toArrival: b,
    ...(a && b
      ? savedPathwayReachability(data, a, b, floor.levelIds)
      : {
          connected: false,
          edgeIds: [],
          reachableNodeIds: [],
          missingArrival: true,
        }),
  };
});
const report = {
  format: "saved-pathway-connectivity-v1",
  sourceIndoorSha256: sha(raw),
  sourceUnchanged: before === sha(JSON.stringify(data)),
  authorityGranted: false,
  semantics:
    "Enabled source graph only, including ordinary rooms and unconfirmed access. False means no same-campus-floor source path; true is not physical/public/step-free route approval.",
  topologySeconds: (performance.now() - started) / 1000,
  results,
};
if (!report.sourceUnchanged)
  throw new Error("Source mutated during inspection");
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(
  JSON.stringify({
    sourceUnchanged: report.sourceUnchanged,
    results: results.map(({ from, to, connected }) => ({
      from,
      to,
      connected,
    })),
  }),
);
