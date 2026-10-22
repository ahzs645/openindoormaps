export type CorridorAttachmentRequirement = {
  id?: string;
  from: string;
  to: string;
};

export type CorridorAttachmentCandidate = {
  component: number;
  distance: number;
  /** Keep a previously checked join when no complete assignment exists. */
  preferred?: boolean;
};

/** A geometric assignment for existing source traversals, never a permission
 * graph. A common checked component is chosen for a whole source component
 * when possible. Partial repairs may add satisfied requirements but may not
 * discard one already satisfied by the initial checked joins. */
export function chooseCorridorTerminalAttachments<
  T extends CorridorAttachmentCandidate,
>(
  candidates: ReadonlyMap<string, readonly T[]>,
  requirements: readonly CorridorAttachmentRequirement[],
) {
  const ids = [...candidates.keys()].sort();
  const selected = new Map<string, T>();
  const best = new Map<string, Map<number, T>>();
  for (const id of ids) {
    const options = candidates.get(id)!;
    const components = new Map<number, T>();
    for (const option of options) {
      const prior = components.get(option.component);
      if (
        !prior ||
        (option.preferred && !prior.preferred) ||
        (!!option.preferred === !!prior.preferred &&
          option.distance < prior.distance)
      )
        components.set(option.component, option);
    }
    best.set(id, components);
    const initial = options.find((option) => option.preferred) ?? options[0];
    if (initial) selected.set(id, initial);
  }
  const links = requirements.filter(
    (edge) => candidates.has(edge.from) && candidates.has(edge.to),
  );
  const neighbours = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const edge of links) {
    neighbours.get(edge.from)!.add(edge.to);
    neighbours.get(edge.to)!.add(edge.from);
  }
  const visited = new Set<string>();
  for (const first of ids) {
    if (visited.has(first)) continue;
    const group = [first];
    visited.add(first);
    for (let i = 0; i < group.length; i++)
      for (const id of [...neighbours.get(group[i])!].sort())
        if (!visited.has(id)) {
          visited.add(id);
          group.push(id);
        }
    group.sort();
    const common = [...best.get(first)!.keys()]
      .filter((component) => group.every((id) => best.get(id)!.has(component)))
      .map((component) => ({
        component,
        moved: group.filter((id) => {
          const preferred = candidates
            .get(id)!
            .find((candidate) => candidate.preferred);
          return preferred && preferred.component !== component;
        }).length,
        distance: group.reduce(
          (sum, id) => sum + best.get(id)!.get(component)!.distance,
          0,
        ),
      }))
      .sort(
        (a, b) =>
          a.moved - b.moved ||
          a.distance - b.distance ||
          a.component - b.component,
      );
    if (common.length > 0) {
      for (const id of group)
        selected.set(id, best.get(id)!.get(common[0].component)!);
      continue;
    }
    const groupIds = new Set(group);
    const edges = links.filter((edge) => groupIds.has(edge.from));
    const fulfilled = (assignment: ReadonlyMap<string, T>) =>
      edges.map((edge) => {
        const a = assignment.get(edge.from),
          b = assignment.get(edge.to);
        return !!a && !!b && a.component === b.component;
      });
    const distance = (assignment: ReadonlyMap<string, T>) =>
      group.reduce((sum, id) => sum + (assignment.get(id)?.distance ?? 0), 0);
    // At most one trial per available component, followed by bounded local
    // sweeps. Coverage only grows and distance strictly falls on equal
    // coverage, so iteration order cannot oscillate.
    const components = [
      ...new Set(group.flatMap((id) => [...best.get(id)!.keys()])),
    ].sort((a, b) => a - b);
    const accept = (trial: Map<string, T>) => {
      const before = fulfilled(selected),
        after = fulfilled(trial);
      if (before.some((ok, i) => ok && !after[i])) return false;
      const improvement = after.some((ok, i) => ok && !before[i]);
      if (!improvement && distance(trial) >= distance(selected)) return false;
      for (const id of group) {
        const candidate = trial.get(id);
        if (candidate) selected.set(id, candidate);
      }
      return true;
    };
    for (const component of components) {
      const trial = new Map(selected);
      for (const id of group) {
        const candidate = best.get(id)!.get(component);
        if (candidate) trial.set(id, candidate);
      }
      accept(trial);
    }
    for (let pass = 0; pass < Math.min(group.length, 8); pass++) {
      let changed = false;
      for (const id of group)
        for (const component of [...best.get(id)!.keys()].sort(
          (a, b) => a - b,
        )) {
          const trial = new Map(selected);
          trial.set(id, best.get(id)!.get(component)!);
          changed = accept(trial) || changed;
        }
      if (!changed) break;
    }
  }
  return selected;
}
