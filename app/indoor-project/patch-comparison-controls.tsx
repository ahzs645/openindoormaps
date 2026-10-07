import { useEffect, useRef, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { NativeBoundaryPatch } from "./native-boundary-patches";
import type { PinComparisonMode, PinComparisonResult } from "./pin-comparison";
import { PatchComparisonLegend } from "./patch-comparison-legend";

export type PatchComparisonView = {
  data: IndoorDataset;
  result: PinComparisonResult;
  mode: PinComparisonMode;
};
export function PatchComparisonControls({
  data,
  patch,
  onView,
  onClose,
}: {
  data: IndoorDataset;
  patch: NativeBoundaryPatch;
  onView: (view?: PatchComparisonView) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "nearest" });
  }, [patch]);
  const [boundResult, setBoundResult] = useState<{
    data: IndoorDataset;
    patch: NativeBoundaryPatch;
    result: PinComparisonResult;
  }>();
  const result =
    boundResult?.data === data && boundResult?.patch === patch
      ? boundResult.result
      : undefined;
  const [mode, setMode] = useState<PinComparisonMode>("updated-selection");
  const [error, setError] = useState("");
  const callback = useRef(onView);
  callback.current = onView;
  useEffect(() => {
    setBoundResult(undefined);
    setError("");
    setMode("updated-selection");
    callback.current(undefined);
    const worker = new Worker(
      new URL("./pin-comparison.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({
      data: response,
    }: MessageEvent<{ result?: PinComparisonResult; error?: string }>) => {
      setBoundResult(
        response.result ? { data, patch, result: response.result } : undefined,
      );
      setError(response.error ?? "");
      worker.terminate();
    };
    worker.onerror = () => {
      setError("Comparison failed. Close and reopen this patch to retry.");
      worker.terminate();
    };
    const ring = patch.ringsFeet[0];
    const point = ring.reduce(
      (s, p) =>
        [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length] as [
          number,
          number,
        ],
      [0, 0] as [number, number],
    );
    worker.postMessage({
      data,
      levelId: patch.levelId,
      point,
      patches: [patch],
    });
    return () => {
      worker.terminate();
      callback.current(undefined);
    };
  }, [data, patch]);
  useEffect(() => {
    callback.current(result ? { data, result, mode } : undefined);
  }, [data, result, mode]);
  return (
    <section
      ref={panel}
      aria-label="Before and after patch"
      className="patch-comparison-controls"
    >
      <h3>Compare this patch</h3>
      <p>
        Walls #{patch.wallEvidence.map((w) => w.nativeElementId).join(" / #")} ·{" "}
        {patch.status}
      </p>
      <div className="pin-review-comparison-buttons">
        <button
          disabled={!result}
          aria-pressed={mode === "current-selection"}
          onClick={() => setMode("current-selection")}
        >
          Before patch
        </button>
        <button
          disabled={!result?.updated}
          aria-pressed={mode === "updated-selection"}
          onClick={() => setMode("updated-selection")}
        >
          After patch
        </button>
        <button onClick={onClose}>Close patch comparison</button>
      </div>
      <p role="status">
        {error ||
          (result
            ? "Comparison ready. Other applied corrections remain; other proposals are excluded."
            : "Tracing before and after native enclosures…")}
      </p>
      {result && (
        <PatchComparisonLegend
          data={data}
          result={result}
          after={mode === "updated-selection"}
        />
      )}
      <p>
        Magenta marks the patch. This comparison changes neither saved geometry
        nor directions. Close the comparison to select or edit native areas.
      </p>
    </section>
  );
}
