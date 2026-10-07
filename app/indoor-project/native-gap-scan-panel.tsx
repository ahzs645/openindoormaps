import { useEffect, useRef, useState } from "react";
import type { IndoorProject } from "./package";
import { compactGapScan, gapScanPreview, validateGapScanOptions, type GapScanOptions, type GapScanPreview, type GapScanResult } from "./native-gap-scan";
import { saveReviewCompanion } from "./review-companion-save";
export function NativeGapScanPanel({ project, levelId, locked, onPreview, onLocate, onApply, onRepair }: {
  project: IndoorProject; levelId: number; locked: boolean;
  onPreview: (preview?: GapScanPreview) => void;
  onLocate: (point: [number, number]) => void;
  onApply: (p: IndoorProject) => void;
  onRepair: (points: [[number, number], [number, number]]) => void;
}) {
  const [options, setOptions] = useState<GapScanOptions>({ minWidthFeet: 0.02, maxWidthFeet: 6, minAreaSquareFeet: 40 });
  const [result, setResult] = useState<GapScanResult>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const workerRef = useRef<Worker | undefined>(undefined);
  const optionsKey = JSON.stringify(options);
  useEffect(() => {
    workerRef.current?.terminate(); workerRef.current = undefined;
    setResult(undefined); setBusy(false); setMessage(""); onPreview(undefined);
    return () => { workerRef.current?.terminate(); onPreview(undefined); };
  }, [project.dataset, levelId, optionsKey]);
  const records = project.dataset.records;
  const names = (keys: string[]) => keys.map(key => { const r = records.find(r => r.key === key); return r ? `${r.number} ${r.name}` : key; }).join(" / ") || "No place label";
  const findings = result?.findings.filter(f => !query || names(f.sides.flatMap(s => s.roomKeys)).toLowerCase().includes(query.toLowerCase())) ?? [];
  return <details className="native-gap-scan-panel">
    <summary>Find narrow connections</summary>
    <p>Scan this entire native level for rooms or large areas joined by narrow openings. Measured doors stay closed for this scan. Source outlines supply label hints only.</p>
    {([['minWidthFeet', 'Minimum connection width (feet)'], ['maxWidthFeet', 'Maximum connection width (feet)'], ['minAreaSquareFeet', 'Minimum area on each side (sq ft)']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" aria-label={label} min={key === 'minAreaSquareFeet' ? 1 : 0.02} max={key === 'minAreaSquareFeet' ? 1e7 : 20} step={key === 'minAreaSquareFeet' ? 1 : 0.01} value={options[key]} disabled={busy || locked} onChange={e => setOptions(old => ({ ...old, [key]: Number(e.target.value) }))}/></label>)}
    <button disabled={locked || busy} onClick={() => {
      try { validateGapScanOptions(options); } catch(e) { setMessage(String(e)); return; }
      setResult(undefined); setMessage(""); onPreview(undefined); setBusy(true);
      const worker = new Worker(new URL('./native-gap-scan.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = ({ data }: MessageEvent<{ result?: GapScanResult; error?: string }>) => {
        if (workerRef.current !== worker) return;
        setResult(data.result); setMessage(data.error ?? ""); setBusy(false); worker.terminate(); workerRef.current = undefined;
      };
      worker.onerror = () => { setBusy(false); setMessage("Connection scan failed. Try a narrower size range."); worker.terminate(); workerRef.current = undefined; };
      worker.postMessage({ data: project.dataset, levelId, options });
    }}>Scan connections</button>
    {busy && <button onClick={() => { workerRef.current?.terminate(); workerRef.current = undefined; setBusy(false); setMessage("Scan cancelled."); }}>Cancel connection scan</button>}
    <p role="status">{busy ? "Scanning native connections…" : message}</p>
    {result && <>
      <p role="status">{result.complete ? "Scan finished" : "Partial scan"} · {result.findings.length} narrow connections · {result.testedCuts} cross-sections tested · {result.regionCount} native regions</p>
      <p>This finds geometric bottlenecks, including intentional passages. It does not certify every gap or approve a wall patch. “Combined cuts” includes other tested openings in the same region.</p>
      <label>Find connected rooms<input aria-label="Find connected rooms" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <button onClick={() => onPreview(undefined)}>Clear connection preview</button>
      <button disabled={locked} onClick={async () => {
        try { onApply(await saveReviewCompanion(project, `connection-scans/level-${levelId}.json`, compactGapScan(result))); setMessage("Connection scan saved. Export reviewed project to keep it in the ZIP."); }
        catch(e) { setMessage(`${e instanceof Error ? e.message : String(e)} Download the scan separately if the companion bundle is full.`); }
      }}>Save scan with project</button>
      <button onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(compactGapScan(result), null, 2)], { type: "application/json" }));
        const a = document.createElement('a'); a.href = url; a.download = `native-connections-${levelId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download connection scan</button>
      <div className="native-door-check-list">{findings.slice(0, 100).map(f => <div key={f.id}>
        <strong>{f.widthFeet.toFixed(3)} ft · {f.kind === 'wall-gap' ? 'Between precise wall faces' : 'Narrow passage'} · {f.separation === 'single-cut' ? 'Separates with one cut' : 'Requires combined cuts'}</strong>
        {f.sides.map((side, i) => <small key={i}>Side {i + 1}: {side.areaSquareFeet.toFixed(0)} sq ft · {names(side.roomKeys)}</small>)}
        <small>Native walls: {f.wallIds.join(', ') || 'No pair of precise wall supports'}</small>
        <button onClick={() => { const worker = new Worker(new URL("./native-gap-scan.worker.ts", import.meta.url), { type: "module" }); workerRef.current?.terminate(); workerRef.current = worker; worker.onmessage = ({ data }) => { if (workerRef.current === worker) { onPreview(data.preview); worker.terminate(); workerRef.current = undefined; } }; worker.postMessage({ preview: gapScanPreview(result, f) }); onLocate([(f.endpointsFeet[0][0] + f.endpointsFeet[1][0]) / 2, (f.endpointsFeet[0][1] + f.endpointsFeet[1][1]) / 2]); }}>Preview connection {f.id}</button>
        {f.kind === 'wall-gap' && f.widthFeet <= 6 && <button disabled={locked} onClick={() => { onPreview(undefined); onRepair(f.endpointsFeet); }}>Investigate wall repair {f.id}</button>}
      </div>)}</div>
      {findings.length > 100 && <p>Showing the first 100 matches. Filter by a room number or download all results.</p>}
      <details><summary>Measured doors in this size range · {result.measuredDoors.length}</summary>{result.measuredDoors.map(d => <div key={d.nativeElementId}>Door #{d.nativeElementId} · {d.widthFeet.toFixed(2)} ft · {d.status === 'same-region' ? 'Same region on both sides: look for another bypass' : d.status}<button onClick={() => onLocate(d.pointFeet)}>Show measured door {d.nativeElementId}</button></div>)}</details>
      <details><summary>Scan evidence and limits</summary>{result.warnings.map(w => <p key={w}>{w}</p>)}</details>
    </>}
  </details>;
}
