import { useEffect, useState } from "react";
import type { IndoorProject } from "./package";
import { reviewVisitorMetadata } from "./package";
import type { IndoorRecord } from "./contract";
import { visitorCategories, type VisitorCategory } from "./visitor-metadata";

export function VisitorMetadataEditor({
  project,
  room,
  onApply,
}: {
  project: IndoorProject;
  room: IndoorRecord;
  onApply: (next: IndoorProject) => void;
}) {
  const [displayName, setDisplayName] = useState(""),
    [description, setDescription] = useState(""),
    [category, setCategory] = useState<VisitorCategory | "">(""),
    [department, setDepartment] = useState(""),
    [color, setColor] = useState(""),
    [landmark, setLandmark] = useState(false),
    [buildingName, setBuildingName] = useState(""),
    [shortName, setShortName] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const place = project.dataset.visitor?.places[room.key],
      building = project.dataset.visitor?.buildings[room.building];
    setDisplayName(place?.displayName ?? "");
    setDescription(place?.description ?? "");
    setCategory(place?.category ?? "");
    setDepartment(place?.department ?? "");
    setColor(place?.color ?? "");
    setLandmark(place?.landmark ?? false);
    setBuildingName(building?.name ?? "");
    setShortName(building?.shortName ?? "");
    setError("");
  }, [project, room]);
  return (
    <details className="project-visitor-metadata">
      <summary>Visitor names, categories and colors</summary>
      <label>
        Building name
        <input
          aria-label="Visitor building name"
          maxLength={200}
          value={buildingName}
          onChange={(e) => setBuildingName(e.target.value)}
          placeholder={`Building ${room.building}`}
        />
      </label>
      <label>
        Building badge
        <input
          aria-label="Visitor building badge"
          maxLength={12}
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder={room.building}
        />
      </label>
      <label>
        Place name
        <input
          aria-label="Visitor place name"
          maxLength={200}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={room.name}
        />
      </label>
      <label>
        Description
        <textarea
          aria-label="Visitor description"
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        Category
        <select
          aria-label="Visitor category"
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
        >
          <option value="">Use room-name suggestion</option>
          {visitorCategories.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Department
        <input
          aria-label="Visitor department"
          maxLength={200}
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
      </label>
      <label>
        Room color
        <input
          aria-label="Visitor room color"
          value={color}
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
          placeholder="#bce7f1"
          onChange={(e) => setColor(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={landmark}
          onChange={(e) => setLandmark(e.target.checked)}
        />
        Prominent map landmark
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        onClick={() => {
          try {
            onApply(
              reviewVisitorMetadata(
                project,
                room.key,
                {
                  displayName,
                  description,
                  category: category || undefined,
                  department,
                  color,
                  landmark,
                },
                buildingName.trim()
                  ? {
                      name: buildingName,
                      ...(shortName.trim() ? { shortName } : {}),
                    }
                  : undefined,
              ),
            );
            setError("");
          } catch (error_) {
            setError(String(error_));
          }
        }}
      >
        Apply visitor details
      </button>
    </details>
  );
}
