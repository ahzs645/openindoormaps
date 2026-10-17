# Local indoor repair loop

Test the changed feature and its physical dependencies first. Batch supported
repairs before running the complete import, export, navigation and browser
acceptance flow. A local diagnostic helps find a defect; it does not certify a
visitor export or replace the final checks.

## Choose the smallest correct scope

| Change | First checks | Current-geometry scope |
| --- | --- | --- |
| Door or jamb | Opening, both original owners, full passage, retained foreign material, access | Host and adjoining areas; incident walking branches and both directions through the door |
| Wall, column or physical floor | Exact contact/support and real openings | Affected physical elevation and its connected areas; widen for shared hosts or cross-level material |
| Walking-path planner | Fixed original terminals, containment and obstruction refusals | Affected existing cells and related branches |
| Stair or ramp | Original flight/surface, both terminal approaches, source obstacles and access | Both served physical elevations and the complete vertical clearance demand; up/down and step-free refusals as appropriate |
| Colour, controls or loading | Affected rendering/client behavior and cache invalidation | Selected views and nearby controls; preserve geometry/routing and test the actual browser |
| Converter or shared geometry predicate | Representative source and regression fixtures | Every dependent geometry family; broaden the final batch to all affected floors |

Keep complete source floors, holes, walls, doors, fixtures, envelopes, exact
topology and policy records when scoping cell enumeration or selected edges.
Nearby geometry can still obstruct a passage. Unknown, unbounded or shared
dependencies require a wider scope. Use exact source physical elevations and
stable element/terminal/owner identities, rather than rounded cell-ID suffixes.

## Iterate in three tiers

1. Run the affected production-predicate tests, including a genuine positive
   case and relevant refusal/regression cases. Fix the demonstrated failure and
   rerun that family. Do not start with every unit test or a full campus import.
2. Replay the affected current geometry and related links. Bind the saved input
   bytes and current implementation; retain failed and unavailable outcomes.
   Rebuild the affected cell or physical elevation when the change alters its
   geometry. Check both directions and the appropriate access profiles. Do not
   export or publish the diagnostic dataset.
3. Once the repairs are stable, run the required complete preservation,
   physical, every-origin reachability, actual navigation and production-worker
   checks on one immutable candidate. Then build/export the visitor assets and
   perform the required desktop/mobile visual checks. If a failure needs another
   edit, return to its local scope before repeating the final batch.

Record local preparation, predicate, physical-replay and route time separately.
An unavailable route, skipped disabled edge and successful calculation are
different outcomes. Repeating an unchanged passing check is unnecessary unless
new changes, failures or unresolved concerns affect it.

## Existing entry points

Run only the relevant test files from the appropriate repository. For example,
door-boundary reader work in OpenIndoorMaps can start with:

```sh
node --import tsx --test --test-concurrency=1 \
  tests/unit/native-door-boundary-closures.test.ts \
  tests/unit/native-door-boundary-column-jamb.test.ts \
  tests/unit/native-door-column-jamb-lifecycle.test.ts
```

The sibling Reviter has matching source tests, including
`tests/native-door-boundary-closures.test.ts`,
`tests/native-circulation-plane-drafts.test.ts` and
`tests/native-terminal-refinement.test.ts`. Select the family affected by the
edit; these examples are not a mandatory combined suite.

Reviter's `prepareNativeCirculationPlaneDraft` in
`lib/reviter/native-circulation-geometry.ts` prepares one exact physical
elevation. `attachNativeCirculationCellRoutes` can replay selected existing
cells for a diagnostic while retaining the complete physical context. These
are local APIs, not a thin-source importer or permission to merge stale plane
drafts into a published map. Global assembly and its keys still need a coherent
final candidate.

For one existing landing candidate, `createNativeApproachEvaluator` in
`lib/reviter/native-circulation-links.ts` evaluates that original pair against
the complete saved model/dataset. It avoids enumerating every campus pair for
a diagnostic. Recreate the query after changing physical inputs; its cached
regions assume an unchanged input phase.

`audit-pathway-candidate.ts --cases` adds requested cases to the full audit; it
does **not** filter out the complete import and every-origin matrices.
`audit-room-routing.ts --shard` also imports the whole archive. Use these for
acceptance, rather than presenting them as a cheap per-edit loop.

Reusing a diagnostic input or cache requires unchanged actual dependencies and
implementation bindings. Raw serialized runtime bytes can change despite equal
values. Keep transport integrity separate from a stable complete cache identity;
never relabel old checkpoints, substitute source filenames for prepared-state
equivalence, or restore validation authority from a diagnostic snapshot.
