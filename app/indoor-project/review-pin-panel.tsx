import { useState } from "react";
import { zipSync, strToU8 } from "fflate";
import type { IndoorDataset } from "./contract";
import { reviewPinContext, type ReviewPin } from "./review-pins";
import type { WallCapture } from "./wall-review-layer";
export function ReviewPinPanel({
  pin,
  data,
  onSave,
  onMove,
  onRemove,
  onLocate,
  capture,
}: {
  pin: ReviewPin;
  data: IndoorDataset;
  onSave: (pin: ReviewPin) => void;
  onMove: () => void;
  onRemove: () => void;
  onLocate: () => void;
  capture: WallCapture;
}) {
  const [label, setLabel] = useState(pin.label),
    [notes, setNotes] = useState(pin.notes),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const edited = () => ({ ...pin, label: label.trim() || pin.label, notes });
  const evidence = () => reviewPinContext(data, edited());
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(evidence(), null, 2));
      setStatus("Copied pin context.");
    } catch {
      setStatus("Copy unavailable. Download the review instead.");
    }
  }
  async function download() {
    setBusy(true);
    try {
      const { png, camera } = await capture();
      const bytes = zipSync({
        "map.png": png,
        "review.json": strToU8(
          JSON.stringify({ ...evidence(), camera }, null, 2),
        ),
        "README.txt": strToU8(
          `Magenta marks the review pin: ${edited().label}. Attach map.png and review.json to your AI review.\n${evidence().reviewGuidance}\n`,
        ),
      });
      const url = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], {
          type: "application/zip",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pin.id}-review.zip`;
      a.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus("Downloaded pin image, coordinates and notes.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div data-testid="review-pin-panel">
      <h3>{pin.label}</h3>
      <dl>
        <dt>Floor / native level</dt>
        <dd>
          {evidence().floor} · #{pin.levelId}
        </dd>
        <dt>Model coordinates (feet)</dt>
        <dd>{pin.pointFeet.map((n) => n.toFixed(3)).join(", ")}</dd>
        <dt>Nearby wall reference</dt>
        <dd>
          {pin.wallKey
            ? `#${evidence().nearbyWall?.selection.nativeElementId} · proximity hint`
            : "No nearby source wall"}
        </dd>
      </dl>
      <button onClick={onLocate}>Show pin on map</button>
      <label>
        Pin label
        <input
          aria-label="Review pin label"
          value={label}
          maxLength={200}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label>
        What needs review?
        <textarea
          aria-label="Review pin notes"
          value={notes}
          maxLength={4000}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="project-actions">
        <button
          onClick={() => {
            onSave(edited());
            setStatus("Pin notes saved. Export the project to keep them.");
          }}
        >
          Save pin notes
        </button>
        <button onClick={onMove}>Move pin</button>
        <button onClick={onRemove}>Remove pin</button>
      </div>
      <div className="project-actions">
        <button onClick={() => void copy()}>Copy pin context</button>
        <button disabled={busy} onClick={() => void download()}>
          {busy ? "Capturing map…" : "Download pin review"}
        </button>
      </div>
      <p aria-live="polite">{status}</p>
    </div>
  );
}
export function ReviewPinControls({
  pins,
  data,
  levelIds,
  levelId,
  placing,
  onLevel,
  onPlace,
  onCancel,
  onSelect,
}: {
  pins: ReviewPin[];
  data: IndoorDataset;
  levelIds: number[];
  levelId: number;
  placing: boolean;
  onLevel: (id: number) => void;
  onPlace: () => void;
  onCancel: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <h2>Reference pins</h2>
      <p>Drop a dot at a wall, gap or any place you want reviewed.</p>
      {levelIds.length > 1 && (
        <label>
          Pin native level
          <select
            aria-label="Pin native level"
            value={levelId}
            onChange={(e) => onLevel(Number(e.target.value))}
          >
            {levelIds.map((id) => (
              <option key={id} value={id}>
                {data.nativeLevels.find((level) => level.id === id)?.name ??
                  `Level #${id}`}{" "}
                · #{id}
              </option>
            ))}
          </select>
        </label>
      )}
      <button onClick={placing ? onCancel : onPlace}>
        {placing ? "Cancel pin placement" : "Drop review pin"}
      </button>
      {placing && (
        <p role="status">
          Click or tap the floor plan to place the dot. Placement uses 2D for
          precise wall positioning.
        </p>
      )}
      {pins
        .filter((p) => levelIds.includes(p.levelId))
        .map((pin) => (
          <button
            className="project-search-item"
            key={pin.id}
            onClick={() => onSelect(pin.id)}
          >
            {pin.label}
          </button>
        ))}
    </section>
  );
}
