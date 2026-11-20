import { corridorChainTopologyContacts } from "./corridor-chain-fit";
import type { CorridorRetainedPath } from "./corridor-run-fit";
import type { PreparedRouting } from "./prepared-routing";

export type CorridorGuideTopologyInput = {
  guides: PreparedRouting["guides"];
  edges: ReadonlyMap<string, { from: string; to: string }>;
  /** Identity of the checked network that emitted the complete guide. A
   * post-compilation refinement gets its own origin; it may not borrow the
   * topology acceptance of the network it subsequently changed. */
  origins: ReadonlyMap<string, string>;
};

export type CorridorGuideContact = {
  edgeIds: [string, string];
  /** Exact rational point, or endpoints of a collinear overlap. */
  at: string;
};

/** Keep every complete control guide outside the primary physical part being
 * fitted, including legacy paths, later refinements and other physical parts.
 * Full approaches and original source endpoints are part of the constraint.
 * A missing origin is retained conservatively; it never borrows this network's
 * own topology acceptance. */
export function retainedCorridorGuidePaths(
  control: CorridorGuideTopologyInput,
  primaryOrigin: string,
): CorridorRetainedPath[] {
  return [...control.guides]
    .filter((guide) => control.origins.get(guide.edgeId) !== primaryOrigin)
    .sort((a, b) => a.edgeId.localeCompare(b.edgeId))
    .map((guide) => {
      const edge = control.edges.get(guide.edgeId);
      if (!edge) throw new Error("Unknown original guide edge");
      return {
        id: guide.edgeId,
        from: edge.from,
        to: edge.to,
        points: guide.pointsFeet.map(([x, y]): [number, number] => [x, y]),
      };
    });
}

/** Inspect the final guides of one complete physical cell. The shared-lane
 * routes emitted by one unchanged checked network intentionally overlap, so
 * its internal acceptance remains authoritative. Different networks, legacy
 * fallbacks and later refinements must also be inspected together. Only true
 * original terminal identities qualify endpoint contact; numeric coincidence
 * alone does not create a junction. */
function contacts(input: CorridorGuideTopologyInput, mixedOnly: boolean) {
  const guides = [...input.guides].sort((a, b) =>
    a.edgeId.localeCompare(b.edgeId),
  );
  const chains = guides.map((guide) => {
    const edge = input.edges.get(guide.edgeId);
    if (!edge) throw new Error("Unknown original guide edge");
    return {
      id: guide.edgeId,
      from: edge.from,
      to: edge.to,
      points: guide.pointsFeet.map(([x, y]): [number, number] => [x, y]),
    };
  });
  return corridorChainTopologyContacts(chains).flatMap(({ pair, at }) => {
    const a = guides[pair[0]].edgeId,
      b = guides[pair[1]].edgeId;
    const origin = input.origins.get(a);
    if (
      mixedOnly &&
      a !== b &&
      origin !== undefined &&
      origin === input.origins.get(b)
    )
      return [];
    return [{ edgeIds: [a, b] as [string, string], at }];
  });
}

/** A candidate may retain an existing contact at its exact location. A lower
 * total count cannot compensate for a new or moved contact elsewhere (the
 * historical mixed-network cell-852 regression). The control contains every
 * final guide, including recovery and door-bend passes, rather than only the
 * initial primary network. */
export function compareCombinedCorridorGuides(
  control: CorridorGuideTopologyInput,
  candidate: CorridorGuideTopologyInput,
) {
  const accepted = new Set(candidate.guides.map((guide) => guide.edgeId));
  const missingGuideIds = control.guides
    .map((guide) => guide.edgeId)
    .filter((id) => !accepted.has(id))
    .sort();
  const key = (contact: CorridorGuideContact) => JSON.stringify(contact);
  const existing = new Set(contacts(control, false).map(key));
  const newContacts = contacts(candidate, true).filter(
    (contact) => !existing.has(key(contact)),
  );
  return { missingGuideIds, newContacts };
}
