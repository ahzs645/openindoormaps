/** Lossless transport sharing. The original logical plan remains the pin. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "fflate";
import {
  encodePublishedVisitorPlanDelta,
  restorePublishedVisitorPlanDelta,
} from "../../app/indoor-project/published-visitor-plan-delta";
import type {
  PublishedVisitorPlan,
  PublishedVisitorPlanReceipt,
} from "../../app/indoor-project/published-visitor-plan-types";

type CandidateReceipt = Omit<PublishedVisitorPlanReceipt, "runtimeSha256">;
const sha = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

export async function optimizePublishedVisitorPlanCarriers<
  Row extends { receipt: CandidateReceipt },
>(directory: string, rows: Row[]) {
  const plans = new Map<string, PublishedVisitorPlan>();
  const originalBytes = rows.reduce(
    (sum, row) => sum + row.receipt.compressedBytes,
    0,
  );
  for (const row of rows) {
    const receipt = row.receipt;
    assert(!receipt.delta, "Optimize only independently produced full plans");
    const stored = await fs.readFile(
      path.join(directory, receipt.compressedSha256 + ".json.gz"),
    );
    assert.equal(stored.length, receipt.compressedBytes);
    assert.equal(sha(stored), receipt.compressedSha256);
    const logical = gunzipSync(stored);
    assert.equal(logical.length, receipt.logicalBytes);
    assert.equal(sha(logical), receipt.logicalSha256);
    plans.set(receipt.scopeId, JSON.parse(new TextDecoder().decode(logical)));
  }
  const contains = (base: PublishedVisitorPlan, plan: PublishedVisitorPlan) =>
    base.levelIds.length > plan.levelIds.length &&
    plan.levelIds.every((id) => base.levelIds.includes(id)) &&
    base.revisionSha256 === plan.revisionSha256 &&
    base.engineSha256 === plan.engineSha256 &&
    base.datasetSha256 === plan.datasetSha256;
  // Maximal scopes remain full carriers. References never form chains/cycles.
  const bases = rows.filter(({ receipt }) => {
    const plan = plans.get(receipt.scopeId)!;
    return !rows.some((other) =>
      contains(plans.get(other.receipt.scopeId)!, plan),
    );
  });
  for (const row of rows) {
    const receipt = row.receipt;
    if (receipt.compressedBytes < 2 * 1024 * 1024) continue;
    const plan = plans.get(receipt.scopeId)!;
    let best:
      | { stored: Uint8Array; logical: Uint8Array; base: CandidateReceipt }
      | undefined;
    for (const candidate of bases) {
      const base = plans.get(candidate.receipt.scopeId)!;
      if (!contains(base, plan)) continue;
      const wire = encodePublishedVisitorPlanDelta(
        plan,
        base,
        candidate.receipt.logicalSha256,
      );
      const rebuilt = bytes(
        restorePublishedVisitorPlanDelta(
          wire,
          base,
          candidate.receipt.logicalSha256,
        ),
      );
      assert.equal(rebuilt.length, receipt.logicalBytes);
      assert.equal(
        sha(rebuilt),
        receipt.logicalSha256,
        "Every coordinate, property and order must reproduce the original plan bytes",
      );
      const logical = bytes(wire),
        stored = gzipSync(logical, { level: 9, mtime: 0 });
      // Sharing must save meaningful space and keep cold transfer within 20%.
      if (
        stored.length + 65_536 >= receipt.compressedBytes ||
        stored.length + candidate.receipt.compressedBytes >
          receipt.compressedBytes * 1.2
      )
        continue;
      if (!best || stored.length < best.stored.length)
        best = { stored, logical, base: candidate.receipt };
    }
    if (!best) continue;
    const oldName = receipt.compressedSha256 + ".json.gz";
    const digest = sha(best.stored),
      name = digest + ".json.gz";
    await fs.writeFile(path.join(directory, name), best.stored, { flag: "wx" });
    receipt.delta = {
      baseScopeId: best.base.scopeId,
      baseLogicalSha256: best.base.logicalSha256,
      logicalSha256: sha(best.logical),
      logicalBytes: best.logical.length,
    };
    receipt.compressedSha256 = digest;
    receipt.compressedBytes = best.stored.length;
    receipt.url = "/data/unbc-plans/" + name;
    if (
      !rows.some(
        (other) => other.receipt.compressedSha256 + ".json.gz" === oldName,
      )
    )
      await fs.unlink(path.join(directory, oldName));
  }
  const optimizedBytes = rows.reduce(
    (sum, row) => sum + row.receipt.compressedBytes,
    0,
  );
  return {
    originalBytes,
    optimizedBytes,
    savedBytes: originalBytes - optimizedBytes,
    deltaScopes: rows
      .filter((row) => row.receipt.delta)
      .map((row) => row.receipt.scopeId),
  };
}
