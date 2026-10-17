import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
const { resolve, dirname } = path;
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import {
  readIndoorProject,
  exportPreparedRoutingProject,
} from "../../app/indoor-project/package";
import { prepareRouting } from "../../app/indoor-project/prepare-routing";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { auditSharedCorridorNavigation } from "./lib/audit-shared-corridor-navigation";
import {
  preparedRoutingKey,
  preparedWalkingGuides,
  validatePreparedRouting,
  withPreparedRouting,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
const [input, output, ...flags] = process.argv.slice(2);
let method: "per-edge" | "shared-corridor" = "per-edge";
let guidesFrom: string | undefined;
let verifyNavigation = false;
const cellIds = new Set<string>();
for (let i = 0; i < flags.length; i++) {
  if (flags[i] === "--shared-corridors") method = "shared-corridor";
  else if (flags[i] === "--verify-navigation") verifyNavigation = true;
  else if (flags[i] === "--cell" && flags[i + 1]) cellIds.add(flags[++i]);
  else if (flags[i] === "--guides-from" && flags[i + 1])
    guidesFrom = flags[++i];
  else throw new Error(`Unknown or incomplete option: ${flags[i]}`);
}
if (!input || !output || resolve(input) === resolve(output))
  throw new Error(
    "Usage: tsx scripts/indoor/prepare-routing.ts input.zip output.zip [--shared-corridors [--cell id]] [--guides-from prepared-routing.json] [--verify-navigation] (distinct paths)",
  );
if (cellIds.size > 0 && method !== "shared-corridor")
  throw new Error(
    "--cell requires --shared-corridors; no full-map preparation started",
  );
if (guidesFrom && (method === "shared-corridor" || cellIds.size > 0))
  throw new Error(
    "Choose either --guides-from or new --shared-corridors compilation",
  );
await initializeNativeExactGeosOverlay();
const validationStarted = performance.now();
const project = await readIndoorProject(await readFile(input), (progress) =>
  console.log(
    JSON.stringify({
      phase: "source-import",
      ...progress,
      seconds: (performance.now() - validationStarted) / 1000,
    }),
  ),
);
const sourceValidationSeconds = (performance.now() - validationStarted) / 1000;
const original = JSON.stringify(project.dataset),
  started = performance.now();
let notified = 0;
const options = {
  method,
  cellIds: cellIds.size > 0 ? cellIds : undefined,
  progress: (completed, total, compiled) => {
    const now = performance.now();
    if (now - notified > 10_000 || completed === total) {
      console.log(
        `Prepared ${completed}/${total} walking edges (${compiled} compiled).`,
      );
      notified = now;
    }
  },
} satisfies NonNullable<Parameters<typeof prepareRouting>[1]>;
const prepared = await (async () => {
  if (!guidesFrom) return prepareRouting(project.dataset, options);
  // A separate floor compilation can finish while full source validation is
  // running. Wait without restarting the completed import.
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await readFile(guidesFrom);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || attempt === 119)
        throw error;
      console.log("Source verified; waiting for candidate guides");
      await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
    }
  }
  const metadata = JSON.parse(
    await readFile(guidesFrom, "utf8"),
  ) as PreparedRouting;
  const dataset = withPreparedRouting(project.dataset, metadata);
  validatePreparedRouting(dataset);
  if (
    metadata.sourceGeometryKey !== preparedRoutingKey(project.dataset) ||
    preparedWalkingGuides(dataset).size !== metadata.guides.length
  )
    throw new Error(
      "Candidate guides do not match the completely imported source and current resolver",
    );
  return {
    dataset,
    report: {
      version: 1,
      algorithm: metadata.resolverVersion,
      method: "bound-candidate-guides",
      walkingEdges: project.dataset.edges.filter(
        (e) => e.enabled && e.kind === "walk",
      ).length,
      compiledWalkingEdges: metadata.guides.length,
      newGraphConnections: 0,
    },
  };
})();
if (JSON.stringify(project.dataset) !== original)
  throw new Error("Routing preparation modified source geometry or reviews.");
const bytes = await exportPreparedRoutingProject(project, prepared.dataset);
// Full source validation has just run. Independently check transport and exact
// output value parity rather than repeating all unchanged physical checks.
const restoredFiles = unzipSync(bytes);
const restoredManifest = JSON.parse(strFromU8(restoredFiles["manifest.json"]));
const indoor = restoredFiles[restoredManifest.indoor.path];
if (
  !indoor ||
  indoor.length !== restoredManifest.indoor.bytes ||
  createHash("sha256").update(indoor).digest("hex") !==
    restoredManifest.indoor.sha256
)
  throw new Error("Prepared routing output does not match its ZIP manifest");
const restoredDataset = JSON.parse(strFromU8(indoor));
if (JSON.stringify(restoredDataset) !== JSON.stringify(prepared.dataset))
  throw new Error("Prepared routing changed during ZIP round-trip.");
for (const [name, originalBytes] of Object.entries(project.files)) {
  if (
    ["manifest.json", "viewer/indoor.json"].includes(name) ||
    name.startsWith("viewer/display/")
  )
    continue;
  const saved = restoredFiles[name];
  if (
    !saved ||
    saved.length !== originalBytes.length ||
    saved.some((v, i) => v !== originalBytes[i])
  )
    throw new Error(`Source asset changed: ${name}`);
}
await mkdir(dirname(resolve(output)), { recursive: true });
const temporary = resolve(output) + `.${process.pid}.tmp`;
await writeFile(temporary, bytes);
await rename(temporary, resolve(output));
const report = {
  ...prepared.report,
  input: resolve(input),
  output: resolve(output),
  preparationSeconds: (performance.now() - started) / 1000,
  archiveBytes: bytes.length,
  archiveSha256: createHash("sha256").update(bytes).digest("hex"),
  indoorSha256: restoredManifest.indoor.sha256,
  generatedAt: new Date().toISOString(),
  sourceValidationSeconds,
  sourceAssetsUnchanged: true,
  source: restoredDataset.source,
  verification: {
    source: "complete current import",
    output: "independent ZIP SHA and exact parsed dataset/source asset parity",
  },
};
await writeFile(
  resolve(output) + ".routing-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (verifyNavigation) {
  const navigation = await auditSharedCorridorNavigation(
    prepared.dataset,
    resolve(output) + ".qa",
  );
  if (navigation.failures.length > 0)
    throw new Error(
      `${navigation.failures.length} actual navigation checks failed; keep this candidate unpublished`,
    );
}
