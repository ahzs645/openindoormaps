import type { ProjectRouteDiagnostic } from "./route-diagnostics";
import type { IndoorDataset } from "./contract";

/** Compare identities, not labels: separate places may share a display name. */
export const sameRoutePlace = (start: string, end: string) =>
  !!start && start === end;

/** A missing original arrival cannot be repaired by searching the graph. This
 * preflight only refuses work; it never supplies or authorizes a connection. */
export function missingRouteEntrance(
  data: Pick<IndoorDataset, "records"> | undefined,
  start: string,
  end: string,
): ProjectRouteDiagnostic | undefined {
  if (!data || !start || !end || sameRoutePlace(start, end)) return;
  const absent = [start, end].find(
    (key) => !data.records.find((r) => r.key === key)?.arrivalNodeId,
  );
  if (absent)
    return {
      kind: "missing-entrance",
      message: "This location has no prepared entrance connection.",
      blockers: [],
      sourceEdgeIds: [],
      reviewRoomKey: absent,
    };
}

/** Visitor failures describe availability; source investigation stays in authoring. */
export function visitorRouteFailureMessage(
  diagnostic: ProjectRouteDiagnostic | undefined,
  mode: "public" | "accessible",
) {
  if (diagnostic?.kind === "missing-entrance")
    return "An entrance is unavailable for one of these places.";
  if (mode === "accessible")
    return "No confirmed step-free route is available between these places.";
  if (diagnostic?.constraint === "hallways")
    return "No hallway-only route is available. You can allow paths through other rooms in Directions.";
  if (
    diagnostic?.blockers.some((b) =>
      ["staff", "non-walkable", "off-limits"].includes(b.kind),
    )
  )
    return "No route is available without entering a restricted area.";
  return "No indoor route is available between these places.";
}
