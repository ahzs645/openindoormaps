import { useState } from "react";
import type { IndoorProject } from "./package";
import {
  reviewConnector,
  removeConnectorReview,
  sourceConnectorReview,
} from "./connector-review";
import { stairDisplayPoint } from "./connector-markers";
import { projectFloorName } from "./navigation-steps";
type Stop = { roomKey: string; nativeId: string; x: string; y: string };
export function ConnectorEditor({
  project,
  onApply,
}: {
  project: IndoorProject;
  onApply: (p: IndoorProject) => void;
}) {
  const [name, setName] = useState(""),
    [nativeId, setNativeId] = useState(""),
    [evidence, setEvidence] = useState(""),
    [accessible, setAccessible] = useState<"unknown" | "yes" | "no">("unknown"),
    [stops, setStops] = useState<Stop[]>([
      { roomKey: "", nativeId: "", x: "", y: "" },
      { roomKey: "", nativeId: "", x: "", y: "" },
    ]),
    [error, setError] = useState("");
  const source = sourceConnectorReview(project);
  const rooms = project.dataset.records
    .filter((r) => r.walkable && r.access !== "staff")
    .sort(
      (a, b) =>
        a.building.localeCompare(b.building) ||
        a.elevationFeet - b.elevationFeet ||
        a.number.localeCompare(b.number),
    );
  const update = (i: number, patch: Partial<Stop>) =>
    setStops((all) =>
      all.map((s, index) => (index === i ? { ...s, ...patch } : s)),
    );
  return (
    <section className="project-connector-editor">
      <h2>Elevators</h2>
      <p>
        Add the actual floor entrances here, then export and regenerate in
        Reviter to check the model and connect the routes.
      </p>
      {source.connectors.map((c) => (
        <div key={c.id} className="project-connector-review-item">
          <strong>{c.id}</strong>
          <p>
            {c.entrances.length} served floors ·{" "}
            {project.dataset.connectors?.some((a) => a.id === c.id)
              ? "Compiled"
              : "Awaiting model validation"}
          </p>
          {!project.dataset.connectors?.some((a) => a.id === c.id) && (
            <button
              onClick={() => onApply(removeConnectorReview(project, c.id))}
            >
              Remove {c.id}
            </button>
          )}
        </div>
      ))}
      <details>
        <summary>Add elevator</summary>
        <label>
          Elevator name
          <input
            aria-label="Elevator name"
            value={name}
            maxLength={150}
            onChange={(e) => setName(e.target.value)}
            placeholder="Library elevator"
          />
        </label>
        <label>
          Native elevator element ID
          <input
            aria-label="Native elevator element ID"
            inputMode="numeric"
            value={nativeId}
            onChange={(e) => setNativeId(e.target.value)}
          />
        </label>
        <label>
          Evidence
          <textarea
            aria-label="Elevator evidence"
            value={evidence}
            maxLength={10_000}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Source element or verified survey identifying the lift and its entrances"
          />
        </label>
        {stops.map((stop, i) => (
          <fieldset key={i}>
            <legend>Entrance {i + 1}</legend>
            <label>
              Served room and floor
              <select
                aria-label={`Elevator entrance ${i + 1} room`}
                value={stop.roomKey}
                onChange={(e) => {
                  const r = rooms.find((r) => r.key === e.target.value);
                  if (!r) {
                    update(i, { roomKey: "", x: "", y: "" });
                    return;
                  }
                  const p = stairDisplayPoint(project.dataset, r);
                  update(i, {
                    roomKey: r.key,
                    x: String(p[0]),
                    y: String(p[1]),
                  });
                }}
              >
                <option value="">Choose room on the served floor</option>
                {rooms.map((r) => (
                  <option value={r.key} key={r.key}>
                    {r.building} ·{" "}
                    {projectFloorName(project.dataset, r.levelId)} · {r.number}{" "}
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Native entrance element ID
              <input
                aria-label={`Elevator entrance ${i + 1} native ID`}
                value={stop.nativeId}
                inputMode="numeric"
                onChange={(e) => update(i, { nativeId: e.target.value })}
              />
            </label>
            <p>
              Entrance point in model feet. Adjust the suggested room point to
              the actual lift doorway.
            </p>
            <label>
              X
              <input
                aria-label={`Elevator entrance ${i + 1} X`}
                value={stop.x}
                onChange={(e) => update(i, { x: e.target.value })}
              />
            </label>
            <label>
              Y
              <input
                aria-label={`Elevator entrance ${i + 1} Y`}
                value={stop.y}
                onChange={(e) => update(i, { y: e.target.value })}
              />
            </label>
            {stops.length > 2 && (
              <button
                onClick={() =>
                  setStops((all) => all.filter((_, index) => index !== i))
                }
              >
                Remove entrance {i + 1}
              </button>
            )}
          </fieldset>
        ))}
        <button
          onClick={() =>
            setStops((all) => [
              ...all,
              { roomKey: "", nativeId: "", x: "", y: "" },
            ])
          }
        >
          Add served floor
        </button>
        <label>
          Step-free use
          <select
            aria-label="Elevator accessibility"
            value={accessible}
            onChange={(e) => setAccessible(e.target.value as typeof accessible)}
          >
            <option value="unknown">Needs verification</option>
            <option value="yes">Step-free · user verified</option>
            <option value="no">Not step-free</option>
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button
          onClick={() => {
            try {
              if (!name.trim()) throw new Error("Enter an elevator name.");
              if (stops.some((s) => !s.x.trim() || !s.y.trim()))
                throw new Error(
                  "Provide the actual entrance point on every floor.",
                );
              onApply(
                reviewConnector(project, {
                  id: name.trim(),
                  kind: "elevator",
                  nativeElementId: Number(nativeId),
                  evidence,
                  accessible,
                  direction: "both",
                  entrances: stops.map((s) => ({
                    roomKey: s.roomKey,
                    levelId:
                      rooms.find((r) => r.key === s.roomKey)?.levelId ?? -1,
                    nativeElementId: Number(s.nativeId),
                    pointFeet: [Number(s.x), Number(s.y)],
                  })),
                }),
              );
              setError("");
              setName("");
            } catch (error_) {
              setError(
                error_ instanceof Error ? error_.message : String(error_),
              );
            }
          }}
        >
          Save elevator review
        </button>
      </details>
      {source.connectors.length > 0 && (
        <button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(source, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "indoor-connectors.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download connector review JSON
        </button>
      )}
    </section>
  );
}
