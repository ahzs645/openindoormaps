import { useState, useEffect } from "react";
import type { IndoorProject } from "./package";
import { setMapAnnotations, setFloorDisplayName } from "./map-edits";
import {
  editorGeoJSON,
  editorFloorSvg,
  downloadEditorFile,
} from "./editor-exports";
export type EditorAppearance = {
  geometry: number;
  annotations: number;
  labels: boolean;
  basemap: boolean;
  snap: boolean;
};
export const defaultEditorAppearance: EditorAppearance = {
  geometry: 1,
  annotations: 1,
  labels: true,
  basemap: true,
  snap: false,
};
export function EditorOptions({
  project,
  levelIds,
  appearance,
  onAppearance,
  onApply,
}: {
  project: IndoorProject;
  levelIds: number[];
  appearance: EditorAppearance;
  onAppearance: (a: EditorAppearance) => void;
  onApply: (p: IndoorProject) => void;
}) {
  const [target, setTarget] = useState(
    project.dataset.nativeLevels.find((l) => !levelIds.includes(l.id))?.id ??
      levelIds[0],
  );
  const [error, setError] = useState("");
  const currentFloor = project.dataset.floors.find((f) =>
    f.levelIds.some((id) => levelIds.includes(id)),
  );
  const [floorName, setFloorName] = useState("");
  useEffect(() => {
    setFloorName(
      currentFloor
        ? (project.rooms.mapEdits?.floorNames?.[currentFloor.id] ??
            currentFloor.name)
        : "",
    );
  }, [currentFloor, project.rooms.mapEdits?.floorNames]);
  return (
    <>
      <details>
        <summary>Layers & snapping</summary>
        <label>
          Geometry opacity
          <input
            type="range"
            min="0"
            max="1"
            step=".05"
            aria-label="Geometry opacity"
            value={appearance.geometry}
            onChange={(e) =>
              onAppearance({ ...appearance, geometry: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Annotation opacity
          <input
            type="range"
            min="0"
            max="1"
            step=".05"
            aria-label="Annotation opacity"
            value={appearance.annotations}
            onChange={(e) =>
              onAppearance({
                ...appearance,
                annotations: Number(e.target.value),
              })
            }
          />
        </label>
        <label className="project-editor-check">
          <input
            type="checkbox"
            checked={appearance.labels}
            onChange={(e) =>
              onAppearance({ ...appearance, labels: e.target.checked })
            }
          />
          Room / building labels
        </label>
        <label className="project-editor-check">
          <input
            type="checkbox"
            checked={appearance.basemap}
            onChange={(e) =>
              onAppearance({ ...appearance, basemap: e.target.checked })
            }
          />
          Street map
        </label>
        <label className="project-editor-check">
          <input
            type="checkbox"
            checked={appearance.snap}
            onChange={(e) =>
              onAppearance({ ...appearance, snap: e.target.checked })
            }
          />
          Snap edits to 1 ft grid
        </label>
      </details>
      <details>
        <summary>Floor display name</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (currentFloor)
              onApply(setFloorDisplayName(project, currentFloor.id, floorName));
          }}
        >
          <label>
            Floor name
            <input
              required
              maxLength={100}
              aria-label="Floor display name"
              value={floorName}
              onChange={(e) => setFloorName(e.target.value)}
            />
          </label>
          <button>Save floor name</button>
          <p>
            Display name only. Measured elevations and native level IDs remain
            registered to the model.
          </p>
        </form>
      </details>
      <details>
        <summary>Copy annotations to a level</summary>
        <label>
          Target level
          <select
            aria-label="Copy annotations target level"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          >
            {project.dataset.nativeLevels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.elevationFeet.toFixed(2)} ft
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={levelIds.includes(target)}
          onClick={() => {
            try {
              const all = project.rooms.mapEdits?.annotations ?? [];
              const copies = all
                .filter((a) => levelIds.includes(a.levelId))
                .map((a) => ({
                  ...a,
                  id: crypto.randomUUID(),
                  levelId: target,
                  roomKey: undefined,
                }));
              if (copies.length === 0)
                throw new Error("This floor has no annotations to copy.");
              onApply(setMapAnnotations(project, [...all, ...copies]));
              setError("");
            } catch (error_) {
              setError(
                error_ instanceof Error ? error_.message : String(error_),
              );
            }
          }}
        >
          Copy floor annotations
        </button>
        <p>
          Copies labels and objects at their native coordinates. Choose room
          attachments on the destination level separately.
        </p>
      </details>
      <details>
        <summary>Download floor map</summary>
        <div className="project-editor-tools">
          <button
            onClick={() =>
              downloadEditorFile(
                JSON.stringify(editorGeoJSON(project, levelIds), null, 2),
                "floor-map.geojson",
                "application/geo+json",
              )
            }
          >
            Download GeoJSON
          </button>
          <button
            onClick={() => {
              try {
                downloadEditorFile(
                  editorFloorSvg(project, levelIds),
                  "floor-map.svg",
                  "image/svg+xml",
                );
                setError("");
              } catch (error_) {
                setError(String(error_));
              }
            }}
          >
            Download SVG
          </button>
          <button
            disabled={!project.scene}
            onClick={() => {
              if (project.scene)
                downloadEditorFile(
                  project.scene,
                  "source-model.glb",
                  "model/gltf-binary",
                );
            }}
          >
            Download source GLB
          </button>
        </div>
        <p>
          SVG and GeoJSON include the current floor and edits. GLB is the
          imported source scene. Use Export reviewed project above for a
          complete editable backup.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
