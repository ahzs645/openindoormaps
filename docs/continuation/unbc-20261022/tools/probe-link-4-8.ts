// Scratch probe: Building 4 <-> 8 routes on Floor 2 (level 694).
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { buildHallwayNetwork, createHallwayRouter } from "../../app/indoor-project/hallway-network";

const data = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as IndoorDataset;
const network = buildHallwayNetwork(data);
const route = createHallwayRouter(network);
const byNumber = new Map(data.records.map((r) => [r.number, r]));
const door = [30.6125, 528.5495];
const describe = (a: string, b: string) => {
  const ra = byNumber.get(a)!, rb = byNumber.get(b)!;
  const out: Record<string, unknown> = { from: `${a} ${ra.name}`, to: `${b} ${rb.name}` };
  for (const profile of ["walking", "step-free"] as const) {
    const r = route(ra.key, rb.key, profile);
    if (!r) { out[profile] = "no route"; continue; }
    const levels = [...new Set(r.nodes.map((n) => network.nodes[n]![0]))];
    const nearDoor = r.nodes.some((n) => { const [l, x, y] = network.nodes[n]!; return l === 694 && Math.hypot(x - door[0], y - door[1]) < 6; });
    out[profile] = { metres: +r.metres.toFixed(1), levels, viaLinkDoor: nearDoor };
  }
  return out;
};
console.log(JSON.stringify(describe("04-255", "08-272"), null, 1));
const b4 = data.records.filter((r) => r.levelId === 694 && r.building === "04" && r.arrivalNodeId).map((r) => r.number!).sort();
const b8 = data.records.filter((r) => r.levelId === 694 && r.building === "08" && r.arrivalNodeId).map((r) => r.number!).sort();
let pairs = 0, routed = 0, floor2Only = 0, viaDoor = 0;
const offFloor: string[] = [];
for (let i = 0; i < b4.length; i += Math.max(1, Math.floor(b4.length / 25)))
  for (let j = 0; j < b8.length; j += Math.max(1, Math.floor(b8.length / 25))) {
    const ra = byNumber.get(b4[i]!)!, rb = byNumber.get(b8[j]!)!;
    const r = route(ra.key, rb.key, "walking");
    pairs++;
    if (!r) continue;
    routed++;
    const levels = new Set(r.nodes.map((n) => network.nodes[n]![0]));
    if (levels.size === 1 && levels.has(694)) floor2Only++;
    else if (offFloor.length < 8) offFloor.push(`${b4[i]} -> ${b8[j]} via levels ${[...levels].join(",")}`);
    if (r.nodes.some((n) => { const [l, x, y] = network.nodes[n]!; return l === 694 && Math.hypot(x - door[0], y - door[1]) < 6; })) viaDoor++;
  }
console.log(JSON.stringify({ b4Rooms: b4.length, b8Rooms: b8.length, sampledPairs: pairs, routed, floor2Only, viaLinkDoor: viaDoor, offFloorExamples: offFloor }, null, 1));
