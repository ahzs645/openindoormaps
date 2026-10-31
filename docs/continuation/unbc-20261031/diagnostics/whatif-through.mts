/** What-if, diagnostic only: apply the editor's reviewed through-navigation
 * (reviewArea) to candidate Building 04 rooms in memory and replay the
 * hallway-only 04-255 <-> 08-272 requests. Nothing is saved or exported. */
import { appendFile, readFile } from "node:fs/promises";
import { readIndoorProject, reviewArea } from "/home/user/openindoormaps/app/indoor-project/package";
import { createWorkerRouteCalculator } from "/home/user/openindoormaps/app/indoor-project/route-calculation";
import { initializeNativeExactGeosOverlay } from "/home/user/openindoormaps/app/indoor-project/native-exact-geos-overlay";

const [input, output] = process.argv.slice(2);
await initializeNativeExactGeosOverlay();
const base = await readIndoorProject(await readFile(input), () => {});
const byNumber = (n: string) => base.dataset.records.find((r) => r.number === n && r.levelId === 694)!;
const K = { "04-255": byNumber("04-255").key, "08-272": byNumber("08-272").key, "08-216": byNumber("08-216").key, "08-260": byNumber("08-260").key };
const variants: [string, string[]][] = [
  ["rotunda-only", ["04-259"]],
  ["rotunda-and-offices", ["04-259", "04-256", "04-257"]],
];
for (const [name, rooms] of variants) {
  let project = base;
  for (const n of rooms)
    project = reviewArea(project, byNumber(n).key, {
      throughNavigation: true,
      notes: "WHAT-IF ONLY: diagnostic, not a site-confirmed passage review",
    });
  const data = project.dataset;
  const label = (k: string) => {
    const r = data.records.find((x) => x.key === k)!;
    return `${r.number} ${r.name}`;
  };
  const calculate = createWorkerRouteCalculator(data);
  const cases: [string, string, string][] = [
    ["08-216", "08-260", "inside"],
    ["04-255", "08-272", "hallway"],
    ["08-272", "04-255", "hallway"],
    ["04-255", "08-272", "inside"],
    ["08-272", "04-255", "inside"],
  ];
  for (const [a, b, endpointMode] of cases) {
    const t = performance.now();
    const r = calculate(K[a as keyof typeof K], K[b as keyof typeof K], "public", {
      endpointMode: endpointMode as "inside" | "hallway",
      allowOtherRoomTransit: false,
      useSharedCorridorGuides: true,
      preferHallways: true,
    });
    const row = {
      variant: name,
      reviewedRooms: rooms,
      from: a,
      to: b,
      endpointMode,
      allowOtherRoomTransit: false,
      available: !!r.route,
      distanceMetres: r.route?.distanceMetres,
      crossesDoor2311764: r.route
        ? r.route.edges.some((e) => e.id === "door:694:2311764") ||
          (r.route.doorEdgeIds ?? []).includes("door:694:2311764")
        : false,
      unknownAccessAreas: r.route?.unknownAccessAreas.map(label),
      diagnostic: r.diagnostic && {
        kind: r.diagnostic.kind,
        message: r.diagnostic.message,
        constraint: (r.diagnostic as { constraint?: string }).constraint,
      },
      seconds: (performance.now() - t) / 1000,
    };
    console.log(JSON.stringify(row));
    await appendFile(output, JSON.stringify(row) + "\n");
  }
}
console.log(JSON.stringify({ done: true }));
