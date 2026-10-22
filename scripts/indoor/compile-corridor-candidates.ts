import { readFile, mkdir, readdir, open, unlink } from "node:fs/promises";
import { writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { prepareSharedCorridorRouting } from "../../app/indoor-project/prepare-corridor-routing";
import { indexCorridorRoutingScope } from "../../app/indoor-project/corridor-routing-scope";
import { CORRIDOR_COMPILER_PARAMETERS } from "../../app/indoor-project/corridor-routing-parameters";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import {
  preparedRoutingKey,
  ROUTING_GUIDE_VERSION,
} from "../../app/indoor-project/prepared-routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import {
  CORRIDOR_CANDIDATE_PARAMETERS,
  corridorCandidateCanonicalJson,
  corridorCandidateCellScopes,
  corridorCandidateDisplayGeoJson,
  corridorCandidateSha256 as sha,
  makeCorridorCandidateCheckpoint,
  mergeCorridorCandidateCheckpoints,
  validateCorridorCandidateCheckpoint,
  type CorridorCandidateBinding,
  type CorridorCandidateCheckpoint,
} from "./lib/corridor-candidate-checkpoints";

const usage =
  "Usage: compile-corridor-candidates.ts visitor.zip output-directory [--cell cell-id]... [--max-deviation-feet feet] [--resume | --merge candidate-directory ...]";
const [input, output, ...args] = process.argv.slice(2);
if (!input || !output) throw new Error(usage);
const selectedIds: string[] = [],
  mergeDirectories: string[] = [];
let resume = false;
const parameters = { ...CORRIDOR_COMPILER_PARAMETERS };
let deviationSpecified = false;
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (flag === "--resume" && !resume) resume = true;
  else if (
    flag === "--max-deviation-feet" &&
    !deviationSpecified &&
    args[i + 1]
  ) {
    const value = Number(args[++i]);
    if (!Number.isFinite(value) || value < 0)
      throw new Error("Invalid chain deviation in feet");
    parameters.maxDeviationFeet = value;
    deviationSpecified = true;
  } else if (
    (flag === "--cell" || flag === "--merge") &&
    args[i + 1] &&
    !args[i + 1].startsWith("--")
  ) {
    const value = args[++i];
    (flag === "--cell" ? selectedIds : mergeDirectories).push(value);
  } else throw new Error(usage);
}
if (resume && mergeDirectories.length > 0)
  throw new Error("Choose resume or merge, not both");
if (new Set(selectedIds).size !== selectedIds.length)
  throw new Error("Duplicate requested cell");
if (
  new Set(mergeDirectories.map((directory) => path.resolve(directory))).size !==
  mergeDirectories.length
)
  throw new Error("Duplicate merge directory");
if (
  mergeDirectories.some(
    (directory) => path.resolve(directory) === path.resolve(output),
  )
)
  throw new Error("Merge into a new output directory");

const root = path.resolve(import.meta.dirname, "../..");
const compilerSource = () =>
  preparedDisplayEngineBinding(
    root,
    ["scripts/indoor/compile-corridor-candidates.ts"],
    { namespace: "complete-cell-corridor-candidates-v2" },
  );
const source = compilerSource();
// The dependency walker follows local imports and WASM URLs, including this
// CLI, the checkpoint emitter/merger and its own resolver implementation.
const readInput = async () => {
  const bytes = await readFile(input);
  const manifestFiles = unzipSync(bytes, {
    filter: (entry) => entry.name === "manifest.json",
  });
  if (!manifestFiles["manifest.json"])
    throw new Error("Missing package manifest");
  const manifest = JSON.parse(strFromU8(manifestFiles["manifest.json"]));
  const descriptors = [manifest.indoor, manifest.floors, manifest.georeference];
  if (descriptors.some((descriptor) => typeof descriptor?.path !== "string"))
    throw new Error("Missing package member descriptor");
  const wanted = new Set(descriptors.map((descriptor) => descriptor.path));
  // A master may carry large native models. Read only the three bound
  // members needed here; do not inflate unrelated original source assets.
  const files = unzipSync(bytes, { filter: (entry) => wanted.has(entry.name) });
  for (const descriptor of descriptors) {
    const member = files[descriptor.path];
    if (
      !member ||
      member.length !== descriptor.bytes ||
      sha(member) !== descriptor.sha256
    )
      throw new Error("Package member does not match its manifest");
  }
  const data = JSON.parse(
    strFromU8(files[manifest.indoor.path]),
  ) as IndoorDataset;
  if (data.source.modelSha256 !== manifest.model.sha256)
    throw new Error("Model identities disagree");
  return {
    data,
    inputZipSha256: sha(bytes),
    inputJsonSha256: sha(files[manifest.indoor.path]),
  };
};
const { data, inputZipSha256, inputJsonSha256 } = await readInput();
const sourceSnapshot = sha(JSON.stringify(data));
const binding: CorridorCandidateBinding = {
  version: 2,
  inputZipSha256,
  inputJsonSha256,
  sourceModelSha256: data.source.modelSha256,
  sourceGeometryKey: createImmutableRoutingSession(data)(() =>
    preparedRoutingKey(data),
  ),
  compilerBinding: source.sha256,
  resolverVersion: ROUTING_GUIDE_VERSION,
  runtime: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    execArgv: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS ?? "",
  },
  parameters: { ...CORRIDOR_CANDIDATE_PARAMETERS, compiler: parameters },
};
const allScopes = corridorCandidateCellScopes(data);
for (const id of selectedIds)
  if (!allScopes.has(id))
    throw new Error(
      `Requested cell is outside the current eligible source scope: ${id}`,
    );
