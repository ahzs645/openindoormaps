/** Local release/data QA; writes reports and a proposed visual review only.
 * Does not install pins, edit assets, import source authority or claim browser QA. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { PUBLISHED_CIRCULATION_PAINT_REVIEW } from "../../app/indoor-project/published-circulation-paint-reviews";
import {
  applyPublishedCirculationPaint,
  applyPublishedOverviewCirculationPaint,
} from "../../app/indoor-project/published-circulation-paint";
import {
  validateProgressiveManifest,
  verifyProgressiveAssetBytes,
  decodeProgressiveFloor,
  progressiveSha256,
  type ProgressiveManifest,
  type ProgressiveScope,
  type ProgressiveOverview,
} from "../../app/indoor-project/progressive-delivery";
import { readProgressiveRoutingParts } from "../../app/indoor-project/progressive-routing-parts";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  captureAuthorizedBaselineVisualReview,
  checkedVisualReviewRebind,
  applyAndInspectCandidateVisualData,
  inspectGreenVisualTargets,
  assertVisualOnlyDecoration,
  visualJsonSha256,
  type PaintReview,
} from "./candidate-visual-data-checks";

const args = process.argv.slice(2),
  get = (flag: string) => {
    const i = args.indexOf(flag);
    return i < 0 ? undefined : args[i + 1];
  };
const usage =
  "node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/audit-candidate-visual-data.ts --baseline-directory OLD-PROGRESSIVE --baseline-review OLD-BOUND-REVIEW.json --candidate-directory NEW-PROGRESSIVE --candidate-qa FRESH-QA/candidate-regression-report.json --scope 1450417,311,1487816 --out NEW-DIRECTORY [--candidate-review CHECKED-PROPOSED-REVIEW.json] [--baseline-scope 1450417,311,1487816]; baseline evidence only: omit candidate arguments and add --capture-baseline-only";
if (args.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
const baselineDirectory = get("--baseline-directory"),
  baselineReviewPath = get("--baseline-review"),
  candidateDirectory = get("--candidate-directory"),
  qaPath = get("--candidate-qa"),
  scopeText = get("--scope"),
  out = get("--out");
const baselineOnly = args.includes("--capture-baseline-only");
assert(baselineDirectory && baselineReviewPath && scopeText && out, usage);
if (!baselineOnly) assert(candidateDirectory && qaPath, usage);
assert(/^\d+(?:,\d+)*$/.test(scopeText));
const levels = scopeText.split(",").map(Number);
const json = async (file: string) =>
  JSON.parse(await fs.readFile(file, "utf8"));
const baselineScopeText = get("--baseline-scope") ?? scopeText;
assert(/^\d+(?:,\d+)*$/.test(baselineScopeText));
const baselineLevels = baselineScopeText.split(",").map(Number);
async function checkedView(
  directory: string,
  expectedEngine?: string,
  selectedLevels = levels,
) {
  const manifest = (await json(
    path.join(directory, "manifest.json"),
  )) as ProgressiveManifest;
  validateProgressiveManifest(manifest, expectedEngine);
  const scopes = manifest.scopes.filter(
    (s) => JSON.stringify(s.levelIds) === JSON.stringify(selectedLevels),
  );
  assert.equal(scopes.length, 1, "Choose one exact existing display scope");
  const scope = scopes[0];
  const read = async (id: string) => {
    const asset = manifest.assets[id];
    assert(asset);
    const representation = asset.representations.find(
      (r) => r.encoding === "gzip",
    );
    assert(representation, "Checked gzip representation missing");
    const load = async (relative: string) => {
      const p = path.resolve(directory, relative);
      assert(p.startsWith(path.resolve(directory) + path.sep));
      return new Uint8Array(await fs.readFile(p));
    };
    const stored = representation.parts
      ? await readProgressiveRoutingParts(representation, (part) =>
          load(part.path),
        )
      : await load(representation.path);
    assert.equal(stored.length, representation.bytes);
    assert.equal(progressiveSha256(stored), representation.sha256);
    const logical = new Uint8Array(
      gunzipSync(stored, { maxOutputLength: asset.logicalBytes }),
    );
    verifyProgressiveAssetBytes(asset, logical);
    return logical;
  };
  const data = JSON.parse(
    new TextDecoder("utf8", { fatal: true }).decode(
      await read(manifest.routeAssetId),
    ),
  ) as IndoorDataset;
  assert.equal(data.source.modelSha256, manifest.provenance.source.modelSha256);
  const payload = await decodeProgressiveFloor(manifest, scope, read),
    overview = JSON.parse(
      new TextDecoder("utf8", { fatal: true }).decode(
        await read(scope.overviewAssetId),
      ),
    ) as ProgressiveOverview;
  assert.deepEqual(overview.binding, scope.display.descriptor.binding);
  return { data, payload, overview, manifest, scope };
}
await fs.mkdir(out, { recursive: false });
const oldReview = (await json(baselineReviewPath)) as PaintReview;
let prior: Awaited<ReturnType<typeof checkedView>> | undefined =
  await checkedView(baselineDirectory, oldReview.engineSha256, baselineLevels);
const baseline = captureAuthorizedBaselineVisualReview(
  prior.data,
  prior.payload,
  prior.manifest,
  prior.scope,
  oldReview,
);
await fs.writeFile(
  path.join(out, "baseline-visual-local-evidence.json"),
  JSON.stringify(baseline, null, 2) + "\n",
  { flag: "wx" },
);
if (baselineOnly) {
  const painted = applyPublishedCirculationPaint(
    prior.payload,
    prior.manifest,
    prior.scope,
    oldReview,
  );
  const small = applyPublishedOverviewCirculationPaint(
    prior.overview,
    prior.manifest,
    prior.scope,
    oldReview,
  );
  assertVisualOnlyDecoration(prior.payload, painted);
  assertVisualOnlyDecoration(prior.overview, small);
  const targets = inspectGreenVisualTargets(prior.data, painted, small);
  await fs.writeFile(
    path.join(out, "baseline-visual-anchor-checks.json"),
    JSON.stringify(
      {
        targets,
        passed: targets.every((t) => t.passed),
        browserProof: false,
        limits:
          "Historical prepared data under its authorized visual review. No fresh candidate, source or navigation approval.",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
}
prior = undefined;
globalThis.gc?.();
if (baselineOnly) {
  if (JSON.stringify(levels) !== JSON.stringify(baselineLevels)) {
    const extra = await checkedView(baselineDirectory, oldReview.engineSha256);
    const checked = checkedVisualReviewRebind(
      baseline,
      extra.data,
      extra.payload,
      extra.manifest,
      extra.scope,
    );
    assert(
      checked.eligible && checked.proposedDisplayOnlyReview,
      "Historical comparison scope changed local source/face geometry",
    );
    const painted = applyPublishedCirculationPaint(
      extra.payload,
      extra.manifest,
      extra.scope,
      checked.proposedDisplayOnlyReview,
    );
    const small = applyPublishedOverviewCirculationPaint(
      extra.overview,
      extra.manifest,
      extra.scope,
      checked.proposedDisplayOnlyReview,
    );
    assertVisualOnlyDecoration(extra.payload, painted);
    assertVisualOnlyDecoration(extra.overview, small);
    const targets = inspectGreenVisualTargets(extra.data, painted, small);
    await fs.writeFile(
      path.join(out, "baseline-comparison-scope-checks.json"),
      JSON.stringify(
        {
          scope: extra.scope.id,
          levelIds: levels,
          checked,
          targets,
          passed: targets.every((t) => t.passed),
          browserProof: false,
          limits:
            "Historical comparison scope with independently equal local source and exact native faces. No publication pin installed or source/navigation approval granted.",
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
  }
  console.log(
    JSON.stringify({
      baselineCaptured: true,
      out: path.resolve(out),
      sourceOrNavigationApprovalGranted: false,
    }),
  );
  process.exit(0);
}
assert(candidateDirectory && qaPath, usage);
const qa = await json(qaPath);
assert.equal(qa.passed, true, "Fresh full candidate QA has not passed");
assert.equal(qa.sourceDatasetUnchanged, true);
const current = await checkedView(candidateDirectory);
assert.equal(
  current.manifest.provenance.packageSha256,
  qa.candidatePackageSha256,
  "Delivery is not the tested candidate package",
);
assert.equal(
  current.manifest.assets[current.manifest.routeAssetId].logicalSha256,
  qa.candidateRoutingProjectionSha256,
  "Routing/source records differ from tested candidate",
);
assert.equal(
  qa.selectedDisplayPreparation?.datasetSha256,
  current.manifest.provenance.datasetSha256,
  "Fresh selected-scope source preparation belongs to another dataset",
);
const sourceBefore = visualJsonSha256(current.data),
  rebind = checkedVisualReviewRebind(
    baseline,
    current.data,
    current.payload,
    current.manifest,
    current.scope,
  );
await fs.writeFile(
  path.join(out, "checked-visual-rebind-report.json"),
  JSON.stringify(rebind, null, 2) + "\n",
  { flag: "wx" },
);
if (rebind.proposedDisplayOnlyReview)
  await fs.writeFile(
    path.join(out, "proposed-circulation-paint-review.json"),
    JSON.stringify(rebind.proposedDisplayOnlyReview, null, 2) + "\n",
    { flag: "wx" },
  );
const reviewPath = get("--candidate-review");
let review: PaintReview = PUBLISHED_CIRCULATION_PAINT_REVIEW;
if (reviewPath) {
  assert(
    rebind.eligible,
    "Source/geometry evidence no longer supports the prior paint decision",
  );
  review = await json(reviewPath);
  assert.deepEqual(
    review,
    rebind.proposedDisplayOnlyReview,
    "Review is not the exact checked local-geometry rebind",
  );
}
const result = applyAndInspectCandidateVisualData(
  current.data,
  current.payload,
  current.overview,
  current.manifest,
  current.scope,
  review,
);
assert.equal(
  visualJsonSha256(current.data),
  sourceBefore,
  "Visual QA changed source or navigation data",
);
const report = {
  format: "unbc-fresh-candidate-visual-data-regression-v1",
  candidateQaPath: path.resolve(qaPath),
  candidateQaSha256: progressiveSha256(
    new Uint8Array(await fs.readFile(qaPath)),
  ),
  candidatePackageSha256: qa.candidatePackageSha256,
  manifestRevisionSha256: current.manifest.revisionSha256,
  datasetSha256: current.manifest.provenance.datasetSha256,
  engineSha256: current.manifest.provenance.enginePreparationSha256,
  scope: {
    id: current.scope.id,
    label: current.scope.label,
    levelIds: current.scope.levelIds,
  },
  preparedLogicalSha256: current.scope.display.descriptor.logicalJsonSha256,
  checkedReviewRebindEligible: rebind.eligible,
  paintReviewUsed: reviewPath
    ? path.resolve(reviewPath)
    : "current built-in publication review",
  ...result,
  limits:
    "Checked source records, exact local face equality for rebind, immutable paint-only decoration and actual prepared/overview geometry samples. No browser screenshot, WebGL occlusion, current access classification or navigation approval is granted.",
};
await fs.writeFile(
  path.join(out, "candidate-visual-data-report.json"),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    passed: report.passed,
    scope: current.scope.label,
    rebindEligible: rebind.eligible,
    failedTargets: report.targets.filter((t) => !t.passed).map((t) => t.label),
    out: path.resolve(out),
  }),
);
if (!report.passed) process.exitCode = 1;
