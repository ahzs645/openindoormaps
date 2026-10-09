import {
  PatchComparisonControls,
  type PatchComparisonView,
} from "./patch-comparison-controls";
import { selectionDoorIds } from "./selection-door-thresholds";
import { ProposalDecisionControls } from "./proposal-decision-controls";
import { NativeGapScanPanel } from "./native-gap-scan-panel";
import { ReviewedAreaPartitionsPanel } from "./reviewed-area-partitions-panel";
import type { GapScanPreview } from "./native-gap-scan";
import { useEffect, useRef, useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import type { IndoorProject } from "./package";
import {
  importNativeBoundaryPatchFile,
  nativeBoundaryPatchFile,
} from "./native-boundary-patch-file";
import {
  nativeAreaKinds,
  saveNativeAreaDecision,
  applyNativeAreaDecision,
  type NativeAreaKind,
  type NativeAreaResult,
  type NativeAreaOptions,
  saveNativeBoundaryPatches,
  removeOutdoorExclusion,
} from "./native-area-review";
export function NativeAreaPanel({
  project,
  levelId,
  onLevel,
  result,
  error,
  selected,
  additive,
  onAdditive,
  onSelect,
  onApply,
  onClear,
  onUndo,
  canUndo,
  locked,
  onLocateDoor,
  options,
  onOptions,
  showHallways,
  onShowHallways,
  drawing,
  draft,
  onDrawing,
  onFinishOutdoor,
  onPartitionDraft,
  onConnectionPreview,
  onPatchComparison,
}: {
  onConnectionPreview: (preview?: GapScanPreview) => void;
  onPatchComparison: (view?: PatchComparisonView) => void;
  project: IndoorProject;
  levelId: number;
  onLevel: (id: number) => void;
  result?: NativeAreaResult;
  error: string;
  selected: string[];
  additive: boolean;
  onAdditive: (value: boolean) => void;
  onSelect: (id: string, additive: boolean) => void;
  onApply: (project: IndoorProject) => void;
  onClear: () => void;
  onUndo: () => void;
  canUndo: boolean;
  locked: boolean;
  onLocateDoor: (point: [number, number]) => void;
  options: NativeAreaOptions;
  onOptions: (options: NativeAreaOptions) => void;
  showHallways: boolean;
  onShowHallways: (value: boolean) => void;
  drawing?: "wall" | "outdoor" | "partition";
  draft: [number, number][];
  onDrawing: (tool?: "wall" | "outdoor" | "partition") => void;
  onPartitionDraft: (points: [number, number][]) => void;
  onFinishOutdoor: () => void;
}) {
  const [outdoorChecked, setOutdoorChecked] = useState(false);
  const [reviewPatchId, setReviewPatchId] = useState("");
  const [kind, setKind] = useState<NativeAreaKind>("hallway");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [applyKeys, setApplyKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [comparisonPatchId, setComparisonPatchId] = useState("");
  const comparisonPatch = project.rooms.nativeBoundaryPatches?.patches.find(
    (p) => p.id === comparisonPatchId && p.levelId === levelId,
  );
  const [pendingDecision, setPendingDecision] = useState("");
  const [gapNotes, setGapNotes] = useState("");
  const [patchIds, setPatchIds] = useState<string[]>([]);
  const [pendingPatch, setPendingPatch] = useState("");
  const [gapOpen, setGapOpen] = useState(false);
  const patchFileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const manual = result?.gapCandidates?.find((c) =>
      c.id.startsWith("manual-gap:"),
    );
    if (
      manual &&
      options.manualGapPoints &&
      !options.previewGapIds?.includes(manual.id)
    ) {
      setGapOpen(true);
      onOptions({
        ...options,
        previewGapIds: [...(options.previewGapIds ?? []), manual.id],
      });
    }
  }, [result?.geometrySha256]);
  useEffect(() => {
    const p = project.rooms.nativeBoundaryPatches?.patches.find(
      (p) => p.id === pendingPatch,
    );
    if (!p || result?.levelId !== p.levelId) return;
    onOptions(
      p.status === "applied"
        ? { mode: "connected" }
        : {
            mode: "connected",
            manualGapPoints: p.manualPointsFeet,
            maxGapFeet: Math.max(options.maxGapFeet ?? 0, p.widthFeet),
            previewGapIds: [p.id],
          },
    );
    onLocateDoor(
      p.ringsFeet[0].reduce(
        (s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4] as [number, number],
        [0, 0] as [number, number],
      ),
    );
    setComparisonPatchId(p.id);
    setPendingPatch("");
  }, [pendingPatch, result, project.rooms.nativeBoundaryPatches]);
  useEffect(
    () => setPatchIds([]),
    [
      levelId,
      options.maxGapFeet,
      options.roomKey,
      options.manualGapPoints,
      options.cropPolygonFeet,
    ],
  );
  useEffect(() => {
    setMessage("");
    setLabel("");
    setNotes("");
  }, [levelId]);
  const regions = result?.regions.filter((r) => selected.includes(r.id)) ?? [];
  const decisions = project.rooms.nativeAreaReviews?.decisions ?? [];
  const provisionalSeals =
    project.rooms.nativeProvisionalCornerSeals?.sourceModelSha256 ===
    project.dataset.source.modelSha256
      ? project.rooms.nativeProvisionalCornerSeals.rows.filter(
          (row) => row.levelId === levelId && row.state === "applied",
        )
      : [];
  const decisionProposal = project.rooms.enclosureProposals?.records.find((r) =>
    r.boundaryPatchIds?.includes(reviewPatchId),
  );
  const decisionPatch = project.rooms.nativeBoundaryPatches?.patches.find(
    (p) => p.id === reviewPatchId,
  );
  useEffect(() => {
    if (!pendingDecision || !result) return;
    const d = decisions.find(
      (d) => d.id === pendingDecision && d.levelId === result.levelId,
    );
    if (!d) return;
    if (
      JSON.stringify(d.selectionOptions ?? {}) !==
      JSON.stringify(result.options ?? {})
    ) {
      onOptions(d.selectionOptions ?? {});
      return;
    }
    if (d.geometrySha256 === result.geometrySha256) {
      onClear();
      d.regionIds.forEach((id) => onSelect(id, true));
    } else
      setMessage(
        "This decision belongs to older geometry. Reselect the native regions before saving it again.",
      );
    setKind(d.kind);
    setLabel(d.label);
    setNotes(d.notes);
    setPendingDecision("");
  }, [pendingDecision, result, decisions, onClear, onSelect]);
  const keys = [...new Set(regions.flatMap((r) => r.roomKeys))];
  const keyBinding = JSON.stringify(keys);
  const openFloorEdge = regions.reduce((n, r) => n + r.exposedFloorEdgeFeet, 0);
  // Connected native space is not proof that every contained label shares
  // its use/access. Require explicit identities, especially for leaky traces.
  useEffect(() => setApplyKeys([]), [keyBinding]);
  useEffect(
    () => setOutdoorChecked(false),
    [selected, levelId, kind, result?.geometrySha256],
  );
  const sharedDoors = (result?.doorChecks ?? []).filter(
    (d) =>
      d.status === "same-region" &&
      selected.includes(d.sideRegionIds[0]!) &&
      !options.passThroughDoorIds?.includes(d.nativeElementId),
  );
  const neighbouringDoors = (result?.doorChecks ?? []).filter(
    (d) =>
      d.status === "separated" &&
      d.sideRegionIds.filter((id) => id && selected.includes(id)).length === 1,
  );
  const passThroughDoorIds =
    options.passThroughDoorIds ?? selectionDoorIds(project.dataset, levelId);
  const previewPassThrough = (nativeElementId: number) =>
    onOptions({
      ...options,
      passThroughDoorIds: [
        ...new Set([...passThroughDoorIds, nativeElementId]),
      ],
    });
  const level = project.dataset.nativeLevels.find((l) => l.id === levelId);
  const menu = <T extends string>(
    name: string,
    value: T,
    values: Record<T, string>,
    change: (v: T) => void,
  ) => (
    <Menu.Root>
      <Menu.Trigger aria-label={name} disabled={locked || busy}>
        {values[value]} ▾
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="enclosure-filter-menu native-area-menu"
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <Menu.RadioGroup value={value} onValueChange={(v) => change(v as T)}>
            {Object.entries(values).map(([v, title]) => (
              <Menu.RadioItem
                key={v}
                value={v}
                disabled={
                  name === "Native area floor" &&
                  !project.dataset.walkingSupport?.floors.some(
                    (f) =>
                      Math.abs(
                        f.elevationFeet -
                          (project.dataset.nativeLevels.find(
                            (l) => l.id === Number(v),
                          )?.elevationFeet ?? Infinity),
                      ) < 0.15,
                  )
                }
              >
                {String(title)}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
  return (
    <section aria-label="Native area decisions" className="native-area-panel">
      <h2>Select native floor areas</h2>
      {comparisonPatch && (
        <PatchComparisonControls
          data={project.dataset}
          patch={comparisonPatch}
          onView={onPatchComparison}
          onClose={() => setComparisonPatchId("")}
        />
      )}
      <button disabled={locked || busy || !canUndo} onClick={onUndo}>
        Undo area edit
      </button>
      <p>
        Walls and measured doors define the candidate regions. Click the map to
        draw a region's outline, or choose a named region below.
      </p>
      <p>
        Room doors are closed for selection; reviewed pass-through thresholds
        remain included. Areas across a door can still be connected by
        directions; floor support alone does not identify indoors.
      </p>
      {!!passThroughDoorIds.length && (
        <section aria-label="Pass-through threshold previews">
          <h3>Included selection thresholds</h3>
          <p>
            This selection includes the measured threshold floor and groups its
            neighbouring areas. Physical doors, access and routes remain
            unchanged; inspect the full region before classifying a vestibule.
          </p>
          {passThroughDoorIds.map((id) => (
            <button
              key={id}
              disabled={locked || busy}
              onClick={() =>
                onOptions({
                  ...options,
                  passThroughDoorIds: passThroughDoorIds.filter(
                    (openId) => openId !== id,
                  ),
                })
              }
            >
              Close selection threshold #{id}
            </button>
          ))}
        </section>
      )}
      <section aria-label="Draw native corrections">
        <h3>Repair or trim this floor</h3>
        <button
          disabled={locked || busy}
          aria-pressed={drawing === "wall"}
          onClick={() => onDrawing("wall")}
        >
          Draw wall gap patch
        </button>
        <button
          disabled={locked || busy}
          aria-pressed={drawing === "outdoor" && kind === "outdoor"}
          onClick={() => {
            setKind("outdoor");
            onDrawing("outdoor");
          }}
        >
          Draw outdoor boundary
        </button>
        <button
          disabled={locked || busy}
          aria-pressed={drawing === "outdoor" && kind === "non-traversable"}
          onClick={() => {
            setKind("non-traversable");
            onDrawing("outdoor");
          }}
        >
          Draw non-traversable boundary
        </button>
        {drawing && drawing !== "partition" && (
          <>
            <p role="status">
              {drawing === "wall"
                ? `Click two native wall faces at the gap (0.02–6 feet). ${draft.length} of 2 points placed. The repair snaps to exact walls and previews before application.`
                : `Click around only the ${kind === "non-traversable" ? "non-traversable" : "outdoor"} portion, then finish. ${draft.length} points placed. Other rooms and real floor holes remain outside the exclusion.`}
            </p>
            {drawing === "outdoor" && (
              <button
                disabled={draft.length < 3 || draft.length > 200}
                onClick={onFinishOutdoor}
              >
                {kind === "non-traversable"
                  ? "Preview non-traversable boundary"
                  : "Preview outdoor boundary"}
              </button>
            )}
            <button onClick={() => onDrawing(undefined)}>Cancel drawing</button>
          </>
        )}
        {options.cropPolygonFeet && (
          <button
            onClick={() => {
              onDrawing(undefined);
              onOptions({ ...options, cropPolygonFeet: undefined });
            }}
          >
            Reset drawn boundary
          </button>
        )}
        {options.manualGapPoints && (
          <button
            onClick={() => {
              onDrawing(undefined);
              onOptions({
                ...options,
                manualGapPoints: undefined,
                previewGapIds: [],
              });
            }}
          >
            Reset drawn wall patch
          </button>
        )}
        <p>
          Save a recommendation or apply a checked patch below. Applying a wall
          patch retraces selection immediately; export and regenerate in Reviter
          to rebuild rooms and directions.
        </p>
      </section>
      <ReviewedAreaPartitionsPanel
        project={project}
        levelId={levelId}
        result={result}
        locked={locked || busy}
        options={options}
        onOptions={onOptions}
        onApply={onApply}
        drawing={drawing === "partition"}
        draft={drawing === "partition" ? draft : []}
        onDrawing={(active) => onDrawing(active ? "partition" : undefined)}
        onDraft={(points) => {
          if (drawing !== "partition") onDrawing("partition");
          onPartitionDraft(points);
        }}
        onLocate={onLocateDoor}
        onShaft={() => {
          setKind("non-traversable");
          onDrawing("outdoor");
        }}
      />
      {menu(
        "Native area floor",
        String(levelId),
        Object.fromEntries(
          project.dataset.nativeLevels.map((l) => [
            String(l.id),
            `${l.name} · #${l.id} · ${l.elevationFeet.toFixed(2)} ft${project.dataset.walkingSupport?.floors.some((f) => Math.abs(f.elevationFeet - l.elevationFeet) < 0.15) ? "" : " · no native slab support"}`,
          ]),
        ),
        (v) => onLevel(Number(v)),
      )}
      {menu(
        "Native selection mode",
        options.mode ?? "connected",
        { connected: "Connected native area", room: "Room focus" },
        (mode) =>
          onOptions({
            ...options,
            mode,
            roomKey: undefined,
            previewGapIds: [],
          }),
      )}
      {options.mode === "room" && (
        <>
          <label>
            Find a room
            <input
              aria-label="Find room enclosure"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Room number or name"
            />
          </label>
          <div className="native-area-region-list">
            {project.dataset.records
              .filter(
                (r) =>
                  r.levelId === levelId &&
                  `${r.number} ${r.name}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .slice(0, 20)
              .map((r) => (
                <button
                  key={r.key}
                  disabled={locked || busy}
                  aria-pressed={options.roomKey === r.key}
                  onClick={() =>
                    onOptions({ ...options, roomKey: r.key, previewGapIds: [] })
                  }
                >
                  Focus {r.number} · {r.name}
                </button>
              ))}
          </div>
        </>
      )}
      {menu(
        "Native slab focus",
        String(options.nativeFloorId ?? "all"),
        {
          all: "All native slabs on this level",
          ...Object.fromEntries(
            (project.dataset.walkingSupport?.floors ?? [])
              .filter(
                (f) =>
                  Math.abs(
                    f.elevationFeet - (level?.elevationFeet ?? Infinity),
                  ) < 0.15,
              )
              .map((f) => [
                String(f.nativeElementId),
                `Slab #${f.nativeElementId}`,
              ]),
          ),
        },
        (v) =>
          onOptions({
            ...options,
            nativeFloorId: v === "all" ? undefined : Number(v),
            roomKey: undefined,
            mode: "connected",
            previewGapIds: [],
          }),
      )}
      <p>
        Focus a measured slab to inspect a link separately from neighbouring
        buildings. Its floor holes and current door thresholds remain.
      </p>
      {options.nativeFloorId !== undefined && (
        <p role="status">
          Selection is limited to slab #{options.nativeFloorId}. Choose All
          native slabs on this level to select elsewhere.
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={showHallways}
          onChange={(e) => onShowHallways(e.target.checked)}
        />{" "}
        Show existing hallway mapping
      </label>
      <label>
        Maximum wall gap (feet)
        <input
          aria-label="Maximum wall gap feet"
          type="number"
          min="0"
          max="6"
          step="0.1"
          value={options.maxGapFeet ?? 0}
          disabled={locked || busy}
          onChange={(e) => {
            const value = e.target.valueAsNumber;
            if (Number.isFinite(value) && value >= 0 && value <= 6)
              onOptions({ ...options, maxGapFeet: value, previewGapIds: [] });
          }}
        />
      </label>
      <p>
        0 keeps native gaps open. Compare 5 or 6 feet; slab, atrium and
        stairwell openings stay protected. Recommendations are assumptions until
        checked against the model.
      </p>
      {!result && !error && (
        <p role="status">Tracing native slabs, walls and door thresholds…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {!!provisionalSeals.length && (
        <details>
          <summary>
            Applied provisional seals · {provisionalSeals.length}
          </summary>
          <p>
            These repairs use recorded human assumptions and still need a later
            source review. Their evidence travels with the reviewed ZIP.
          </p>
          <div className="native-door-check-list">
            {provisionalSeals.map((seal) => (
              <div key={seal.id}>
                <strong>
                  Assumed sealed · #
                  {seal.carrierContactNativeElementIds.join(" / #")}
                  {" / #"}
                  {seal.targetNativeElementId}
                </strong>
                <small>Provisional · revisit required</small>
                <button
                  onClick={() =>
                    onLocateDoor([
                      (seal.nearestCarrierContactFeet[0] +
                        seal.nearestTargetContactFeet[0]) /
                        2,
                      (seal.nearestCarrierContactFeet[1] +
                        seal.nearestTargetContactFeet[1]) /
                        2,
                    ])
                  }
                >
                  Show provisional seal
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      {result && (
        <>
          <p>
            {result.regions.length} native regions · {level?.name} · #{levelId}
          </p>
          {result.cropEvidence && <p role="status">{result.cropEvidence}</p>}
          {showHallways && (
            <p>
              {result.hallwayPartsFeet?.length
                ? "Light blue shows the existing prepared hallway mapping; teal is the native selection."
                : "No current prepared hallway mapping on this native level. It may be stale after geometry/access changes; regenerate to restore it."}
            </p>
          )}
          <NativeGapScanPanel
            project={project}
            levelId={levelId}
            locked={locked || busy}
            onPreview={onConnectionPreview}
            onLocate={onLocateDoor}
            onApply={onApply}
            onRepair={(points) => {
              setGapOpen(true);
              onOptions({
                mode: "connected",
                maxGapFeet: 0,
                manualGapPoints: points,
              });
            }}
          />
          {!!result.gapCandidates?.length && (
            <details
              open={gapOpen}
              onToggle={(e) => setGapOpen(e.currentTarget.open)}
            >
              <summary>
                Wall gap recommendations · {result.gapCandidates.length}
              </summary>
              <p>
                Preview checkboxes change only the selection outline. Check
                “Patch” separately to save or apply a correction. Known door
                portals stay available after regeneration.
              </p>
              <button
                disabled={locked || busy}
                onClick={() =>
                  onOptions({
                    ...options,
                    previewGapIds: result.gapCandidates!.map((c) => c.id),
                  })
                }
              >
                Preview all recommended closures
              </button>
              <button
                disabled={locked || busy}
                onClick={() =>
                  onOptions({
                    ...options,
                    manualGapPoints: undefined,
                    previewGapIds: [],
                  })
                }
              >
                Reset closure preview
              </button>
              <div className="native-door-check-list">
                {[...result.gapCandidates]
                  .sort(
                    (a, b) =>
                      Number(!!b.manualPointsFeet) -
                      Number(!!a.manualPointsFeet),
                  )
                  .map((c) => (
                    <div key={c.id}>
                      <strong>
                        {c.manualPointsFeet ? "Drawn wall repair · " : ""}
                        {c.widthFeet.toFixed(2)} ft · walls #
                        {c.wallEvidence
                          .map((w) => w.nativeElementId)
                          .join(" / #")}
                      </strong>
                      <small>
                        {c.nativeDoorIds.length
                          ? `Measured door: ${c.nativeDoorIds.join(", ")}`
                          : "Unlabelled opening — verify its purpose"}
                      </small>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Preview closure ${c.id}`}
                          checked={
                            options.previewGapIds?.includes(c.id) ?? false
                          }
                          disabled={locked || busy}
                          onChange={(e) =>
                            onOptions({
                              ...options,
                              previewGapIds: e.target.checked
                                ? [...(options.previewGapIds ?? []), c.id]
                                : (options.previewGapIds ?? []).filter(
                                    (id) => id !== c.id,
                                  ),
                            })
                          }
                        />{" "}
                        Preview
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Patch closure ${c.id}`}
                          checked={patchIds.includes(c.id)}
                          disabled={locked || busy}
                          onChange={(e) =>
                            setPatchIds((old) =>
                              e.target.checked
                                ? [...old, c.id]
                                : old.filter((id) => id !== c.id),
                            )
                          }
                        />{" "}
                        Patch
                      </label>
                      <button
                        onClick={() =>
                          onLocateDoor(
                            c.ringsFeet[0].reduce(
                              (p, q) =>
                                [p[0] + q[0] / 4, p[1] + q[1] / 4] as [
                                  number,
                                  number,
                                ],
                              [0, 0] as [number, number],
                            ),
                          )
                        }
                      >
                        Show gap
                      </button>
                    </div>
                  ))}
              </div>
              <label>
                Boundary patch evidence
                <textarea
                  aria-label="Boundary patch evidence"
                  value={gapNotes}
                  maxLength={10000}
                  onChange={(e) => setGapNotes(e.target.value)}
                />
              </label>
              {[false, true].map((apply) => (
                <button
                  key={String(apply)}
                  disabled={
                    locked || busy || !patchIds.length || !gapNotes.trim()
                  }
                  onClick={async () => {
                    setBusy(true);
                    try {
                      onApply(
                        await saveNativeBoundaryPatches(
                          project,
                          result,
                          patchIds,
                          gapNotes,
                          apply,
                        ),
                      );
                      if (apply) {
                        onDrawing(undefined);
                        onOptions({
                          ...options,
                          manualGapPoints: undefined,
                          previewGapIds: [],
                        });
                      }
                      setMessage(
                        apply
                          ? "Boundary patches applied to reviewed geometry. RVT/GLB retained; export and regenerate in Reviter before directions are available."
                          : "Boundary recommendations saved; source geometry and directions unchanged.",
                      );
                    } catch (e) {
                      setMessage(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {apply
                    ? "Apply checked boundary patches"
                    : "Save checked boundary recommendations"}
                </button>
              ))}
            </details>
          )}
          <label>
            <input
              type="checkbox"
              checked={additive}
              onChange={(e) => onAdditive(e.target.checked)}
            />{" "}
            Add to selection (or Shift-click the map)
          </label>
          <label>
            Find a native region
            <input
              aria-label="Find native region"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Room number, name or region ID"
            />
          </label>
          <div className="native-area-region-list">
            {result.regions
              .filter((r) =>
                `${r.id} ${r.roomKeys
                  .map((k) => {
                    const room = project.dataset.records.find(
                      (p) => p.key === k,
                    );
                    return `${room?.number} ${room?.name}`;
                  })
                  .join(" ")}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .slice(0, 50)
              .map((r) => (
                <button
                  key={r.id}
                  aria-pressed={selected.includes(r.id)}
                  onClick={() => onSelect(r.id, additive)}
                >
                  {r.roomKeys
                    .slice(0, 3)
                    .map(
                      (k) =>
                        project.dataset.records.find((p) => p.key === k)
                          ?.number,
                    )
                    .join(" / ") || "Unlabelled native floor"}
                  <small>
                    {r.id} · {r.areaSquareFeet.toFixed(0)} sq ft ·{" "}
                    {r.roomKeys.length} place labels
                  </small>
                </button>
              ))}
          </div>
          <p>
            {selected.length} selected regions ·{" "}
            {regions.reduce((n, r) => n + r.areaSquareFeet, 0).toFixed(0)} sq ft
          </p>
          {!!selected.length && (
            <>
              <button onClick={onClear}>Clear area selection</button>
              <section aria-label="Native boundary checks">
                <h3>Check the enclosure</h3>
                {openFloorEdge >= 0.1 && (
                  <div role="status">
                    <strong>Indoor / outdoor enclosure needs review</strong>
                    <p>
                      {openFloorEdge.toFixed(1)} feet of this selection reaches
                      an open native slab edge. It may be an outdoor connection
                      or missing wall/glazing geometry. Slab support alone does
                      not make it an indoor hallway.
                    </p>
                    <p>
                      Compare the full source model and building entry doors. A
                      floor section can hide walls or a roof above it. Real
                      atrium and stairwell holes are excluded from this edge
                      check.
                    </p>
                  </div>
                )}
                <p>
                  Orange edges also outline holes: rooms inside those holes are
                  excluded. Place labels are location hints, not verified room
                  ownership.
                </p>
                {neighbouringDoors.length > 0 && (
                  <details>
                    <summary>
                      Neighbouring areas across doors ·{" "}
                      {neighbouringDoors.length}
                    </summary>
                    <p>
                      These measured doors separate selection regions. Add only
                      the neighbouring area you have checked. This does not
                      verify indoor enclosure, access or a route.
                    </p>
                    <div className="native-door-check-list">
                      {neighbouringDoors.map((d) => {
                        const id = d.sideRegionIds.find(
                          (id) => id && !selected.includes(id),
                        )!;
                        const neighbour = result.regions.find(
                          (r) => r.id === id,
                        )!;
                        return (
                          <div key={d.nativeElementId}>
                            <strong>Door #{d.nativeElementId}</strong>
                            <small>
                              {neighbour.roomKeys
                                .slice(0, 3)
                                .map(
                                  (key) =>
                                    project.dataset.records.find(
                                      (r) => r.key === key,
                                    )?.number,
                                )
                                .join(" / ") || "Unlabelled native floor"}
                              {" · "}
                              {neighbour.areaSquareFeet.toFixed(0)} sq ft
                              {" · "}
                              {neighbour.roomKeys.length} place labels
                            </small>
                            <button
                              disabled={locked || busy}
                              onClick={() => onLocateDoor(d.pointFeet)}
                            >
                              Show connecting door #{d.nativeElementId}
                            </button>
                            <button
                              disabled={locked || busy}
                              onClick={() => onSelect(id, true)}
                            >
                              Add area across door #{d.nativeElementId}
                            </button>
                            <button
                              disabled={locked || busy}
                              onClick={() =>
                                previewPassThrough(d.nativeElementId)
                              }
                            >
                              Preview pass-through threshold #
                              {d.nativeElementId}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
                {sharedDoors.length > 0 && (
                  <>
                    <p role="status">
                      {sharedDoors.length} measured doors have the same
                      connected area on both sides.
                    </p>
                    <p>
                      A gap at a wall join, jamb or another opening can connect
                      these spaces. This check identifies where to inspect; it
                      does not prove those doors are faulty in Revit.
                    </p>
                    <details>
                      <summary>
                        Inspect door checks · {sharedDoors.length}
                      </summary>
                      <div className="native-door-check-list">
                        {sharedDoors.map((d) => (
                          <div key={d.nativeElementId}>
                            <button
                              disabled={locked || busy}
                              onClick={() => onLocateDoor(d.pointFeet)}
                            >
                              Show door #{d.nativeElementId}
                            </button>
                            {!passThroughDoorIds.includes(
                              d.nativeElementId,
                            ) && (
                              <button
                                disabled={locked || busy}
                                onClick={() =>
                                  previewPassThrough(d.nativeElementId)
                                }
                              >
                                Preview pass-through threshold #
                                {d.nativeElementId}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  </>
                )}
              </section>
              <h3>Classify selected areas</h3>
              {menu(
                "Native area classification",
                kind,
                nativeAreaKinds,
                setKind,
              )}
              <label>
                Area label
                <input
                  aria-label="Native area label"
                  value={label}
                  maxLength={200}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="E.g. Back staff corridor"
                />
              </label>
              <label>
                Evidence and reason
                <textarea
                  aria-label="Native area evidence"
                  value={notes}
                  maxLength={10000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the walls, doors and intended use you checked."
                />
              </label>
              <p>
                Contains {keys.length} place label hints. Labels and door
                portals are retained; disconnected regions stay separate.
              </p>
              <button
                disabled={locked || busy || !label.trim() || !notes.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    onApply(
                      await saveNativeAreaDecision(project, result, selected, {
                        kind,
                        label,
                        notes,
                      }),
                    );
                    setMessage(
                      "Area decision saved in the project. Export reviewed project to keep it. Classification is proposed; access and routing require review and regeneration.",
                    );
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save proposal
              </button>
              {kind === "outdoor" || kind === "non-traversable" ? (
                <section
                  aria-label={
                    kind === "outdoor"
                      ? "Outdoor exclusion"
                      : "Non-traversable exclusion"
                  }
                >
                  <p>
                    Excludes the entire selected footprint from native selection
                    and all indoor directions, including connections without
                    place labels. Native floors, walls, doors and source
                    geometry are retained. Place identities and their access
                    rules stay unchanged. Include only the footprint confirmed
                    {kind === "outdoor" ? " outdoors" : " non-traversable"} by
                    the full source model.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={outdoorChecked}
                      onChange={(e) => setOutdoorChecked(e.target.checked)}
                    />
                    I checked the full source model and this entire selection is
                    {kind === "outdoor" ? " outdoors" : " non-traversable"}
                  </label>
                  <button
                    disabled={
                      locked ||
                      busy ||
                      !outdoorChecked ||
                      !label.trim() ||
                      !notes.trim() ||
                      !!options.previewGapIds?.length ||
                      !!options.roomKey
                    }
                    onClick={async () => {
                      setBusy(true);
                      try {
                        onApply(
                          await applyNativeAreaDecision(
                            project,
                            result,
                            selected,
                            { kind, label, notes },
                            [],
                          ),
                        );
                        onClear();
                        onDrawing(undefined);
                        onOptions({ ...options, cropPolygonFeet: undefined });
                        setMessage(
                          `Confirmed ${kind === "outdoor" ? "outdoor" : "non-traversable"} footprint excluded from selection and indoor routes. Export the reviewed project to retain it; regenerate in Reviter to rebuild circulation cells. Native geometry remains intact.`,
                        );
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {kind === "outdoor"
                      ? "Exclude outdoors"
                      : "Exclude non-traversable footprint"}{" "}
                    from selection and routes
                  </button>
                  {(options.roomKey || !!options.previewGapIds?.length) && (
                    <p>
                      Use complete native regions without temporary gap previews
                      to define an exclusion boundary.
                    </p>
                  )}
                </section>
              ) : (
                <details open>
                  <summary>
                    Apply to existing places · {applyKeys.length}
                  </summary>
                  <p>
                    Choose the existing places to change. None are selected
                    automatically.
                  </p>
                  <p>
                    Changes the entire listed places: hallway allows public
                    passage, staff only excludes public routes, off limits
                    disables walking. Existing walls, doors, identities and
                    graph connections remain. New connections and merged
                    boundaries require regeneration in Reviter.
                  </p>
                  {keys.map((key) => {
                    const r = project.dataset.records.find(
                      (r) => r.key === key,
                    )!;
                    return (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={applyKeys.includes(key)}
                          onChange={(e) =>
                            setApplyKeys((old) =>
                              e.target.checked
                                ? [...old, key]
                                : old.filter((k) => k !== key),
                            )
                          }
                        />
                        {r.number} · {r.name}
                      </label>
                    );
                  })}
                  <button
                    disabled={
                      locked ||
                      busy ||
                      !label.trim() ||
                      !notes.trim() ||
                      !applyKeys.length ||
                      !!options.previewGapIds?.length ||
                      kind === "unclassified"
                    }
                    onClick={async () => {
                      setBusy(true);
                      try {
                        onApply(
                          await applyNativeAreaDecision(
                            project,
                            result,
                            selected,
                            { kind, label, notes },
                            applyKeys,
                          ),
                        );
                        setMessage(
                          "Classification applied to the checked places and saved in the project. Source access rules now affect routing. Regenerate in Reviter to rebuild circulation geometry and any missing connections.",
                        );
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Apply classification to map
                  </button>
                  {!!options.previewGapIds?.length && (
                    <p>
                      Apply reviewed boundary patches and retrace before
                      applying a classification from this preview.
                    </p>
                  )}
                </details>
              )}
            </>
          )}
          {message && <p role="status">{message}</p>}
          <details>
            <summary>Boundary evidence and limits</summary>
            <ul>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p>
              Selected native floor IDs:{" "}
              {[...new Set(regions.flatMap((r) => r.nativeFloorIds))].join(
                ", ",
              ) || "none"}
              . Nearby measured door IDs:{" "}
              {[...new Set(regions.flatMap((r) => r.nativeDoorIds))].join(
                ", ",
              ) || "none"}
              . Door proximity is evidence to inspect, not ownership or access
              approval.
            </p>
          </details>
        </>
      )}
      {!!project.dataset.indoorExclusions?.areas.length && (
        <section
          aria-label={
            project.dataset.indoorExclusions.areas.some(
              (a) => a.reason === "off-limits",
            )
              ? "Excluded footprints"
              : "Excluded outdoor areas"
          }
        >
          <h3>Excluded from indoor selection and routes</h3>
          {project.dataset.indoorExclusions.areas.map((a) => (
            <div key={a.id}>
              <strong>{a.label}</strong>
              <small>
                {a.reason === "off-limits"
                  ? "Non-traversable footprint"
                  : "Outdoor footprint"}{" "}
                · Native level #{a.levelId} · slab #
                {a.nativeFloorIds.join(" / #")}
              </small>
              <button
                disabled={locked || busy}
                onClick={() => {
                  try {
                    onApply(removeOutdoorExclusion(project, a.id));
                    setMessage(
                      `${a.reason === "off-limits" ? "Footprint" : "Outdoor"} exclusion removed. The proposal is retained; regenerate previously compiled circulation to restore missing walking branches.`,
                    );
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Restore indoor scope: {a.label}
              </button>
            </div>
          ))}
        </section>
      )}
      <h3>Saved area decisions · {decisions.length}</h3>
      <p>
        Saved boundary patches ·{" "}
        {project.rooms.nativeBoundaryPatches?.patches.length ?? 0}
        {project.dataset.boundaryPatchState?.regenerated === false
          ? " · regeneration needed"
          : ""}
      </p>
      <div className="native-door-check-list">
        <p>
          Corrections are saved inside the reviewed ZIP, alongside the preserved
          RVT. Save a separate JSON copy to replay them against the same model.
          Import adds proposals; it never applies new geometry automatically.
        </p>
        <input
          ref={patchFileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Geometry patch JSON"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setBusy(true);
            try {
              if (file.size > 10 * 1024 * 1024)
                throw new Error("Geometry patch JSON exceeds the 10 MB limit.");
              const next = importNativeBoundaryPatchFile(
                project,
                JSON.parse(await file.text()),
              );
              const count =
                (next.rooms.nativeBoundaryPatches?.patches.length ?? 0) -
                (project.rooms.nativeBoundaryPatches?.patches.length ?? 0);
              onApply(next);
              setMessage(
                `${count} new boundary proposals imported. Existing applied corrections are retained; inspect each new proposal before applying.`,
              );
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        <button
          disabled={locked || busy}
          onClick={() => patchFileInput.current?.click()}
        >
          Import geometry patch JSON
        </button>
        <button
          disabled={
            busy || !project.rooms.nativeBoundaryPatches?.patches.length
          }
          onClick={() => {
            try {
              const url = URL.createObjectURL(
                new Blob(
                  [JSON.stringify(nativeBoundaryPatchFile(project), null, 2)],
                  { type: "application/json" },
                ),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `${project.dataset.source.modelFileName.replace(/\.[^.]+$/, "")}.native-boundary-patches.json`;
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setMessage(
                "Separate geometry patch JSON saved. Export reviewed project also preserves these corrections inside the ZIP.",
              );
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Export geometry patch JSON
        </button>
        {project.rooms.nativeBoundaryPatches?.patches.map((p) => (
          <div key={p.id}>
            <strong>
              {p.widthFeet.toFixed(2)} ft · #{p.levelId} · {p.status}
            </strong>
            <small>
              Walls #{p.wallEvidence.map((w) => w.nativeElementId).join(" / #")}
            </small>
            <p>{p.notes}</p>
            {project.rooms.enclosureProposals?.records.some((r) =>
              r.boundaryPatchIds?.includes(p.id),
            ) && (
              <>
                <button
                  onClick={() => {
                    setReviewPatchId(p.id);
                    if (levelId !== p.levelId) onLevel(p.levelId);
                    onLocateDoor(
                      p.ringsFeet[0].reduce(
                        (s, q) =>
                          [s[0] + q[0] / 4, s[1] + q[1] / 4] as [
                            number,
                            number,
                          ],
                        [0, 0] as [number, number],
                      ),
                    );
                  }}
                >
                  Review decision for walls #
                  {p.wallEvidence.map((w) => w.nativeElementId).join(" / #")}
                </button>
              </>
            )}
            <button
              disabled={locked || busy}
              onClick={() => {
                if (levelId !== p.levelId) onLevel(p.levelId);
                setPendingPatch(p.id);
              }}
            >
              {p.status === "applied"
                ? "Show applied boundary"
                : "Preview saved boundary"}{" "}
              {p.id}
            </button>
          </div>
        ))}
      </div>
      {decisionProposal && decisionPatch && (
        <ProposalDecisionControls
          project={project}
          catalog={project.rooms.enclosureProposals!}
          roomKey={decisionProposal.key}
          evidenceSha256={
            result?.levelId === decisionPatch.levelId
              ? result.reviewEvidenceSha256
              : undefined
          }
          onApply={onApply}
        />
      )}
      {decisions.map((d) => (
        <button
          key={d.id}
          onClick={() => {
            setPendingDecision(d.id);
            onLevel(d.levelId);
          }}
        >
          <strong>{d.label}</strong> · {nativeAreaKinds[d.kind]}
          <small>
            #{d.levelId} · {d.status}
            {result?.levelId === d.levelId &&
            result.geometrySha256 !== d.geometrySha256
              ? " · geometry changed: reselect regions"
              : ""}
          </small>
        </button>
      ))}
    </section>
  );
}
