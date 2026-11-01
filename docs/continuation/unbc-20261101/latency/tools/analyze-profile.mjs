// Summarize a V8 .cpuprofile: self and inclusive time per function (deduplicated
// per stack so recursion is not double counted), plus inclusive time of selected
// phase functions.
//   node analyze-profile.mjs FILE.cpuprofile [TOP=40] > summary.json
import { readFileSync } from "node:fs";

const [file, topArg] = process.argv.slice(2);
const top = Number(topArg ?? 40);
const p = JSON.parse(readFileSync(file, "utf8"));
const nodes = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const dt = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const d = p.timeDeltas[i + 1] ?? 0;
  dt.set(p.samples[i], (dt.get(p.samples[i]) ?? 0) + d);
}
const total = (p.endTime - p.startTime) / 1000;
const shortUrl = (u) => (u || "").split("/").pop().replace(/\?.*$/, "");
const key = (n) =>
  `${n.callFrame.functionName || "(anonymous)"} ${shortUrl(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
const self = new Map(),
  inclusive = new Map();
let idle = 0,
  gc = 0,
  program = 0;
for (const [id, us] of dt) {
  const n = nodes.get(id);
  const name = n.callFrame.functionName;
  if (name === "(idle)") idle += us;
  if (name === "(garbage collector)") gc += us;
  if (name === "(program)") program += us;
  self.set(key(n), (self.get(key(n)) ?? 0) + us);
  const seen = new Set();
  for (let at = id; at !== undefined; at = parent.get(at)) {
    const k = key(nodes.get(at));
    if (seen.has(k)) continue;
    seen.add(k);
    inclusive.set(k, (inclusive.get(k) ?? 0) + us);
  }
}
const ms = (us) => Math.round(us / 1000);
const rank = (m) =>
  [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([k, v]) => ({ fn: k, ms: ms(v) }));
const phases = [
  "load",
  "loadRouting",
  "readAsset",
  "logicalBytes",
  "gunzipSync",
  "parseVerifiedRoutingDataset",
  "freezeOwnedJsonTree",
  "progressiveSha256",
  "initializeNativeExactGeosOverlay",
  "prepareProgressiveRouteCalculator",
  "decodePublishedRouteCells",
  "createPublishedRouteCalculator",
  "createVerifiedProgressiveRouteCalculator",
  "validateIndoorDataset",
  "calculateRoute",
  "findProjectRoute",
  "resolveProjectRoute",
  "projectRoutingGraph",
  "routingSnapshot",
  "nativeCirculationBinding",
  "centeredRoutePaths",
  "resolveRouteArrival",
  "reachableViewerDestinations",
  "createProjectRouteDiagnostics",
  "projectNavigationSteps",
  "progressiveRouteSummary",
  "createIndoorExclusionQuery",
  "createNativeFloorHoleQuery",
  "sourceFallbackBarrierHits",
  "postMessage",
];
const phaseRows = {};
for (const ph of phases) {
  let best = 0,
    where = [];
  for (const [k, v] of inclusive)
    if (k.split(" ")[0] === ph) {
      where.push({ fn: k, ms: ms(v) });
      best = Math.max(best, v);
    }
  if (where.length) phaseRows[ph] = where.sort((a, b) => b.ms - a.ms);
}
console.log(
  JSON.stringify(
    {
      file,
      wallSeconds: total,
      idleMs: ms(idle),
      gcMs: ms(gc),
      programMs: ms(program),
      phases: phaseRows,
      topInclusive: rank(inclusive),
      topSelf: rank(self),
    },
    null,
    1,
  ),
);
