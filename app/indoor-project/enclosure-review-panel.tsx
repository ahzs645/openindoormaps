import type { PinComparisonResult } from "./pin-comparison";
import { PatchComparisonLegend } from "./patch-comparison-legend";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { IndoorProject } from "./package";
import { ProposalDecisionControls } from "./proposal-decision-controls";
import { isViewerProject } from "./package";
import type { VolumeAudit } from "./volume-coverage";
import type { VolumeWorkerResponse } from "./volume-coverage.worker";
import {
  validateEnclosureProposals,
  proposalMatchesModel,
  proposalIsCurrent,
  proposalRecordIsCurrent,
  saveEnclosureProposals,
  proposalNotes,
  roomBoundaryPreviewCandidates,
  boundaryPatchPreviewPlan,
  boundaryPatchGroupPreviewPlan,
  type BoundaryPatchPreviewPlan,
  proposalDisplayPreviewPlan,
  type ProposalDisplayPreviewPlan,
  type EnclosureProposals,
} from "./enclosure-proposals";
import {
  coverageLabels,
  decisionLabels,
  decisionGuidance,
  enclosureItems,
  enclosureProposalItems,
  needsEnclosureEvidence,
  currentEnclosureReview,
  saveEnclosureReview,
  type EnclosureDecision,
} from "./enclosure-review";

function ReviewFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button className="enclosure-filter" aria-label={label}>
          <span>
            <small>{label}</small>
            {options.find(([id]) => id === value)?.[1] ?? value}
          </span>
          <ChevronDown size={16} />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="enclosure-filter-menu"
          sideOffset={5}
          align="start"
        >
          <Menu.RadioGroup value={value} onValueChange={onChange}>
            {options.map(([id, text]) => (
              <Menu.RadioItem key={id} value={id}>
                {text}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
const formatCount = (n: number) => n.toLocaleString();
const pageSize = 30;
export function EnclosureReviewPanel({
  project,
  selected,
  view,
  onLocate,
  onView,
  sourceStatus,
  onApply,
  onPreviewBoundary,
  previewBoundaryPatchId,
  onExitBoundaryPreview,
  boundaryPreviewStatus,
  boundaryComparison, boundaryAfter = true, onBoundaryAfter,
  onPreviewWindows,
  onExitWindowPreview,
  previewingWindows,
  onPreviewDisplay,
  previewDisplayRoomKey,
  onExitDisplayPreview,
  displayPreviewStatus,
}: {
  project: IndoorProject;
  selected: string;
  view: "2d" | "3d" | "relative" | "native";
  onLocate: (key: string) => void;
  onView: (view: "2d" | "3d" | "relative" | "native") => void;
  sourceStatus?: string;
  onApply: (project: IndoorProject) => void;
  onPreviewBoundary?: (plan: BoundaryPatchPreviewPlan) => void;
  previewBoundaryPatchId?: string;
  onExitBoundaryPreview?: () => void;
  boundaryPreviewStatus?: string;
  boundaryComparison?: PinComparisonResult;
  boundaryAfter?: boolean;
  onBoundaryAfter?: (after: boolean) => void;
  onPreviewWindows?: () => void;
  onExitWindowPreview?: () => void;
  previewingWindows?: boolean;
  onPreviewDisplay?: (plan: ProposalDisplayPreviewPlan) => void;
  previewDisplayRoomKey?: string;
  onExitDisplayPreview?: () => void;
  displayPreviewStatus?: string;
}) {
  const data = project.dataset;
  const [bundledProposals, setBundledProposals] =
    useState<EnclosureProposals>();
  const [proposalError, setProposalError] = useState("");
  const proposalFile = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    setBundledProposals(undefined);
    setProposalError("");
    // Optional evidence catalog; matching is by source model and audited geometry.
    fetch(`${import.meta.env.BASE_URL}review/enclosure-proposals.json`, {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const value: unknown = await response.json();
        validateEnclosureProposals(value);
        if (value && proposalMatchesModel(value, project))
          setBundledProposals(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setProposalError(
            e instanceof Error
              ? e.message
              : "Could not load proposal evidence.",
          );
      });
    return () => abort.abort();
  }, [data.source.modelSha256]);
  const proposals = project.rooms.enclosureProposals ?? bundledProposals;
  const matchingProposals =
    proposals && proposalMatchesModel(proposals, project)
      ? proposals
      : undefined;
  const proposalByKey = useMemo(
    () => new Map(matchingProposals?.records.map((r) => [r.key, r]) ?? []),
    [matchingProposals],
  );
  async function importProposals(file: File) {
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Proposal file exceeds 5 MB.");
      const value: unknown = JSON.parse(await file.text());
      validateEnclosureProposals(value);
      if (!value) throw new Error("Proposal file is empty.");
      onApply(saveEnclosureProposals(project, value));
      setProposalError("");
    } catch (e) {
      setProposalError(
        e instanceof Error ? e.message : "Could not import proposals.",
      );
    }
  }
  const [report, setReport] = useState<VolumeAudit>();
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    name: string;
  }>();
  const [running, setRunning] = useState(true);
  const [generation, setGeneration] = useState(0);
  const worker = useRef<Worker>();
  useEffect(() => {
    setReport(undefined);
    setError("");
    setProgress(undefined);
    setRunning(true);
    let active = true;
    const current = new Worker(
      new URL("volume-coverage.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = current;
    const fail = (message: string) => {
      if (active) {
        setError(message);
        setRunning(false);
        current.terminate();
      }
    };
    current.onmessage = ({
      data: response,
    }: MessageEvent<VolumeWorkerResponse>) => {
      if (!active || worker.current !== current) return;
      if ("progress" in response) setProgress(response.progress);
      else if ("result" in response) {
        setReport(response.result);
        setRunning(false);
        current.terminate();
      } else fail(response.error);
    };
    current.onerror = (event) => {
      event.preventDefault();
      fail(event.message || "The room audit could not run.");
    };
    current.onmessageerror = () =>
      fail("The audit returned unreadable results.");
    current.postMessage(data);
    return () => {
      active = false;
      current.terminate();
      if (worker.current === current) worker.current = undefined;
    };
  }, [data, generation]);
  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState("all");
  const [floor, setFloor] = useState("all");
  const [coverage, setCoverage] = useState("needs-evidence");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const items = useMemo(() => (report ? enclosureItems(report) : []), [report]);
  const proposalItems = useMemo(
    () => enclosureProposalItems(items, new Set(proposalByKey.keys())),
    [items, proposalByKey],
  );
  const proposalItemKeys = useMemo(
    () => new Set(proposalItems.map((item) => item.key)),
    [proposalItems],
  );
  const filtered = useMemo(
    () =>
      items.filter(
        (r) =>
          (building === "all" || r.building === building) &&
          (floor === "all" || r.scopes.some((s) => s.id === floor)) &&
          (coverage === "all" ||
            (coverage === "proposed-solutions"
              ? proposalItemKeys.has(r.key)
              : coverage === "needs-evidence"
                ? needsEnclosureEvidence(r)
                : r.status === coverage)) &&
          (decisionFilter === "all" ||
            (report &&
              (currentEnclosureReview(project, report, r.key)?.decision ??
                "to-review") === decisionFilter)) &&
          `${r.number} ${r.name} ${r.key} ${r.diagnostics.map((d) => d.message).join(" ")} ${proposalByKey.get(r.key)?.solution ?? ""} ${proposalByKey.get(r.key)?.cause ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [
      items,
      building,
      floor,
      coverage,
      decisionFilter,
      project,
      report,
      search,
      proposalByKey,
      proposalItemKeys,
    ],
  );
  const selectedItem = items.find((r) => r.key === selected);
  const selectedProposal = proposalByKey.get(selected);
  const allReferencedWallsApplied =
    !!selectedProposal?.boundaryPatchIds?.length &&
    selectedProposal.boundaryPatchIds.every((id) =>
      project.rooms.nativeBoundaryPatches?.patches.some(
        (patch) => patch.id === id && patch.status === "applied",
      ),
    );
  const referencedWallsRegenerated =
    allReferencedWallsApplied &&
    project.dataset.boundaryPatchState?.regenerated === true &&
    selectedProposal!.boundaryPatchIds!.every((id) =>
      project.dataset.boundaryPatchState!.patchIds.includes(id),
    );
  const boundaryPreviewCandidates = useMemo(
    () => roomBoundaryPreviewCandidates(project, selected, selectedProposal),
    [project, selected, selectedProposal],
  );
  const proposalsCurrent =
    !!matchingProposals &&
    !!report &&
    proposalIsCurrent(matchingProposals, report);
  const selectedProposalCurrent =
    proposalsCurrent &&
    !!selectedProposal &&
    proposalRecordIsCurrent(
      matchingProposals!,
      selectedProposal,
      report!.reviewEvidenceSha256,
    );
  const selectedReview =
    report && currentEnclosureReview(project, report, selected);
  const previousReview = project.rooms.enclosureReviews?.records[selected];
  const [decision, setDecision] = useState<EnclosureDecision>("to-review");
  const [notes, setNotes] = useState("");
  const saved =
    selectedReview?.decision === decision && selectedReview?.notes === notes;
  useEffect(() => {
    setDecision(selectedReview?.decision ?? "to-review");
    setNotes(selectedReview?.notes ?? previousReview?.notes ?? "");
  }, [selected, selectedReview, previousReview]);
  useEffect(
    () => setPage(0),
    [
      search,
      building,
      floor,
      coverage,
      decisionFilter,
      report,
      matchingProposals,
    ],
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const index = filtered.findIndex((r) => r.key === selected);
  const needReview = items.filter(needsEnclosureEvidence);
  const toReview = needReview.filter(
    (r) =>
      !report ||
      !currentEnclosureReview(project, report, r.key) ||
      currentEnclosureReview(project, report, r.key)?.decision === "to-review",
  ).length;
  function locate(key: string) {
    const i = filtered.findIndex((r) => r.key === key);
    if (i !== -1) setPage(Math.floor(i / pageSize));
    onLocate(key);
  }
  function downloadReport() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              ...report,
              uniquePlaces: items.length,
              enclosureReviews: project.rooms.enclosureReviews,
              enclosureProposals: matchingProposals,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "room-enclosure-review.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="enclosure-review-panel" aria-label="Room enclosure review">
      <div className="enclosure-heading">
        <span className="project-kicker">NATIVE ROOM EVIDENCE</span>
        <h2>Room review</h2>
        <p>
          Compare each flagged room with its walls, doors and floor. Review
          notes do not repair the model.
        </p>
      </div>
      <input
        ref={proposalFile}
        type="file"
        accept=".json,application/json"
        aria-label="Import enclosure proposals"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void importProposals(file);
        }}
      />
      <div className="enclosure-actions">
        {matchingProposals && (
          <button
            disabled={!report}
            onClick={() => {
              setSearch("");
              setBuilding("all");
              setFloor("all");
              setDecisionFilter("all");
              setCoverage("proposed-solutions");
              setPage(0);
            }}
          >
            View proposals
            {report ? ` (${formatCount(proposalItems.length)})` : ""}
          </button>
        )}
        <button onClick={() => proposalFile.current?.click()}>
          Import proposals
        </button>
        {matchingProposals &&
          !isViewerProject(project) &&
          project.rooms.enclosureProposals !== matchingProposals && (
            <button
              onClick={() => {
                try {
                  onApply(saveEnclosureProposals(project, matchingProposals));
                  setProposalError("");
                } catch (e) {
                  setProposalError(
                    e instanceof Error
                      ? e.message
                      : "Could not save proposals.",
                  );
                }
              }}
            >
              Save proposals in project
            </button>
          )}
      </div>
      {matchingProposals && (
        <>
          <p className="enclosure-proposal-status" role="status">
            {matchingProposals.records.length} proposed solutions ·{" "}
            {matchingProposals.title}
            {!report && " · Waiting for the current map audit."}
            {report &&
              proposalItems.length !== matchingProposals.records.length &&
              ` · ${formatCount(proposalItems.length)} linked to places in this map.`}
            {report &&
              !proposalsCurrent &&
              " · Earlier geometry: compare again before applying."}
            {project.rooms.enclosureProposals === matchingProposals &&
              " · Included in reviewed project exports."}
          </p>
          <p className="enclosure-revision">
            Archived catalogs and scan reports are under Review files. Physical
            wall corrections are under Native areas → Saved boundary patches.
          </p>
        </>
      )}
      {proposalError && (
        <p role="alert" className="project-warning">
          {proposalError}
        </p>
      )}
      {running ? (
        <div className="enclosure-progress" role="status">
          <strong>Checking room geometry…</strong>
          <p>
            {progress
              ? `${progress.completed} of ${progress.total} floor views · ${progress.name}`
              : "Starting the audit of this loaded map"}
          </p>
          <progress
            max={progress?.total ?? 1}
            value={progress?.completed ?? 0}
          />
          <button
            onClick={() => {
              worker.current?.terminate();
              worker.current = undefined;
              setRunning(false);
              setError("Audit stopped. Run it again to rebuild the queue.");
            }}
          >
            Stop audit
          </button>
        </div>
      ) : report ? (
        <>
          <div className="enclosure-counts" data-testid="enclosure-counts">
            <div>
              <strong>{formatCount(needReview.length)}</strong>
              <span>Need evidence</span>
            </div>
            <div>
              <strong>
                {formatCount(
                  items.filter((r) => r.status === "block-present").length,
                )}
              </strong>
              <span>Room blocks</span>
            </div>
            <div>
              <strong>{formatCount(toReview)}</strong>
              <span>Not yet reviewed</span>
            </div>
          </div>
          <p className="enclosure-revision">
            {data.floors.length} campus floors · {data.nativeLevels.length}{" "}
            native levels · {formatCount(items.length)} unique places
            <br />
            Audited map <code>{report.datasetSha256.slice(0, 12)}</code>
          </p>
          <div className="enclosure-actions">
            <button onClick={downloadReport}>Download review report</button>
            <button onClick={() => setGeneration((n) => n + 1)}>
              Recheck geometry
            </button>
          </div>
          <label>
            Find a room
            <input
              aria-label="Find room enclosure"
              placeholder="Room number, name or evidence"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="enclosure-filters">
            <ReviewFilter
              label="Review building"
              value={building}
              onChange={setBuilding}
              options={[
                ["all", "All buildings"],
                ...[...new Set(items.map((r) => r.building))]
                  .sort()
                  .map((b): [string, string] => [b, `Building ${b}`]),
              ]}
            />
            <ReviewFilter
              label="Review floor"
              value={floor}
              onChange={setFloor}
              options={[
                ["all", "All floors / levels"],
                ...report.views.map((s): [string, string] => [
                  s.id,
                  s.scope === "native-level"
                    ? `${s.name} · #${s.levelIds[0]}`
                    : s.name,
                ]),
              ]}
            />
            <ReviewFilter
              label="Geometry finding"
              value={coverage}
              onChange={setCoverage}
              options={[
                ["needs-evidence", "Needs evidence"],
                ["proposed-solutions", "Proposed solutions"],
                ["all", "All places"],
                ...Object.entries(coverageLabels),
              ]}
            />
            <ReviewFilter
              label="Review decision"
              value={decisionFilter}
              onChange={setDecisionFilter}
              options={[
                ["all", "All decisions"],
                ...Object.entries(decisionLabels),
              ]}
            />
          </div>
          <p aria-live="polite">
            {filtered.length === 0
              ? "No places match these filters."
              : `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${formatCount(filtered.length)} places`}
          </p>
          <div className="enclosure-list" aria-label="Room evidence queue">
            {filtered
              .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
              .map((item) => (
                <button
                  key={item.key}
                  className="enclosure-room"
                  aria-pressed={selected === item.key}
                  aria-label={`Review ${item.number} · ${item.name}`}
                  onClick={() => locate(item.key)}
                >
                  <strong>
                    {item.number} · {item.name}
                  </strong>
                  <span>
                    Building {item.building} ·{" "}
                    {item.scopes.find((s) => s.scope === "campus-floor")
                      ?.name ?? `#${item.nativeLevel}`}
                  </span>
                  <small>
                    {coverageLabels[item.status]} ·{" "}
                    {
                      decisionLabels[
                        currentEnclosureReview(project, report, item.key)
                          ?.decision ?? "to-review"
                      ]
                    }
                  </small>
                  {proposalByKey.has(item.key) && (
                    <small className="enclosure-proposal-badge">
                      {proposalsCurrent &&
                      proposalRecordIsCurrent(
                        matchingProposals!,
                        proposalByKey.get(item.key)!,
                        report!.reviewEvidenceSha256,
                      )
                        ? "Proposed solution available"
                        : "Historical proposal · evidence needs rechecking"}
                    </small>
                  )}
                </button>
              ))}
          </div>
          {filtered.length > pageSize && (
            <div className="enclosure-actions">
              <button
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous page
              </button>
              <span>
                {currentPage + 1} / {lastPage + 1}
              </span>
              <button
                disabled={currentPage === lastPage}
                onClick={() => setPage(currentPage + 1)}
              >
                Next page
              </button>
            </div>
          )}
          {selectedItem ? (
            <section
              className="enclosure-detail"
              aria-label="Selected enclosure evidence"
            >
              <div className="enclosure-actions">
                <button
                  disabled={index <= 0}
                  onClick={() => locate(filtered[index - 1].key)}
                >
                  Previous room
                </button>
                <button
                  disabled={
                    index >= filtered.length - 1 || filtered.length === 0
                  }
                  onClick={() => locate(filtered[index + 1].key)}
                >
                  Next room
                </button>
              </div>
              <h3>
                {selectedItem.number} · {selectedItem.name}
              </h3>
              <p className="enclosure-finding">
                {coverageLabels[selectedItem.status]}
              </p>
              <div
                className="enclosure-views"
                role="group"
                aria-label="Compare room views"
              >
                {(
                  [
                    ["2d", "2D"],
                    ["3d", "3D"],
                    ["relative", "Native heights"],
                    ...(project.scene ? [["native", "Source model"]] : []),
                  ] as [typeof view, string][]
                ).map(([id, text]) => (
                  <button
                    key={id}
                    aria-pressed={view === id}
                    onClick={() => onView(id)}
                  >
                    {text}
                  </button>
                ))}
              </div>
              {view === "native" && sourceStatus && (
                <p role="status" data-testid="enclosure-source-status">
                  {sourceStatus}
                </p>
              )}
              {selectedProposal && (
                <section
                  className="enclosure-proposal"
                  aria-label="Proposed room solution"
                >
                  <div className="enclosure-proposal-heading">
                    <h4>Proposed solution</h4>
                    <span>
                      {selectedProposal.confidence.replaceAll("-", " ")}{" "}
                      confidence
                    </span>
                  </div>
                  <p className="enclosure-proposal-disclaimer">
                    {allReferencedWallsApplied
                      ? referencedWallsRegenerated
                        ? "Measured wall corrections applied · navigation regenerated"
                        : "Measured wall corrections applied · navigation needs regeneration"
                      : selectedProposal.boundaryPatchIds?.length
                        ? "Evidence review · wall corrections not applied"
                        : "Evidence review · see the implementation status below"}
                  </p>
                  {!selectedProposalCurrent && (
                    <p className="project-warning">
                      This proposal was measured on earlier geometry. Recheck
                      its evidence against this map.
                    </p>
                  )}
                  <p>
                    <strong>Likely cause</strong>
                    <br />
                    {selectedProposal.cause}
                  </p>
                  <p>{selectedProposal.solution}</p>
                  {matchingProposals && (
                    <ProposalDecisionControls
                      project={project}
                      catalog={matchingProposals}
                      roomKey={selected}
                      evidenceSha256={report?.reviewEvidenceSha256}
                      onApply={onApply}
                    />
                  )}
                  {!boundaryPreviewCandidates.length &&
                    !selectedProposal.displayPreview && (
                      <p>
                        {allReferencedWallsApplied
                          ? "Inspect the applied correction in Native areas → Saved boundary patches."
                          : selectedProposal.boundaryPatchIds?.length
                            ? "The referenced measured correction is unavailable on this native level. Import the matching proposed patch log before previewing."
                            : "This recommendation has no measured geometry preview yet. Its text does not define an approved room boundary."}
                      </p>
                    )}
                  {selectedProposal.displayPreview && onPreviewDisplay && (
                    <div>
                      <p>
                        {selectedProposal.displayPreview.kind ===
                        "native-enclosure-walkway"
                          ? `Full native enclosure from inside wall faces. ${selectedProposal.displayPreview.passThroughDoorIds?.length ? `The ${selectedProposal.displayPreview.passThroughDoorIds.length} reviewed pass-through thresholds are included in the floor preview; physical doors remain recorded and other doors stay closed for tracing.` : "Measured doorway thresholds stay closed for tracing."} The source outline supplies the seed only. Amber marks unresolved connections to neighbouring places; blue marks a supported walkway candidate. Real walls, columns and floor openings stay excluded.`
                          : "Source stair outline cropped to exact native slab support and clear floor. The blue preview retains real openings and does not certify hallway access or a new stair flight."}
                      </p>
                      <button
                        disabled={
                          !selectedProposalCurrent ||
                          !report ||
                          !matchingProposals
                        }
                        aria-pressed={previewDisplayRoomKey === selected}
                        onClick={() => {
                          if (!report || !matchingProposals) return;
                          try {
                            setProposalError("");
                            onPreviewDisplay(
                              proposalDisplayPreviewPlan(
                                project,
                                matchingProposals,
                                report,
                                selected,
                              ),
                            );
                          } catch (e) {
                            setProposalError(
                              e instanceof Error
                                ? e.message
                                : "Could not preview the measured landing.",
                            );
                          }
                        }}
                      >
                        Preview proposed walkway
                      </button>
                      {previewDisplayRoomKey === selected &&
                        onExitDisplayPreview && (
                          <button onClick={onExitDisplayPreview}>
                            Show original walkway
                          </button>
                        )}
                      {displayPreviewStatus && (
                        <p role="status">{displayPreviewStatus}</p>
                      )}
                    </div>
                  )}
                  {selectedProposal.relatedKeys.length > 0 && (
                    <details>
                      <summary>Related areas in this review group</summary>
                      <div className="enclosure-related-areas">
                        {selectedProposal.relatedKeys.map((key) => {
                          const r = data.records.find((r) => r.key === key);
                          return r ? (
                            <button key={key} onClick={() => locate(key)}>
                              {r.number} · {r.name}
                            </button>
                          ) : null;
                        })}
                      </div>
                    </details>
                  )}
                  <details open>
                    <summary>Before applying</summary>
                    <ul>
                      {selectedProposal.prerequisites.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </details>
                  <button
                    disabled={
                      !selectedProposalCurrent || isViewerProject(project)
                    }
                    onClick={() => {
                      setDecision("needs-correction");
                      setNotes(proposalNotes(selectedProposal));
                    }}
                  >
                    Use proposal as review notes
                  </button>
                </section>
              )}
              {!!boundaryPreviewCandidates.length && onPreviewBoundary && (
                <section
                  aria-label="Preview proposed boundary solution"
                  className="enclosure-proposal"
                >
                  <h4>Preview boundary solution</h4>
                  <p>
                    Compare the original native regions with the proposed wall
                    extension. This preview does not change the saved map or
                    directions.
                  </p>
                  {!selectedProposal?.boundaryPatchIds && (
                    <p>
                      These saved corrections are near this room's outline.
                      Inspect the resulting regions before deciding which rooms
                      they repair.
                    </p>
                  )}
                  {selectedProposal?.boundaryPatchIds &&
                    boundaryPreviewCandidates.length > 1 && (
                      <div>
                        <p>
                          Compare all {boundaryPreviewCandidates.length} linked
                          joins together to see their combined effect.
                          Individual previews below show each join's
                          contribution.
                        </p>
                        <button
                          disabled={!selectedProposalCurrent}
                          onClick={() => {
                            try {
                              setProposalError("");
                              onPreviewBoundary(
                                boundaryPatchGroupPreviewPlan(
                                  project,
                                  selected,
                                  selectedProposal.boundaryPatchIds!,
                                  report?.reviewEvidenceSha256,
                                ),
                              );
                            } catch (e) {
                              setProposalError(
                                e instanceof Error
                                  ? e.message
                                  : "Could not preview the complete correction.",
                              );
                            }
                          }}
                        >
                          Preview complete boundary solution
                        </button>
                      </div>
                    )}
                  {boundaryPreviewCandidates.map((patch) => (
                    <div key={patch.id}>
                      <p>
                        {patch.widthFeet.toFixed(3)} ft gap · walls #
                        {patch.wallEvidence
                          .map((w) => w.nativeElementId)
                          .join(" / #")}
                      </p>
                      <p>{patch.notes}</p>
                      <button
                        aria-pressed={previewBoundaryPatchId === patch.id}
                        disabled={
                          !!selectedProposal && !selectedProposalCurrent
                        }
                        onClick={() => {
                          try {
                            setProposalError("");
                            onPreviewBoundary(
                              boundaryPatchPreviewPlan(
                                project,
                                selected,
                                patch.id,
                                report?.reviewEvidenceSha256,
                              ),
                            );
                          } catch (e) {
                            setProposalError(
                              e instanceof Error
                                ? e.message
                                : "Could not preview the native correction.",
                            );
                          }
                        }}
                      >
                        Preview proposed solution
                      </button>
                    </div>
                  ))}
                  {previewBoundaryPatchId && onExitBoundaryPreview && (
                    <button onClick={onExitBoundaryPreview}>
                      Show original geometry
                    </button>
                  )}
                  {boundaryComparison && onBoundaryAfter && <>
                    <div className="pin-review-comparison-buttons">
                      <button aria-pressed={!boundaryAfter} onClick={()=>onBoundaryAfter(false)}>Before patch</button>
                      <button aria-pressed={boundaryAfter} onClick={()=>onBoundaryAfter(true)}>After patch</button>
                    </div>
                    <PatchComparisonLegend data={data} result={boundaryComparison} after={boundaryAfter} />
                  </>}
                  {boundaryPreviewStatus && (
                    <p role="status">{boundaryPreviewStatus}</p>
                  )}
                  <p>
                    To apply a reviewed correction, use Native areas → Saved
                    boundary patches. Application and regeneration remain
                    separate from this comparison.
                  </p>
                </section>
              )}
              <dl>
                <dt>Native floor / elevation</dt>
                <dd>
                  #{selectedItem.nativeLevel} ·{" "}
                  {selectedItem.nativeElevationFeet.toFixed(2)} ft
                </dd>
                <dt>Boundary evidence</dt>
                <dd>
                  {selectedItem.preparedBoundary ??
                    "No complete prepared enclosure"}
                </dd>
                <dt>Visible blocks · ordinary / native heights</dt>
                <dd>
                  {selectedItem.modes.map((m) => m.blockCount).join(" / ")}
                </dd>
                <dt>Selection evidence</dt>
                <dd>
                  {[
                    ...new Set(
                      selectedItem.modes.flatMap((m) => m.floorMaskSources),
                    ),
                  ].join(" · ") || "Source outline"}
                </dd>
                <dt>Source ID</dt>
                <dd>
                  <code>{selectedItem.key}</code>
                </dd>
              </dl>
              {onPreviewWindows &&
                data.windowDisplay?.sourceModelSha256 ===
                  data.source.modelSha256 &&
                data.windowDisplay.wallCuts.some(
                  (cut) =>
                    cut.levelId === selectedItem.nativeLevel &&
                    data.windowDisplay?.elements.some(
                      (e) =>
                        e.levelId === cut.levelId && e.hostId === cut.hostId,
                    ),
                ) && (
                  <div>
                    <button
                      aria-pressed={!!previewingWindows}
                      onClick={
                        previewingWindows && onExitWindowPreview
                          ? onExitWindowPreview
                          : onPreviewWindows
                      }
                    >
                      {previewingWindows
                        ? "Show original windows"
                        : "Preview native windows"}
                    </button>
                    <p>
                      Compare measured window members on this native level with
                      the simplified display. This changes the preview only;
                      room boundaries and routes stay preserved.
                    </p>
                  </div>
                )}
              {selectedItem.diagnostics.length > 0 && (
                <details open>
                  <summary>Why this needs review</summary>
                  <ul>
                    {selectedItem.diagnostics.map((d, i) => (
                      <li key={i}>
                        <strong>{d.code}</strong>: {d.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <details>
                <summary>What to check</summary>
                <ul>
                  <li>
                    Trace the complete room along native inside wall faces.
                  </li>
                  <li>
                    Close measured door openings for the display boundary;
                    preserve door thresholds for routing.
                  </li>
                  <li>
                    Keep stair voids, ramps, hallways and adjacent rooms out of
                    this block.
                  </li>
                  <li>
                    Compare 2D, 3D and native heights. Verify the entrance route
                    separately.
                  </li>
                </ul>
              </details>
              {previousReview && !selectedReview && (
                <p className="project-warning">
                  Earlier review belongs to different geometry. Its notes are
                  retained below; review this version again.
                </p>
              )}
              <ReviewFilter
                label="Enclosure decision"
                value={decision}
                onChange={(v) => {
                  setDecision(v as EnclosureDecision);
                }}
                options={Object.entries(decisionLabels)}
              />
              <p className="enclosure-decision-guidance">
                {decisionGuidance[decision]}
              </p>
              <label>
                Evidence and correction notes
                <textarea
                  aria-label="Enclosure review notes"
                  value={notes}
                  maxLength={10_000}
                  onChange={(e) => {
                    setNotes(e.target.value);
                  }}
                  placeholder="Native wall / door IDs, observed gap, intended area, proposed correction"
                />
              </label>
              <button
                disabled={isViewerProject(project)}
                onClick={() => {
                  onApply(
                    saveEnclosureReview(
                      project,
                      report,
                      selected,
                      decision,
                      notes,
                    ),
                  );
                }}
              >
                Save room review
              </button>
              {saved && (
                <p role="status">
                  Review saved. Export the reviewed project ZIP to keep it.
                </p>
              )}
              {isViewerProject(project) && (
                <p>Import the master Reviter ZIP to save authoring reviews.</p>
              )}
            </section>
          ) : (
            <p>Select a room to inspect its evidence and record a review.</p>
          )}
        </>
      ) : (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setGeneration((n) => n + 1)}>
            Run room audit
          </button>
        </div>
      )}
    </div>
  );
}
