import { useEffect, useState } from "react";
import type { IndoorProject } from "./package";
import {
  setMapLocations,
  editorSymbols,
  safeEditorUrl,
  roomLabelPoint,
  type MapLocation,
  type EditPoint,
} from "./map-edits";
import { editorSymbolSvg } from "./editor-symbols";
function attachmentSummary(p: MapLocation) {
  if (p.roomKeys.length > 0) return `${p.roomKeys.length} attached rooms`;
  return p.position ? "Point location" : "Unattached";
}
export function LocationManager({
  project,
  selectedRoom,
  selectedId,
  onSelect,
  onApply,
  onPlace,
  onLocate,
}: {
  project: IndoorProject;
  selectedRoom: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onApply: (next: IndoorProject) => void;
  onPlace: (id: string) => void;
  onLocate: (levelId: number, point: EditPoint) => void;
}) {
  const locations = project.rooms.mapEdits?.locations ?? [];
  const current = locations.find((p) => p.id === selectedId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("az");
  const [draft, setDraft] = useState<MapLocation | null>(null),
    [error, setError] = useState("");
  const [tags, setTags] = useState(""),
    [photos, setPhotos] = useState(""),
    [links, setLinks] = useState("");
  useEffect(() => {
    setDraft(current ? structuredClone(current) : null);
    setError("");
    setTags(current?.tags.join(", ") ?? "");
    setPhotos(current?.photos.join("\n") ?? "");
    setLinks(
      current?.links.map((l) => `${l.title} | ${l.url}`).join("\n") ?? "",
    );
  }, [current]);
  function apply(values: MapLocation[]) {
    try {
      onApply(setMapLocations(project, values));
      setError("");
      return true;
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
      return false;
    }
  }
  function locationValue(): MapLocation {
    if (!draft) throw new Error("Select a location first.");
    return {
      ...draft,
      name: draft.name.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      photos: photos
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
      links: links
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          const i = l.indexOf("|");
          return {
            title: l.slice(0, i).trim(),
            url: i === -1 ? "" : l.slice(i + 1).trim(),
          };
        }),
    };
  }
  function create() {
    const location: MapLocation = {
      id: crypto.randomUUID(),
      name: "New location",
      description: "",
      category: "other",
      tags: [],
      color: "#007d8a",
      symbol: "pin",
      roomKeys: [],
      website: "",
      phone: "",
      hours: "",
      links: [],
      photos: [],
      logo: "",
      showLabel: true,
    };
    if (apply([...locations, location])) onSelect(location.id);
  }
  const room = project.dataset.records.find((r) => r.key === selectedRoom);
  const matches = locations
    .filter(
      (p) =>
        (filter === "all" ||
          (filter === "attached"
            ? p.roomKeys.length > 0
            : p.roomKeys.length === 0)) &&
        `${p.name} ${p.description} ${p.category} ${p.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "za"
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name),
    );
  function locate(p: MapLocation) {
    const record = project.dataset.records.find((r) => r.key === p.roomKeys[0]);
    const pos =
      p.position ??
      (record
        ? {
            levelId: record.levelId,
            pointFeet: roomLabelPoint(project.dataset, record.key),
          }
        : undefined);
    if (pos) onLocate(pos.levelId, pos.pointFeet);
  }
  const field = (
    key:
      | "name"
      | "description"
      | "category"
      | "website"
      | "phone"
      | "hours"
      | "logo",
    value: string,
  ) => setDraft((p) => (p ? { ...p, [key]: value } : p));
  return (
    <section className="project-location-manager" aria-label="Location manager">
      <h3>Location manager · {locations.length}</h3>
      <input
        aria-label="Search managed locations"
        placeholder="Search name, category or tags…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="project-editor-tools">
        <select
          aria-label="Location attachment filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All locations</option>
          <option value="attached">Attached</option>
          <option value="unattached">Unattached</option>
        </select>
        <select
          aria-label="Location sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="az">Name A–Z</option>
          <option value="za">Name Z–A</option>
        </select>
        <button onClick={create}>New location</button>
      </div>
      <div className="project-editor-list">
        {matches.map((p) => (
          <button
            key={p.id}
            aria-label={`Manage location: ${p.name}`}
            aria-pressed={p.id === selectedId}
            className="project-search-item"
            onClick={() => {
              onSelect(p.id);
              locate(p);
            }}
          >
            <span
              dangerouslySetInnerHTML={{ __html: editorSymbolSvg(p.symbol) }}
            />{" "}
            <span>
              {p.name}
              <small>
                {attachmentSummary(p)} · {p.category}
              </small>
            </span>
          </button>
        ))}
        {matches.length === 0 && (
          <p>
            No matching locations. Create one, then attach it to a room or place
            a marker.
          </p>
        )}
      </div>
      {draft && (
        <form
          aria-label="Location details"
          onSubmit={(e) => {
            e.preventDefault();
            const value = locationValue();
            apply(locations.map((p) => (p.id === value.id ? value : p)));
          }}
        >
          <h3>Location details</h3>
          <label>
            Name
            <input
              required
              maxLength={200}
              aria-label="Location name"
              value={draft.name}
              onChange={(e) => field("name", e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              maxLength={4000}
              aria-label="Location description"
              value={draft.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </label>
          <label>
            Category
            <input
              maxLength={100}
              list="editor-location-categories"
              aria-label="Location category"
              value={draft.category}
              onChange={(e) => field("category", e.target.value)}
            />
          </label>
          <datalist id="editor-location-categories">
            {[
              "study",
              "food",
              "washroom",
              "department",
              "entrance",
              "other",
            ].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <label>
            Search tags
            <input
              aria-label="Location search tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="advising, registration"
            />
          </label>
          <div className="project-editor-tools">
            <label>
              Color
              <input
                type="color"
                aria-label="Location color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </label>
            <label>
              Symbol
              <select
                aria-label="Location symbol"
                value={draft.symbol}
                onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
              >
                {Object.entries(editorSymbols).map(([key, title]) => (
                  <option key={key} value={key}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="project-editor-check">
            <input
              type="checkbox"
              checked={draft.showLabel}
              onChange={(e) =>
                setDraft({ ...draft, showLabel: e.target.checked })
              }
            />
            Show location label
          </label>
          <details>
            <summary>Contact, hours, links & images</summary>
            <label>
              Website
              <input
                type="url"
                aria-label="Location website"
                value={draft.website}
                onChange={(e) => field("website", e.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                maxLength={100}
                aria-label="Location phone"
                value={draft.phone}
                onChange={(e) => field("phone", e.target.value)}
              />
            </label>
            <label>
              Opening / special hours
              <textarea
                maxLength={2000}
                aria-label="Location hours"
                value={draft.hours}
                onChange={(e) => field("hours", e.target.value)}
                placeholder="Mon–Fri 9:00–17:00; closed holidays"
              />
            </label>
            <label>
              Links / socials (title | URL per line)
              <textarea
                aria-label="Location links"
                value={links}
                onChange={(e) => setLinks(e.target.value)}
              />
            </label>
            <label>
              Photo URLs (one per line)
              <textarea
                aria-label="Location photos"
                value={photos}
                onChange={(e) => setPhotos(e.target.value)}
              />
            </label>
            <label>
              Logo URL
              <input
                type="url"
                aria-label="Location logo"
                value={draft.logo}
                onChange={(e) => field("logo", e.target.value)}
              />
            </label>
          </details>
          {error && <p role="alert">{error}</p>}
          <button className="project-editor-primary" type="submit">
            Save location
          </button>
          <h4>Attached rooms</h4>
          {draft.roomKeys.map((key) => {
            const r = project.dataset.records.find((r) => r.key === key)!;
            return (
              <div className="project-editor-tools" key={key}>
                <button
                  type="button"
                  onClick={() =>
                    onLocate(r.levelId, roomLabelPoint(project.dataset, key))
                  }
                >
                  {r.number} · {r.name}
                </button>
                <button
                  type="button"
                  aria-label={`Detach room ${r.number}`}
                  onClick={() => {
                    const next = {
                      ...locationValue(),
                      roomKeys: draft.roomKeys.filter((k) => k !== key),
                      position: undefined,
                    };
                    if (
                      apply(locations.map((p) => (p.id === next.id ? next : p)))
                    )
                      setDraft(next);
                  }}
                >
                  Detach
                </button>
              </div>
            );
          })}
          <p>
            {room
              ? `Selected room: ${room.number} · ${room.name}`
              : "Select a room on the map to attach it."}
          </p>
          <button
            type="button"
            disabled={!room || draft.roomKeys.includes(room.key)}
            onClick={() => {
              if (!room) return;
              const next = {
                ...locationValue(),
                roomKeys: [...draft.roomKeys, room.key],
                position: undefined,
              };
              if (apply(locations.map((p) => (p.id === next.id ? next : p))))
                setDraft(next);
            }}
          >
            Attach selected room
          </button>
          <div className="project-editor-tools">
            <button type="button" onClick={() => onPlace(draft.id)}>
              Place / move location marker
            </button>
            <button
              type="button"
              onClick={() => {
                const next = { ...locationValue(), position: undefined };
                apply(locations.map((p) => (p.id === next.id ? next : p)));
              }}
            >
              Reset marker to room
            </button>
            <button
              type="button"
              onClick={() => {
                if (apply(locations.filter((p) => p.id !== draft.id)))
                  onSelect("");
              }}
            >
              Delete location
            </button>
          </div>
          <details>
            <summary>Preview location</summary>
            <div className="project-location-preview">
              <strong>{draft.name}</strong>
              <p>{draft.description}</p>
              <p>
                {draft.phone} · {draft.hours}
              </p>
              {draft.website && safeEditorUrl(draft.website) && (
                <a href={draft.website} target="_blank" rel="noreferrer">
                  Website
                </a>
              )}
              <p>{draft.tags.join(" · ")}</p>
            </div>
          </details>
        </form>
      )}
    </section>
  );
}
