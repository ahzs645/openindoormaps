/** Refuse confirmed-public/step-free advertising without changing runtime
 * policy. Input is an exact source ZIP plus route requests, never route claims. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readIndoorProject } from "../../app/indoor-project/package";
import { tryReadPublishedProject } from "../../app/indoor-project/published-project";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import {
  auditAdvertisedRouteAccess,
  validateAdvertisedRouteCases,
} from "./advertised-route-access";

const [input, expectedSha256, casesFile, output] = process.argv.slice(2);
assert(
  input && /^[a-f0-9]{64}$/.test(expectedSha256 ?? "") && casesFile && output,
  "Usage: audit-advertised-route-access.ts SOURCE.zip EXPECTED-SHA256 ROUTE-CASES.json NEW-REPORT.json",
);
const sha = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const engine = () =>
  preparedDisplayEngineBinding(path.resolve(import.meta.dirname, "../.."))
    .sha256;
assert.equal(
  engine(),
  PREPARED_DISPLAY_ENGINE_SHA256,
  "Stale source engine binding",
);
const inputBytes = new Uint8Array(await readFile(input));
assert.equal(
  sha(inputBytes),
  expectedSha256,
  "Source package checksum mismatch",
);
const caseBytes = new Uint8Array(await readFile(casesFile));
const requests: unknown = JSON.parse(new TextDecoder().decode(caseBytes));
validateAdvertisedRouteCases(requests);
await initializeNativeExactGeosOverlay();
const admitted = await tryReadPublishedProject(
  inputBytes,
  undefined,
  undefined,
  {
    retainArchiveFiles: false,
  },
);
const project = admitted?.project ?? (await readIndoorProject(inputBytes));
const data = editorVisitorDataset(project);
const datasetSha256 = preparedDisplayDatasetSha256(data);
const audit = auditAdvertisedRouteAccess(data, requests);
assert.equal(
  preparedDisplayDatasetSha256(data),
  datasetSha256,
  "Dataset changed",
);
assert.equal(
  sha(new Uint8Array(await readFile(input))),
  expectedSha256,
  "Source changed",
);
assert.equal(
  sha(new Uint8Array(await readFile(casesFile))),
  sha(caseBytes),
  "Cases changed",
);
assert.equal(engine(), PREPARED_DISPLAY_ENGINE_SHA256, "Source engine changed");
const report = {
  ...audit,
  inputSha256: expectedSha256,
  datasetSha256,
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  caseFileSha256: sha(caseBytes),
  compiledSourceAdmission: !!admitted,
  sourceUnchanged: true,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(
  JSON.stringify({
    output,
    advertisedAccessPassed: audit.advertisedAccessPassed,
    routes: audit.routes.length,
    routesComputed: audit.routesComputed,
    geometryAuthority: false,
  }),
);
if (!audit.advertisedAccessPassed) process.exitCode = 1;
