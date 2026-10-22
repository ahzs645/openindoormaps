import { readFileSync } from "node:fs";
import { serialize, deserialize } from "node:v8";
import { createHash } from "node:crypto";
const h = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const out = {};
for (const f of process.argv.slice(2)) {
  const raw = readFileSync(f);
  const t = Date.now();
  const once = serialize(deserialize(raw));
  const twice = serialize(deserialize(once));
  out[f.slice(0, 40)] = { raw: h(raw), rawBytes: raw.length, once: h(once), onceBytes: once.length, twice: h(twice), stableAfterOne: h(once) === h(twice), ms: Date.now() - t };
}
console.log(JSON.stringify(out, null, 1));
