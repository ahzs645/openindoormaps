import { useState } from "react";
import { zipSync, strToU8 } from "fflate";
import type { WallReviewContext } from "./wall-review";
import type { WallCapture } from "./wall-review-layer";

export function WallReviewPanel({
  context,
  capture,
  onFit,
}: {
  context: WallReviewContext;
  capture: WallCapture;
  onFit: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const evidence = () => ({ ...context, reviewNotes: notes });
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(JSON.stringify(evidence(), null, 2));
      setStatus("Copied wall source context.");
    } catch {
      setStatus("Copy unavailable. Download the review bundle instead.");
    }
  }
  async function download() {
    setBusy(true);
    try {
      const { png, camera } = await capture();
      const bytes = zipSync({
        "review.json": strToU8(
          JSON.stringify({ ...evidence(), camera }, null, 2),
        ),
        "map.png": png,
        "README.txt": strToU8(
          `Selected wall #${context.selection.nativeElementId}, level #${context.selection.levelId}.\nAttach map.png and review.json to an AI conversation. Orange highlights the selected native wall footprint. The image shows the current view. Geometry coordinates in review.json are in model feet.\n${context.reviewGuidance}\n`,
        ),
      });
      const url = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], {
          type: "application/zip",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `wall-${context.selection.nativeElementId}-level-${context.selection.levelId}-review.zip`;
      anchor.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus(
        "Downloaded map image and source context. Attach both to your AI review.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div data-testid="wall-review-panel">
      <h3>Wall #{context.selection.nativeElementId}</h3>
      <dl>
        <dt>Floor / native level</dt>
        <dd>
          {context.selection.floor} · #{context.selection.levelId}
        </dd>
        <dt>Source footprint</dt>
        <dd>{context.selection.footprintQuality}</dd>
        <dt>Source parts / footprint area</dt>
        <dd>
          {context.selection.partsFeet.length} ·{" "}
          {context.selection.areaFeet2.toFixed(1)} ft²
        </dd>
      </dl>
      {context.selection.footprintQuality === "approximate bounds envelope" && (
        <p className="project-warning">
          This shape is a source bounding envelope. Its edges are not verified
          wall faces.
        </p>
      )}
      <button onClick={onFit}>Show wall on map</button>
      <h3>Nearby rooms</h3>
      <ul>
        {context.nearbyRooms.map((r) => (
          <li key={r.key}>
            {r.number} · {r.name}
          </li>
        ))}
      </ul>
      <p>
        {context.nearbyDoors.length} nearby door footprints ·{" "}
        {context.issues.length} related review items.
      </p>
      <label>
        What needs review?
        <textarea
          aria-label="Wall review notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="For example: check this gap or overlapping wall joint."
        />
      </label>
      <div className="project-actions">
        <button onClick={() => void copy()}>Copy AI context</button>
        <button disabled={busy} onClick={() => void download()}>
          {busy ? "Capturing map…" : "Download AI review"}
        </button>
      </div>
      <p aria-live="polite">{status}</p>
      <details>
        <summary>Source geometry and review context</summary>
        <pre>{JSON.stringify(evidence(), null, 2)}</pre>
      </details>
    </div>
  );
}
