import { useEffect, useMemo, useState, useRef } from "react";
import type { IndoorProject } from "./package";
import type { PinComparisonResult } from "./pin-comparison";
import type { PinDecision } from "./pin-recommendations";
import { pinRecommendations } from "./pin-recommendations";
import {
  matchingPatchDecision,
  patchEvidenceHash,
  readPinPatchDecisions,
  savePinPatchDecision,
  type PinPatchDecision,
} from "./pin-patch-decisions";
export function PinPatchReview({
  project,
  entry,
  geometrySha256,
  selectedPatchId,
  acceptedView,
  comparison,
  locked,
  onApply,
  onSelect,
  onAccepted,
  onBusyChange,
}: {
  project: IndoorProject;
  entry: ReturnType<typeof pinRecommendations>[number];
  geometrySha256?: string;
  selectedPatchId?: string;
  acceptedView: boolean;
  comparison?: PinComparisonResult;
  locked: boolean;
  onApply: (p: IndoorProject) => void;
  onSelect: (id?: string) => void;
  onAccepted: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const live = useRef({ project, active: true });
  live.current.project = project;
  useEffect(() => {
    live.current.active = true;
    return () => {
      live.current.active = false;
    };
  }, []);
  const r = entry.recommendation;
  const patches = project.rooms.nativeBoundaryPatches?.patches;
  const [binding, setBinding] = useState<{
    source: typeof patches;
    hashes: Record<string, string>;
  }>();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setBinding(undefined);
    void Promise.all(
      (patches ?? []).map(
        async (p) => [p.id, await patchEvidenceHash(p)] as const,
      ),
    ).then((values) => {
      if (active)
        setBinding({ source: patches, hashes: Object.fromEntries(values) });
    });
    return () => {
      active = false;
    };
  }, [patches]);
  const decisions = useMemo(
    () => readPinPatchDecisions(project),
    [project.rooms.reviewBundle, project.dataset.source.modelSha256],
  );
  const hashes = binding && binding.source === patches ? binding.hashes : {};
  const current = (id: string) =>
    matchingPatchDecision(
      decisions.decisions,
      r.id,
      id,
      entry.evidenceSha256,
      geometrySha256,
      hashes[id],
    );
  const accepted = r.patchIds.filter(
    (id) => current(id)?.decision === "accept",
  ).length;
  const reviewed = r.patchIds.filter((id) => !!current(id)).length;
  if (!r.patchIds.length) return null;
  return (
    <fieldset aria-label="Review patches one by one">
      <legend>Review patches one by one</legend>
      <p>
        {reviewed} of {r.patchIds.length} patches reviewed · {accepted}{" "}
        accepted.
      </p>
      <p>
        Compare the current map and updated selection, record this patch’s
        decision, then continue. Acceptance saves a review decision; geometry
        and directions remain unchanged.
      </p>
      {r.patchIds.map((id, i) => (
        <PatchAnswer
          key={`${id}:${hashes[id] ?? "checking"}:${geometrySha256 ?? "checking"}`}
          id={id}
          index={i}
          total={r.patchIds.length}
          hidden={acceptedView || selectedPatchId !== id}
          saved={current(id)}
          stale={
            !!geometrySha256 &&
            !!hashes[id] &&
            !current(id) &&
            decisions.decisions.some(
              (d) => d.recommendationId === r.id && d.patchId === id,
            )
          }
          locked={locked || busy || !entry.current || !hashes[id]}
          canAccept={
            !!comparison?.updated &&
            comparison.patches.length === 1 &&
            comparison.patches[0].id === id
          }
          onSave={async (decision, notes, next) => {
            setBusy(true);
            onBusyChange(true);
            try {
              const updated = await savePinPatchDecision(
                project,
                r.id,
                id,
                decision,
                notes ||
                  {
                    accept: "Accepted after reviewing this patch preview.",
                    reject: "Rejected in per-patch review.",
                    "more-evidence":
                      "More source evidence requested in per-patch review.",
                  }[decision],
                geometrySha256,
              );
              if (!live.current.active || live.current.project !== project)
                throw new Error(
                  "The project changed while saving. Reopen this patch on the current project before reviewing it.",
                );
              onApply(updated);
              setMessage(
                `Patch ${i + 1}: ${decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : "needs evidence"}. Export reviewed project to retain this decision.`,
              );
              if (next && i + 1 < r.patchIds.length)
                onSelect(r.patchIds[i + 1]);
            } catch (e) {
              setMessage(String(e));
            } finally {
              setBusy(false);
              onBusyChange(false);
            }
          }}
        />
      ))}
      {(acceptedView || !selectedPatchId) && (
        <p>Choose an individual patch in Patch scope to record its decision.</p>
      )}
      <button
        disabled={!accepted || busy || locked || !entry.current}
        aria-pressed={acceptedView}
        onClick={onAccepted}
      >
        Preview accepted patches ({accepted})
      </button>
      {acceptedView && (
        <p>
          Only current accepted patches are included in this preview. Rejected,
          unanswered and stale decisions are excluded.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
function PatchAnswer({
  id,
  index,
  total,
  hidden,
  saved,
  locked,
  canAccept,
  stale,
  onSave,
}: {
  id: string;
  index: number;
  total: number;
  hidden: boolean;
  saved?: PinPatchDecision;
  locked: boolean;
  canAccept: boolean;
  stale: boolean;
  onSave: (
    d: PinDecision["decision"],
    notes: string,
    next: boolean,
  ) => Promise<void>;
}) {
  const [notes, setNotes] = useState(saved?.notes ?? ""),
    [next, setNext] = useState(true);
  return (
    <div hidden={hidden}>
      <p>
        Patch {index + 1} of {total} ·{" "}
        {saved?.decision === "accept"
          ? "Accepted"
          : saved?.decision === "reject"
            ? "Rejected"
            : saved
              ? "Needs evidence"
              : "Not reviewed"}
      </p>
      {stale && (
        <p>
          Saved decision needs re-review because this patch, its evidence or the
          dataset has changed.
        </p>
      )}
      <label>
        Patch review note (optional)
        <textarea
          aria-label={`Patch note ${id}`}
          maxLength={4000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={locked}
        />
      </label>
      {index + 1 < total && (
        <label>
          <input
            type="checkbox"
            checked={next}
            onChange={(e) => setNext(e.target.checked)}
          />
          Move to next patch after saving
        </label>
      )}
      <div className="pin-review-actions">
        <button
          disabled={locked || !canAccept}
          onClick={() => void onSave("accept", notes, next)}
        >
          Accept patch{next && index + 1 < total ? " and next" : ""}
        </button>
        <button
          disabled={locked}
          onClick={() => void onSave("reject", notes, next)}
        >
          Reject patch{next && index + 1 < total ? " and next" : ""}
        </button>
        <button
          disabled={locked}
          onClick={() => void onSave("more-evidence", notes, next)}
        >
          Needs evidence{next && index + 1 < total ? " and next" : ""}
        </button>
      </div>
    </div>
  );
}
