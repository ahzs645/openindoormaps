import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { IndoorProject } from "./package";
import { isViewerProject } from "./package";
import type { EnclosureProposals } from "./enclosure-proposals";
import {
  saveEnclosureProposals,
  validateEnclosureProposals,
  proposalRecordIsCurrent,
} from "./enclosure-proposals";
import { saveReviewCompanion } from "./review-companion-save";
import { reviewFileBytes } from "./review-bundle";
export const proposalDecisionPath = "room-review/proposal-decisions.json";
export type ProposalDecision = "accept" | "reject" | "needs-evidence";
type Reply = {
  id: string;
  roomKeys: string[];
  patchIds: string[];
  decision: ProposalDecision;
  notes: string;
  evidenceSha256: string;
};
export type ProposalDecisions = {
  format: "openindoormaps-room-proposal-decisions";
  version: 1;
  modelSha256: string;
  decisions: Reply[];
};
const digest = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));
const validHash = (v: unknown) =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function readProposalDecisions(
  project: IndoorProject,
): ProposalDecisions {
  const file = project.rooms.reviewBundle?.files.find(
    (f) => f.path === proposalDecisionPath,
  );
  if (!file)
    return {
      format: "openindoormaps-room-proposal-decisions",
      version: 1,
      modelSha256: project.dataset.source.modelSha256,
      decisions: [],
    };
  const p = JSON.parse(
    new TextDecoder().decode(reviewFileBytes(file)),
  ) as ProposalDecisions;
  const strings = (v: unknown) =>
    Array.isArray(v) &&
    v.length <= 1000 &&
    v.every((s) => typeof s === "string" && s.length > 0 && s.length <= 200) &&
    new Set(v).size === v.length;
  if (
    p.format !== "openindoormaps-room-proposal-decisions" ||
    p.version !== 1 ||
    !validHash(p.modelSha256) ||
    !Array.isArray(p.decisions) ||
    p.decisions.length > 50000 ||
    new Set(p.decisions.map((r) => r.id)).size !== p.decisions.length ||
    p.decisions.some(
      (r) =>
        !r ||
        !validHash(r.id) ||
        !validHash(r.evidenceSha256) ||
        !strings(r.roomKeys) ||
        !r.roomKeys.length ||
        !strings(r.patchIds) ||
        !["accept", "reject", "needs-evidence"].includes(r.decision) ||
        typeof r.notes !== "string" ||
        r.notes.length > 10000,
    )
  )
    throw new Error("Invalid room proposal decisions.");
  return p;
}
function descriptor(
  project: IndoorProject,
  catalog: EnclosureProposals,
  key: string,
  currentEvidenceSha256: string,
) {
  validateEnclosureProposals(catalog);
  if (
    catalog.modelSha256 !== project.dataset.source.modelSha256 ||
    !validHash(currentEvidenceSha256)
  )
    throw new Error(
      "Proposal model or audit evidence does not match this project.",
    );
  const record = catalog.records.find((r) => r.key === key);
  if (!record)
    throw new Error("Select a room proposal before recording a decision.");
  const patchIds = [...(record.boundaryPatchIds ?? [])].sort();
  const recordEvidenceSha256 = record.evidenceSha256 ?? catalog.evidenceSha256;
  const group = patchIds.length
    ? catalog.records.filter(
        (r) =>
          (r.evidenceSha256 ?? catalog.evidenceSha256) ===
            recordEvidenceSha256 &&
          JSON.stringify([...(r.boundaryPatchIds ?? [])].sort()) ===
            JSON.stringify(patchIds),
      )
    : [record];
  const roomKeys = group.map((r) => r.key).sort(),
    patches = patchIds.map((id) => {
      const p = project.rooms.nativeBoundaryPatches?.patches.find(
        (p) => p.id === id,
      );
      if (!p) throw new Error("A referenced proposal patch is missing.");
      return p;
    });
  return {
    id: digest([
      catalog.modelSha256,
      patchIds.length ? ["patches", patchIds] : ["room", key],
    ]),
    roomKeys,
    patchIds,
    proposalCurrent: proposalRecordIsCurrent(
      catalog,
      record,
      currentEvidenceSha256,
    ),
    evidenceSha256: digest([
      catalog.modelSha256,
      recordEvidenceSha256,
      currentEvidenceSha256,
      [...group].sort((a, b) => a.key.localeCompare(b.key)),
      patches,
    ]),
  };
}
export function proposalReply(
  project: IndoorProject,
  catalog: EnclosureProposals,
  key: string,
  currentEvidenceSha256: string,
) {
  const evidence = descriptor(project, catalog, key, currentEvidenceSha256),
    responses = readProposalDecisions(project),
    reply = responses.decisions.find((r) => r.id === evidence.id);
  return {
    ...evidence,
    reply,
    status: reply
      ? responses.modelSha256 === catalog.modelSha256 &&
        evidence.proposalCurrent &&
        reply.evidenceSha256 === evidence.evidenceSha256
        ? "current"
        : "stale"
      : "unanswered",
  } as const;
}
export async function saveProposalDecision(
  project: IndoorProject,
  catalog: EnclosureProposals,
  key: string,
  decision: ProposalDecision,
  notes: string,
  currentEvidenceSha256: string,
) {
  if (isViewerProject(project))
    throw new Error("Import the master ZIP to save proposal decisions.");
  const record = catalog.records.find((r) => r.key === key);
  if (
    record &&
    !proposalRecordIsCurrent(catalog, record, currentEvidenceSha256)
  )
    throw new Error(
      "Re-audit this proposal against current geometry before accepting it.",
    );
  if (
    !["accept", "reject", "needs-evidence"].includes(decision) ||
    notes.length > 10000
  )
    throw new Error("Invalid proposal decision or notes.");
  const e = descriptor(project, catalog, key, currentEvidenceSha256),
    old = readProposalDecisions(project);
  if (old.modelSha256 !== project.dataset.source.modelSha256)
    throw new Error("Saved decisions belong to another model.");
  return saveReviewCompanion(
    saveEnclosureProposals(project, catalog),
    proposalDecisionPath,
    {
      ...old,
      decisions: [
        ...old.decisions.filter((r) => r.id !== e.id),
        {
          id: e.id,
          roomKeys: e.roomKeys,
          patchIds: e.patchIds,
          evidenceSha256: e.evidenceSha256,
          decision,
          notes,
        },
      ],
    },
  );
}
export function proposalDecisionExport(
  project: IndoorProject,
  catalog: EnclosureProposals,
  currentEvidenceSha256: string,
) {
  const replies = catalog.records.map((record) => ({
    ...record,
    ...proposalReply(project, catalog, record.key, currentEvidenceSha256),
  }));
  return {
    format: "openindoormaps-room-proposal-review",
    version: 1,
    modelSha256: catalog.modelSha256,
    auditEvidenceSha256: currentEvidenceSha256,
    decisions: readProposalDecisions(project),
    proposals: replies,
  };
}
