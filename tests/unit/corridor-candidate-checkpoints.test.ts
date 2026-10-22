import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { CORRIDOR_COMPILER_PARAMETERS } from "../../app/indoor-project/corridor-routing-parameters";
import { ROUTING_GUIDE_VERSION } from "../../app/indoor-project/prepared-routing";
import { preparedDisplayEngineBinding } from "../../scripts/indoor/prepared-display-engine-binding";
import {
  CORRIDOR_CANDIDATE_PARAMETERS,
  corridorCandidateCanonicalJson,
  corridorCandidateCellScopes,
  corridorCandidateDisplayGeoJson,
  corridorCandidateSha256,
  makeCorridorCandidateCheckpoint,
  mergeCorridorCandidateCheckpoints,
  validateCorridorCandidateCheckpoint,
  type CorridorCandidateBinding,
  type CorridorCandidateCheckpoint,
} from "../../scripts/indoor/lib/corridor-candidate-checkpoints";

const root = fileURLToPath(new URL("../..", import.meta.url));
const cli = path.join(root, "scripts/indoor/compile-corridor-candidates.ts");
const sha = corridorCandidateSha256;
function fixture() {
  const data = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  ) as IndoorDataset;
  data.source.modelSha256 = "a".repeat(64);
  for (const edge of data.edges)
    if (edge.kind === "walk")
      edge.nativeCellId = edge.id === "walk-a" ? "cell-a" : "cell-b";
  const binding: CorridorCandidateBinding = {
    version: 2,
    inputZipSha256: "b".repeat(64),
    inputJsonSha256: "c".repeat(64),
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: "d".repeat(64),
    compilerBinding: "e".repeat(64),
    resolverVersion: ROUTING_GUIDE_VERSION,
    runtime: {
      node: "fixture",
      v8: "fixture",
      platform: "fixture",
      architecture: "fixture",
      execArgv: [],
      nodeOptions: "",
    },
    parameters: {
      ...CORRIDOR_CANDIDATE_PARAMETERS,
      compiler: { ...CORRIDOR_COMPILER_PARAMETERS },
    },
  };
  const scopes = corridorCandidateCellScopes(data);
  const checkpoints = [...scopes.values()].map((scope) => {
    // This fixture checks checkpoint transport/accounting only. These original
    // polylines are not independently qualified candidate geometry.
    const guides = data.edges
      .filter((edge) => scope.edgeIds.includes(edge.id))
      .map((edge) => ({
        edgeId: edge.id,
        kind: "shared-corridor" as const,
        pointsFeet: edge.pointsFeet,
        hallwayJoins: [0, edge.pointsFeet.length - 1] as [number, number],
      }));
    return makeCorridorCandidateCheckpoint(
      binding,
      scope,
      {
        cellId: scope.cellId,
        elevationFeet: scope.elevationFeet,
        eligibleEdges: scope.edgeIds.length,
        requestedEdges: scope.edgeIds.length,
        terminalCount: scope.terminalIds.length,
        emittedEdges: guides.length,
        compiledEdges: guides.length,
        refusedEdges: [],
        guideIds: guides.map((guide) => guide.edgeId),
        networks: [],
        seconds: 0,
      },
      guides,
    );
  });
  return { data, binding, scopes, checkpoints };
}
function resign(record: CorridorCandidateCheckpoint) {
  const { payloadSha256: _, ...payload } = record;
  record.payloadSha256 = sha(corridorCandidateCanonicalJson(payload));
}

test("candidate merge retains complete original cells in stable order, without navigation authority", () => {
  const { data, binding, scopes, checkpoints } = fixture();
  const before = JSON.stringify(data);
  const merged = mergeCorridorCandidateCheckpoints(
    checkpoints.toReversed(),
    binding,
    scopes,
    data,
  );
  assert.deepEqual([...merged.keys()], [...scopes.keys()]);
  assert.equal(merged.get("cell-a")!.status, "candidate-guides-only");
  assert.equal(JSON.stringify(data), before);
  const incomplete = mergeCorridorCandidateCheckpoints(
    checkpoints.slice(0, 1),
    binding,
    scopes,
    data,
    false,
  );
  assert.equal(incomplete.size, 1, "resume may contain only completed cells");
  assert.throws(
    () =>
      mergeCorridorCandidateCheckpoints(
        checkpoints.slice(0, 1),
        binding,
        scopes,
        data,
      ),
    /Missing candidate cells: cell-b/,
  );
  assert.throws(
    () =>
      mergeCorridorCandidateCheckpoints(
        [...checkpoints, checkpoints[0]],
        binding,
        scopes,
        data,
      ),
    /Duplicate candidate cell/,
  );
  assert.throws(
    () =>
      mergeCorridorCandidateCheckpoints(
        checkpoints,
        binding,
        new Map([["cell-a", scopes.get("cell-a")!]]),
        data,
      ),
    /Unexpected candidate cell cell-b/,
  );
});

