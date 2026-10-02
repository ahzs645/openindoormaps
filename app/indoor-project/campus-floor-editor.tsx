import { useState } from "react";
import type { IndoorProject } from "./package";
import { combineProjectFloors } from "./campus-floors";

export function CampusFloorEditor({
  project,
  floorId,
  onChange,
}: {
  project: IndoorProject;
  floorId: string;
  onChange: (project: IndoorProject, floorId: string) => void;
}) {
  const [other, setOther] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <details>
      <summary>Combine campus floors</summary>
      <p>
        Show parts of the same campus floor together. Native heights and route
        connections are preserved. Export the reviewed project to save the
        grouping for Reviter.
      </p>
      <label>
        Combine current floor with
        <select
          aria-label="Combine with floor"
          value={other}
          onChange={(e) => setOther(e.target.value)}
        >
          <option value="">Choose another floor</option>
          {project.dataset.floors
            .filter((f) => f.id !== floorId)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Combined floor name
        <input
          aria-label="Combined floor name"
          value={name}
          maxLength={200}
          placeholder="Campus Floor 3"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        disabled={!other || other === floorId || !name.trim()}
        onClick={() => {
          try {
            const next = combineProjectFloors(project, [floorId, other], name);
            const merged = next.dataset.floors.find((f) =>
              f.levelIds.includes(
                project.dataset.floors.find((f) => f.id === floorId)!
                  .levelIds[0],
              ),
            )!;
            onChange(next, merged.id);
            setOther("");
            setName("");
            setError("");
          } catch (error_) {
            setError(error_ instanceof Error ? error_.message : String(error_));
          }
        }}
      >
        Combine floors
      </button>
    </details>
  );
}
