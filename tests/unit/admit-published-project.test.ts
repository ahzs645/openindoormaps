import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFullNormalImport,
  publishedProjectReceiptsSource,
} from "../../scripts/indoor/admit-published-project";
import type { PublishedProjectReceipt } from "../../app/indoor-project/published-project";

const receipt = (id: string): PublishedProjectReceipt => ({
  id,
  packageSha256: "1".repeat(64),
  packageBytes: 10,
  validatorSha256: "2".repeat(64),
  datasetSha256: "3".repeat(64),
  source: {
    modelFileName: "m.rvt",
    modelSha256: "4".repeat(64),
    roomsSha256: "5".repeat(64),
  },
  entries: { "manifest.json": { bytes: 1, sha256: "6".repeat(64) } },
  progressiveRevisionSha256: "7".repeat(64),
  validationReportSha256: "8".repeat(64),
  validationElapsedMs: 1,
  admission: "progressive-floors",
});
const current = readFileSync(
  new URL(
    "../../app/indoor-project/published-project-receipts.ts",
    import.meta.url,
  ),
  "utf8",
);
const evaluate = (source: string) =>
  new Function(
    source
      .replace(/^import type .*$/m, "")
      .replace("Object.freeze<PublishedProjectReceipt[]>(", "Object.freeze(")
      .replace(
        /export const PUBLISHED_PROJECT_RECEIPTS: readonly PublishedProjectReceipt\[\] =/,
        "const receipts =",
      ) + "\nreturn receipts;",
  )() as PublishedProjectReceipt[];

test("only a full normal import's stages admit a receipt", () => {
  assertFullNormalImport([
    "archive",
    "checksums",
    "decode",
    "companions",
    "geometry",
    "materials",
    "routes",
    "mapping",
    "reviews",
    "patches",
    "identity",
    "scene",
    "transfer",
  ]);
  // The compiled fast import (tryReadPublishedProject) skips validation.
  assert.throws(
    () =>
      assertFullNormalImport([
        "checksums",
        "archive",
        "decode",
        "identity",
        "transfer",
      ]),
    /geometry/,
  );
});
test("the generated trust root keeps existing receipts and replaces only the same id", () => {
  const before = evaluate(current);
  const first = publishedProjectReceiptsSource(current, receipt("floors-a"));
  assert(first.startsWith(current.slice(0, current.lastIndexOf("  ]);"))));
  assert.deepEqual(evaluate(first), [...before, receipt("floors-a")]);
  const replaced = {
    ...receipt("floors-a"),
    validationReportSha256: "9".repeat(64),
  };
  const second = publishedProjectReceiptsSource(first, replaced);
  assert.deepEqual(evaluate(second), [...before, replaced]);
  assert.throws(() =>
    publishedProjectReceiptsSource(current, {
      ...receipt("package"),
      admission: undefined,
    }),
  );
});
