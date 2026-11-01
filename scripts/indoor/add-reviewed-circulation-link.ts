/** Add one owner-reviewed circulation link to a reviewed authoring master.
 *
 * The link joins two EXISTING graph nodes on one floor plane. It is written to
 * both the authoring review (rooms.json) and the prepared dataset, replayed
 * against the current source geometry with the same predicate the compiler and
 * route worker use, and refused unless that replay passes. Nodes, doors,
 * owners and access are never changed. Prepared shared guides are bound to the
 * graph, so they must be recompiled for the new master.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
import {
  applyReviewedCirculationLinks,
  reviewedCirculationLinkSupport,
  validateReviewedCirculationLinks,
  type ReviewedCirculationLink,
} from "../../app/indoor-project/reviewed-circulation-links";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";

const usage =
  "Usage: add-reviewed-circulation-link.ts MASTER.zip NEW-MASTER.zip|--check-only --from NODE --to NODE --source TEXT --decision-id TEXT --summary TEXT [--notes TEXT]";
const [input, output, ...rest] = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < rest.length; i += 2) {
  if (!rest[i]?.startsWith("--") || rest[i + 1] === undefined)
    throw new Error(usage);
  flags.set(rest[i].slice(2), rest[i + 1]);
}
for (const key of ["from", "to", "source", "decision-id", "summary"])
  if (!flags.get(key)) throw new Error(usage);
const checkOnly = output === "--check-only";
if (!input || !output || path.resolve(input) === path.resolve(output))
  throw new Error(usage);
const stage = (name: string) =>
  console.log(
    JSON.stringify({ stage: name, seconds: performance.now() / 1000 }),
  );

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const inputBytes = await readFile(input);
await initializeNativeExactGeosOverlay();
const project = await readIndoorProject(inputBytes, (event) =>
  console.log(JSON.stringify({ phase: "source-import", ...event })),
);
stage("imported");
const data = project.dataset;
const from = data.nodes.find((n) => n.id === flags.get("from"));
const to = data.nodes.find((n) => n.id === flags.get("to"));
if (!from || !to) throw new Error("Both linked nodes must already exist.");
if (from.levelId !== to.levelId || from.pointFeet[2] !== to.pointFeet[2])
  throw new Error("A reviewed circulation link must stay on one floor plane.");

const link: ReviewedCirculationLink = {
  id: `${from.id}|${to.id}`,
  fromNodeId: from.id,
  toNodeId: to.id,
  pointsFeet: [
    [...from.pointFeet] as [number, number, number],
    [...to.pointFeet] as [number, number, number],
  ],
  decision: {
    source: flags.get("source")!,
    id: flags.get("decision-id")!,
    summary: flags.get("summary")!,
  },
  ...(flags.get("notes") ? { notes: flags.get("notes") } : {}),
};
const existing = data.reviewedCirculationLinks ?? {
  version: 1 as const,
  sourceModelSha256: data.source.modelSha256,
  links: [],
};
if (existing.links.some((l) => l.id === link.id))
  throw new Error(`Link ${link.id} already exists.`);
const next = { ...existing, links: [...existing.links, link] };
validateReviewedCirculationLinks(next, data.source.modelSha256);
data.reviewedCirculationLinks = next;
const support = reviewedCirculationLinkSupport(data, link);
stage("replayed");
if (!support.ok) throw new Error(`Link replay refused: ${support.reason}`);
const { applied, rejected } = applyReviewedCirculationLinks(data);
if (rejected.length > 0)
  throw new Error(`Reviewed links refused: ${JSON.stringify(rejected)}`);
if (!applied.some((e) => e.reviewedCirculationLinkId === link.id))
  throw new Error("The new link did not produce an edge.");
stage("applied");
project.rooms.reviewedCirculationLinks = structuredClone(next);
const bytes = checkOnly ? undefined : await exportIndoorProject(project);
if (bytes) await writeFile(output, bytes, { flag: "wx" });
console.log(
  JSON.stringify(
    {
      status: bytes
        ? "LINK_ADDED_GUIDES_AND_ACCEPTANCE_REQUIRED"
        : "LINK_REPLAY_PASSED_NOT_EXPORTED",
      inputSha256: sha(inputBytes),
      outputSha256: bytes && sha(bytes),
      outputBytes: bytes?.length,
      link,
      support,
      appliedLinks: applied.map((e) => e.reviewedCirculationLinkId),
    },
    null,
    2,
  ),
);
