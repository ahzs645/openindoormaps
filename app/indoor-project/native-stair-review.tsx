import { useState } from "react";
import type { IndoorDataset } from "./contract";
import {
  sourceStairEdges,
  sourceStairKind,
  type SourceStair,
} from "./source-stairs";
function stairAccessLabel(data: IndoorDataset, stair: SourceStair) {
  if (sourceStairEdges(data, stair).some((e) => e.enabled))
    return "Route connection available";
  if (stair.context === "tiered-seating")
    return "Seating / aisle access needs review";
  return "Entrance connection needs review";
}
export function NativeStairReview({
  data,
  onLocate,
}: {
  data: IndoorDataset;
  onLocate: (stair: SourceStair) => void;
}) {
  const [search, setSearch] = useState("");
  const stairs = data.stairDisplay?.sourceFlights ?? [];
  if (stairs.length === 0) return null;
  const connected = stairs.filter((s) =>
    sourceStairEdges(data, s).some((e) => e.enabled),
  ).length;
  return (
    <section>
      <h2>Native stairs and seating</h2>
      <details>
        <summary>
          {stairs.length} stairs · {stairs.length - connected} connection
          reviews
        </summary>
        <p>
          Inspect every source assembly at its actual height. Visible steps do
          not confirm an entrance or a route.
        </p>
        <label>
          Find a stair
          <input
            aria-label="Find native stairs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Source ID or building"
          />
        </label>
        {stairs
          .filter((s) =>
            `${s.stairElementId} ${s.buildings.join(" ")} ${sourceStairKind(s)}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
          )
          .map((s) => (
            <button
              key={s.stairElementId}
              className="project-search-item project-native-ramp-item"
              aria-label={`Show native stair #${s.stairElementId}`}
              onClick={() => onLocate(s)}
            >
              <strong>
                {sourceStairKind(s)} #{s.stairElementId}
              </strong>
              <small>
                {s.context === "outdoor" ? "Near building" : "Building"}{" "}
                {s.buildings.join(" / ")} · {stairAccessLabel(data, s)}
              </small>
            </button>
          ))}
      </details>
    </section>
  );
}
export function NativeStairInspector({
  data,
  stair,
  onSelectConnection,
}: {
  data: IndoorDataset;
  stair: SourceStair;
  onSelectConnection?: (id: string) => void;
}) {
  const edges = sourceStairEdges(data, stair),
    nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const elevations = [
    ...new Set(
      stair.treads.map((t) => Math.round(t.elevationFeet * 10_000) / 10_000),
    ),
  ];
  let connectionMessage =
    "Entrance connection needs review before directions are available. Stairs are excluded from wheelchair paths.";
  if (edges.some((e) => e.enabled))
    connectionMessage =
      "Route connection available. Stairs are excluded from wheelchair paths.";
  else if (stair.context === "tiered-seating")
    connectionMessage =
      "Seating and aisle access needs review. These tiers are excluded from wheelchair paths.";
  return (
    <div>
      <h3>
        Source{" "}
        {stair.context ? sourceStairKind(stair).toLowerCase() : "staircase"} #
        {stair.stairElementId}
      </h3>
      <p>
        {stair.context === "outdoor" ? "Near building" : "Building"}{" "}
        {stair.buildings.join(" / ")} · {elevations.length} measured
        {stair.context === "tiered-seating"
          ? " seating tiers"
          : " step elevations"}
      </p>
      {stair.context && (
        <p>
          {stair.context === "tiered-seating"
            ? "Stepped seating platforms inside the lecture hall. This is not a confirmed connection between campus floors. Wheelchair access uses reviewed step-free room entrances and seating access."
            : "Outdoor staircase. Nearby building and height references do not establish an indoor floor connection."}
        </p>
      )}
      <p>{connectionMessage}</p>
      <dl>
        <dt>Native height span</dt>
        <dd>
          {[stair.levelIds[0], stair.levelIds.at(-1)!]
            .filter((id, i, a) => a.indexOf(id) === i)
            .map(
              (id) =>
                data.nativeLevels.find((l) => l.id === id)?.name ?? `#${id}`,
            )
            .join(" ↔ ")}
        </dd>
        <dt>Tread surfaces</dt>
        <dd>
          {Math.min(...elevations).toFixed(2)}–
          {Math.max(...elevations).toFixed(2)} ft
        </dd>
        {!!stair.runs?.length && (
          <>
            <dt>Run endpoints</dt>
            <dd>
              {Math.min(
                ...stair.runs.map((r) => r.bottomElevationFeet),
              ).toFixed(2)}
              –
              {Math.max(...stair.runs.map((r) => r.topElevationFeet)).toFixed(
                2,
              )}{" "}
              ft · terminal risers included
            </dd>
          </>
        )}
        <dt>Geometry</dt>
        <dd>
          {stair.sourceGeometry === "native-brep"
            ? "Recovered native model faces"
            : "Native runs and treads"}
        </dd>
      </dl>
      {edges.map((e) => (
        <div key={e.id}>
          <h4>Connection</h4>
          <p>
            {[e.from, e.to]
              .map((id) => {
                const n = nodes.get(id);
                return n
                  ? `${data.records.find((r) => r.key === n.roomKey)?.number || n.roomKey} · ${n.pointFeet[2].toFixed(2)} ft`
                  : id;
              })
              .join(" ↔ ")}
          </p>
          <p>
            {e.enabled ? "Enabled" : "Disabled"} · {e.evidence}
          </p>
          <small>{e.id}</small>
          {onSelectConnection && (
            <button onClick={() => onSelectConnection(e.id)}>
              Review connection
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
