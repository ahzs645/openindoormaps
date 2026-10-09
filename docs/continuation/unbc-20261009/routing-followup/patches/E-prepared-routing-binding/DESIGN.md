# E. Prepared routing guide binding and global preflight ordering

Status: E1 is a candidate patch with a test. E2 is a design only. Neither is installed.
Files owned by other agents are not edited.

## Where the cache misses come from

`app/indoor-project/prepared-routing.ts` `preparedRoutingKey(data)` hashes
`JSON.stringify([routingSnapshot(data), data.walls, data.alignment, data.nodes])`.
`routingSnapshot` (`routing-cache.ts:51`) serializes some fields raw, and different contexts
redact those fields differently:

| context | redaction | field in the snapshot |
|---|---|---|
| route worker (`route-worker-dataset.ts`) | removes `circulationGeometry.displayResidualTopology` and every `cells[].containedDisplay` | `data.circulationGeometry` (raw) |
| campus viewer (`package.ts` ~1036/1054) | deletes `stairDisplay.sourceFlights[].historicalPreparedTreads` | `stairDisplay.sourceFlights` (raw, native datasets) |
| campus viewer | deletes `indoorExclusions.areas[].notes` | `data.indoorExclusions` (raw) |

Every one of these gives a different digest from the master's. `preparedWalkingGuides()` then
returns an empty map, so the worker and the viewer recompute every walking centre-line. No routing
code reads any of these fields. `historicalPreparedTreads` is used only in package redaction, and
`native-exact-routing-authority.ts:77` says explicitly that they never supply a veto. Exclusion notes
are only length-validated. The worker already routes without the display tessellation.

## E1: candidate patch (`prepared-routing.patch`)

`preparedRoutingBindingDataset(data)` = `routeWorkerDataset(data)` plus two more steps: it strips
exclusion `notes`, and it strips `historicalPreparedTreads` and the render `flights`. The key is
computed over this projection. The projection is idempotent, so master, worker and viewer all
produce the same digest. Every physical or policy input stays in the digest: records/access/rings,
nodes, edges/enablement, doors, walls, material sections, wall-position binding, frame returns,
corner seals, exclusion footprints/reasons, walking support, envelopes, exact circulation topology
and cells, stair source flights and connectors. Validation of the stripped render fields
(`validateNativeCirculationGeometry`, the package validators) is unchanged.

Test `prepared-routing-binding.test.ts`:
1. Guides survive the worker and viewer redactions.
2. The legacy key differs under each redaction (the regression is reproduced, and fails on the
   current code). The new key is equal, and the projection is idempotent.
3. Nine physical or permission edits still change the key: access, edge enablement, a node
   coordinate moved by 1e-6, exclusion footprint, exclusion reason, walking support, exact cell
   ownership, stair source flight and wall.

Results: 3/3 new tests pass, plus 4/4 existing `prepared-routing.test.ts` and 3/3
`route-worker-calculation.test.ts`. Strict typecheck of the touched files is clean. The run used a
scratch copy of the repository; the production file is untouched.

Not changed, by design: accessible routing still ignores guides (`centeredRoutePaths(enabled=false)`).
The existing test asserts this, and it is a separate width/clearance decision.

## E2: global preflight before guide reuse (design only)

`findProjectRoute` → `resolveProjectRoute` → `projectRoutingGraph` → `buildProjectRoutingGraph`
runs `nativeCirculationWalkBlockers(data)` over every walk edge (exact path, threshold-half,
floor-hole and exclusion checks) before any search. Prepared guides are consulted only later, in
`centeredRoutePaths`. That global pass is the 6.5–7 minute first-use cost measured in the CLI.

Proposal (keeps full validation of every edge a returned route uses):
1. At preparation, `prepareRouting` also stores `walkVerdicts`: the blocked edge-id set from the
   same `nativeCirculationWalkBlockers`. It is bound to the canonical E1 key and to a guard-engine
   fingerprint (`NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION` plus a new `NATIVE_WALK_GUARD_VERSION`
   constant). This bumps `PreparedRouting.version` to 2. Validation is structural, like the current
   validation.
2. At runtime, when key and fingerprint match, `buildProjectRoutingGraph` seeds blockers from
   `walkVerdicts` instead of running the global pass.
3. After a successful search, rerun the exact guard on the route's walk edges only:
   `nativeCirculationWalkBlockers(data, routeEdges)`, a subset call the function already supports.
   Any edge that fails goes into `excluded`, and the existing `{ retry }` loop in
   `findProjectRoute` searches again. A wrongly "unblocked" seed can therefore never reach a user.
4. A failed (unavailable) result from a seeded graph is provisional. Before reporting it, run the
   full global pass once and search again. A wrongly "blocked" seed can therefore never produce a
   false "no route".
5. In the browser, run the full pass at idle time in the worker and compare it with the seed. Any
   difference discards the prepared verdicts and logs a stale-binding error.

What this preserves: no edge is accepted without its exact check, and "unavailable" is only
claimed after the full pass. A mismatch in source, policy or engine falls back to today's
behaviour. Tests needed: seeded-correct, seeded-stale-unblocked (must retry), seeded-stale-blocked
(failure must trigger the full pass), engine-fingerprint mismatch, and parity with full-mode routes
on the 44-case suite.
