/** Runtime geometry that re-derives compiled native geometry (room areas,
 * boundary patches, walls, prepared display, routing) must give the same bits
 * in every browser and on every platform as the compiler did. ECMAScript
 * leaves Math.sin/cos/atan2/hypot/... implementation-approximated, so these
 * modules route them through deterministic-math.ts, a byte-identical mirror
 * of the compiler's lib/reviter/deterministic-math.ts. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as DMath from "../../app/indoor-project/deterministic-math";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function moduleGraph(entries: readonly string[]) {
  const seen = new Set<string>();
  const pattern =
    /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']|new URL\(\s*["'](\.[^"']+\.(?:ts|mjs))["']/g;
  const visit = (modulePath: string) => {
    if (seen.has(modulePath)) return;
    seen.add(modulePath);
    for (const m of readFileSync(modulePath, "utf8").matchAll(pattern)) {
      const specifier = m[1] ?? m[2] ?? m[3] ?? m[4]!;
      if (!specifier.startsWith(".")) continue;
      const target = path.resolve(path.dirname(modulePath), specifier);
      const file = [
        target,
        `${target}.ts`,
        `${target}.tsx`,
        `${target}.mjs`,
        `${target}/index.ts`,
      ].find((p) => existsSync(p) && statSync(p).isFile());
      // The compiler checkout has its own test for its module graph.
      if (file && /\.(?:ts|tsx|mjs|js)$/.test(file) && file.startsWith(root))
        visit(file);
    }
  };
  for (const entry of entries) visit(path.resolve(root, entry));
  return [...seen].map((p) => path.relative(root, p)).sort();
}
const APPROXIMATE =
  /(?<![\w$.])Math\.(?:sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|hypot|exp|expm1|log|log1p|log2|log10|pow|cbrt)\b/;
/** `2 ** n` is an exact power of two; any other base needs Math.pow semantics. */
const APPROXIMATE_POWER = /(?<![\w$.])(?!2\s*\*\*)[\w$.\])]+\s*\*\*(?!\/)/;
const code = (text: string) =>
  text
    .replaceAll(/\/\*[\s\S]*?\*\//g, (comment) =>
      comment.replaceAll(/[^\n]/g, ""),
    )
    .replaceAll(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

test("runtime geometry modules use no implementation-approximated Math", () => {
  for (const line of ["x = Math.sin(a);", "Math.hypot(...v)", "s = u[0] ** 2"])
    assert.ok(APPROXIMATE.test(line) || APPROXIMATE_POWER.test(line), line);
  for (const line of ["x = DMath.sin(a);", "e = 2 ** -52", "// Math.sin(a)"])
    assert.ok(
      !APPROXIMATE.test(code(line)) && !APPROXIMATE_POWER.test(code(line)),
      line,
    );
  const files = moduleGraph([
    "app/indoor-project/prepared-floor.ts",
    "app/indoor-project/native-explore.ts",
    "app/indoor-project/prepared-floor-cache.ts",
    "app/indoor-project/prepared-display-preparation.ts",
    "app/indoor-project/native-area-review.ts",
    "scripts/indoor/regenerate-from-native-cache.ts",
  ]);
  assert.ok(files.includes("app/indoor-project/native-boundary-patches.ts"));
  assert.ok(files.length > 100, `graph has ${files.length} modules`);
  const offenders = files.flatMap((file) =>
    code(readFileSync(path.resolve(root, file), "utf8"))
      .split("\n")
      .flatMap((line, i) =>
        APPROXIMATE.test(line) || APPROXIMATE_POWER.test(line)
          ? [`${file}:${i + 1}: ${line.trim().slice(0, 120)}`]
          : [],
      ),
  );
  assert.deepEqual(offenders, []);
});

test("deterministic math mirrors the compiler module byte for byte", (t) => {
  const compiler = path.resolve(
    root,
    "../reviter/lib/reviter/deterministic-math.ts",
  );
  if (!existsSync(compiler)) return t.skip("reviter checkout not adjacent");
  assert.equal(
    readFileSync(
      path.resolve(root, "app/indoor-project/deterministic-math.ts"),
      "utf8",
    ),
    readFileSync(compiler, "utf8"),
  );
});

test("deterministic math matches V8 hypot and stays within 1 ulp for trig", () => {
  const bits = new DataView(new ArrayBuffer(8));
  const ordered = (x: number) => {
    bits.setFloat64(0, x);
    const v = bits.getBigInt64(0);
    return v < 0n ? -(v & 0x7f_ff_ff_ff_ff_ff_ff_ffn) : v;
  };
  const ulps = (a: number, b: number) => {
    const d = ordered(a) - ordered(b);
    return Number(d < 0n ? -d : d);
  };
  let seed = 7;
  const rnd = () =>
    (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  let worst = 0;
  for (let i = 0; i < 50_000; i++) {
    const x = (rnd() - 0.5) * 8 * Math.PI,
      y = (rnd() - 0.5) * 1e3,
      z = (rnd() - 0.5) * 1e3;
    worst = Math.max(
      worst,
      ulps(DMath.sin(x), Math.sin(x)),
      ulps(DMath.cos(x), Math.cos(x)),
      ulps(DMath.atan2(y, z), Math.atan2(y, z)),
    );
    assert.ok(Object.is(DMath.hypot(y, z), Math.hypot(y, z)));
    assert.ok(Object.is(DMath.hypot(x, y, z), Math.hypot(x, y, z)));
  }
  assert.ok(worst <= 1, `max ulp ${worst}`);
});
