// For samples whose stack contains a function named TARGET, attribute time to
// the first DEPTH distinct named ancestors above it (a caller breakdown).
//   node callers.mjs FILE.cpuprofile TARGET [DEPTH=3]
import { readFileSync } from "node:fs";
const [file, target, depthArg] = process.argv.slice(2);
const depth = Number(depthArg ?? 3);
const p = JSON.parse(readFileSync(file, "utf8"));
const nodes = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const skip = new Set([
  target,
  "hashC",
  "update",
  "process",
  "digest",
  "sha256",
  "(anonymous)",
  "routingCalculationValue",
  "progressiveSha256",
]);
const out = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const d = p.timeDeltas[i + 1] ?? 0;
  let at = p.samples[i];
  let found = false;
  const chain = [];
  for (; at !== undefined; at = parent.get(at)) {
    const n = nodes.get(at);
    const name = n.callFrame.functionName;
    if (!found) {
      if (name === target) found = true;
      continue;
    }
    if (skip.has(name) || !name) continue;
    chain.push(`${name}:${n.callFrame.lineNumber + 1}`);
    if (chain.length >= depth) break;
  }
  if (!found) continue;
  const k = chain.join(" < ");
  out.set(k, (out.get(k) ?? 0) + d);
}
for (const [k, v] of [...out].sort((a, b) => b[1] - a[1]).slice(0, 25))
  console.log(Math.round(v / 1000), "ms", k);
