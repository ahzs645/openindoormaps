import { useEffect, useMemo, useState, useRef } from "react";
import {
  MousePointer2,
  Type,
  Pentagon,
  Undo2,
  Redo2,
  Move,
  Trash2,
} from "lucide-react";
import type { IndoorProject } from "./package";
import {
  setMapAnnotations,
  moveMapAnnotation,
  shapePoints,
  roomLabelPoint,
  editorSymbols,
  type EditPoint,
  type MapAnnotation,
} from "./map-edits";
import { LocationManager } from "./location-manager";
import { EditorOptions, type EditorAppearance } from "./editor-options";
import type { AnnotationTool } from "./map-annotation-layer";

export function MapEditorPanel({
  project,
  levelIds,
  tool,
  onTool,
  selectedId,
  onSelect,
  draft,
  onDraft,
  onApply,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onVertex,
  selectedRoom,
  locationId,
  onLocation,
  onPlaceLocation,
  onLocate,
  appearance,
  onAppearance,
}: {
  project: IndoorProject;
  selectedRoom: string;
  locationId: string;
  onLocation: (id: string) => void;
  onPlaceLocation: (id: string) => void;
  onLocate: (levelId: number, point: EditPoint) => void;
  appearance: EditorAppearance;
  onAppearance: (a: EditorAppearance) => void;
  levelIds: number[];
  tool: AnnotationTool;
  onTool: (tool: AnnotationTool) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  draft: EditPoint[];
  onDraft: (points: EditPoint[]) => void;
  onApply: (next: IndoorProject) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onVertex: (index: number) => void;
}) {
  const annotations = project.rooms.mapEdits?.annotations ?? [];
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const clipboard = useRef<MapAnnotation>();
  const item = annotations.find((a) => a.id === selectedId);
  const defaultLevelId = useMemo(() => {
    const counts = new Map(levelIds.map((id) => [id, 0]));
    for (const room of project.dataset.records)
      if (counts.has(room.levelId))
        counts.set(room.levelId, counts.get(room.levelId)! + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? levelIds[0];
  }, [project.dataset.records, levelIds]);
  const [text, setText] = useState(""),
    [notes, setNotes] = useState(""),
    [color, setColor] = useState("#007d8a"),
    [fontSize, setFontSize] = useState(16),
    [levelId, setLevelId] = useState(defaultLevelId),
    [error, setError] = useState(""),
    [symbol, setSymbol] = useState("none"),
    [rotation, setRotation] = useState(0),
    [query, setQuery] = useState("");
  useEffect(() => {
    setText(item?.text ?? "");
    setSymbol(item?.symbol ?? "none");
    setRotation(item?.rotation ?? 0);
    setNotes(item?.notes ?? "");
    setColor(item?.color ?? "#007d8a");
    setFontSize(item?.fontSize ?? 16);
    setLevelId(item?.levelId ?? defaultLevelId);
    setError("");
  }, [item, defaultLevelId]);
  function apply(values: MapAnnotation[]) {
    try {
      onApply(setMapAnnotations(project, values));
      setError("");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  const drawing = [
    "label",
    "area",
    "rectangle",
    "circle",
    "line",
    "measure",
  ].includes(tool);
  let minimum = 2;
  if (tool === "label") minimum = 1;
  if (tool === "area") minimum = 3;
  const begin = (next: AnnotationTool) => {
    onSelect("");
    onTool(next);
    onDraft([]);
    setError("");
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        begin("select");
        return;
      }
      if (mod && event.key.toLowerCase() === "c" && item) {
        event.preventDefault();
        clipboard.current = structuredClone(item);
        return;
      }
      if (mod && event.key.toLowerCase() === "v" && clipboard.current) {
        event.preventDefault();
        const value = {
          ...moveMapAnnotation(clipboard.current, [
            clipboard.current.pointsFeet[0][0] + 3,
            clipboard.current.pointsFeet[0][1] + 3,
          ]),
          id: crypto.randomUUID(),
          roomKey: undefined,
          levelId: defaultLevelId,
        };
        if (apply([...annotations, value])) onSelect(value.id);
        return;
      }
      if (
        item &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        const direction: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, step],
          ArrowDown: [0, -step],
        };
        const [dx, dy] = direction[event.key];
        apply(
          annotations.map((a) =>
            a.id === item.id
              ? moveMapAnnotation(a, [
                  a.pointsFeet[0][0] + dx,
                  a.pointsFeet[0][1] + dy,
                ])
              : a,
          ),
        );
      }
    };
    globalThis.addEventListener("keydown", key);
    return () => globalThis.removeEventListener("keydown", key);
  });
  let instruction =
    "Select a label or highlighted area. Select a room to edit its name, color and category in the inspector.";
  switch (tool) {
    case "label": {
      instruction = "Click the map to place your label, then save it.";
      break;
    }
    case "area": {
      instruction =
        "Click the map to add corners, then save the highlighted area.";
      break;
    }
    case "move": {
      instruction =
        "Click a new location for the selected label or the area's first corner.";
      break;
    }
    case "vertex": {
      instruction = "Click the map to move the chosen corner.";
      break;
    }
  }
  const toolInstructions: Partial<Record<AnnotationTool, string>> = {
    rectangle: "Click two opposite corners, then save your rectangle.",
    circle: "Click the center, then an edge point, and save your circle.",
    line: "Click to add points, then save the line.",
    measure: "Click to add points, then save the measurement.",
    location: "Click to position the selected location marker.",
  };
  instruction = toolInstructions[tool] ?? instruction;
  let annotationKind: MapAnnotation["kind"] = "area";
  if (tool === "label") annotationKind = "label";
  if (["line", "measure"].includes(tool)) annotationKind = "line";
  return (
    <section className="project-map-editor" aria-label="Map editor">
      <span className="project-kicker">MAP EDITOR</span>
      <h2>Map content editor</h2>
      <div
        className="project-editor-tools"
        role="group"
        aria-label="Editing tools"
      >
        <button
          onClick={() => begin("select")}
          aria-pressed={tool === "select"}
        >
          <MousePointer2 size={16} />
          Select
        </button>
        <button onClick={() => begin("label")} aria-pressed={tool === "label"}>
          <Type size={16} />
          Add label
        </button>
        <button onClick={() => begin("area")} aria-pressed={tool === "area"}>
          <Pentagon size={16} />
          Draw area
        </button>
      </div>
      <div
        className="project-editor-tools"
        role="group"
        aria-label="Object tools"
      >
        {(
          [
            ["rectangle", "Rectangle"],
            ["circle", "Circle"],
            ["line", "Draw line"],
            ["measure", "Measure distance"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={tool === value}
            onClick={() => begin(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="project-editor-tools">
        <button disabled={!canUndo} onClick={onUndo}>
          <Undo2 size={16} />
          Undo edit
        </button>
        <button disabled={!canRedo} onClick={onRedo}>
          <Redo2 size={16} />
          Redo edit
        </button>
      </div>
      <p role="status">{instruction}</p>
      {selectedRoom && tool === "select" && (
        <button
          onClick={() => {
            const room = project.dataset.records.find(
              (r) => r.key === selectedRoom,
            )!;
            const value: MapAnnotation = {
              id: crypto.randomUUID(),
              kind: "label",
              text:
                project.dataset.visitor?.places[room.key]?.displayName ??
                room.name,
              notes: "",
              color: "#007d8a",
              fontSize: 16,
              levelId: room.levelId,
              roomKey: room.key,
              pointsFeet: [roomLabelPoint(project.dataset, room.key)],
            };
            if (apply([...annotations, value])) onSelect(value.id);
          }}
        >
          Add label to selected room
        </button>
      )}
      {(drawing || item) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value: MapAnnotation = {
              id: item?.id ?? crypto.randomUUID(),
              ...item,
              kind: item?.kind ?? annotationKind,
              levelId,
              text: text.trim(),
              notes,
              color,
              fontSize,
              pointsFeet: item?.pointsFeet ?? shapePoints(tool, draft),
              symbol,
              rotation,
              shape:
                item?.shape ??
                (["rectangle", "circle", "measure"].includes(tool)
                  ? (tool as "rectangle" | "circle" | "measure")
                  : undefined),
              roomKey:
                item?.roomKey &&
                project.dataset.records.some(
                  (r) => r.key === item.roomKey && r.levelId === levelId,
                )
                  ? item.roomKey
                  : undefined,
            };
            if (
              apply(
                item
                  ? annotations.map((a) => (a.id === item.id ? value : a))
                  : [...annotations, value],
              )
            ) {
              onSelect(value.id);
              onTool("select");
              onDraft([]);
            }
          }}
        >
          <label>
            Label text
            <input
              aria-label="Annotation text"
              maxLength={200}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Student services"
            />
          </label>
          <label>
            Native level
            <select
              aria-label="Annotation level"
              value={levelId}
              onChange={(e) => setLevelId(Number(e.target.value))}
            >
              {project.dataset.nativeLevels
                .filter((level) => levelIds.includes(level.id))
                .map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Color
            <input
              type="color"
              aria-label="Annotation color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            Text size
            <select
              aria-label="Annotation text size"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            >
              {[12, 14, 16, 20, 24, 28, 32].map((size) => (
                <option key={size} value={size}>
                  {size} px
                </option>
              ))}
            </select>
          </label>
          <label>
            Symbol
            <select
              aria-label="Annotation symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {Object.entries(editorSymbols).map(([key, title]) => (
                <option key={key} value={key}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Label rotation
            <input
              type="number"
              min="-360"
              max="360"
              aria-label="Annotation rotation"
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
            />
          </label>
          <label>
            Notes
            <textarea
              aria-label="Annotation notes"
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {drawing && (
            <p>
              {draft.length} {tool === "area" ? "corners" : "position"} placed
            </p>
          )}
          {drawing && (
            <button
              type="button"
              disabled={draft.length === 0}
              onClick={() => onDraft(draft.slice(0, -1))}
            >
              Remove last point
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="project-editor-primary"
            disabled={drawing && draft.length < minimum}
            type="submit"
          >
            {item ? "Save annotation" : "Create annotation"}
          </button>
          <button type="button" onClick={() => begin("select")}>
            Cancel selection
          </button>
        </form>
      )}
      {item && (
        <>
          <div className="project-editor-tools">
            <button
              onClick={() => {
                const clone = {
                  ...moveMapAnnotation(item, [
                    item.pointsFeet[0][0] + 3,
                    item.pointsFeet[0][1] + 3,
                  ]),
                  id: crypto.randomUUID(),
                  roomKey: undefined,
                  text: item.text + " copy",
                };
                if (apply([...annotations, clone])) onSelect(clone.id);
              }}
            >
              Duplicate annotation
            </button>
            <button onClick={() => onTool("move")}>
              <Move size={16} />
              Move annotation
            </button>
            <button
              onClick={() => {
                if (apply(annotations.filter((a) => a.id !== item.id)))
                  begin("select");
              }}
            >
              <Trash2 size={16} />
              Delete annotation
            </button>
          </div>
          <div className="project-editor-tools" aria-label="Nudge annotation">
            {(
              [
                [-1, 0, "left"],
                [1, 0, "right"],
                [0, 1, "up"],
                [0, -1, "down"],
              ] as const
            ).map(([dx, dy, direction]) => (
              <button
                key={direction}
                aria-label={`Nudge annotation ${direction}`}
                onClick={() =>
                  apply(
                    annotations.map((a) =>
                      a.id === item.id
                        ? moveMapAnnotation(a, [
                            a.pointsFeet[0][0] + dx,
                            a.pointsFeet[0][1] + dy,
                          ])
                        : a,
                    ),
                  )
                }
              >
                {direction} 1 ft
              </button>
            ))}
          </div>
          {item.roomKey && (
            <p>
              Attached to room{" "}
              {
                project.dataset.records.find((r) => r.key === item.roomKey)
                  ?.number
              }{" "}
              <button
                onClick={() =>
                  apply(
                    annotations.map((a) =>
                      a.id === item.id ? { ...a, roomKey: undefined } : a,
                    ),
                  )
                }
              >
                Detach room label
              </button>
            </p>
          )}
          {item.kind !== "label" && (
            <details>
              <summary>Edit area corners</summary>
              {item.pointsFeet.map((_, index) => (
                <div className="project-editor-tools" key={index}>
                  <button onClick={() => onVertex(index)}>
                    Move corner {index + 1}
                  </button>
                  <button
                    disabled={
                      item.pointsFeet.length <= (item.kind === "line" ? 2 : 3)
                    }
                    onClick={() =>
                      apply(
                        annotations.map((a) =>
                          a.id === item.id
                            ? {
                                ...a,
                                pointsFeet: a.pointsFeet.filter(
                                  (_, i) => i !== index,
                                ),
                              }
                            : a,
                        ),
                      )
                    }
                  >
                    Remove corner {index + 1}
                  </button>
                </div>
              ))}
            </details>
          )}
        </>
      )}
      <h3>
        On this floor ·{" "}
        {annotations.filter((a) => levelIds.includes(a.levelId)).length}
      </h3>
      <input
        aria-label="Search floor annotations"
        placeholder="Search labels and objects…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <details>
        <summary>Select multiple annotations</summary>
        <div className="project-editor-list">
          {annotations
            .filter((a) => levelIds.includes(a.levelId))
            .map((a) => (
              <label className="project-editor-check" key={a.id}>
                <input
                  aria-label={`Include annotation: ${a.text}`}
                  type="checkbox"
                  checked={batchIds.includes(a.id)}
                  onChange={(e) =>
                    setBatchIds((ids) =>
                      e.target.checked
                        ? [...ids, a.id]
                        : ids.filter((id) => id !== a.id),
                    )
                  }
                />
                {a.text}
              </label>
            ))}
        </div>
        <div className="project-editor-tools">
          <button
            disabled={
              !batchIds.some((id) =>
                annotations.some(
                  (a) => a.id === id && levelIds.includes(a.levelId),
                ),
              )
            }
            onClick={() => {
              const copies = annotations
                .filter(
                  (a) =>
                    batchIds.includes(a.id) && levelIds.includes(a.levelId),
                )
                .map((a) => ({
                  ...moveMapAnnotation(a, [
                    a.pointsFeet[0][0] + 3,
                    a.pointsFeet[0][1] + 3,
                  ]),
                  id: crypto.randomUUID(),
                  roomKey: undefined,
                  text: a.text + " copy",
                }));
              apply([...annotations, ...copies]);
            }}
          >
            Duplicate selected annotations
          </button>
          <button
            disabled={
              !batchIds.some((id) =>
                annotations.some(
                  (a) => a.id === id && levelIds.includes(a.levelId),
                ),
              )
            }
            onClick={() => {
              if (
                apply(
                  annotations.filter(
                    (a) =>
                      !batchIds.includes(a.id) || !levelIds.includes(a.levelId),
                  ),
                )
              ) {
                setBatchIds([]);
                begin("select");
              }
            }}
          >
            Delete selected annotations
          </button>
        </div>
      </details>
      <div className="project-editor-list">
        {annotations
          .filter(
            (a) =>
              levelIds.includes(a.levelId) &&
              a.text.toLowerCase().includes(query.toLowerCase()),
          )
          .map((a) => (
            <button
              className="project-search-item"
              aria-pressed={a.id === selectedId}
              key={a.id}
              onClick={() => {
                onTool("select");
                onDraft([]);
                onSelect(a.id);
              }}
            >
              <span style={{ color: a.color }}>
                {a.kind === "label" ? "T" : "▱"}
              </span>{" "}
              {a.text}
            </button>
          ))}
      </div>
      <LocationManager
        project={project}
        selectedRoom={selectedRoom}
        selectedId={locationId}
        onSelect={onLocation}
        onApply={onApply}
        onPlace={onPlaceLocation}
        onLocate={onLocate}
      />
      <EditorOptions
        project={project}
        levelIds={levelIds}
        appearance={appearance}
        onAppearance={onAppearance}
        onApply={onApply}
      />
      <p className="project-editor-shortcuts">
        ⌘/Ctrl Z: undo · Shift Z: redo · C / V: copy / paste selected annotation
        · Arrow keys: 1 ft nudge · Shift arrows: 5 ft · Esc: cancel
      </p>
      <details>
        <summary>Structural geometry & navigation</summary>
        <p>
          Use Review project for source walls, entrance review, room access, and
          connector floor spans. Drawing tools here add map objects; changing
          structural walls, door openings, floor elevations, or GIS alignment
          requires a regenerated Reviter package.
        </p>
      </details>
    </section>
  );
}
