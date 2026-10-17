/** Exact local code-review binding. This is NOT a publisher receipt and never
 * approves an imported map. Historical compiler and current consumers have
 * separate complete manifests; source physical constructors stay unchanged. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { exactSteppedWorkerProjectionAmendment } from "./stepped-stair-worker-projection-review";
import { postcompileHash } from "./postcompile-stepped-stair-artifacts";

export const REVIEWED_STEPPED_FLAT_POLICY_SHA256 =
  "1e43631165cd3089587a5005b9fb12eb6fe528a903acc53cae844083dc93d6da";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  reviter = path.resolve(root, "../reviter");
const names = [
  "native-stepped-stair-v2.ts",
  "native-circulation.ts",
  "route-worker-dataset.ts",
  "prepared-display-engine-binding.ts",
] as const;
const existingPaths = names.map((n) =>
  path.join(root, "app/indoor-project", n),
);
const helperPath = path.join(
  root,
  "app/indoor-project/native-stepped-stair-v2-flat-policy.ts",
);
const decodeText = (b: Uint8Array) =>
  new TextDecoder("utf8", { fatal: true }).decode(b);
export function assertHistoricalSteppedAlgorithmBindings(
  algorithms: { path: string; sha256: string }[],
  files: Record<string, string>,
) {
  const expected = [
    "source-stepped-stair-v2-review.ts",
    "source-stepped-stair-v2-producer.ts",
    "finalize-source-stepped-stair-v2.ts",
  ].map((file) => fileURLToPath(new URL(file, import.meta.url)));
  assert.deepEqual(
    algorithms.map((row) => path.resolve(row.path)).sort(),
    expected.sort(),
    "Historical source summary must bind exactly its review, producer and finalizer",
  );
  for (const algorithm of algorithms) {
    assert.match(algorithm.sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      algorithm.sha256,
      files[path.resolve(algorithm.path)],
      "Historical source algorithm differs from the compiler freeze",
    );
  }
}
type Closure = {
  createdAt: string;
  runtime: string;
  entryPoints: string[];
  files: Record<string, string>;
};
export type PostcompileStrengtheningReview = {
  format: "openindoormaps-postcompile-stepped-consumer-strengthening-v1";
  historicalCompilerClosure: { path: string; sha256: string };
  historicalFileSnapshot: {
    path: string;
    sha256: string;
    files: { originalPath: string; snapshotPath: string; sha256: string }[];
  };
  currentRuntime: string;
  currentClosure: { entryPoints: string[]; files: Record<string, string> };
  reviewedNewFlatPolicySha256: string;
  currentEngineSha256: string;
  reviewAlgorithm: { path: string; sha256: string };
  historicalSourcePhysicalAlgorithmsUnchanged: true;
  originalCompilerRerunClaimed: false;
  sourceAuthorityGranted: false;
};

export function exactPostcompileQualifierStrengthening(original: Uint8Array) {
  const source = decodeText(original),
    importText =
      'import { assertCurrentSteppedFlatApproachPolicy } from "./native-stepped-stair-v2-flat-policy";\n',
    anchor = "  }\n}\n\nexport function inspectNativeSteppedStairV2Binding(";
  assert.equal(source.split(anchor).length, 2);
  assert(!source.includes("assertCurrentSteppedFlatApproachPolicy"));
  return new TextEncoder().encode(
    importText +
      source.replace(
        anchor,
        "  }\n  assertCurrentSteppedFlatApproachPolicy(data, edge, proof);\n}\n\nexport function inspectNativeSteppedStairV2Binding(",
      ),
  );
}
export function exactPostcompileCellAccessExport(original: Uint8Array) {
  const source = decodeText(original),
    anchor = "function nativeCellAccessIsSupported(";
  assert.equal(source.split(anchor).length, 2);
  assert(!source.includes("export " + anchor));
  return new TextEncoder().encode(source.replace(anchor, "export " + anchor));
}
function expectedEntryPoints() {
  return [
    path.join(root, "scripts/indoor/regenerate-from-native-cache.ts"),
    path.join(reviter, "scripts/indoor/native-circulation-plane-worker.ts"),
    path.join(reviter, "scripts/indoor/native-landing-approach-worker.ts"),
  ];
}
function currentEntryPoints() {
  return [
    ...expectedEntryPoints(),
    ...[
      "scripts/indoor/replay-postcompile-stepped-stair.ts",
      "scripts/indoor/build-pathway-candidate-scope.ts",
      "scripts/indoor/audit-pathway-candidate.ts",
      "scripts/indoor/audit-candidate-route-transport.ts",
      "app/indoor-project/package.ts",
      "app/indoor-project/published-route-calculation.worker.ts",
      "app/indoor-project/progressive-route.worker.ts",
    ].map((p) => path.join(root, p)),
  ];
}
export async function collectClosure(
  entryPoints: string[],
  overrides = new Map<string, Uint8Array>(),
) {
  const compiled = await build({
    // This bootstrap is launched from a runtime URL, so ordinary import
    // traversal cannot discover it. It is analysis-only; the three semantic
    // compiler entry points recorded below remain unchanged.
    entryPoints: [
      ...new Set([
        ...entryPoints,
        path.join(reviter, "scripts/indoor/bounded-checkpoint-worker.ts"),
      ]),
    ],
    absWorkingDir: root,
    outdir: path.join(root, "unused-postcompile-closure"),
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
    loader: { ".wasm": "file" },
    plugins: [
      {
        name: "exact-historical-before-images-only",
        setup(api) {
          api.onLoad({ filter: /\.(?:ts|tsx|mjs|js)$/ }, (args) => {
            const bytes = overrides.get(args.path);
            return bytes
              ? {
                  contents: decodeText(bytes),
                  loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
                  resolveDir: path.dirname(args.path),
                }
              : undefined;
          });
        },
      },
    ],
  });
  const resolved = [
    ...Object.keys(compiled.metafile!.inputs).map((file) =>
      path.resolve(root, file),
    ),
    path.join(reviter, "scripts/register-local-typescript.mjs"),
    path.join(reviter, "scripts/local-typescript-resolver.mjs"),
    ...[root, reviter].flatMap((base) => [
      path.join(base, "package.json"),
      path.join(base, "package-lock.json"),
      path.join(
        base,
        base === root
          ? "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm"
          : "lib/reviter/vendor/native-exact-geos/native-exact-geos.wasm",
      ),
    ]),
  ];
  const files: Record<string, string> = {};
  for (const file of [...new Set(resolved)].sort())
    files[file] = postcompileHash(
      overrides.get(file) ?? (await fs.readFile(file)),
    );
  return { entryPoints, files };
}
async function historicalClosure(file: string) {
  const bytes = await fs.readFile(file),
    value = JSON.parse(bytes.toString()) as Closure;
  assert.equal(value.runtime, process.version);
  assert.deepEqual(value.entryPoints, expectedEntryPoints());
  assert(Number.isFinite(Date.parse(value.createdAt)));
  for (const digest of Object.values(value.files))
    assert.match(digest, /^[a-f0-9]{64}$/);
  return { bytes, value };
}
export async function capturePostcompileHistoricalFiles(
  closurePath: string,
  directory: string,
) {
  const { bytes, value } = await historicalClosure(closurePath);
  for (const [file, digest] of Object.entries(value.files))
    assert.equal(
      postcompileHash(await fs.readFile(file)),
      digest,
      `Historical source changed: ${file}`,
    );
  await fs.mkdir(directory, { recursive: true });
  assert.equal(
    (await fs.readdir(directory)).length,
    0,
    "Historical snapshot directory must be empty",
  );
  const rows = [];
  for (const originalPath of existingPaths) {
    const body = await fs.readFile(originalPath),
      snapshotPath = path.resolve(directory, path.basename(originalPath));
    assert.equal(postcompileHash(body), value.files[originalPath]);
    await fs.writeFile(snapshotPath, body, { flag: "wx" });
    rows.push({ originalPath, snapshotPath, sha256: postcompileHash(body) });
  }
  const snapshot = {
    format: "postcompile-historical-consumer-before-images-v1",
    compilerClosureSha256: postcompileHash(bytes),
    files: rows,
  };
  const snapshotPath = path.resolve(directory, "snapshot.json");
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), {
    flag: "wx",
  });
  return {
    path: snapshotPath,
    sha256: postcompileHash(await fs.readFile(snapshotPath)),
    files: rows,
  };
}
async function checkedSourceDelta(closurePath: string, snapshotPath: string) {
  const historical = await historicalClosure(closurePath),
    snapshotBytes = await fs.readFile(snapshotPath),
    snapshot = JSON.parse(snapshotBytes.toString());
  assert.equal(
    snapshot.format,
    "postcompile-historical-consumer-before-images-v1",
  );
  assert.equal(
    snapshot.compilerClosureSha256,
    postcompileHash(historical.bytes),
  );
  assert.deepEqual(
    snapshot.files
      .map((row: { originalPath: string }) => row.originalPath)
      .sort(),
    [...existingPaths].sort(),
  );
  const originals = new Map<string, Uint8Array>();
  for (const row of snapshot.files) {
    const bytes = new Uint8Array(await fs.readFile(row.snapshotPath));
    assert.equal(postcompileHash(bytes), row.sha256);
    assert.equal(row.sha256, historical.value.files[row.originalPath]);
    originals.set(row.originalPath, bytes);
  }
  assert.deepEqual(
    (await collectClosure(expectedEntryPoints(), originals)).files,
    historical.value.files,
    "Historical compiler closure cannot be exactly reconstructed from reviewed before-images",
  );
  const engine = preparedDisplayEngineBinding(root),
    literal = `// Generated from the complete local preparation module graph and dependency lock.\n// Refresh through Vite or scripts/indoor/prepared-display-engine-binding.ts.\nexport const PREPARED_DISPLAY_ENGINE_SHA256 =\n  ${JSON.stringify(engine.sha256)};\n`,
    expected = [
      exactPostcompileQualifierStrengthening(originals.get(existingPaths[0]!)!),
      exactPostcompileCellAccessExport(originals.get(existingPaths[1]!)!),
      exactSteppedWorkerProjectionAmendment(originals.get(existingPaths[2]!)!),
      new TextEncoder().encode(literal),
    ];
  for (const [i, file] of existingPaths.entries())
    assert.deepEqual(
      new Uint8Array(await fs.readFile(file)),
      expected[i],
      `Code changed outside exact consumer/projection/official-engine amendment: ${file}`,
    );
  assert.equal(
    postcompileHash(await fs.readFile(helperPath)),
    REVIEWED_STEPPED_FLAT_POLICY_SHA256,
    "Current policy helper is not the independently reviewed strict variant",
  );
  const allowed = new Set(existingPaths);
  for (const [file, digest] of Object.entries(historical.value.files))
    if (!allowed.has(file))
      assert.equal(
        postcompileHash(await fs.readFile(file)),
        digest,
        `Frozen source/physical algorithm changed: ${file}`,
      );
  return { historical, snapshot, snapshotBytes, engine };
}
export async function writePostcompileStrengtheningReview(
  closurePath: string,
  snapshotPath: string,
  output: string,
) {
  const checked = await checkedSourceDelta(closurePath, snapshotPath),
    currentClosure = await collectClosure(currentEntryPoints()),
    algorithm = fileURLToPath(import.meta.url);
  const review: PostcompileStrengtheningReview = {
    format: "openindoormaps-postcompile-stepped-consumer-strengthening-v1",
    historicalCompilerClosure: {
      path: path.resolve(closurePath),
      sha256: postcompileHash(checked.historical.bytes),
    },
    historicalFileSnapshot: {
      path: path.resolve(snapshotPath),
      sha256: postcompileHash(checked.snapshotBytes),
      files: checked.snapshot.files,
    },
    currentRuntime: process.version,
    currentClosure,
    reviewedNewFlatPolicySha256: REVIEWED_STEPPED_FLAT_POLICY_SHA256,
    currentEngineSha256: checked.engine.sha256,
    reviewAlgorithm: {
      path: algorithm,
      sha256: postcompileHash(await fs.readFile(algorithm)),
    },
    historicalSourcePhysicalAlgorithmsUnchanged: true,
    originalCompilerRerunClaimed: false,
    sourceAuthorityGranted: false,
  };
  await fs.writeFile(output, JSON.stringify(review, null, 2), { flag: "wx" });
  return review;
}
export async function verifyPostcompileStrengtheningReview(
  review: PostcompileStrengtheningReview,
) {
  assert.equal(
    review.format,
    "openindoormaps-postcompile-stepped-consumer-strengthening-v1",
  );
  assert.equal(review.currentRuntime, process.version);
  assert.equal(review.historicalSourcePhysicalAlgorithmsUnchanged, true);
  assert.equal(review.originalCompilerRerunClaimed, false);
  assert.equal(review.sourceAuthorityGranted, false);
  assert.equal(
    path.resolve(review.reviewAlgorithm.path),
    fileURLToPath(import.meta.url),
  );
  assert.equal(
    postcompileHash(await fs.readFile(review.reviewAlgorithm.path)),
    review.reviewAlgorithm.sha256,
  );
  const checked = await checkedSourceDelta(
    review.historicalCompilerClosure.path,
    review.historicalFileSnapshot.path,
  );
  assert.equal(
    postcompileHash(checked.historical.bytes),
    review.historicalCompilerClosure.sha256,
  );
  assert.equal(
    postcompileHash(checked.snapshotBytes),
    review.historicalFileSnapshot.sha256,
  );
  assert.deepEqual(checked.snapshot.files, review.historicalFileSnapshot.files);
  assert.equal(
    review.reviewedNewFlatPolicySha256,
    REVIEWED_STEPPED_FLAT_POLICY_SHA256,
  );
  assert.equal(checked.engine.sha256, review.currentEngineSha256);
  assert.deepEqual(
    await collectClosure(currentEntryPoints()),
    review.currentClosure,
    "Current complete consumer closure changed since review; start a fresh checked process",
  );
  return {
    historicalCompilerClosurePreserved: true,
    currentCompleteClosureMatched: true,
    currentEngineSha256: checked.engine.sha256,
    physicalSourceAuthorityGranted: false,
  } as const;
}
