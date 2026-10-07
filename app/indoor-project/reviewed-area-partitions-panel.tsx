import { useEffect, useRef, useState } from "react";
import type { IndoorProject } from "./package";
import type { NativeAreaOptions, NativeAreaResult } from "./native-area-review";
import {
  restoreReviewedAreaPartition,
  saveReviewedAreaPartition,
  snapReviewedAreaPartitionPoints,
  type ReviewedAreaPartitionCheck,
  type ReviewedAreaPartitions,
} from "./reviewed-area-partitions";

type Partition = Parameters<typeof saveReviewedAreaPartition>[1];
type Point = [number, number];
const boundaryKinds = {
  shutter: "Shutter / Flexiglide front",
  "open-entrance": "Doorless entrance",
  "pickup-front": "Pickup / counter front",
  "missing-partition": "Missing physical partition",
} as const;

/** Authoring-only closures. Physical access is deliberately outside this tool. */
export function ReviewedAreaPartitionsPanel({
  project,
  levelId,
  result,
  locked,
  options,
  onOptions,
  onApply,
  drawing,
  draft,
  onDrawing,
  onDraft,
  onLocate,
  onShaft,
}: {
  project: IndoorProject;
  levelId: number;
  result?: NativeAreaResult;
  locked: boolean;
  options: NativeAreaOptions;
  onOptions: (options: NativeAreaOptions) => void;
  onApply: (project: IndoorProject) => void;
  drawing: boolean;
  draft: Point[];
  onDrawing: (active: boolean) => void;
  onDraft: (points: Point[]) => void;
  onLocate: (point: Point) => void;
  onShaft: () => void;
}) {
  const [kind, setKind] = useState<keyof typeof boundaryKinds>("shutter");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceKind, setEvidenceKind] = useState<
    Partition["evidence"]["kind"]
  >("reviewed-assumption");
  const [elementIds, setElementIds] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupConfirmed, setGroupConfirmed] = useState(false);
  const [groupChecks, setGroupChecks] = useState<
    { id: string; check: ReviewedAreaPartitionCheck }[]
  >([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [physicalHash, setPhysicalHash] = useState("");
  const [checkState, setCheckState] = useState<{
    id: string;
    check: ReviewedAreaPartitionCheck;
  }>();
  const [coordinates, setCoordinates] = useState(["", "", "", ""]);
  const projectRef = useRef(project);
  projectRef.current = project;
  const levelRef = useRef(levelId);
  levelRef.current = levelId;
  const applyWorkerRef = useRef<Worker>();
  useEffect(() => () => applyWorkerRef.current?.terminate(), []);
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    setCoordinates(
      [0, 1, 2, 3].map((i) => {
        const value = draft[Math.floor(i / 2)]?.[i % 2];
        return value === undefined ? "" : String(value);
      }),
    );
    setConfirmed(false);
  }, [draftKey]);
  useEffect(() => {
    setLabel("");
    setNotes("");
    setElementIds("");
    setConfirmed(false);
    setMessage("");
    setGroupIds([]);
  }, [levelId, project.dataset.source.modelSha256]);
  useEffect(() => {
    setConfirmed(false);
    setGroupConfirmed(false);
  }, [project.dataset, JSON.stringify(options), JSON.stringify(groupIds)]);
  useEffect(() => {
    let current = true;
    setPhysicalHash("");
    setCheckState(undefined);
    setGroupChecks([]);
    const partition = project.rooms.reviewedAreaPartitions?.partitions.find(
      (p) =>
        p.levelId === levelId && options.previewPartitionIds?.includes(p.id),
    );
    const worker = new Worker(
      new URL("./reviewed-area-partitions.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      physicalHash?: string;
      check?: ReviewedAreaPartitionCheck;
      checks?: { id: string; check: ReviewedAreaPartitionCheck }[];
      error?: string;
    }>) => {
      if (!current) return;
      if (data.error) setMessage(data.error);
      if (data.physicalHash) setPhysicalHash(data.physicalHash);
      if (data.checks) setGroupChecks(data.checks);
      if (partition && data.check)
        setCheckState({ id: partition.id, check: data.check });
      worker.terminate();
    };
    worker.onerror = () => {
      if (current)
        setMessage(
          "Area boundary validation failed. Reopen the native floor and try again.",
        );
      worker.terminate();
    };
    worker.postMessage({
      data: project.dataset,
      levelId,
      partition,
      checkIds: options.previewPartitionIds,
    });
    return () => {
      current = false;
      worker.terminate();
    };
  }, [project.dataset, levelId, JSON.stringify(options.previewPartitionIds)]);
  const entries =
    project.rooms.reviewedAreaPartitions?.partitions.filter(
      (p) => p.levelId === levelId,
    ) ?? [];
  const group = entries.filter(
    (p) => groupIds.includes(p.id) && p.status === "proposed",
  );
  const groupPreviewed =
    !!group.length &&
    !options.ignoreAppliedPartitions &&
    group.length === options.previewPartitionIds?.length &&
    group.every((p) => options.previewPartitionIds?.includes(p.id));
  const groupReady =
    groupPreviewed &&
    !!physicalHash &&
    result?.levelId === levelId &&
    JSON.stringify(result.options) === JSON.stringify(options) &&
    !result.options?.ignoreAppliedPartitions &&
    result.options?.previewPartitionIds?.length === group.length &&
    group.every(
      (p) =>
        result.logicalPartitionIds?.includes(p.id) &&
        groupChecks.some((c) => c.id === p.id && c.check.valid),
    );
  const level = project.dataset.nativeLevels.find((l) => l.id === levelId);
  const disabled = locked || busy;
  const canSave =
    !disabled &&
    !!physicalHash &&
    !!level &&
    draft.length === 2 &&
    coordinates.every((q) => q.trim() && Number.isFinite(Number(q))) &&
    !!label.trim() &&
    !!notes.trim() &&
    (evidenceKind !== "native-endpoints" || !!elementIds.trim());

  const preview = (id: string) =>
    onOptions({
      ...options,
      previewPartitionIds: [id],
      ignoreAppliedPartitions: false,
    });
  const locate = (p: Partition) =>
    onLocate([
      p.pointsFeet.reduce((sum, q) => sum + q[0], 0) / p.pointsFeet.length,
      p.pointsFeet.reduce((sum, q) => sum + q[1], 0) / p.pointsFeet.length,
    ]);
  const updateCoordinate = (index: number, value: string) => {
    const next = [...coordinates];
    next[index] = value;
    setCoordinates(next);
    setConfirmed(false);
    if (next.slice(0, 2).every((q) => q.trim() && Number.isFinite(Number(q)))) {
      const start: Point = [Number(next[0]), Number(next[1])];
      if (next.slice(2).every((q) => q.trim() && Number.isFinite(Number(q))))
        onDraft([start, [Number(next[2]), Number(next[3])]]);
      else onDraft([start]);
    }
  };
  const save = async (addAnother = false) => {
    if (!level || !physicalHash || draft.length !== 2) return;
    setBusy(true);
    setMessage("");
    try {
      if (elementIds.trim() && !/^\d+(?:\s*,\s*\d+)*$/.test(elementIds.trim()))
        throw new Error("Enter native wall or column IDs separated by commas.");
      const partition: Partition = {
        id: `area-partition-${crypto.randomUUID()}`,
        levelId,
        elevationFeet: level.elevationFeet,
        geometrySha256: physicalHash,
        kind,
        pointsFeet: draft.map((p) => [...p] as Point),
        closed: false,
        status: "proposed",
        label: label.trim(),
        notes: notes.trim(),
        evidence: {
          kind: evidenceKind,
          nativeElementIds: elementIds.trim()
            ? [...new Set(elementIds.split(",").map((id) => Number(id.trim())))]
            : [],
          reason: notes.trim(),
        },
        selection: "closed",
        navigation: "unchanged",
      };
      const next = await saveReviewedAreaPartition(project, partition);
      onApply(next);
      const ids = [...group.map((p) => p.id), partition.id];
      setGroupIds(ids);
      onOptions({
        ...options,
        previewPartitionIds: ids,
        ignoreAppliedPartitions: false,
      });
      if (addAnother) {
        onDraft([]);
        onDrawing(true);
        setLabel("");
        setElementIds("");
        setEvidenceKind("reviewed-assumption");
      } else onDrawing(false);
      setConfirmed(false);
      setMessage(
        addAnother
          ? "Boundary added to the group. Draw the next two endpoints, give it a label and add it. Your earlier proposals are saved; nothing is applied yet."
          : "Boundary proposal saved in the group. Preview the boundaries together, then apply the reviewed group or an individual boundary. Export reviewed project to keep them in the ZIP.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const applyBoundaries = async (ids: string[]) => {
    setBusy(true);
    setMessage("");
    try {
      const appliedPartitions = await new Promise<ReviewedAreaPartitions>(
        (resolve, reject) => {
          const worker = new Worker(
            new URL("./reviewed-area-partitions.worker.ts", import.meta.url),
            { type: "module" },
          );
          applyWorkerRef.current = worker;
          worker.onmessage = ({
            data,
          }: MessageEvent<{
            appliedPartitions?: ReviewedAreaPartitions;
            error?: string;
          }>) => {
            worker.terminate();
            applyWorkerRef.current = undefined;
            if (projectRef.current !== project || levelRef.current !== levelId)
              return reject(
                new Error(
                  "The project changed during validation. Preview these boundaries again.",
                ),
              );
            if (data.error || !data.appliedPartitions)
              return reject(
                new Error(
                  data.error ??
                    "Boundary application returned no checked metadata.",
                ),
              );
            resolve(data.appliedPartitions);
          };
          worker.onerror = () => {
            worker.terminate();
            applyWorkerRef.current = undefined;
            reject(
              new Error(
                "Boundary application failed. Preview the boundaries again before applying.",
              ),
            );
          };
          worker.postMessage({ data: project.dataset, levelId, applyIds: ids });
        },
      );
      onApply({
        ...project,
        rooms: { ...project.rooms, reviewedAreaPartitions: appliedPartitions },
        dataset: {
          ...project.dataset,
          reviewedAreaPartitions: appliedPartitions,
        },
      });
      setGroupIds((current) => current.filter((id) => !ids.includes(id)));
      onOptions({
        ...options,
        previewPartitionIds: [],
        ignoreAppliedPartitions: false,
      });
      setConfirmed(false);
      setGroupConfirmed(false);
      setMessage(
        `${ids.length} area ${ids.length === 1 ? "boundary applied" : "boundaries applied"} to native selection. Physical walls, doors, access and routing are unchanged. Export reviewed project to save all boundaries and their history together.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="reviewed-area-partitions-panel">
      <summary>Define open entrances and partitions</summary>
      <p>
        Separate selection areas at a shutter, pickup front or doorless
        entrance. A logical boundary follows the opening; it does not add a
        physical wall or change access and directions.
      </p>
      <label>
        Boundary type
        <select
          aria-label="Area boundary type"
          disabled={disabled}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as keyof typeof boundaryKinds);
            setConfirmed(false);
          }}
        >
          {Object.entries(boundaryKinds).map(([value, title]) => (
            <option key={value} value={value}>
              {title}
            </option>
          ))}
        </select>
      </label>
      {kind === "missing-partition" && (
        <p>
          A missing physical partition can be recorded and compared here as a
          virtual boundary. Reconstructing a real wall requires a separately
          checked source repair and regeneration.
        </p>
      )}
      <button
        disabled={disabled}
        aria-pressed={drawing}
        onClick={() => onDrawing(!drawing)}
      >
        {drawing ? "Cancel area boundary drawing" : "Draw area boundary"}
      </button>
      <p role="status">
        {drawing
          ? `Click the two ends of the opening on this native floor. ${Math.min(draft.length, 2)} of 2 points placed. You can refine the coordinates below.`
          : "Use two map clicks or enter the model coordinates in feet below."}
      </p>
      <fieldset className="area-partition-coordinates">
        <legend>Boundary endpoints · model feet</legend>
        {["Start X", "Start Y", "End X", "End Y"].map((title, index) => (
          <label key={title}>
            {title}
            <input
              aria-label={`Area boundary ${title}`}
              type="number"
              step="any"
              value={coordinates[index]}
              disabled={disabled}
              onChange={(e) => updateCoordinate(index, e.target.value)}
            />
          </label>
        ))}
      </fieldset>
      {draft.length === 2 && (
        <p>
          Opening span:{" "}
          {Math.hypot(
            draft[1][0] - draft[0][0],
            draft[1][1] - draft[0][1],
          ).toFixed(2)}{" "}
          ft. This is a selection boundary, not a measured door width.
        </p>
      )}
      <button
        disabled={disabled || draft.length !== 2}
        onClick={() => {
          try {
            const snapped = snapReviewedAreaPartitionPoints(
              project.dataset,
              levelId,
              draft as [Point, Point],
            );
            if (snapped.details.some((p) => p.nativeElementId === undefined))
              throw new Error(
                "Both endpoints need a precise native wall within 0.5 ft. Refine the coordinates or retain a reviewed assumption.",
              );
            onDraft(snapped.pointsFeet);
            setElementIds(snapped.nativeElementIds.join(", "));
            setEvidenceKind("native-endpoints");
            setConfirmed(false);
            setMessage(
              "Both endpoints snapped to current native wall faces. Inspect the complete line before saving.",
            );
          } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
          }
        }}
      >
        Snap area boundary endpoints to native walls
      </button>
      <label>
        Boundary label
        <input
          aria-label="Area boundary label"
          value={label}
          maxLength={200}
          disabled={disabled}
          placeholder="E.g. Bookstore shutter front"
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label>
        Evidence type
        <select
          aria-label="Area boundary evidence type"
          value={evidenceKind}
          disabled={disabled}
          onChange={(e) => {
            setEvidenceKind(e.target.value as Partition["evidence"]["kind"]);
            setConfirmed(false);
          }}
        >
          <option value="reviewed-assumption">
            Reviewed assumption · revisit later
          </option>
          <option value="native-endpoints">
            Checked native wall / column endpoints
          </option>
        </select>
      </label>
      <label>
        Supporting native wall / column IDs
        <input
          aria-label="Area boundary supporting IDs"
          value={elementIds}
          disabled={disabled}
          placeholder="Optional for an assumption; e.g. 703652, 703653"
          onChange={(e) => setElementIds(e.target.value)}
        />
      </label>
      <label>
        Evidence and reason
        <textarea
          aria-label="Area boundary evidence"
          value={notes}
          disabled={disabled}
          maxLength={10000}
          placeholder="Describe the opening, shutter or divider, its endpoints and what you checked. Record uncertain dimensions as an assumption."
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button disabled={!canSave} onClick={() => void save()}>
        Save area boundary proposal
      </button>
      <button disabled={!canSave} onClick={() => void save(true)}>
        Add another boundary
      </button>
      <p>
        Add another boundary saves the current line as a proposal and starts the
        next. The type and evidence notes stay available; check the endpoints
        and evidence for each new line.
      </p>
      <button disabled={disabled} onClick={onShaft}>
        Define elevator shaft footprint
      </button>
      <p>
        An elevator shaft needs its full non-traversable footprint, including
        any missing floor opening. Use the footprint tool, inspect the landing
        and lift entrance, then confirm exclusion separately. A boundary line
        does not certify a shaft or lift route.
      </p>
      {message && <p role="status">{message}</p>}
      <h3>Saved area boundaries · {entries.length}</h3>
      {!!group.length && (
        <section aria-label="Boundary group">
          <h4>Boundary group · {group.length}</h4>
          <p>
            Preview all included proposals together over the applied boundaries,
            then inspect the resulting selections. No physical walls or routes
            are changed.
          </p>
          <button
            disabled={disabled || !physicalHash}
            onClick={() => {
              setGroupConfirmed(false);
              onOptions({
                ...options,
                previewPartitionIds: group.map((p) => p.id),
                ignoreAppliedPartitions: false,
              });
              locate(group[0]);
            }}
          >
            Preview boundary group
          </button>
          {groupPreviewed && !groupReady && (
            <p role="status">
              Waiting for a valid combined native selection preview. Check any
              boundary warnings below.
            </p>
          )}
          {groupPreviewed &&
            groupChecks
              .filter((c) => !c.check.valid)
              .map((c) => (
                <p role="alert" key={c.id}>
                  {entries.find((p) => p.id === c.id)?.label}:{" "}
                  {c.check.errors.join(" ")}
                </p>
              ))}
          <label>
            <input
              type="checkbox"
              checked={groupConfirmed}
              disabled={disabled || !groupReady}
              onChange={(e) => setGroupConfirmed(e.target.checked)}
            />
            I reviewed these boundaries and will use them for selection only
          </label>
          <button
            disabled={disabled || !groupReady || !groupConfirmed}
            onClick={() => void applyBoundaries(group.map((p) => p.id))}
          >
            Apply boundary group
          </button>
        </section>
      )}
      {!!entries.length && (
        <>
          <button
            disabled={disabled}
            aria-pressed={
              !options.ignoreAppliedPartitions &&
              !options.previewPartitionIds?.length
            }
            onClick={() =>
              onOptions({
                ...options,
                previewPartitionIds: [],
                ignoreAppliedPartitions: false,
              })
            }
          >
            Show applied selection
          </button>
          <button
            disabled={disabled}
            aria-pressed={!!options.ignoreAppliedPartitions}
            onClick={() =>
              onOptions({
                ...options,
                previewPartitionIds: [],
                ignoreAppliedPartitions: true,
              })
            }
          >
            Show native geometry without area boundaries
          </button>
          <p>
            Preview a boundary or a group over the applied boundaries. The
            comparison keeps native walls, columns, door metadata and floor
            holes intact.
          </p>
        </>
      )}
      <div className="native-door-check-list">
        {entries.map((p) => {
          const stale = !!physicalHash && p.geometrySha256 !== physicalHash;
          const checked =
            !stale && checkState?.id === p.id ? checkState.check : undefined;
          const active = options.previewPartitionIds?.includes(p.id) ?? false;
          return (
            <div key={p.id}>
              <strong>
                {p.label} · {p.status}
              </strong>
              {p.status === "proposed" && (
                <label>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={groupIds.includes(p.id)}
                    aria-label={`Include in boundary group: ${p.label}`}
                    onChange={(e) =>
                      setGroupIds((current) =>
                        e.target.checked
                          ? [...new Set([...current, p.id])]
                          : current.filter((id) => id !== p.id),
                      )
                    }
                  />
                  Include in boundary group
                </label>
              )}
              <small>
                {p.kind in boundaryKinds
                  ? boundaryKinds[p.kind as keyof typeof boundaryKinds]
                  : "Shaft outline proposal"}{" "}
                ·{" "}
                {p.evidence.kind === "reviewed-assumption"
                  ? "provisional assumption"
                  : "native endpoint evidence"}
                {stale ? " · geometry changed: review again" : ""}
              </small>
              <p>{p.notes}</p>
              <button
                disabled={disabled || stale || !physicalHash}
                aria-pressed={active}
                onClick={() => {
                  setConfirmed(false);
                  preview(p.id);
                  locate(p);
                }}
              >
                Preview area boundary: {p.label}
              </button>
              {active && (
                <>
                  {checked && !checked.valid && (
                    <p role="alert">{checked.errors.join(" ")}</p>
                  )}
                  <p>
                    Native trace: {result?.regions.length ?? "…"} regions on
                    this level. Inspect both sides for other connections; a line
                    alone does not certify a room enclosure.
                  </p>
                  {p.status === "proposed" &&
                    p.kind !== "shaft-boundary" &&
                    options.previewPartitionIds?.length === 1 && (
                      <>
                        <label>
                          <input
                            type="checkbox"
                            checked={confirmed}
                            disabled={disabled || stale || !checked?.valid}
                            onChange={(e) => setConfirmed(e.target.checked)}
                          />
                          I reviewed this boundary and will use it for selection
                          only
                        </label>
                        <button
                          disabled={
                            disabled || stale || !confirmed || !checked?.valid
                          }
                          onClick={async () => {
                            await applyBoundaries([p.id]);
                          }}
                        >
                          Apply selection boundary: {p.label}
                        </button>
                      </>
                    )}
                </>
              )}
              {p.status === "applied" && (
                <button
                  disabled={disabled}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      onApply(
                        await restoreReviewedAreaPartition(project, p.id),
                      );
                      onOptions({
                        ...options,
                        previewPartitionIds: [],
                        ignoreAppliedPartitions: false,
                      });
                      setMessage(
                        "Selection boundary restored to a proposal. Its evidence and review history remain in the project.",
                      );
                    } catch (error) {
                      setMessage(
                        error instanceof Error ? error.message : String(error),
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Restore open selection: {p.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p>
        Boundaries and their evidence are saved separately in the reviewed
        master ZIP. They do not edit the original Revit geometry or add visitor
        rooms.
      </p>
    </details>
  );
}
