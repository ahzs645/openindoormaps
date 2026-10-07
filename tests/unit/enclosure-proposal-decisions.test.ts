import assert from "node:assert/strict";
import test from "node:test";
import { gapProject } from "../fixtures/native-area-project";
import {
  deriveNativeAreas,
  saveNativeBoundaryPatches,
} from "../../app/indoor-project/native-area-review";
import {
  saveEnclosureProposals,
  type EnclosureProposals,
} from "../../app/indoor-project/enclosure-proposals";
import {
  saveProposalDecision,
  proposalReply,
  readProposalDecisions,
  proposalDecisionExport,
} from "../../app/indoor-project/enclosure-proposal-decisions";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
async function fixture() {
  let p = await gapProject();
  const trace = await deriveNativeAreas(p.dataset, 1, {
      manualGapPoints: [
        [15, 7.25],
        [15, 12.75],
      ],
    }),
    id = trace.gapCandidates!.find((c) => c.manualPointsFeet)!.id;
  p = await saveNativeBoundaryPatches(
    p,
    trace,
    [id],
    "Native partition evidence checked.",
    false,
  );
  const catalog: EnclosureProposals = {
    format: "openindoormaps-enclosure-proposals",
    version: 1,
    title: "Two room shared patch",
    modelSha256: p.dataset.source.modelSha256,
    evidenceSha256: "a".repeat(64),
    records: ["0", "1"].map((key) => ({
      key,
      cause: "Shared gap",
      solution: "Extend existing partition",
      confidence: "Measured",
      prerequisites: ["Check source"],
      relatedKeys: [key === "0" ? "1" : "0"],
      boundaryPatchIds: [id],
    })),
  };
  return { p: saveEnclosureProposals(p, catalog), catalog, id };
}
test("one accepted patch decision covers both affected rooms and stays portable authoring metadata", async () => {
  const { p, catalog } = await fixture(),
    before = JSON.stringify(p.dataset),
    source = structuredClone(p.files);
  const saved = await saveProposalDecision(
    p,
    catalog,
    "0",
    "accept",
    "Keep both doors.",
    catalog.evidenceSha256,
  );
  assert.equal(JSON.stringify(saved.dataset), before);
  assert.deepEqual(saved.files, source);
  assert.equal(
    proposalReply(saved, catalog, "1", catalog.evidenceSha256).reply!.decision,
    "accept",
  );
  assert.equal(readProposalDecisions(saved).decisions.length, 1);
  const reopened = await readIndoorProject(await exportIndoorProject(saved));
  assert.equal(
    proposalReply(reopened, catalog, "0", catalog.evidenceSha256).status,
    "current",
  );
  assert.equal(
    proposalDecisionExport(reopened, catalog, catalog.evidenceSha256).decisions
      .decisions.length,
    1,
  );
  const viewer = await readIndoorProject(await exportCampusViewer(saved));
  assert.equal(viewer.rooms.reviewBundle, undefined);
});
test("changed evidence, solution or exact patch invalidates acceptance; reject replaces the shared response", async () => {
  const { p, catalog } = await fixture(),
    saved = await saveProposalDecision(
      p,
      catalog,
      "0",
      "accept",
      "",
      catalog.evidenceSha256,
    );
  assert.equal(
    proposalReply(saved, catalog, "1", "b".repeat(64)).status,
    "stale",
  );
  const changed = structuredClone(catalog);
  changed.records[1].solution += " changed";
  assert.equal(
    proposalReply(saved, changed, "0", catalog.evidenceSha256).status,
    "stale",
  );
  saved.rooms.nativeBoundaryPatches!.patches[0].ringsFeet[0][0][0] += 0.01;
  assert.equal(
    proposalReply(saved, catalog, "1", catalog.evidenceSha256).status,
    "stale",
  );
  await assert.rejects(
    saveProposalDecision(saved, catalog, "0", "accept", "", "b".repeat(64)),
    /Re-audit/,
  );
  saved.rooms.nativeBoundaryPatches!.patches[0].ringsFeet[0][0][0] -= 0.01;
  const rejected = await saveProposalDecision(
    saved,
    catalog,
    "1",
    "reject",
    "Further evidence needed.",
    catalog.evidenceSha256,
  );
  assert.equal(readProposalDecisions(rejected).decisions.length, 1);
  assert.equal(
    proposalReply(rejected, catalog, "0", catalog.evidenceSha256).reply!
      .decision,
    "reject",
  );
});
test("text-only proposals remain per-room and missing patch/model bindings fail closed", async () => {
  const { p, catalog, id } = await fixture();
  delete catalog.records[0].boundaryPatchIds;
  delete catalog.records[1].boundaryPatchIds;
  const saved = await saveProposalDecision(
    p,
    catalog,
    "0",
    "needs-evidence",
    "Missing native facade.",
    catalog.evidenceSha256,
  );
  assert.equal(
    proposalReply(saved, catalog, "1", catalog.evidenceSha256).status,
    "unanswered",
  );
  catalog.records[0].boundaryPatchIds = [id];
  p.rooms.nativeBoundaryPatches!.patches = [];
  await assert.rejects(
    saveProposalDecision(p, catalog, "0", "accept", "", catalog.evidenceSha256),
    /missing/,
  );
  catalog.modelSha256 = "c".repeat(64);
  await assert.rejects(
    saveProposalDecision(
      saved,
      catalog,
      "0",
      "accept",
      "",
      catalog.evidenceSha256,
    ),
    /model/,
  );
});

test("mixed catalogs retain historical record bindings without sharing a fresh patch approval", async () => {
  const { p, catalog } = await fixture();
  catalog.records[1].evidenceSha256 = "b".repeat(64);
  const saved = await saveProposalDecision(
    p,
    catalog,
    "0",
    "accept",
    "Current room evidence checked.",
    catalog.evidenceSha256,
  );
  const current = proposalReply(saved, catalog, "0", catalog.evidenceSha256);
  assert.equal(current.proposalCurrent, true);
  assert.equal(current.status, "current");
  assert.deepEqual(current.roomKeys, ["0"]);
  const historical = proposalReply(saved, catalog, "1", catalog.evidenceSha256);
  assert.equal(historical.proposalCurrent, false);
  assert.equal(historical.status, "stale");
  assert.deepEqual(historical.roomKeys, ["1"]);
  await assert.rejects(
    saveProposalDecision(
      saved,
      catalog,
      "1",
      "accept",
      "",
      catalog.evidenceSha256,
    ),
    /Re-audit/,
  );
  const exported = proposalDecisionExport(
    saved,
    catalog,
    catalog.evidenceSha256,
  );
  assert.equal(exported.proposals[0].proposalCurrent, true);
  assert.equal(exported.proposals[1].proposalCurrent, false);
  const reopened = await readIndoorProject(await exportIndoorProject(saved));
  assert.equal(
    reopened.rooms.enclosureProposals!.records[1].evidenceSha256,
    "b".repeat(64),
  );
  assert.equal(
    proposalReply(reopened, catalog, "1", catalog.evidenceSha256).status,
    "stale",
  );
});

test("record bindings cannot override a stale catalog or contain malformed hashes", async () => {
  const { p, catalog } = await fixture();
  catalog.records[0].evidenceSha256 = "b".repeat(64);
  await assert.rejects(
    saveProposalDecision(p, catalog, "0", "accept", "", "b".repeat(64)),
    /Re-audit/,
  );
  catalog.records[0].evidenceSha256 = "invalid";
  assert.throws(() => saveEnclosureProposals(p, catalog), /evidence binding/);
});
