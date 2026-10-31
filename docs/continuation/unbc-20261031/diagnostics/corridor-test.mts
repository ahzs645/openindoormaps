/** Diagnostic only: hallway-only corridor-to-corridor journeys across the 04-08
 * Floor 2 link with no reviews, then with only the Rotunda reviewed. */
import { appendFile, readFile } from "node:fs/promises";
import { readIndoorProject, reviewArea } from "/home/user/openindoormaps/app/indoor-project/package";
import { createWorkerRouteCalculator } from "/home/user/openindoormaps/app/indoor-project/route-calculation";
import { initializeNativeExactGeosOverlay } from "/home/user/openindoormaps/app/indoor-project/native-exact-geos-overlay";
const [input, output] = process.argv.slice(2);
await initializeNativeExactGeosOverlay();
const base = await readIndoorProject(await readFile(input), () => {});
const rec = (n: string) => base.dataset.records.find((r) => r.number === n && r.levelId === 694)!;
for (const n of ["04-204", "04-237", "04-244", "04-245", "04-236", "04-259", "08-267", "08-202", "08-205"]) {
  const r = rec(n);
  console.log(JSON.stringify({ room: n, name: r?.name, circulation: r?.circulation, access: r?.access }));
}
const pairs: [string, string][] = [["04-204", "08-267"], ["08-267", "04-204"], ["04-244", "08-202"], ["08-202", "04-244"], ["04-237", "08-205"], ["08-205", "04-237"]];
for (const [variant, rooms] of [["no-review", []], ["rotunda-only", ["04-259"]]] as [string, string[]][]) {
  let project = base;
  for (const n of rooms) project = reviewArea(project, rec(n).key, { throughNavigation: true, notes: "WHAT-IF ONLY: diagnostic" });
  const data = project.dataset;
  const label = (k: string) => { const r = data.records.find((x) => x.key === k)!; return `${r.number} ${r.name}`; };
  const calculate = createWorkerRouteCalculator(data);
  for (const [a, b] of pairs)
    for (const mode of ["public", "accessible"] as const) {
      const r = calculate(rec(a).key, rec(b).key, mode, { endpointMode: "hallway", allowOtherRoomTransit: false, useSharedCorridorGuides: true, preferHallways: true });
      const row = {
        variant, from: a, to: b, mode, available: !!r.route, distanceMetres: r.route?.distanceMetres,
        crossesDoor2311764: r.route ? r.route.edges.some((e) => e.id === "door:694:2311764") || (r.route.doorEdgeIds ?? []).includes("door:694:2311764") : false,
        unknownAccessAreas: r.route?.unknownAccessAreas.map(label),
        diagnostic: r.diagnostic && { message: r.diagnostic.message, constraint: (r.diagnostic as { constraint?: string }).constraint },
      };
      console.log(JSON.stringify(row));
      await appendFile(output, JSON.stringify(row) + "\n");
    }
}
console.log(JSON.stringify({ done: true }));
