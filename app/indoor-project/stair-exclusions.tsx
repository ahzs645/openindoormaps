import { useCallback, useMemo, useState } from "react";
import type { IndoorDataset } from "./contract";
import { projectRoutingOptionsKey } from "./routing-options";

export type HostedStairPreferences = {
  sourceModelSha256: string;
  excludedNativeStairIds: number[];
};
export function checkedStairPreferences(
  value: unknown,
): HostedStairPreferences {
  const row = value as HostedStairPreferences;
  if (
    !row ||
    !/^[a-f0-9]{64}$/.test(row.sourceModelSha256) ||
    !Array.isArray(row.excludedNativeStairIds)
  )
    throw new Error("Invalid map staircase preferences.");
  const [, , ids] = JSON.parse(
    projectRoutingOptionsKey({
      excludedNativeStairIds: row.excludedNativeStairIds,
    }),
  );
  return {
    sourceModelSha256: row.sourceModelSha256,
    excludedNativeStairIds: ids,
  };
}
export function loadExcludedStairs(
  model: string,
  defaults: readonly number[] = [],
): number[] {
  try {
    const raw = globalThis.localStorage.getItem("indoor-route-stairs:" + model);
    if (raw !== null)
      return checkedStairPreferences({
        sourceModelSha256: model,
        excludedNativeStairIds: JSON.parse(raw),
      }).excludedNativeStairIds;
  } catch {
    /* Storage is optional; keep the checked map defaults. */
  }
  return checkedStairPreferences({
    sourceModelSha256: model,
    excludedNativeStairIds: [...defaults],
  }).excludedNativeStairIds;
}
export function useStairExclusions(
  data?: IndoorDataset,
  defaults?: HostedStairPreferences,
) {
  const [stored, setStored] = useState<HostedStairPreferences>();
  const model = data?.source.modelSha256;
  const ids = useMemo(
    () =>
      !model
        ? []
        : stored?.sourceModelSha256 === model
          ? stored.excludedNativeStairIds
          : loadExcludedStairs(
              model,
              defaults?.sourceModelSha256 === model
                ? defaults.excludedNativeStairIds
                : [],
            ),
    [model, stored, defaults],
  );
  const onChange = useCallback(
    (next: number[]) => {
      if (!model) return;
      const value = checkedStairPreferences({
        sourceModelSha256: model,
        excludedNativeStairIds: next,
      });
      try {
        globalThis.localStorage.setItem(
          "indoor-route-stairs:" + model,
          JSON.stringify(value.excludedNativeStairIds),
        );
      } catch {
        /* Session choices still work. */
      }
      setStored(value);
    },
    [model],
  );
  return { ids, onChange };
}
export function StairExclusionSettings({
  data,
  ids,
  onChange,
}: {
  data: IndoorDataset;
  ids: number[];
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const stairs = stairExclusionChoices(data, ids);
  return (
    <details className="project-profile-field">
      <summary>Excluded stairs · {ids.length}</summary>
      <p>
        Excluded stairs will not be used for directions. Their source geometry
        stays on the map.
      </p>
      <label>
        Find a staircase
        <input
          aria-label="Find stairs to exclude"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Source ID or building"
        />
      </label>
      {stairs
        .filter((s) => `${s.stairElementId} ${s.label}`.includes(query.trim()))
        .map((s) => (
          <label key={s.stairElementId}>
            <input
              type="checkbox"
              aria-label={`Exclude staircase #${s.stairElementId}`}
              checked={ids.includes(s.stairElementId)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...ids, s.stairElementId]
                    : ids.filter((id) => id !== s.stairElementId),
                )
              }
            />
            #{s.stairElementId} · {s.label}
          </label>
        ))}
      {!!ids.length && (
        <button type="button" onClick={() => onChange([])}>
          Clear staircase exclusions
        </button>
      )}
    </details>
  );
}

/** Stored exclusions remain reversible even when this map has no displayed
 * source assembly for that ID. A preference never supplies missing geometry. */
export function stairExclusionChoices(
  data: IndoorDataset,
  ids: readonly number[],
) {
  const choices = new Map(
    (data.stairDisplay?.sourceFlights ?? []).map((stair) => [
      stair.stairElementId,
      {
        stairElementId: stair.stairElementId,
        label: `Building ${stair.buildings.join(" / ")}`,
      },
    ]),
  );
  for (const id of ids)
    if (!choices.has(id))
      choices.set(id, {
        stairElementId: id,
        label: "not in displayed stair inventory",
      });
  return [...choices.values()];
}
