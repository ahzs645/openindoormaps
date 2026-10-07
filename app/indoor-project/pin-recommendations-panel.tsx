import { PatchComparisonLegend } from "./patch-comparison-legend";
import { PinPatchReview } from "./pin-patch-review";
import { readPinPatchDecisions } from "./pin-patch-decisions";
import { useEffect, useMemo, useState } from "react";
import type { IndoorProject } from "./package";
import {
  pinRecommendations,
  readPinDecisions,
  savePinDecision,
  type PinDecision,
  type PinRecommendation,
} from "./pin-recommendations";
import type { PinComparisonMode, PinComparisonResult } from "./pin-comparison";
export function PinRecommendationsPanel({
  project,
  locked,
  onApply,
  onLocate,
  activeId,
  onSelect,
  onCompare,
  mode,
  comparison,
  comparisonStatus,
  selectedPatchId,
  onPatchSelect,
  acceptedView,
  onAccepted,
}: {
  project: IndoorProject;
  locked: boolean;
  onApply: (p: IndoorProject) => void;
  onLocate: (id: string) => void;
  activeId?: string;
  onSelect: (r: PinRecommendation) => void;
  onCompare: (mode: PinComparisonMode) => void;
  mode: PinComparisonMode;
  comparison?: PinComparisonResult;
  comparisonStatus: string;
  selectedPatchId?: string;
  onPatchSelect: (id?: string) => void;
  acceptedView: boolean;
  onAccepted: () => void;
}) {
  const [binding, setBinding] = useState<{
    data: IndoorProject["dataset"];
    hash: string;
  }>();
  useEffect(() => {
    setBinding(undefined);
    const worker = new Worker(
      new URL("./pin-recommendations.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({ data }) =>
      setBinding({ data: project.dataset, hash: data.geometrySha256 });
    worker.postMessage(project.dataset);
    return () => worker.terminate();
  }, [project.dataset]);
  const geometrySha256 =
    binding?.data === project.dataset ? binding.hash : undefined;
  const entries = useMemo(
    () => pinRecommendations(project, geometrySha256),
    [project.rooms.reviewBundle, geometrySha256, project.rooms.reviewPins],
  );
  const decisions = useMemo(
    () => readPinDecisions(project),
    [project.rooms.reviewBundle, project.dataset.source],
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [copyText, setCopyText] = useState("");
  const chosen = entries.find((e) => e.recommendation.id === activeId),
    index = entries.indexOf(chosen!);
  useEffect(() => {
    if (entries.length && !chosen) onSelect(entries[0].recommendation);
  }, [entries, chosen, onSelect]);
  if (!entries.length)
    return (
      <section className="pin-recommendations-panel">
        <h2>Pin recommendations</h2>
        <p>
          This project has no saved pin recommendations. Import the reviewed
          master ZIP with its companions.
        </p>
      </section>
    );
  const transfer = () =>
    JSON.stringify(
      {
        ...decisions,
        patchDecisions: readPinPatchDecisions(project).decisions,
        entries: entries.map((e) => ({
          ...e.recommendation,
          evidenceSha256: e.evidenceSha256,
          current: e.current,
        })),
      },
      null,
      2,
    );
  return (
    <section
      className="pin-recommendations-panel"
      aria-label="Pin recommendations"
    >
      <h2>Pin recommendations · {entries.length}</h2>
      <p>
        Select a recommendation, compare the map, then save your answer.
        Accepting records a decision; applying geometry is separate.
      </p>
      <label>
        Review recommendation
        <select
          disabled={locked || busy}
          aria-label="Review recommendation"
          value={chosen?.recommendation.id ?? ""}
          onChange={(e) => {
            const entry = entries.find(
              (r) => r.recommendation.id === e.target.value,
            );
            if (entry) onSelect(entry.recommendation);
          }}
        >
          <option value="" disabled>
            Choose a pin
          </option>
          {entries.map((e) => (
            <option key={e.recommendation.id} value={e.recommendation.id}>
              {e.recommendation.title} ·{" "}
              {decisions.decisions.some(
                (d) =>
                  d.recommendationId === e.recommendation.id &&
                  d.evidenceSha256 === e.evidenceSha256 &&
                  d.geometrySha256 === geometrySha256,
              )
                ? "answered"
                : "unanswered"}
            </option>
          ))}
        </select>
      </label>
      <div className="pin-review-actions">
        <button
          disabled={index <= 0 || locked || busy}
          onClick={() => onSelect(entries[index - 1].recommendation)}
        >
          Previous pin
        </button>
        <button
          disabled={index < 0 || index >= entries.length - 1 || locked || busy}
          onClick={() => onSelect(entries[index + 1].recommendation)}
        >
          Next pin
        </button>
      </div>
      {entries.map((e) => (
        <PinRecommendationRow
          data={project.dataset}
          key={`${e.recommendation.id}:${e.evidenceSha256}:${geometrySha256 ?? "checking"}`}
          hidden={e !== chosen}
          entry={e}
          saved={decisions.decisions.find(
            (d) =>
              d.recommendationId === e.recommendation.id &&
              d.evidenceSha256 === e.evidenceSha256 &&
              d.geometrySha256 === geometrySha256,
          )}
          locked={locked || busy}
          onLocate={() => onLocate(e.recommendation.pinId)}
          mode={mode}
          comparison={comparison}
          comparisonStatus={comparisonStatus}
          selectedPatchId={selectedPatchId}
          onPatchSelect={onPatchSelect}
          acceptedView={acceptedView}
          onAccepted={onAccepted}
          patchReview={
            <PinPatchReview
              project={project}
              entry={e}
              geometrySha256={geometrySha256}
              selectedPatchId={selectedPatchId}
              acceptedView={acceptedView}
              comparison={comparison}
              locked={locked || busy}
              onApply={onApply}
              onSelect={onPatchSelect}
              onAccepted={onAccepted}
              onBusyChange={setBusy}
            />
          }
          onCompare={onCompare}
          onSave={async (decision, notes) => {
            setBusy(true);
            try {
              onApply(
                await savePinDecision(
                  project,
                  e.recommendation.id,
                  decision,
                  notes,
                  geometrySha256,
                ),
              );
              setMessage(
                "Decision saved. Export reviewed project to keep it in the ZIP, or copy review decisions for this chat.",
              );
            } catch (error) {
              setMessage(String(error));
            } finally {
              setBusy(false);
            }
          }}
        />
      ))}
      <details className="pin-review-transfer">
        <summary>Share or save your answers</summary>
        <button
          onClick={async () => {
            const text = transfer();
            setCopyText(text);
            try {
              await navigator.clipboard.writeText(text);
              setMessage("Copied review decisions. Paste them into this chat.");
            } catch {
              setMessage(
                "Copy unavailable. Select the results below or download them.",
              );
            }
          }}
        >
          Copy review decisions
        </button>
        <button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([transfer()], { type: "application/json" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "pin-review-decisions.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download review decisions
        </button>
        {copyText && (
          <label>
            Decisions to paste
            <textarea
              aria-label="Decisions to paste"
              readOnly
              value={copyText}
            />
          </label>
        )}
      </details>
      <p role="status">{message}</p>
    </section>
  );
}
function PinRecommendationRow({
  data,
  entry,
  saved,
  locked,
  hidden,
  onLocate,
  onCompare,
  mode,
  comparison,
  comparisonStatus,
  selectedPatchId,
  onPatchSelect,
  acceptedView,
  onAccepted,
  patchReview,
  onSave,
}: {
  data: IndoorProject["dataset"];
  entry: ReturnType<typeof pinRecommendations>[number];
  saved?: PinDecision;
  locked: boolean;
  hidden: boolean;
  onLocate: () => void;
  onCompare: (mode: PinComparisonMode) => void;
  mode: PinComparisonMode;
  comparison?: PinComparisonResult;
  comparisonStatus: string;
  selectedPatchId?: string;
  onPatchSelect: (id?: string) => void;
  acceptedView: boolean;
  onAccepted: () => void;
  patchReview: React.ReactNode;
  onSave: (decision: PinDecision["decision"], notes: string) => Promise<void>;
}) {
  const [decision, setDecision] = useState<PinDecision["decision"]>(
      saved?.decision ?? "more-evidence",
    ),
    [notes, setNotes] = useState(saved?.notes ?? "");
  const r = entry.recommendation;
  const patchIndex = r.patchIds.indexOf(selectedPatchId ?? "");
  const hasPatch = !!r.patchIds.length,
    hasGeometry = !!comparison,
    failed = !!comparisonStatus && !comparison;
  return (
    <section hidden={hidden} className="pin-review-entry">
      <h3>
        {r.title}
        {saved ? ` · ${saved.decision}` : " · unanswered"}
      </h3>
      {!entry.current && (
        <p>
          Evidence binding is being checked or belongs to older geometry. Save
          is available only for current evidence.
        </p>
      )}
      <p>{r.recommendation}</p>
      <p>{r.question}</p>
      <button onClick={onLocate}>Show location: {r.title}</button>
      <fieldset>
        <legend>Compare on the map</legend>
        {hasPatch && (
          <>
            <label>
              Patch scope
              <select
                aria-label="Patch scope"
                value={acceptedView ? "accepted" : (selectedPatchId ?? "")}
                onChange={(e) =>
                  e.target.value === "accepted"
                    ? onAccepted()
                    : onPatchSelect(e.target.value || undefined)
                }
                disabled={locked || !entry.current}
              >
                {acceptedView && (
                  <option value="accepted">Accepted patches only</option>
                )}
                {r.patchIds.map((id, i) => (
                  <option key={id} value={id}>
                    Patch {i + 1} of {r.patchIds.length}
                  </option>
                ))}
                {r.patchIds.length > 1 && (
                  <option value="">
                    All {r.patchIds.length} patches together
                  </option>
                )}
              </select>
            </label>
            {r.patchIds.length > 1 && (
              <div className="pin-review-actions">
                <button
                  disabled={
                    acceptedView || patchIndex <= 0 || locked || !entry.current
                  }
                  onClick={() => onPatchSelect(r.patchIds[patchIndex - 1])}
                >
                  Previous patch
                </button>
                <button
                  disabled={
                    acceptedView ||
                    patchIndex < 0 ||
                    patchIndex >= r.patchIds.length - 1 ||
                    locked ||
                    !entry.current
                  }
                  onClick={() => onPatchSelect(r.patchIds[patchIndex + 1])}
                >
                  Next patch
                </button>
              </div>
            )}
          </>
        )}
        <div className="pin-review-comparison-buttons">
          <button
            aria-pressed={mode === "map"}
            onClick={() => onCompare("map")}
          >
            Current map
          </button>
          <button
            aria-pressed={mode === "current-selection"}
            disabled={!hasGeometry}
            onClick={() => onCompare("current-selection")}
          >
            Before patch
          </button>
          <button
            aria-pressed={mode === "patch"}
            disabled={
              locked || !entry.current || !hasPatch || !hasGeometry || failed
            }
            onClick={() => onCompare("patch")}
          >
            Patch overlay
          </button>
          <button
            aria-pressed={mode === "updated-selection"}
            disabled={
              locked || !entry.current || !hasPatch || !comparison?.updated
            }
            onClick={() => onCompare("updated-selection")}
          >
            After patch
          </button>
        </div>
        <p role="status">
          {comparisonStatus ||
            (hasGeometry
              ? "Comparison ready."
              : "Tracing the native boundary…")}
        </p>
        {!hasPatch && (
          <p>
            No geometric patch is saved for this recommendation yet. The current
            selection is available; an updated selection needs a
            source-supported proposal.
          </p>
        )}
        {comparison && (mode === "current-selection" || mode === "updated-selection") && <PatchComparisonLegend data={data} result={comparison} after={mode === "updated-selection"} />}
        {comparison && (
          <>
            <p>
              Target before:{" "}
              {comparison.current
                ? `${Math.round(comparison.current.areaSquareFeet)} sq ft · ${comparison.current.roomKeys.length} place labels`
                : "No supported area at this location"}
              {comparison.updated && (
                <>
                  . Target after: {Math.round(comparison.updated.areaSquareFeet)} sq
                  ft · {comparison.updated.roomKeys.length} place labels
                </>
              )}
              .
            </p>
            {hasPatch && (
              <p>
                {acceptedView
                  ? `${comparison.patches.length} accepted patches only`
                  : selectedPatchId
                    ? `Patch ${patchIndex + 1} of ${r.patchIds.length} only`
                    : `All ${comparison.patches.length} saved patches together`}
                . This is a temporary native selection, not regenerated rooms or
                directions.
                {!acceptedView &&
                  selectedPatchId &&
                  r.patchIds.length > 1 &&
                  " Other proposed patches are excluded. A single join may leave the same areas connected; compare all patches to test their combined effect."}
              </p>
            )}
            {!acceptedView && selectedPatchId && comparison.patches[0] && (
              <p>
                Selected patch: walls{" "}
                {comparison.patches[0].wallEvidence
                  .map((w) => `#${w.nativeElementId}`)
                  .join(" / ")}{" "}
                · gap {comparison.patches[0].widthFeet.toFixed(2)} ft.
              </p>
            )}
            {comparison.warnings.length > 0 && (
              <details>
                <summary>Boundary evidence and limits</summary>
                <ul>
                  {comparison.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </fieldset>
      {patchReview}
      <details>
        <summary>Evidence and patch details</summary>
        <small>Evidence files: {r.evidencePaths.join(", ")}</small>
        {comparison?.patches.map((p) => (
          <p key={p.id}>
            Walls{" "}
            {p.wallEvidence.map((w) => "#" + w.nativeElementId).join(" / ")} ·{" "}
            {p.widthFeet.toFixed(3)} ft · {p.status}
            <small>{p.notes}</small>
          </p>
        ))}
      </details>
      <details open={!hasPatch}>
        <summary>Whole recommendation answer (optional)</summary>
        {r.patchIds.length > 1 && (
          <small>
            The decision below covers the whole recommendation. Individual patch
            decisions are saved above.
          </small>
        )}
        <label>
          Decision
          <select
            aria-label={`Decision ${r.title}`}
            value={decision}
            disabled={locked || !entry.current}
            onChange={(e) =>
              setDecision(e.target.value as PinDecision["decision"])
            }
          >
            <option value="more-evidence">Need more evidence</option>
            <option value="accept">Accept recommendation</option>
            <option value="reject">Reject recommendation</option>
          </select>
        </label>
        <label>
          Your reason (required to save)
          <textarea
            aria-label={`Reason ${r.title}`}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={locked || !entry.current}
          />
        </label>
        {entry.current && !notes.trim() && (
          <small>Add a reason to enable Save decision.</small>
        )}
        <button
          disabled={locked || !entry.current || !notes.trim()}
          onClick={() => void onSave(decision, notes)}
        >
          Save decision: {r.title}
        </button>
      </details>
    </section>
  );
}
