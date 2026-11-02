/**
 * A floor's checked 2D plan can be several MB to download and draw, so the
 * visitor page fetches it only once that floor's detail is wanted. The opening
 * view draws the overview, as it did before plans were admitted.
 *
 * Detail is wanted when the map is zoomed past the room-detail threshold, when
 * this floor was zoomed in or opened in 3D before (`requestedDetailScope`, kept
 * so zooming out does not drop a drawn plan), or when the visitor asked to be
 * shown this floor (`shownScope`: a route or instruction focus, a located place
 * or an explicitly chosen floor). Scope keys bind the manifest revision.
 */
export function visitorPlanWanted({
  scopeKey,
  admitted,
  locked,
  mode,
  detail,
  requestedDetailScope,
  shownScope,
}: {
  scopeKey: string;
  /** The selected scope has a published plan receipt for this revision. */
  admitted: boolean;
  locked: boolean;
  mode: string;
  /** The current zoom is at or past the room-detail threshold. */
  detail: boolean;
  requestedDetailScope: string;
  shownScope: string;
}) {
  return (
    admitted &&
    !locked &&
    mode === "2d" &&
    (detail || requestedDetailScope === scopeKey || shownScope === scopeKey)
  );
}
