/** Candidate rooms input #16 (candidate-floors-16/integration/assemble16.mts, from assemble15.mts): base rooms.candidate15.json +
 *   exclusions  round12 q12.1 follow-up: a 0.3 ft off-limits cut across the slab ledge east of the 05-206 wall that still joined
 *         05-206 to 05-211 (the q12.1 line ends on a low curb the selection cut passes over).
 *   node --import tsx assemble16.mts  ->  candidate-floors-16/integration/rooms.candidate16.json + receipt.json */
import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
const RUN = "/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009", C3 = RUN + "/candidate-floors-3", C4 = RUN + "/candidate-floors-4", C7 = RUN + "/candidate-floors-7", C8 = RUN + "/candidate-floors-8", C10 = RUN + "/candidate-floors-10", C11 = RUN + "/candidate-floors-11", C12 = RUN + "/candidate-floors-12", C13 = RUN + "/candidate-floors-13", C14 = RUN + "/candidate-floors-14", C15 = RUN + "/candidate-floors-15", C16 = RUN + "/candidate-floors-16", C9 = RUN + "/candidate-floors-9";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const rel = (p: string) => p.replace(RUN + "/", "");
const refusals: string[] = [];
const refuse = (m: string) => refusals.push(m);
const S = await import(A + "native-provisional-corner-seals.ts");
const { nativeIndoorEnvelopeHash } = await import(A + "native-indoor-envelopes.ts");
const { validateReviewedAreaPartitions } = await import(A + "reviewed-area-partitions.ts");
const { validateIndoorExclusions } = await import(A + "indoor-exclusions.ts");
const { validateIndoorConnectorReview } = await import("/Users/ahmadjalil/github/reviter/lib/reviter/indoor-connectors.ts");
const AUTH = [
  { prefix: "2026-10-14-round12", path: RUN + "/user-decisions/2026-10-14-round12.json", sha256: "ea2a800bbe05cacbced14a24771f8ca425d0c47576d0937f1e29c8f0f41f580b" },
  { prefix: "2026-10-13-round11", path: RUN + "/user-decisions/2026-10-13-round11.json", sha256: "eb32dbdc04da5d559c8896c7141637bad191190c3837fa511bc88d55f5cdac18" },
  { prefix: "2026-10-13-round10", path: RUN + "/user-decisions/2026-10-13-round10.json", sha256: "f88a9b829a2db3700f0bdac4daa573ac6d604a6124ab75721ec6113b92c29c4c" },
  { prefix: "2026-10-13-round9b", path: RUN + "/user-decisions/2026-10-13-round9b.json", sha256: "43e02ff3383dcefa10db794eb4df23c9a7f47558396a6292591c38dfebde0968" },
  { prefix: "2026-10-13-round9", path: RUN + "/user-decisions/2026-10-13-round9.json", sha256: "7d9180ae4217c2d86d80d954490235d3724c8903c4ff4b1f0b06c022dbac81d0" },
  { prefix: "2026-10-09-gap-review", path: RUN + "/user-decisions/2026-10-09-gap-review.json", sha256: "95d88c8fe00cc11a8bc57225c9b0e6ce081af2c95520f8c20185b03801671cd0" },
  { prefix: "2026-10-09-round2", path: RUN + "/user-decisions/2026-10-09-round2.json", sha256: "5644fa37889bb8f6166e7f05d9967eecc2ef0b73062f395d14ab5ea107008d25" },
  { prefix: "2026-10-10-round3", path: RUN + "/user-decisions/2026-10-10-round3.json", sha256: "3b4a1f5d26966532a5edba6d0b600df1863e09cb0eb4d202f5954a8364e6d288" },
  { prefix: "2026-10-12-round6", path: RUN + "/user-decisions/2026-10-12-round6.json", sha256: "168b9ec72b4b7066bb76b3a81db5a3e3fbbbabc77e60bce6b7f745606ddc6f81" },
  { prefix: "2026-10-12-round7", path: RUN + "/user-decisions/2026-10-12-round7.json", sha256: "f4b0a36372f0890387e669fca3626e7b370e23001570718662ba5c84bde9212a" },
];
const auth = new Map<string, any>();
for (const a of AUTH) {
  const t = await readFile(a.path, "utf8");
  if (sha(t) !== a.sha256) refuse(`authority ${a.prefix}: sha256 ${sha(t).slice(0, 12)} differs from ${a.sha256.slice(0, 12)}`);
  else auth.set(a.prefix, JSON.parse(t));
}
const resolves = (id: string) => {
  const i = id.indexOf("#"); if (i < 0) return false;
  const j = auth.get(id.slice(0, i)), key = id.slice(i + 1);
  if (!j) return false;
  return (key === "standingPolicy" && typeof j.standingPolicy === "string") || !!j.decisions?.[key] || !!j.rawAnswers?.[key] ||
    Object.keys(j.resolved ?? {}).some((k) => k === key || k.split(" ")[0] === key);
};
const IN: Record<string, { path: string; sha256: string }> = {
  base: { path: C15 + "/integration/rooms.candidate15.json", sha256: "ad46460ded265d04459418174cd6e983d6ed715acbe63e3af6ab363c4ddedbd7" },
  exclusions: { path: C16 + "/integration/exclusions-c16.json", sha256: "" },
};
const text: Record<string, string> = {};
for (const [k, e] of Object.entries(IN)) {
  text[k] = await readFile(e.path, "utf8");
  const got = sha(text[k]);
  if (e.sha256 && got !== e.sha256) refuse(`${k}: sha256 ${got.slice(0, 12)} differs from the pinned ${e.sha256.slice(0, 12)}`);
  e.sha256 = got;
}
if (refusals.length) { console.error("REFUSED:\n" + refusals.join("\n")); process.exit(2); }
const rooms = JSON.parse(text.base);
const model = rooms.nativeIndoorEnvelopes.sourceModelSha256 as string;
const receipt: any = {
  format: "unbc-candidate-floors-16-rooms-receipt", version: 1, at: new Date().toISOString(),
  oimHead: (await import("node:child_process")).execFileSync("git", ["-C", "/Users/ahmadjalil/github/openindoormaps", "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  base: { path: rel(IN.base.path), sha256: IN.base.sha256 },
  authorities: AUTH.map(({ prefix, path, sha256 }) => ({ prefix, path: rel(path), sha256 })),
  added: [] as any[],
};
// ---------- exclusions: round 12 off-limits ----------
{
  const X = JSON.parse(text.exclusions);
  const ex = rooms.indoorExclusions ?? { version: 1, sourceModelSha256: model, areas: [] };
  for (const a of X.areas) {
    if (!resolves(a.evidence.decision)) refuse(`exclusion ${a.id}: decision ${a.evidence.decision} does not resolve`);
    if (ex.areas.some((b: any) => b.id === a.id)) refuse(`exclusion ${a.id} already present`);
  }
  const before = ex.areas.length;
  ex.areas = [...ex.areas, ...X.areas.map(({ evidence, ...a }: any) => a)];
  try { validateIndoorExclusions(ex, model); } catch (e: any) { refuse("exclusions: " + e.message); }
  rooms.indoorExclusions = ex;
  receipt.added.push({ id: "indoorExclusions.c16", path: rel(IN.exclusions.path), sha256: IN.exclusions.sha256, field: "indoorExclusions.areas", decisionIds: X.areas.map((a: any) => a.evidence.decision), areas: X.areas.map((a: any) => a.id), before, after: ex.areas.length });
}
if (refusals.length) { console.error(`REFUSED: ${refusals.length}\n` + refusals.join("\n")); process.exit(2); }
receipt.inputs = Object.fromEntries(Object.entries(IN).map(([k, e]) => [k, { path: rel(e.path), sha256: e.sha256 }]));
const out = JSON.stringify(rooms);
const target = C16 + "/integration/rooms.candidate16.json";
receipt.output = { path: rel(target), sha256: sha(out), bytes: Buffer.byteLength(out) };
await writeFile(target + ".tmp", out);
await rename(target + ".tmp", target);
await writeFile(C16 + "/integration/receipt.json", JSON.stringify(receipt, null, 1));
console.log(JSON.stringify({ output: receipt.output, seals: receipt.nativeProvisionalCornerSeals, added: receipt.added.map((a: any) => a.id) }, null, 1));
