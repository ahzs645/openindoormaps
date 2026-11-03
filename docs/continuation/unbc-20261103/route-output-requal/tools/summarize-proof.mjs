// One report from the final-proof browser runs and the policy matrix.
//   node summarize-proof.mjs OUT.json BROWSER-DIR MATRIX.json
// Fails (exit 1) unless every run passed, all runs share one identity, and
// the matrix passed under the strict agreement and expectation rules.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const [output, dir, matrixPath] = process.argv.slice(2);
const identity = JSON.parse(readFileSync(`${dir}/IDENTITY.json`, "utf8"));
const runs = readdirSync(dir)
  .filter((n) => /-run\d+-proof\.json$/.test(n))
  .sort()
  .map((n) => JSON.parse(readFileSync(`${dir}/${n}`, "utf8")));
const problems = [];
for (const r of runs) {
  if (!r.passed) problems.push(`${r.mode} ${r.run}: ${r.failures.join("; ")}`);
  if (JSON.stringify(r.identity) !== JSON.stringify(identity))
    problems.push(`${r.mode} ${r.run}: identity differs from IDENTITY.json`);
}
const browsers = [...new Set(runs.map((r) => r.browserVersion))];
const journeys = [];
for (const label of [...new Set(runs.flatMap((r) => r.results.map((x) => x.label)))]) {
  const row = { label };
  for (const r of runs) {
    const x = r.results.find((y) => y.label === label);
    if (!x) {
      problems.push(`${r.mode} ${r.run}: journey ${label} missing`);
      continue;
    }
    Object.assign(row, {
      from: x.from,
      to: x.to,
      options: x.options,
      expect: x.expect,
      expectedDistanceMetres: x.expectedDistanceMetres,
      toleranceMetres: x.toleranceMetres,
    });
    (row.runs ??= []).push({
      mode: r.mode,
      run: r.run,
      passed: x.passed,
      outcome: x.outcome,
      statusText: x.statusText,
      shownMetres: x.shownMetres,
      stepTotal: x.stepTotal,
      requestToStatusSeconds: x.timing.requestToStatusSeconds,
      requestToRoutePaintSeconds: x.timing.requestToRoutePaintSeconds,
      routePaintNotBeforeSeconds: x.timing.routePaintNotBeforeSeconds,
      requestToFloorReadySeconds: x.timing.requestToFloorReadySeconds,
      routeLinePixels: x.routeLinePixels.after,
      buttonDisabledSeconds: x.buttonDisabledSeconds,
      loadAverageAtRequest: x.loadAverageAtRequest,
      problems: x.problems,
    });
  }
  journeys.push(row);
}
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
if (matrix.format !== "explicit-policy-route-matrix-v2" || !matrix.passed)
  problems.push("policy matrix did not pass the strict report");
for (const key of ["inputSha256", "manifestRevisionSha256", "manifestSha256", "carrierSha256"]) {
  const want = {
    inputSha256: identity.visitorSha256,
    manifestRevisionSha256: identity.manifestRevisionSha256,
    manifestSha256: identity.manifestFileSha256,
    carrierSha256: identity.directionsCarrier.sha256,
  }[key];
  if (matrix.identity[key] !== want) problems.push(`matrix ${key} differs from the browser identity`);
}
const report = {
  format: "final-visitor-proof-report-v1",
  passed: problems.length === 0,
  problems,
  scope: {
    browserJourneys: journeys.length,
    browserRuns: runs.map((r) => `${r.mode} ${r.run}`),
    policyCases: matrix.counts.cases,
    policyCaseShape:
      "18 room pairs (08-264/10-2006, 08-267/10-2066 and 16 former 06-388 island rooms with 06-364) x both directions x policies (8 for the two Floor 2 pairs, 4 for each island pair) = 160 cases",
    notCovered: [
      "physical phones: mobile is Chromium with Playwright iPhone 13 emulation (viewport, DPR 3, touch, UA), software GL",
      "production hosting and CDN: a local python http.server on a shared 4-core / 16 GB host",
      "routes other than the 8 browser journeys and the 160 matrix cases",
    ],
  },
  identity,
  browserVersions: browsers,
  emulation: Object.fromEntries(runs.map((r) => [r.mode, r.emulation])),
  runs: runs.map((r) => ({
    mode: r.mode,
    run: r.run,
    passed: r.passed,
    loadAverageAtStart: r.loadAverageAtStart,
    loadAverageAtEnd: r.loadAverageAtEnd,
    initialFloorReadySeconds: r.log.find((l) => l.stage === "floor-ready")?.seconds,
    pageErrors: r.pageErrors.length,
    consoleErrors: r.consoleErrors.length,
    failedRequests: r.failedRequests.length,
    routingCarrierRequests: r.dataRequests.filter((d) => d.path.includes("unbc-routing")).map((d) => d.path.split("/").pop()),
    planCarrierRequests: r.dataRequests.filter((d) => d.path.includes("unbc-plans")).map((d) => d.path.split("/").pop()),
  })),
  journeys,
  policyMatrix: {
    file: "POLICY-MATRIX.json.gz",
    format: matrix.format,
    passed: matrix.passed,
    complete: matrix.complete,
    allAgree: matrix.allAgree,
    allExpectationsMet: matrix.allExpectationsMet,
    agreementRule: matrix.agreementRule,
    expectationRule: matrix.expectationRule,
    identity: matrix.identity,
    counts: matrix.counts,
    failures: matrix.failures,
    workerRuns: matrix.workerRuns.map((w) => ({
      starts: w.starts,
      heapLimits: w.heapLimits,
      bundleSha256: w.bundleSha256,
      compiledReceipt: w.compiledReceipt,
    })),
  },
};
writeFileSync(output, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ passed: report.passed, problems }, null, 1));
process.exit(report.passed ? 0 : 1);
