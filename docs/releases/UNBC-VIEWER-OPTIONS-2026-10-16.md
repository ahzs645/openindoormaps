# UNBC viewer options release

This release updates the full OpenIndoorMaps viewer using the existing visitor
package. It does not publish the still-running source geometry regeneration.

## What changes

- Route endpoints default to the verified hallway side of ordinary-room doors.
  Circulation areas and verified lift lobbies retain their existing arrivals.
  The viewer offers inside-room and destination-doorway overrides.
- Route search first tries to avoid transit through ordinary rooms, then retains
  the existing physically and policy checked fallback when necessary.
- Reversible exclusions are saved per source model. UNBC starts with the user's
  seven source stair IDs; absent display inventory entries remain individually
  removable. Source geometry and held-route decisions stay intact.
- An unconnected, source-labelled stair area can display an explicitly
  unavailable landing marker. This locates 08-S401 without inventing an upward
  connection, treads, arrival or approved stair route.
- Explicit hallway requests skip unused inside-route/endpoint alternatives.
  Preferences have separate response-cache identities and reuse the resident
  approved graph.
- Visitor packages hide the authoring Room review entry and native mixed-hallway
  diagnostics. Existing authoring projects retain their review interface.
- Published floor display context retains its identity across selection and
  route changes. Floor/context and 3D-label changes still invalidate it. This
  avoids rebuilding stable whole-floor wall and room collections on each click.
- Exact floor hit-testing creates its worker only on the first actual map hit.
  Typing or choosing route endpoints in search does not start that index. The
  original exact initialization, FIFO messages and scope cancellation remain.
- Optional sparse-lane straightening stops before enumerating a grid above
  128 points. Smaller grids delegate to the original algorithm. Larger grids
  use the original continuously checked guide/elbow fallbacks; final floor,
  exclusion, barrier, doorway and transition checks remain in force.
  If the bounded solve finds no valid path, it retries the original centering
  algorithm with fresh rejected links and a distinct result-cache identity.
  Difficult refusals or recovery cases can therefore retain the original cost.

## Reusing the checked map safely

The new search, endpoint preferences, reachability helper and bounded centering
live in viewer modules. All 179 original geometry/preparation dependencies and
their complete ordered hashes remain unchanged. The normal official generator
still computes `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`.
No old fingerprint is assigned to changed preparation code.

The original package, individual ZIP parts, worker projection, policies, exact
cell topology, progressive floor assets and checksummed cache stay unchanged.
The original published importer and cache decoder therefore retain their
original authority. The new consumer is separately bound by its exact file
delta and fresh route/browser checks. This avoids another geometry rebuild for
viewer preferences while preserving the running compiler's frozen inputs.

The visitor ZIP remains 45,290,239 bytes, SHA-256
`6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22`.
The routing worker projection remains
`a7f91256cb2bbd8c6951d7fdab154d7f104c5e0c4bd0100b7e2abb1202cd3ddd`.
The mutable hosted descriptor adds only model-bound viewer preferences.

## Publication check

The check page compares ordinary URLs with their expected bytes and SHA-256.
It shows text, colour and timestamps for current, pending, old-content and
failed/expired-access outcomes. Refresh uses the same URLs with browser cache
reload; verified map downloads and preferences remain intact. It does not claim
to purge a hosting/CDN cache. Owner-private access remains unchanged, so
anonymous checks confirm access restriction and authenticated checks verify
content. An anonymous 403 is not evidence of current map content.

## Limits

This is the full viewer's release. Compact/offline endpoint and exclusion
controls have not been wired to these preferences. All existing held stair
links remain held. The complete upward 08-S401 connection remains unverified.
Unknown access and limited step-free coverage remain as recorded in the map.

## Executed checks

The actual published UNBC importer, original receipt/cache decoder and new
calculator were exercised in ten cases: eight moving routes and two correct
refusals. These include both directions of 05-136/05-173, the inside-room
override, both ordinary-room hallway endpoints (05-173/05-174), unchanged
results with the seven exclusions removed, and both directions through the
Library east lift (05-143/05-242). The unavailable step-free route and 08-S401
connection were refused; no stair clearance was approved.

The two-pass QA receipt explicitly binds four completed cases retained from an
earlier run and six subsequent cases. A floating-point endpoint assertion was
corrected to 1e-9 ft; product geometry did not change. Same-floor computations
still took approximately 4–71 seconds in this environment; the two lift
calculations took about five seconds each. These are calculator measurements,
not total browser startup times or a promise of instant directions.

Related endpoint, worker-cache, centering and barrier fixtures passed, along
with scoped typechecks and a production build. Simulated React DOM checks
verified visitor review controls stay hidden and author controls still work.
The publication status checks exercised current content and controlled
old-content/failed-access responses on ordinary local URLs. Actual desktop,
mobile and production publication receipts are recorded separately after
their checks finish.

## Browser acceptance

Normal-heap Chromium completed desktop and mobile viewport checks.
Desktop checked both hallway cases, option reload persistence, lift
routing, both floor previews and both publication-check actions. Mobile
checked ordinary-room endpoints, both option controls, lift routing and
publication checks. A focused visual follow-up waits for real camera,
tile and indoor-feature readiness on both mobile floor previews; earlier
premature blank captures are retained separately. No new product source
change was used to replace that visual evidence. No console, page, worker
or failed-network errors occurred in the completed checks.

Measured desktop startup was 67.5 seconds; the first same-floor request
took 125.6 seconds and the lift request including floor selection took
157.1 seconds. The focused mobile measurements were 54.2, 60.0 and
58.6 seconds respectively. These are local browser observations, not
hardware-mobile benchmarks. Cold loading and floor preparation still
need further optimization; this release does not claim instant routing
or that every pathway is fixed.
