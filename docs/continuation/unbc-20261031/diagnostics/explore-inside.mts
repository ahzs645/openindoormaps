/** Exploratory, non-asserting replay on the verified candidate: inside-room
 * arrival (what the visitor app requests) and which ordinary rooms the
 * transit-enabled route crosses. Diagnostic only; not acceptance evidence. */
import { appendFile, readFile } from "node:fs/promises";
import { readIndoorProject } from "/home/user/openindoormaps/app/indoor-project/package";
import { createWorkerRouteCalculator } from "/home/user/openindoormaps/app/indoor-project/route-calculation";
import { initializeNativeExactGeosOverlay } from "/home/user/openindoormaps/app/indoor-project/native-exact-geos-overlay";

const [input, output] = process.argv.slice(2);
await initializeNativeExactGeosOverlay();
const project = await readIndoorProject(await readFile(input), () => {});
const data = project.dataset;
const byKey = new Map(data.records.map((r) => [r.key, r]));
const label = (k: string) => `${byKey.get(k)?.number ?? k} ${byKey.get(k)?.name ?? ""}`.trim();
const calculate = createWorkerRouteCalculator(data);
const K: Record<string, string> = {
  "08-216": "rm-694-3eff6106de76",
  "08-260": "rm-694-fa60cb06b7c9",
  "04-255": "rm-694-072a835d76b9",
  "08-272": "rm-694-0179b206bb5d",
};
const pairs: [string, string][] = [
  ["08-216", "08-260"],
  ["08-260", "08-216"],
  ["04-255", "08-272"],
  ["08-272", "04-255"],
];
console.log(JSON.stringify({ loaded: true, records: data.records.length }));
for (const endpointMode of ["inside", "hallway"] as const)
  for (const mode of ["public", "accessible"] as const)
    for (const allowOtherRoomTransit of [false, true])
      for (const [a, b] of pairs) {
        const t = performance.now();
        const r = calculate(K[a], K[b], mode, {
          endpointMode,
          allowOtherRoomTransit,
          useSharedCorridorGuides: true,
          preferHallways: true,
        });
        const route = r.route;
        const ordinary = route
          ? [
              ...new Set(
                route.edges.flatMap((e) =>
                  e.roomKeys.filter((k) => {
                    const room = byKey.get(k);
                    return room && !room.circulation && !room.stair && k !== K[a] && k !== K[b];
                  }),
                ),
              ),
            ].map(label)
          : [];
        const row = {
          from: a,
          to: b,
          endpointMode,
          mode,
          allowOtherRoomTransit,
          available: !!route,
          distanceMetres: route?.distanceMetres,
          crossesDoor2311764: route
            ? route.edges.some((e) => e.id === "door:694:2311764") ||
              (route.doorEdgeIds ?? []).includes("door:694:2311764")
            : false,
          ordinaryRoomsCrossed: ordinary,
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
console.log(JSON.stringify({ done: true }));
