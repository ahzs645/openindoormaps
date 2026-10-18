import type { ProjectStep } from "~/indoor-project/navigation-steps";
import type { ProgressiveScope } from "~/indoor-project/progressive-delivery";

type PlaceScope = Pick<ProgressiveScope, "id" | "levelIds" | "building">;

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
