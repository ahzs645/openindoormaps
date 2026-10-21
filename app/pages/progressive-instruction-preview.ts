import type { ProjectStep } from "~/indoor-project/navigation-steps";
import type { ProgressiveScope } from "~/indoor-project/progressive-delivery";

type PlaceScope = Pick<ProgressiveScope, "id" | "levelIds" | "building">;
type NamedPlace = {
  number: string;
  name: string;
  building: string;
  levelId: number;
};
type FloorNames = {
  nativeLevels: readonly { id: number; name: string }[];
  floors: readonly { levelIds: readonly number[]; name: string }[];
};

function normalizePlaceSearch(value: string) {
  return value.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

/** Original native floor names distinguish levels grouped in one Main view. */
export function progressivePlaceContext(
  place: Pick<NamedPlace, "building" | "levelId">,
  names: FloorNames,
) {
  const floor =
    names.nativeLevels.find((level) => level.id === place.levelId)?.name ??
    names.floors.find((level) => level.levelIds.includes(place.levelId))
      ?.name ??
    "Floor unavailable";
  return `Building ${place.building} · ${floor}`;
}

export function progressivePlaceLabel(place: NamedPlace, names: FloorNames) {
  const originalName = [place.number, place.name].filter(Boolean).join(" ");
  return `${originalName} · ${progressivePlaceContext(place, names)}`;
}

/** Search only published place data. Exact room/name matches lead; original
 * source order breaks ties. Ranking never changes endpoint availability. */
export function progressivePlaceSearchMatches<T extends NamedPlace>(
  places: readonly T[],
  names: FloorNames,
  search: string,
): T[] {
  const query = normalizePlaceSearch(search);
  if (!query) return [];
  const terms = query.split(" ");
  return places
    .map((place, index) => {
      const number = normalizePlaceSearch(place.number),
        name = normalizePlaceSearch(place.name),
        floor =
          names.nativeLevels.find((level) => level.id === place.levelId)
            ?.name ??
          names.floors.find((level) => level.levelIds.includes(place.levelId))
            ?.name ??
          "",
        searchable = normalizePlaceSearch(
          [place.number, place.name, "Building", place.building, floor].join(
            " ",
          ),
        );
      if (!terms.every((term) => searchable.includes(term))) return;
      let rank = 6;
      if (number === query) rank = 0;
      else if (name === query) rank = 1;
      else if (number.startsWith(query)) rank = 2;
      else if (name.startsWith(query)) rank = 3;
      else if (number.includes(query)) rank = 4;
      else if (name.includes(query)) rank = 5;
      return { place, index, rank };
    })
    .filter(
      (match): match is { place: T; index: number; rank: number } => !!match,
    )
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, 12)
    .map((match) => match.place);
}

/** Keep a compatible composite floor instead of loading a narrower duplicate. */
export function progressivePlaceScope<T extends PlaceScope>(
  scopes: readonly T[],
  currentScopeId: string,
  levelId: number,
  building: string,
): T | undefined {
  const contains = (scope: T) =>
    scope.levelIds.includes(levelId) &&
    (scope.building === "all" || scope.building === building);
  return (
    scopes.find((scope) => scope.id === currentScopeId && contains(scope)) ??
    scopes.find((scope) => scope.building === "all" && contains(scope)) ??
    scopes.find((scope) => contains(scope))
  );
}

/** Preview the checked step's destination floor and its corresponding anchor.
 * A display focus is never a new arrival or a route/policy certificate. */
export function progressiveInstructionPreview<T extends PlaceScope>(
  scopes: readonly T[],
  currentScopeId: string,
  step: ProjectStep,
): { scope: T; position?: [number, number] } | undefined {
  const scope = progressivePlaceScope(
    scopes,
    currentScopeId,
    step.levelId,
    step.building,
  );
  if (!scope) return;
  const position =
    step.type === "floor-change"
      ? (step.arrivalPosition ?? step.position)
      : step.position;
  return {
    scope,
    position: position ? [position[0], position[1]] : undefined,
  };
}
