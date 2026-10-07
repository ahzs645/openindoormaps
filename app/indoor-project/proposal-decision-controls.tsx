import { useEffect, useMemo, useState } from "react";
import type { IndoorProject } from "./package";
import { isViewerProject } from "./package";
import type { EnclosureProposals } from "./enclosure-proposals";
import {
  proposalReply,
  saveProposalDecision,
  proposalDecisionExport,
  type ProposalDecision,
} from "./enclosure-proposal-decisions";
export function ProposalDecisionControls({
  project,
  catalog,
  roomKey,
  evidenceSha256,
  onApply,
}: {
  project: IndoorProject;
  catalog: EnclosureProposals;
  roomKey: string;
  evidenceSha256?: string;
  onApply: (p: IndoorProject) => void;
}) {
  const [notes, setNotes] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [copyText, setCopyText] = useState("");
  const state = useMemo(() => {
    try {
      return evidenceSha256
        ? { review: proposalReply(project, catalog, roomKey, evidenceSha256) }
        : { review: undefined };
    } catch (e) {
      return {
        error:
          e instanceof Error ? e.message : "Could not read proposal decisions.",
      };
    }
  }, [project, catalog, roomKey, evidenceSha256]);
  const review = state.review;
  useEffect(() => {
    setNotes(review?.reply?.notes ?? "");
  }, [roomKey, review?.reply?.notes]);
  useEffect(() => {
    setMessage("");
    setCopyText("");
  }, [roomKey]);
  const locked =
    busy ||
    isViewerProject(project) ||
    !evidenceSha256 ||
    catalog.evidenceSha256 !== evidenceSha256 ||
    review?.proposalCurrent !== true ||
    !!state.error;
  const save = async (decision: ProposalDecision) => {
    setBusy(true);
    try {
      onApply(
        await saveProposalDecision(
          project,
          catalog,
          roomKey,
          decision,
          notes,
          evidenceSha256!,
        ),
      );
      setMessage(
        "Decision saved with the project. Export the reviewed ZIP to keep it; this decision does not apply geometry.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save decision.");
    } finally {
      setBusy(false);
    }
  };
  const exportText = () =>
    JSON.stringify(
      proposalDecisionExport(project, catalog, evidenceSha256!),
      null,
      2,
    );
  return (
    <section aria-label="Proposal decision" className="enclosure-proposal">
      <h4>Review this proposal</h4>
      {review && !review.proposalCurrent && (
        <p>
          This historical proposal needs review against the current audit before
          recording a decision.
        </p>
      )}
      <p>
        {review?.status === "current"
          ? `Saved decision: ${review.reply!.decision === "accept" ? "Accepted" : review.reply!.decision === "reject" ? "Rejected" : "Needs evidence"}`
          : review?.status === "stale"
            ? "Earlier decision needs review against this evidence."
            : "No decision saved yet."}
      </p>
      {!!review && review.roomKeys.length > 1 && (
        <p>
          One shared patch decision covers{" "}
          {review.roomKeys
            .map(
              (k) =>
                project.dataset.records.find((r) => r.key === k)?.number ?? k,
            )
            .join(" / ")}
          .
        </p>
      )}
      <label>
        Your reason (optional)
        <textarea
          aria-label="Proposal decision notes"
          value={notes}
          maxLength={10000}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="enclosure-actions">
        {(["accept", "reject", "needs-evidence"] as const).map((v) => (
          <button key={v} disabled={locked} onClick={() => void save(v)}>
            {v === "accept"
              ? "Accept proposal"
              : v === "reject"
                ? "Reject proposal"
                : "Needs more evidence"}
          </button>
        ))}
      </div>
      <p>
        Acceptance records your choice for the reviewing agent. Applying the
        physical patch and regenerating rooms and routes are separate steps.
      </p>
      <div className="enclosure-actions">
        <button
          disabled={busy || !evidenceSha256 || !!state.error}
          onClick={async () => {
            try {
              const text = exportText();
              await navigator.clipboard.writeText(text);
              setMessage(
                "Proposal decisions copied. Paste them into this chat.",
              );
            } catch {
              try {
                setCopyText(exportText());
                setMessage(
                  "Copy the decision text below and paste it into this chat.",
                );
              } catch (e) {
                setMessage(
                  e instanceof Error
                    ? e.message
                    : "Could not export decisions.",
                );
              }
            }
          }}
        >
          Copy proposal decisions
        </button>
        <button
          disabled={busy || !evidenceSha256 || !!state.error}
          onClick={() => {
            try {
              const url = URL.createObjectURL(
                  new Blob([exportText()], { type: "application/json" }),
                ),
                a = document.createElement("a");
              a.href = url;
              a.download = "room-proposal-decisions.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setMessage(
                "Proposal decisions downloaded. Export reviewed project also includes them.",
              );
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "Could not export decisions.",
              );
            }
          }}
        >
          Download proposal decisions
        </button>
      </div>
      {copyText && (
        <textarea
          aria-label="Proposal decisions to copy"
          readOnly
          value={copyText}
        />
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
