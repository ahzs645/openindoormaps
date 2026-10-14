/** Candidate rooms input #15 (candidate-floors-15/integration/assemble15.mts, from assemble14.mts): base rooms.candidate14.json +
 *   rows  candidate-floors-15/integration/rows-candidate15.json: two hairline seals (round10#q10.19) that close the 06-342 corridor
 *         crack (round12#q12.5) and the 03-3021 west-strip crack (round12#q12.4).
 *   partitions  r12-q12.1 (05-206 south-east gap) and r12-q12.5 (06-340 / 06-342 DWG partition), selection only.
 *   exclusions  round12 q12.2 (shaft south of 05-225) and q12.3 (slab strip outside the 03-2012 west wall), off-limits.
 *   connectors  round12 q12.6: the walled box at 05-142 / 05-242 / 05-342 registered as a lift on Floors 1-3.
 *   circulation links  the 08-S101 stair-hall walk (user-reported ramp #1622190 route).
 *   node --import tsx assemble15.mts  ->  candidate-floors-15/integration/rooms.candidate15.json + receipt.json */
import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
const RUN = "/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009", C3 = RUN + "/candidate-floors-3", C4 = RUN + "/candidate-floors-4", C7 = RUN + "/candidate-floors-7", C8 = RUN + "/candidate-floors-8", C10 = RUN + "/candidate-floors-10", C11 = RUN + "/candidate-floors-11", C12 = RUN + "/candidate-floors-12", C13 = RUN + "/candidate-floors-13", C14 = RUN + "/candidate-floors-14", C15 = RUN + "/candidate-floors-15", C9 = RUN + "/candidate-floors-9";
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
  base: { path: C14 + "/integration/rooms.candidate14.json", sha256: "02bcf1aefea918c2f102f9f70c3a7b8db0e7ff11ee92d50573e7b297b1cfa19c" },
  rows: { path: C15 + "/integration/rows-candidate15.json", sha256: "" },
  aloneSeals: { path: C15 + "/fix/gen-seals/validation.json", sha256: "" },
  combined: { path: C15 + "/work/combined/validation.json", sha256: "" },
  lines: { path: C15 + "/fix/lines/partitions-result.json", sha256: "" },
  exclusions: { path: C15 + "/fix/exclusions-r12.json", sha256: "" },
  lift: { path: C15 + "/fix/lift-r12.json", sha256: "" },
  links: { path: C14 + "/links/candidates.json", sha256: "" },
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
  format: "unbc-candidate-floors-15-rooms-receipt", version: 1, at: new Date().toISOString(),
  oimHead: (await import("node:child_process")).execFileSync("git", ["-C", "/Users/ahmadjalil/github/openindoormaps", "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  base: { path: rel(IN.base.path), sha256: IN.base.sha256 },
  authorities: AUTH.map(({ prefix, path, sha256 }) => ({ prefix, path: rel(path), sha256 })),
  added: [] as any[],
};
// ---------- rows ----------
{
  // pass 2: + the 3 rows the candidate-3 audit needed for 08-206 / 08-215 / 08-272 (validated alone on the candidate-3 input,
  // single-removal necessity on the candidate-3 re-probe, one combined pass with all 2,978 candidate-3 rows: combined-c3b)
  const rows = JSON.parse(text.rows).rows;
  const okAlone = new Set<string>();
  for (const k of ["aloneSeals"]) for (const r of JSON.parse(text[k]).results) if (r.ok) okAlone.add(r.id);
  if (JSON.parse(text.combined).allOk !== true) refuse("combined pass not ok");
  const v = rooms.nativeProvisionalCornerSeals, before = v.geometrySha256;
  const ids = new Set(v.rows.map((r: any) => r.id));
  const decisions = new Set<string>();
  for (const r of rows) {
    const d = r.drawingBacked?.decisionId;
    if (!d || !resolves(d)) refuse(`row ${r.id}: decision ${d} does not resolve`);
    if (!okAlone.has(r.id)) refuse(`row ${r.id}: not validated alone`);
    if (ids.has(r.id)) refuse(`row ${r.id}: id already present`);
    if (r.state !== "applied") refuse(`row ${r.id}: state ${r.state}`);
    if (r.drawingBacked?.kind === "exact-contact-closure" && !(r.drawingBacked.measuredGapFeet <= 1.5e-5)) refuse(`row ${r.id}: q2 gap above bound`);
    decisions.add(d);
  }
  v.rows = [...v.rows, ...rows];
  v.geometrySha256 = S.nativeProvisionalCornerSealsHash(v);
  S.validateNativeProvisionalCornerSeals(v, model);
  const env = rooms.nativeIndoorEnvelopes;
  env.levels = env.levels.map((l: any) => (l.provisionalCornerGeometrySha256 === before ? { ...l, provisionalCornerGeometrySha256: v.geometrySha256 } : l));
  env.geometrySha256 = await nativeIndoorEnvelopeHash(env);
  receipt.nativeProvisionalCornerSeals = { baseRows: v.rows.length - rows.length, added: rows.length, total: v.rows.length, beforeGeometrySha256: before, geometrySha256: v.geometrySha256, envelopeGeometrySha256: env.geometrySha256 };
  receipt.added.push({ id: "rows.candidate15", path: rel(IN.rows.path), sha256: IN.rows.sha256, field: "nativeProvisionalCornerSeals.rows", decisionIds: [...decisions].sort(), rows: rows.map((r: any) => r.id),
    validation: { alone: [IN.aloneSeals].map((e) => ({ path: rel(e.path), sha256: e.sha256 })), combined: { path: rel(IN.combined.path), sha256: IN.combined.sha256 } } });
}
// ---------- partitions: round 12 selection-only lines ----------
{
  const value = rooms.reviewedAreaPartitions;
  const res = JSON.parse(text.lines);
  for (const [id, dec] of [["r12-q12.1:694:05-206-south-east-gap", "2026-10-14-round12#q12.1"], ["r12-q12.5:1487353:06-340-06-342-partition", "2026-10-14-round12#q12.5"]]) {
    const r = res.results.find((x: any) => x.id === id);
    if (!resolves(dec)) refuse(`${id}: decision ${dec} does not resolve`);
    if (!r || r.status !== "applied" || !r.check?.valid) { refuse(`${id} not applied/valid`); continue; }
    if (value.partitions.some((p: any) => p.id === id)) refuse(`${id} already present`);
    value.partitions.push(r.partition);
    for (const h of res.reviewedAreaPartitions.history) if (h.id === id) value.history.push(h);
    receipt.added.push({ id: "partition." + id, path: rel(IN.lines.path), sha256: IN.lines.sha256, field: "reviewedAreaPartitions.partitions", decisionIds: r.decisionIds, geometrySha256: r.geometrySha256 });
  }
  validateReviewedAreaPartitions(value, model);
  rooms.reviewedAreaPartitions = value;
}
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
  receipt.added.push({ id: "indoorExclusions.r12", path: rel(IN.exclusions.path), sha256: IN.exclusions.sha256, field: "indoorExclusions.areas", decisionIds: X.areas.map((a: any) => a.evidence.decision), areas: X.areas.map((a: any) => a.id), before, after: ex.areas.length });
}
// ---------- connectors: round 12 q12.6 lift ----------
{
  const L = JSON.parse(text.lift);
  if (!resolves(L.decision)) refuse(`lift: decision ${L.decision} does not resolve`);
  const v = rooms.indoorConnectors;
  if (v.connectors.some((c: any) => c.id === L.connector.id)) refuse("lift already present");
  v.connectors = [...v.connectors, L.connector];
  try { validateIndoorConnectorReview(v); } catch (e: any) { refuse("connectors: " + e.message); }
  receipt.added.push({ id: "indoorConnectors." + L.connector.id, path: rel(IN.lift.path), sha256: IN.lift.sha256, field: "indoorConnectors.connectors", decisionIds: [L.decision] });
}
// ---------- reviewed circulation links: 08-S101 ----------
{
  const L = JSON.parse(text.links).links;
  const v = rooms.reviewedCirculationLinks;
  for (const l of L) {
    if (v.links.some((x: any) => x.id === l.id)) refuse(`link ${l.id} already present`);
    v.links.push(l);
  }
  receipt.added.push({ id: "reviewedCirculationLinks.08-S101", path: rel(IN.links.path), sha256: IN.links.sha256, field: "reviewedCirculationLinks.links", decisionIds: L.map((l: any) => l.decision.id), links: L.map((l: any) => l.id) });
}
if (refusals.length) { console.error(`REFUSED: ${refusals.length}\n` + refusals.join("\n")); process.exit(2); }
receipt.inputs = Object.fromEntries(Object.entries(IN).map(([k, e]) => [k, { path: rel(e.path), sha256: e.sha256 }]));
const out = JSON.stringify(rooms);
const target = C15 + "/integration/rooms.candidate15.json";
receipt.output = { path: rel(target), sha256: sha(out), bytes: Buffer.byteLength(out) };
await writeFile(target + ".tmp", out);
await rename(target + ".tmp", target);
await writeFile(C15 + "/integration/receipt.json", JSON.stringify(receipt, null, 1));
console.log(JSON.stringify({ output: receipt.output, seals: receipt.nativeProvisionalCornerSeals, added: receipt.added.map((a: any) => a.id) }, null, 1));
