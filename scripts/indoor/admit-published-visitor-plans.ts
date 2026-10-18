/** Compile plan pins only after an independent fresh production-floor decode
 * reproduces EVERY candidate carrier. Proof booleans alone confer no trust. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  writePublishedVisitorPlanRuntimeBinding,
  publishedVisitorPlanRuntimeBinding,
} from "./published-visitor-plan-runtime-binding";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import type { PublishedVisitorPlanReceipt } from "../../app/indoor-project/published-visitor-plan-types";
const [
  sourceDirectory,
  expectedManifestSha,
  candidateDirectory,
  outputReport,
  ...flags
] = process.argv.slice(2);
if (
  !sourceDirectory ||
  !expectedManifestSha ||
  !candidateDirectory ||
  !outputReport
)
  throw new Error(
    "Usage: admit-published-visitor-plans.ts VERIFIED-SOURCE-DIRECTORY EXPECTED-MANIFEST-SHA256 CANDIDATE-DIRECTORY NEW-REPORT.json [--verifier-heap-mib=512..8192]",
  );
assert(
  flags.length <= 1 &&
    flags.every((flag) => /^--verifier-heap-mib=\d+$/.test(flag)),
  "Unknown or duplicate independent verifier option",
);
const verifierHeapMiB =
  flags.length > 0
    ? Number(flags[0]!.slice("--verifier-heap-mib=".length))
    : 8192;
assert(
  Number.isSafeInteger(verifierHeapMiB) &&
    verifierHeapMiB >= 512 &&
    verifierHeapMiB <= 8192,
  "Independent verifier heap must be an integer from 512 to 8192 MiB",
);
const root = path.resolve(import.meta.dirname, "../.."),
  candidate = path.resolve(candidateDirectory),
  sha = (v: Uint8Array | string) =>
    createHash("sha256").update(v).digest("hex"),
  binding = writePublishedVisitorPlanRuntimeBinding(root);
assert.equal(
  preparedDisplayEngineBinding(root).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
);
const proofBytes = await fs.readFile(path.join(candidate, "proof.json")),
  proof = JSON.parse(proofBytes.toString()),
  descriptionBytes = await fs.readFile(
    path.join(candidate, "candidate-plans.json"),
  ),
  description = JSON.parse(descriptionBytes.toString());
assert.equal(proof.passed, true);
assert.equal(proof.sourceManifestFileSha256, expectedManifestSha);
assert.equal(proof.engineSha256, PREPARED_DISPLAY_ENGINE_SHA256);
assert.equal(description.completedScopes, description.allCompleteFloorScopes);
assert.equal(proof.allScopesVerified, description.records.length);
const verification = await fs.mkdtemp(
  path.join(os.tmpdir(), "oim-plan-independent-"),
);
const logFile = await fs.open(
  path.resolve(outputReport) + ".independent.log",
  "wx",
);
try {
  const child = spawn(
    process.execPath,
    [
      `--max-old-space-size=${verifierHeapMiB}`,
      "--expose-gc",
      "--import",
      "tsx",
      path.join(root, "scripts/indoor/export-published-visitor-plans.ts"),
      path.resolve(sourceDirectory),
      expectedManifestSha,
      verification,
    ],
    { cwd: root, stdio: ["ignore", logFile.fd, logFile.fd] },
  );
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 0, "Independent full floor decode/projection failed");
} finally {
  await logFile.close();
}
const independent = JSON.parse(
  await fs.readFile(path.join(verification, "candidate-plans.json"), "utf8"),
);
assert.equal(independent.records.length, description.records.length);
const receipts: PublishedVisitorPlanReceipt[] = [];
for (const row of description.records) {
  const check = independent.records.find(
    (r: { receipt: { scopeId: string } }) =>
      r.receipt.scopeId === row.receipt.scopeId,
  );
  assert(check);
  assert.deepEqual(
    row.receipt,
    check.receipt,
    "Source carrier/projection must reproduce independently",
  );
  assert.deepEqual(row.layers, check.layers);
  assert.deepEqual(row.native, check.native);
  const name = row.receipt.compressedSha256 + ".json.gz",
    bytes = await fs.readFile(path.join(candidate, name));
  assert.equal(sha(bytes), row.receipt.compressedSha256);
  assert.equal(bytes.length, row.receipt.compressedBytes);
  assert.equal(
    sha(await fs.readFile(path.join(verification, name))),
    sha(bytes),
  );
  receipts.push({ ...row.receipt, runtimeSha256: binding.sha256 });
}
assert.equal(
  publishedVisitorPlanRuntimeBinding(root).sha256,
  binding.sha256,
  "Plan consumer/projection changed during independent verification",
);
assert.equal(
  preparedDisplayEngineBinding(root).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
);
const target = path.join(
    root,
    "app/indoor-project/published-visitor-plan-receipts.ts",
  ),
  source = `import type { PublishedVisitorPlanReceipt } from "./published-visitor-plan-types";\n// Generated only after independent full-floor decode/projection equality.\nexport const PUBLISHED_VISITOR_PLAN_RECEIPTS: readonly PublishedVisitorPlanReceipt[] =\n  Object.freeze(${JSON.stringify(receipts, null, 2)});\n`;
await fs.writeFile(target, source);
await fs.writeFile(
  outputReport,
  JSON.stringify(
    {
      format: "published-visitor-plan-independent-admission-v1",
      passed: true,
      sourceManifestFileSha256: expectedManifestSha,
      sourceEngineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      runtimeSha256: binding.sha256,
      candidateProofFileSha256: sha(proofBytes),
      candidateDescriptionFileSha256: sha(descriptionBytes),
      allScopesReproducedIndependently: receipts.length,
      independentVerifierHeapMiB: verifierHeapMiB,
      compressedBytes: receipts.reduce((n, r) => n + r.compressedBytes, 0),
      receiptsFileSha256: sha(source),
      compiledTrustRootChanged: true,
      published: false,
      independentDirectory: verification,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    passed: true,
    scopeCount: receipts.length,
    runtimeSha256: binding.sha256,
    compiledTrustRootChanged: true,
    published: false,
  }),
);
