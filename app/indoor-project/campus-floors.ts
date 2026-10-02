import type { IndoorProject } from "./package";

/** Shared review metadata understood by Reviter during regeneration. */
export type CampusStoreyReview = {
  id: string;
  name: string;
  levelIds: number[];
  evidence: "user-reported";
};

/** Combine visitor selections without joining geometry or routing on native levels. */
export function combineProjectFloors(
  project: IndoorProject,
  floorIds: readonly string[],
  name: string,
): IndoorProject {
  const selected = project.dataset.floors.filter((f) =>
    floorIds.includes(f.id),
  );
  if (new Set(floorIds).size < 2 || selected.length !== new Set(floorIds).size)
    throw new Error("Choose at least two existing campus floors.");
  name = name.trim();
  if (!name || name.length > 200)
    throw new Error("Enter a campus floor name of up to 200 characters.");
  const native = project.dataset.nativeLevels;
  const ids = [...new Set(selected.flatMap((f) => f.levelIds))];
  if (
    ids.length > 50 ||
    ids.some(
      (id) =>
        !native.some((l) => l.id === id && Number.isFinite(l.elevationFeet)),
    )
  )
    throw new Error(
      "Campus floors must reference up to 50 known native levels.",
    );
  const levelIds = ids.sort(
    (a, b) =>
      native.find((l) => l.id === a)!.elevationFeet -
        native.find((l) => l.id === b)!.elevationFeet || a - b,
  );
  const id = `storey:${levelIds.join("+")}`;
  const review: CampusStoreyReview = {
    id: `campus-${levelIds.join("-")}`,
    name,
    levelIds,
    evidence: "user-reported",
  };
  const groups = project.rooms.campusStoreys ?? [];
  const floors = [
    ...project.dataset.floors.filter((f) => !floorIds.includes(f.id)),
    {
      id,
      name,
      levelIds,
      elevationFeet: native.find((l) => l.id === levelIds[0])!.elevationFeet,
    },
  ].sort(
    (a, b) =>
      a.elevationFeet - b.elevationFeet || a.levelIds[0] - b.levelIds[0],
  );
  return {
    ...project,
    rooms: {
      ...project.rooms,
      campusStoreys: [
        ...groups.filter((g) => !g.levelIds.some((l) => levelIds.includes(l))),
        review,
      ],
    },
    dataset: { ...project.dataset, floors },
  };
}
