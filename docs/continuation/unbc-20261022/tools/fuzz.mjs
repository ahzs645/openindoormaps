const A = await import(process.argv[2]), B = await import(process.argv[3]);
let seed = 7; const r = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const big = () => { const bits = 1 + Math.floor(r() * 200); let x = 0n; for (let i = 0; i < bits; i += 30) x = (x << 30n) | BigInt(Math.floor(r() * 2 ** 30)); return r() < 0.5 ? -x : x; };
const den = () => r() < 0.6 ? 1n << BigInt(Math.floor(r() * 120)) : (big() || 1n) * (r() < 0.5 ? 1n : -1n);
const val = (M) => { const k = r(); if (k < 0.3) return (r() - 0.5) * 2 ** Math.floor(r() * 60 - 30); if (k < 0.35) return 0; const n = r() < 0.05 ? 0n : big(), d = den() || 1n; return new M.Rational(n, d); };
let checks = 0;
for (let i = 0; i < 200000; i++) {
  const s = seed; const a1 = val(A), b1 = val(A); seed = s; const a2 = val(B), b2 = val(B);
  const key = (x) => typeof x === "number" ? "f" + x : x.n + "/" + x.d;
  if (key(a1) !== key(a2)) throw Error("construct " + key(a1) + " vs " + key(a2));
  for (const op of ["compare", "add", "sub", "mul"]) {
    let x, y; try { x = A[op](a1, b1); } catch (e) { x = "E:" + e.message; } try { y = B[op](a2, b2); } catch (e) { y = "E:" + e.message; }
    const kx = typeof x === "object" ? key(x) : String(x), ky = typeof y === "object" ? key(y) : String(y);
    if (kx !== ky) throw Error(`${op} mismatch ${key(a1)} ${key(b1)}: ${kx} vs ${ky}`);
    checks++;
  }
}
console.log("identical on", checks, "operations");
