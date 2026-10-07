import type { VolumeAudit, VolumeEntry } from "./volume-coverage";
import type { IndoorProject } from "./package";

export type EnclosureDecision =
  | "to-review"
  | "needs-correction"
  | "expected-shape"
  | "reviewed";
export const decisionLabels: Record<EnclosureDecision, string> = {
  "to-review": "To review",
  "needs-correction": "Needs correction",
  "expected-shape": "Expected shape",
  reviewed: "Reviewed",
};
export const decisionGuidance: Record<EnclosureDecision, string> = {
  "to-review":
    "Evidence is incomplete. Keep this in the review queue until walls, doors and slab support have been compared.",
  "needs-correction":
    "Record the specific boundary, grouping or classification change and the source evidence supporting it. Saving this decision does not apply the correction.",
  "expected-shape":
    "Use when the source confirms this shape or intentionally open/flat area. Explain why it is expected; a missing room block alone is not evidence.",
  reviewed:
    "Use after comparing native/source evidence and checking the intended display. This records the review; it does not repair geometry or admit a route.",
};
export const coverageLabels: Record<VolumeEntry["status"], string> = {
  "unsupported-room-enclosure": "Enclosure needs evidence",
  "mode-discrepancy": "Display differs between views",
  "intentional-flat": "Intentionally flat",
  "block-present": "Room block present",
};
export type EnclosureReview = {
  version: 1;
  records: Record<
    string,
    { evidenceSha256: string; decision: EnclosureDecision; notes: string }
  >;
};
export function validateEnclosureReviews(
  value: unknown,
): asserts value is EnclosureReview | undefined {
  if (value === undefined) return;
  const review = value as EnclosureReview;
  if (
    !review ||
    review.version !== 1 ||
    !review.records ||
    typeof review.records !== "object" ||
    Array.isArray(review.records) ||
    Object.keys(review.records).length > 50_000 ||
    Object.entries(review.records).some(
      ([key, r]) =>
        !key ||
        !r ||
        typeof r.evidenceSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(r.evidenceSha256) ||
        !Object.hasOwn(decisionLabels, r.decision) ||
        typeof r.notes !== "string" ||
        r.notes.length > 10_000,
    )
  )
    throw new Error(
      "Room enclosure reviews contain invalid decisions, notes or dataset bindings.",
    );
}
export type EnclosureItem = VolumeEntry & {
  scopes: {
    id: string;
    name: string;
    scope: string;
    status: VolumeEntry["status"];
  }[];
};
const priority = {
  "intentional-flat": 0,
  "block-present": 1,
  "unsupported-room-enclosure": 2,
  "mode-discrepancy": 3,
};
/** A place is counted once, including those visible in both campus/native scopes. */
export function enclosureItems(report: VolumeAudit): EnclosureItem[] {
  const items = new Map<string, EnclosureItem>();
  for (const view of report.views)
    for (const record of view.records) {
      const old = items.get(record.key);
      const scopes = [
        ...(old?.scopes ?? []),
        {
          id: view.id,
          name: view.name,
          scope: view.scope,
          status: record.status,
        },
      ];
      const chosen =
        old && priority[old.status] >= priority[record.status] ? old : record;
      items.set(record.key, { ...chosen, scopes });
    }
  return [...items.values()].sort(
    (a, b) =>
      a.building.localeCompare(b.building) ||
      a.nativeElevationFeet - b.nativeElevationFeet ||
      a.number.localeCompare(b.number, undefined, { numeric: true }),
  );
}
export const needsEnclosureEvidence = (item: EnclosureItem) =>
  item.status === "unsupported-room-enclosure" ||
  item.status === "mode-discrepancy";
/** Catalog rooms remain browsable even when raised or intentionally flat. */
export function enclosureProposalItems(
  items: EnclosureItem[],
  proposalKeys: ReadonlySet<string>,
): EnclosureItem[] {
  return items.filter((item) => proposalKeys.has(item.key));
}
export function currentEnclosureReview(
  project: IndoorProject,
  report: VolumeAudit,
  key: string,
) {
  const review = project.rooms.enclosureReviews?.records[key];
  return review?.evidenceSha256 === report.reviewEvidenceSha256
    ? review
    : undefined;
}
/** Exporting authoring notes changes roomsSha256, but not audited display/routing evidence. */
export const enclosureEvidenceText = (data: IndoorProject["dataset"]) =>
  JSON.stringify({
    ...data,
    source: { ...data.source, roomsSha256: "authoring-review-hash-excluded" },
  });
export function saveEnclosureReview(
  project: IndoorProject,
  report: VolumeAudit,
  key: string,
  decision: EnclosureDecision,
  notes: string,
): IndoorProject {
  if (!project.dataset.records.some((r) => r.key === key))
    throw new Error("Unknown room.");
  // Review decisions are authoring notes, never evidence that changes geometry/access/routes.
  return {
    ...project,
    rooms: {
      ...project.rooms,
      enclosureReviews: {
        version: 1,
        records: {
          ...project.rooms.enclosureReviews?.records,
          [key]: {
            evidenceSha256: report.reviewEvidenceSha256,
            decision,
            notes: notes.slice(0, 10_000),
          },
        },
      },
    },
  };
}
