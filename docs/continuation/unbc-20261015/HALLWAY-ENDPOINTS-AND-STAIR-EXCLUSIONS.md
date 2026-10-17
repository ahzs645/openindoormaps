# Hallway endpoints and staircase exclusions

Status: implemented and tested in an isolated candidate. The running compiler,
canonical master and hosted site have not been changed by this work. This is
not a fresh campus-navigation or release approval.

Candidate: `/workspace/scratch/unbc-pathway-repair-20261015/hallway-routing-candidate/openindoormaps`.
The exact patch and original before-images are in its sibling `reviewed-delta`.
Only that enumerated delta may be integrated; copying the entire candidate app
would overwrite the separately reviewed stronger physical stair consumer.

## Routing behavior

- The full viewer defaults to the hallway sides of both selected rooms' actual
  doors. Existing circulation destinations and verified lift lobbies retain
  their saved arrivals. Explicit inside-room and destination-doorway choices
  remain available.
- The solver chooses among existing, graph-admitted entrance nodes in both
  directions. It checks original owners, circulation classification, direction,
  access/profile admission, same elevation, actual finite doorway crossing and
  exact saved portal endpoints. It creates no nodes, doors or source geometry.
- Multiple entrances are chosen by the outside route, independent of a room's
  saved interior arrival distance. A valid outside route need not calculate an
  interior approach first. An absent verified hallway entrance is reported.
- The solver tries circulation-only transit before its existing checked
  ordinary-room fallback. A room shortcut cannot win merely because it is much
  shorter when a valid hallway route exists. This is a preference, not a claim
  that every destination has a hallway-only route.
- Explicit hallway requests calculate the selected outside route only. They
  leave interior-arrival reachability unset so it cannot incorrectly disable
  an outside-door selection. Legacy audit requests retain inside-route and
  reachability behavior.
- Exclusion and endpoint choices are included in result-cache identities.
  Changing them reuses a resident graph without cloning the campus dataset.
  Legacy all-choice responses and selected-mode responses have separate keys.

## Staircase settings and 08-S401

The candidate's `unbc-viewer-preferences.json` records the user's seven temporary
exclusions: **1842431, 1460777, 1821194, 1523099, 1844188, 1728649, 1727059**.
It must be installed as the hosted project manifest's `viewerPreferences`
before publication. The loader checks the original model hash; overrides are
stored per model and can be cleared or changed from Directions or a stair's
inspector. These preferences remove routing choices, grant no access or source
approval and preserve the visible original geometry.

None of those seven IDs occurs in the saved baseline's 76 vertical graph
connections. Their visible source assemblies are not demonstrated routes.
The preference does not certify an outdoor classification.

08-S401 exists as `rm-402367-1f1e120e87d5`, at native elevation
34.120734908136484 ft. Its baseline has no admitted arrival and records a bounded
approach-planning refusal. The old marker filter hid native stair areas without
an arrival or associated flight. The candidate adds a clearly unconnected
**stair landing** marker inside the existing area, retaining holes. It creates
no treads or upward link. The complete physical staircase and upper-floor
connection remain unverified.

## Why another loading stage occurs

The full viewer still initially downloads the complete ZIP. Rendering then
prepares the selected floor scope, exact room picking initializes its own
floor-topology worker, and directions use a separate campus routing snapshot.
That routing graph supports cross-floor paths; it does not render every floor.
A matching published directions cache reuses checked physical intersections
and link policies. A missing or mismatched cache falls back to full physical
checks, which can dominate startup. The final release still needs a cache bound
to its actual final dataset and engine, plus measured cold-browser behavior.

This candidate removes unused interior-route/endpoint-variant calculations for
an explicit hallway request. It does not claim to eliminate all floor/picking
preparation or implement overview-first loading in the full viewer.

## Verification and remaining integration

- Forty focused routing, arrival, transport and stair-display tests passed in
  13.15 seconds. A subsequent ten-test entrance suite also passed, including the
  newly added multiple-entrance regression.
- Six simulated React DOM checks passed against the actual exclusion controls,
  inspector and storage hook, including model isolation and reversible clears.
  These are component checks, not full browser/WebGL proof.
- Scoped core/UI typechecking passed. The final run took 20.80 seconds with
  approximately 646 MiB maximum child RSS.
- Independent review reproduced and verified fixes for finite-aperture
  qualification and legacy/selected response-cache collisions. It also checked
  cancelled-load preference commits and a centered hallway-detour control.
- Original compiler source files remain unchanged. No normal campus import,
  actual campus route calculation, final browser run or publication was claimed.

Finish the genuine current build, then run the prepared local physical
diagnostic. Apply the reviewed stronger stair consumer and its original source
replay/source-scope checks before installing this delta. Preserve those exact
archives and receipts, bind the reviewed new consumer and final official engine,
then run one final acceptance batch. Keep the original route cases and add
targeted production-worker hallway/exclusion cases; the old cases alone do not
test the new default. Rebuild the matching directions cache and verify the
actual full viewer on desktop/mobile before publishing privately.

The compact/offline viewer's endpoint/exclusion controls are outside this
candidate. Its behavior must not be represented as verified by these full-viewer
changes. The checked integration notes are in
`/workspace/scratch/unbc-pathway-repair-20261015/navigation-qa/hallway-routing-review/INTEGRATION-NOTES.md`.
