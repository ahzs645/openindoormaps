// Inclusive-time attribution of route-worker CPU profiles by named stage.
// A sample counts toward a stage when the stage's function is on its stack
// (deduplicated per stack). Stages can nest; indented rows are subsets of the
// row above. Async stages only include samples on their own synchronous stack.
//   node attribution.mjs OUT.json LABEL=FILE.cpuprofile ...
import { readFileSync, writeFileSync } from "node:fs";

const [out, ...inputs] = process.argv.slice(2);
const stages = [
  [
    "delivery: parse step after the awaited download (loadRouting, sync part)",
    ["loadRouting"],
  ],
  [
    "delivery: SHA-256 of routing parts/stream/logical bytes and cache carrier (all callers)",
    [
      "progressiveSha256",
      "progressiveSha256Async",
      "readProgressiveRoutingParts",
    ],
  ],
  [
    "delivery: JSON.parse + deep freeze",
    ["parseVerifiedRoutingDataset", "parseVerifiedRoutingDatasetAsync"],
    { selfOnly: true, plus: ["freezeOwnedJsonTree"] },
  ],
  [
    "cache admission: decode/validate carrier + hydration",
    ["prepareProgressiveRouteCalculator"],
  ],
  ["  of which decodePublishedRouteCells", ["decodePublishedRouteCells"]],
  ["route calculation (calculateRoute)", ["calculateRoute"]],
  [
    "  graph preparation (buildProjectRoutingGraph)",
    ["buildProjectRoutingGraph"],
  ],
  ["  policy snapshot hash (routingSnapshot, any caller)", ["routingSnapshot"]],
  ["  prepared routing key (preparedRoutingKey)", ["preparedRoutingKey"]],
  [
    "  route centering + exact geometry (centeredRoutePaths)",
    ["centeredRoutePaths", "centeredRoutePaths$1"],
  ],
  [
    "    of which material query build (createNativeRoutingMaterialQuery)",
    ["createNativeRoutingMaterialQuery"],
  ],
  [
    "    of which exact rational overlay (nativeRationalOverlay)",
    ["nativeRationalOverlay"],
  ],
  [
    "  resolved geometry binding (nativeCirculationBinding in resolveProjectRoute)",
    ["__resolvedBinding"],
  ],
  [
    "arrival + reachability",
    ["resolveRouteArrival", "reachableViewerDestinations"],
  ],
  [
    "navigation steps + summary",
    ["projectNavigationSteps", "progressiveRouteSummary"],
  ],
  ["portable SHA-256 anywhere (noble hashC)", ["hashC"]],
  ["garbage collector", ["(garbage collector)"]],
  ["idle (waiting on network/IndexedDB/streams)", ["(idle)"]],
];
const result = {};
for (const input of inputs) {
  const [label, file] = input.split("=");
  const p = JSON.parse(readFileSync(file, "utf8"));
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of p.nodes)
    for (const c of n.children ?? []) parent.set(c, n.id);
  const totals = Object.fromEntries(stages.map(([s]) => [s, 0]));
  let wall = 0;
  for (let i = 0; i < p.samples.length; i++) {
    const d = p.timeDeltas[i + 1] ?? 0;
    wall += d;
    const stack = [];
    for (let at = p.samples[i]; at !== undefined; at = parent.get(at))
      stack.push(nodes.get(at).callFrame.functionName);
    const leaf = stack[0];
    for (const [stage, names, options] of stages) {
      let hit;
      if (names[0] === "__resolvedBinding") {
        const i1 = stack.indexOf("nativeCirculationBinding");
        hit =
          i1 >= 0 &&
          /^resolveProjectRoute/.test(
            stack
              .slice(i1 + 1)
              .find(
                (n) =>
                  n && n !== "(anonymous)" && n !== "routingCalculationValue",
              ) ?? "",
          );
      } else if (options?.selfOnly)
        hit =
          names.includes(leaf) || options.plus.some((n) => stack.includes(n));
      else hit = names.some((n) => stack.includes(n));
      if (hit) totals[stage] += d;
    }
  }
  result[label] = {
    file,
    profiledSeconds: Math.round(wall / 1e3) / 1e3,
    stagesMs: Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, Math.round(v / 1e3)]),
    ),
  };
}
writeFileSync(out, JSON.stringify(result, null, 2));
const labels = Object.keys(result);
console.log(["stage", ...labels].join(" | "));
for (const [s] of stages)
  console.log([s, ...labels.map((l) => result[l].stagesMs[s])].join(" | "));
console.log(
  ["profiled s", ...labels.map((l) => result[l].profiledSeconds)].join(" | "),
);