const scopes = new Map(
  [...allScopes].filter(
    ([id]) => selectedIds.length === 0 || selectedIds.includes(id),
  ),
);
const requestedCellIds = [...scopes.keys()];

const checkpointFile = (id: string) => `${sha(id)}.json`;
const loadDirectory = async (directory: string, ownOutputLock = false) => {
  const saved = JSON.parse(
    await readFile(path.join(directory, "binding.json"), "utf8"),
  );
  if (
    saved.status !== "candidate-guides-only" ||
    corridorCandidateCanonicalJson(saved.binding) !==
      corridorCandidateCanonicalJson(binding)
  )
    throw new Error(`Stale candidate directory: ${directory}`);
  if (
    !Array.isArray(saved.selectedCellIds) ||
    new Set(saved.selectedCellIds).size !== saved.selectedCellIds.length
  )
    throw new Error(`Invalid requested cell scope: ${directory}`);
  if (!ownOutputLock && (await readdir(directory)).includes(".candidate.lock"))
    throw new Error(`Candidate directory is locked: ${directory}`);
  if (
    saved.selectedCellIds.some(
      (id: unknown) => typeof id !== "string" || !allScopes.has(id),
    )
  )
    throw new Error(`Foreign requested cell scope: ${directory}`);
  const names = (await readdir(path.join(directory, "cells")))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const values: unknown[] = [];
  for (const name of names) {
    const value = JSON.parse(
      await readFile(path.join(directory, "cells", name), "utf8"),
    );
    if (
      !saved.selectedCellIds.includes(value?.scope?.cellId) ||
      name !== checkpointFile(value?.scope?.cellId ?? "")
    )
      throw new Error(
        `Foreign or misnamed cell checkpoint: ${directory}/${name}`,
      );
    values.push(value);
  }
  return { saved, values };
};

if (!resume) {
  const existing = await readdir(output).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return [];
    },
  );
  if (existing.length > 0)
    throw new Error("Use an empty candidate output directory, or --resume");
}

