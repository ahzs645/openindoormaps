// Deep-diff two V8-serialised checkpoint snapshots: node landing-diff.mjs A.bin B.bin
import { readFileSync } from "node:fs";
import { deserialize } from "node:v8";
const [a, b] = process.argv.slice(2).map((f) => deserialize(readFileSync(f)));
const diffs = [], orderDiffs = [];
const kind = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : v instanceof Map ? "map" : ArrayBuffer.isView(v) ? "typed" : typeof v);
function walk(x, y, p) {
  if (diffs.length > 60) return;
  const kx = kind(x), ky = kind(y);
  if (kx !== ky) return diffs.push({ p, x: kx, y: ky });
  if (kx === "array" || kx === "typed") {
    if (x.length !== y.length) diffs.push({ p, lenX: x.length, lenY: y.length });
    for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], p + "[" + i + "]");
  } else if (kx === "map") {
    const kxs = [...x.keys()], kys = [...y.keys()];
    if (JSON.stringify(kxs) !== JSON.stringify(kys)) orderDiffs.push({ p, mapKeyOrderOrSetDiffers: true, onlyX: kxs.filter((k) => !y.has(k)).slice(0, 5), onlyY: kys.filter((k) => !x.has(k)).slice(0, 5) });
    for (const k of kxs) if (y.has(k)) walk(x.get(k), y.get(k), p + ".get(" + String(k).slice(0, 40) + ")");
  } else if (kx === "object") {
    const kxs = Object.keys(x), kys = Object.keys(y);
    if (kxs.join() !== kys.join()) {
      const sx = new Set(kxs), sy = new Set(kys);
      const onlyX = kxs.filter((k) => !sy.has(k)), onlyY = kys.filter((k) => !sx.has(k));
      if (onlyX.length || onlyY.length) diffs.push({ p, onlyX: onlyX.slice(0, 5), onlyY: onlyY.slice(0, 5) });
      else orderDiffs.push({ p, keyOrderX: kxs.slice(0, 8), keyOrderY: kys.slice(0, 8) });
    }
    for (const k of kxs) if (k in y) walk(x[k], y[k], p + "." + k);
  } else if (!Object.is(x, y)) diffs.push({ p, x: typeof x === "string" ? x.slice(0, 80) : x, y: typeof y === "string" ? y.slice(0, 80) : y });
}
walk(a, b, "$");
console.log(JSON.stringify({ valueDiffs: diffs.length, orderDiffs: orderDiffs.length, firstValueDiffs: diffs.slice(0, 25), firstOrderDiffs: orderDiffs.slice(0, 10) }, null, 1));