test("candidate checkpoint rejects stale inputs, physical scope, compiler, runtime and fixed parameters", () => {
  const { data, binding, scopes, checkpoints } = fixture();
  const scope = scopes.get("cell-a")!;
  const candidate = checkpoints[0];
  for (const changed of [
    { ...binding, inputJsonSha256: "f".repeat(64) },
    { ...binding, sourceGeometryKey: "f".repeat(64) },
    { ...binding, compilerBinding: "f".repeat(64) },
    { ...binding, runtime: { ...binding.runtime, node: "new runtime" } },
    {
      ...binding,
      parameters: {
        ...binding.parameters,
        compiler: {
          ...binding.parameters.compiler,
          maxDeviationFeet: CORRIDOR_COMPILER_PARAMETERS.maxDeviationFeet + 0.5,
        },
      },
    },
  ])
    assert.throws(
      () =>
        validateCorridorCandidateCheckpoint(candidate, changed, scope, data),
      /stale input, compiler, runtime or parameters/,
    );
  assert.throws(
    () =>
      validateCorridorCandidateCheckpoint(
        candidate,
        binding,
        { ...scope, terminalIds: scope.terminalIds.slice(1) },
        data,
      ),
    /incomplete or changed original cell scope/,
  );
  const changed = structuredClone(data);
  changed.nodes[0].pointFeet[0] += 0.01;
  assert.notEqual(
    corridorCandidateCellScopes(changed).get("cell-a")!.scopeSha256,
    scope.scopeSha256,
  );
});

test("candidate checkpoint rejects corrupt payloads and explicitly accounts for every original edge", () => {
  const { data, binding, scopes, checkpoints } = fixture();
  const scope = scopes.get("cell-b")!;
  const candidate = structuredClone(checkpoints[1]);
  candidate.guides[0].pointsFeet[1][0] += 0.1;
  assert.throws(
    () => validateCorridorCandidateCheckpoint(candidate, binding, scope, data),
    /payload checksum mismatch/,
  );
  const partial = structuredClone(checkpoints[1]);
  partial.guides.pop();
  partial.cell.guideIds.pop();
  partial.cell.compiledEdges--;
  partial.cell.emittedEdges--;
  resign(partial);
  assert.throws(
    () => validateCorridorCandidateCheckpoint(partial, binding, scope, data),
    /missing or foreign original-edge outcome/,
  );
  partial.cell.refusedEdges.push({
    edgeId: scope.edgeIds.at(-1)!,
    reason: "no-current-physical-face",
  });
  resign(partial);
  validateCorridorCandidateCheckpoint(partial, binding, scope, data);
  partial.guides[0].pointsFeet[0][0] += 0.1;
  resign(partial);
  assert.throws(
    () => validateCorridorCandidateCheckpoint(partial, binding, scope, data),
    /changed original endpoints/,
  );
});

test("candidate display export separates native approaches and core and preserves source identities", () => {
  const { data, binding, checkpoints } = fixture();
  const guide = structuredClone(checkpoints[0].guides[0]);
  guide.hallwayJoins = [1, 2];
  const before = JSON.stringify(data);
  const result = corridorCandidateDisplayGeoJson(data, {
    version: 1,
    resolverVersion: binding.resolverVersion,
    sourceModelSha256: binding.sourceModelSha256,
    sourceGeometryKey: binding.sourceGeometryKey,
    guides: [guide],
  });
  assert.equal(result.status, "candidate-display-only");
  assert.equal(result.navigationAuthority, false);
  assert.deepEqual(
    result.features.map((feature) => feature.properties.role),
    ["approach-start", "core", "approach-end"],
  );
  assert.ok(
    result.features.every(
      (feature) =>
        feature.properties.edgeId === "walk-a" &&
        feature.properties.nativeCellId === "cell-a" &&
        feature.properties.from === "a" &&
        feature.properties.to === "door-a" &&
        feature.properties.elevationFeet === 0,
    ),
  );
  assert.ok(
    result.features.every((feature) =>
      feature.geometry.coordinates.every(
        ([longitude, latitude]) => longitude < -121 && latitude > 52,
      ),
    ),
  );
  assert.equal(JSON.stringify(data), before);
});