await mkdir(path.join(output, "cells"), { recursive: true });
const lockPath = path.join(output, ".candidate.lock");
const lock = await open(lockPath, "wx").catch(
  (error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST")
      throw new Error(
        "Candidate directory is locked; verify its recorded process has stopped before removing .candidate.lock",
      );
    throw error;
  },
);
await lock.writeFile(
  JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
);
const atomicWrite = (destination: string, value: unknown, pretty = false) => {
  const temporary = `${destination}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, pretty ? 2 : undefined));
  renameSync(temporary, destination);
};
const writtenCheckpoints: string[] = [];
let sourcePreserved: boolean | undefined;
try {
  let checkpoints = new Map<string, CorridorCandidateCheckpoint>();
  if (resume) {
    const { saved, values } = await loadDirectory(output, true);
    if (
      corridorCandidateCanonicalJson([...saved.selectedCellIds].sort()) !==
      corridorCandidateCanonicalJson([...requestedCellIds].sort())
    )
      throw new Error("Resume requires the original requested cell scope");
    checkpoints = mergeCorridorCandidateCheckpoints(
      values,
      binding,
      scopes,
      data,
      false,
    );
  } else if (mergeDirectories.length > 0) {
    const values: unknown[] = [];
    for (const directory of mergeDirectories)
      values.push(...(await loadDirectory(directory)).values);
    checkpoints = mergeCorridorCandidateCheckpoints(
      values,
      binding,
      scopes,
      data,
    );
  }
  atomicWrite(
    path.join(output, "binding.json"),
    {
      status: "candidate-guides-only",
      binding,
      selectedCellIds: requestedCellIds,
      fullPackageImportPerformed: false,
      actualNavigationAcceptancePerformed: false,
      sourceCodeFiles: source.modules,
    },
    true,
  );
  const remaining = requestedCellIds.filter((id) => !checkpoints.has(id));
  const started = performance.now();
  await initializeNativeExactGeosOverlay();
  const result = await prepareSharedCorridorRouting(data, {
    cellIds: new Set(remaining),
    parameters,
    cellCompleted: (cell, guides) => {
      const scope = scopes.get(cell.cellId);
      if (!scope || checkpoints.has(cell.cellId))
        throw new Error(`Unexpected or repeated compiler cell ${cell.cellId}`);
      const checkpoint = makeCorridorCandidateCheckpoint(
        binding,
        scope,
        cell,
        guides,
      );
      validateCorridorCandidateCheckpoint(checkpoint, binding, scope, data);
      const destination = path.join(
        output,
        "cells",
        checkpointFile(cell.cellId),
      );
      atomicWrite(destination, checkpoint);
      writtenCheckpoints.push(destination);
      checkpoints.set(cell.cellId, checkpoint);
      console.log(
        JSON.stringify({
          cell: cell.cellId,
          elevationFeet: cell.elevationFeet,
          compiled: cell.compiledEdges,
          total: cell.eligibleEdges,
          seconds: cell.seconds,
        }),
      );
    },
  });
  const unchangedData = sha(JSON.stringify(data)) === sourceSnapshot;
  const unchangedCompiler = compilerSource().sha256 === source.sha256;
  sourcePreserved = unchangedData && unchangedCompiler;
  if (!unchangedData) throw new Error("Compiler modified the original dataset");
  if (!unchangedCompiler)
    throw new Error(
      "Compiler sources changed during preparation; discard this attempt's new checkpoints",
    );
  checkpoints = mergeCorridorCandidateCheckpoints(
    [...checkpoints.values()],
    binding,
    scopes,
    data,
  );
  // A merge uses the exact same validated per-cell payloads. It never adds
  // geometry or treats those payloads as physical/navigation admission.
  if (mergeDirectories.length > 0)
    for (const [id, checkpoint] of checkpoints)
      atomicWrite(path.join(output, "cells", checkpointFile(id)), checkpoint);
  const guides = [...checkpoints.values()].flatMap(
    (checkpoint) => checkpoint.guides,
  );
  const cells = [...checkpoints.values()].map((checkpoint) => checkpoint.cell);
  const scopeIndex = indexCorridorRoutingScope(data);
  const edges = scopeIndex.eligible.filter((edge) =>
    scopes.has(edge.nativeCellId!),
  );
  const floors = data.floors.map((floor) => {
    const edgeIds = new Set(
      edges
        .filter((edge) =>
          floor.levelIds.includes(scopeIndex.nodes.get(edge.from)!.levelId),
        )
        .map((edge) => edge.id),
    );
    return {
      id: floor.id,
      name: floor.name,
      eligibleWalkingEdges: edgeIds.size,
      compiledWalkingEdges: guides.filter((guide) => edgeIds.has(guide.edgeId))
        .length,
    };
  });
  const prepared = { ...result.prepared, guides };
  atomicWrite(path.join(output, "prepared-routing.json"), prepared);
  atomicWrite(
    path.join(output, "shared-guides-display.geojson"),
    corridorCandidateDisplayGeoJson(data, prepared),
  );
  atomicWrite(
    path.join(output, "report.json"),
    {
      ...result.report,
      eligibleWalkingEdges: edges.length,
      requestedWalkingEdges: edges.length,
      completeCompiledWalkingEdges: guides.length,
      compiledWalkingEdges: guides.length,
      fallbackWalkingEdges: result.report.walkingEdges - guides.length,
      cells,
      floors,
      unavailableCellIds: cells
        .filter((cell) =>
          cell.refusedEdges.some(
            (edge) => edge.reason === "native-cell-not-admitted",
          ),
        )
        .map((cell) => cell.cellId),
      binding,
      seconds: (performance.now() - started) / 1000,
      reusedCells: checkpoints.size - remaining.length,
      compiledCellsThisRun: remaining.length,
      sourceGraphAndGeometryUnchanged: true,
      fullPackageImportPerformed: false,
      actualNavigationAcceptancePerformed: false,
    },
    true,
  );
  const edgesById = new Map(data.edges.map((edge) => [edge.id, edge]));
  atomicWrite(path.join(output, "preview.json"), {
    status: "source-geometry-preview-only",
    floors: data.floors,
    records: data.records.map(
      ({
        key,
        number,
        name,
        levelId,
        ringsFeet,
        circulation,
        access,
        walkable,
      }) => ({
        key,
        number,
        name,
        levelId,
        ringsFeet,
        circulation,
        access,
        walkable,
      }),
    ),
    cells: data.circulationGeometry?.cells
      .filter((cell) => scopes.has(cell.id))
      .map(({ id, levelIds, elevationFeet, ringsFeet }) => ({
        id,
        levelIds,
        elevationFeet,
        ringsFeet,
      })),
    guides: guides.map((guide) => ({
      ...guide,
      levelId: scopeIndex.nodes.get(edgesById.get(guide.edgeId)!.from)!.levelId,
    })),
  });
  console.log(
    JSON.stringify({
      complete: true,
      compiled: guides.length,
      cells: checkpoints.size,
      compiledCellsThisRun: remaining.length,
      seconds: (performance.now() - started) / 1000,
      floors,
    }),
  );
} finally {
  // A later cell's ordinary failure must retain earlier complete checkpoints.
  // Only a changed source/compiler epoch invalidates this attempt's work.
  if (sourcePreserved === undefined) {
    try {
      sourcePreserved =
        sha(JSON.stringify(data)) === sourceSnapshot &&
        compilerSource().sha256 === source.sha256;
    } catch {
      sourcePreserved = false;
    }
  }
  if (!sourcePreserved)
    for (const destination of writtenCheckpoints)
      await unlink(destination).catch(() => {});
  await lock.close();
  await unlink(lockPath);
}
