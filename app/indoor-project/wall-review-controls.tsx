import { useState } from "react";
import type { IndoorDataset } from "./contract";
import { wallReviewKey, wallReviewFeatures } from "./wall-review";
export function WallReviewControls({
  data,
  levelIds,
  building,
  active,
  onActive,
  onPick,
}: {
  data: IndoorDataset;
  levelIds: number[];
  building: string;
  active: boolean;
  onActive: (active: boolean) => void;
  onPick: (kind: "wall", key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  return (
    <section>
      <h2>Wall area review</h2>
      <label>
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => onActive(e.target.checked)}
        />
        Select source walls
      </label>
      <p>
        Click or tap a wall footprint to inspect it, including walls hidden by
        room blocks. Orange shows the source geometry.
      </p>
      {active && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const wall = data.walls.find(
              (w) =>
                w.kind !== "column" &&
                levelIds.includes(w.levelId) &&
                String(w.nativeElementId) === query.trim().replace(/^#/, ""),
            );
            const visible =
              wall &&
              wallReviewFeatures(data, levelIds, building).features.some(
                (f) => f.properties?.key === wallReviewKey(wall),
              );
            if (wall && visible) {
              onPick("wall", wallReviewKey(wall));
              setStatus("");
            } else
              setStatus("No wall with that ID on this floor and building.");
          }}
        >
          <label>
            Native wall ID
            <input
              aria-label="Native wall ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. 948595"
              inputMode="numeric"
            />
          </label>
          <button type="submit">Find wall</button>
          <p aria-live="polite">{status}</p>
        </form>
      )}
    </section>
  );
}