test("candidate compiler binding includes the actual CLI, emitter, merger, parameter source and exact WASM", () => {
  const binding = preparedDisplayEngineBinding(
    root,
    ["scripts/indoor/compile-corridor-candidates.ts"],
    { namespace: "complete-cell-corridor-candidates-v2" },
  );
  const names = new Set(binding.modules.map(([name]) => name));
  for (const name of [
    "scripts/indoor/compile-corridor-candidates.ts",
    "scripts/indoor/lib/corridor-candidate-checkpoints.ts",
    "scripts/indoor/prepared-display-engine-binding.ts",
    "app/indoor-project/corridor-routing-parameters.ts",
    "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm",
    "package-lock.json",
  ])
    assert.ok(names.has(name), name);
});

test("candidate CLI resumes completed cells, merges disjoint shards and refuses stale or incomplete work", (t) => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "corridor-candidate-jobs-"),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { data } = fixture();
  const members = {
    "indoor.json": strToU8(JSON.stringify(data)),
    "floors.json": strToU8(JSON.stringify(data.floors)),
    "georeference.json": strToU8(JSON.stringify(data.alignment)),
  };
  const descriptor = (name: keyof typeof members) => ({
    path: name,
    bytes: members[name].length,
    sha256: sha(members[name]),
  });
  const input = path.join(directory, "source.zip");
  writeFileSync(
    input,
    zipSync({
      ...members,
      "manifest.json": strToU8(
        JSON.stringify({
          model: { sha256: data.source.modelSha256 },
          indoor: descriptor("indoor.json"),
          floors: descriptor("floors.json"),
          georeference: descriptor("georeference.json"),
        }),
      ),
    }),
  );
  const run = (destination: string, args: string[], success = true) => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cli, input, destination, ...args],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(
      result.status === 0,
      success,
      `${result.stdout}\n${result.stderr}`,
    );
    return result;
  };
  const first = path.join(directory, "first"),
    second = path.join(directory, "second"),
    merged = path.join(directory, "merged");
  run(first, ["--cell", "cell-a"]);
  run(first, ["--cell", "cell-a", "--resume"]);
  const report = JSON.parse(
    readFileSync(path.join(first, "report.json"), "utf8"),
  );
  assert.equal(report.compiledCellsThisRun, 0);
  assert.equal(report.reusedCells, 1);
  assert.equal(report.actualNavigationAcceptancePerformed, false);
  assert.equal(
    report.cells[0].refusedEdges[0].reason,
    "native-cell-not-admitted",
  );
  assert.match(
    run(
      first,
      [
        "--cell",
        "cell-a",
        "--max-deviation-feet",
        String(CORRIDOR_COMPILER_PARAMETERS.maxDeviationFeet + 0.5),
        "--resume",
      ],
      false,
    ).stderr,
    /Stale candidate directory/,
  );
  assert.match(
    run(path.join(directory, "incomplete"), ["--merge", first], false).stderr,
    /Missing candidate cells: cell-b/,
  );
  assert.equal(
    existsSync(path.join(directory, "incomplete", "prepared-routing.json")),
    false,
  );
  run(second, ["--cell", "cell-b"]);
  run(merged, ["--merge", second, "--merge", first]);
  const mergedReport = JSON.parse(
    readFileSync(path.join(merged, "report.json"), "utf8"),
  );
  assert.equal(mergedReport.cells.length, 2);
  assert.equal(mergedReport.compiledCellsThisRun, 0);
  assert.equal(mergedReport.reusedCells, 2);
  assert.equal(mergedReport.eligibleWalkingEdges, 3);
  assert.ok(existsSync(path.join(merged, "shared-guides-display.geojson")));
});
