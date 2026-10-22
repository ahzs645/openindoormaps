import { readFileSync } from "node:fs";
const p = JSON.parse(readFileSync(process.argv[2], "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const dt = new Map(); p.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
const total = [...dt.values()].reduce((a, b) => a + b, 0);
const self = new Map(), incl = new Map();
const parent = new Map(); for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const key = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/")}:${n.callFrame.lineNumber + 1}`;
for (const [id, t] of dt) {
  const n = byId.get(id); self.set(key(n), (self.get(key(n)) ?? 0) + t);
  const seen = new Set(); for (let c = id; c !== undefined; c = parent.get(c)) { const k = key(byId.get(c)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + t); } }
}
const fmt = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${(t / 1e6).toFixed(1).padStart(7)} s ${(100 * t / total).toFixed(1).padStart(5)}%  ${k}`).join("\n");
console.log("total", (total / 1e6).toFixed(1), "s\n--- self time\n" + fmt(self, 25) + "\n--- inclusive (app code)\n" + fmt(new Map([...incl].filter(([k]) => /indoor-project|reviter|scripts/.test(k))), 30));
