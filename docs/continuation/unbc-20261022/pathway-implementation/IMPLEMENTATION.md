# Shared pathways and native visitor presentation

This implementation follows the user's requested order: pathways first, then
visual cleanup, on `main`. The uploaded design packages are reference material;
their historical results and proposed release instructions are not new route
approval or publication authority.

## Source baseline

Start with [SOURCE-BASELINE.md](SOURCE-BASELINE.md) and its checksummed JSON
inventory. The complete October 22 compile archive was recovered and its master,
visitor and source members verified. The implementation baseline is
OpenIndoorMaps `662f400aa347dc79133d11923bfd90a7d24ea5c0` and Reviter
`80177ed21becc91c02df48bb27cd1d24f5fbf297`. Main already contains the inspected
OpenIndoorMaps changes and stepped-stair worker fix. The inspected Reviter
producer's additional change is documentation; its production compiler matches
the selected main.

The unchanged-main candidate baseline processed all 109 initial targets: 2,642
accepted guides from 2,884 eligible original edges, in 655.69 seconds. The four
Floor-2 pilot cells accepted 215/250 guides; library cell 655 accepted 148/182.
These are guide compilation outcomes, not route or public-access certification.

The same-input final four-cell pilot accepted 221/250 guides, including 154/182
in the library. All 215 previously accepted guides remain accepted, with six
additional guides. All 95 library terminals attach, and all 182 original library
requirements share checked components. The remaining 28 library guide refusals
are distance limits. Against the 215 guides accepted in both the baseline and
candidate, the selected 0.75-foot fitter reduced core bends over five degrees
from 598 to 429 (28.3%) and core vertices from 1,164 to 1,042 (10.5%). The exact
comparison, gained IDs and remaining refusals are in
[PILOT-COMPARISON.json](PILOT-COMPARISON.json). Exact core retraces are removed
without moving approach joins or creating a new segment. Original graph and
geometry parity pass. These results describe the pilot; campus-wide and normal
import acceptance are recorded separately when complete.

A separately bound 0.15-foot experiment retained 588 bends in its 214 matched
guides, compared with 426 at 0.75 feet before the final exact-retrace correction.
The selected default is 0.75 feet, with exact physical checks unchanged.

The complete campus candidate processed all 109 targets and all 2,884 eligible
original walks, accepting 2,701 guides versus 2,642 on unchanged main: 60 gained
and one refused. All 109 cells have explicit outcomes, with no refused native
cell admission. The 183 remaining refusals comprise 72 terminal-attachment,
60 distance-limit, 38 sampled-graph and 13 checked-chain disconnections. No new
source connection, owner, access rule or physical geometry was introduced.
[CAMPUS-COMPARISON.json](CAMPUS-COMPARISON.json) lists every cell and changed
accepted ID. The single lost guide has an explained complete-cell attachment
tradeoff and qualified ordinary physical fallback in
[CELL-71-FALLBACK.md](CELL-71-FALLBACK.md).

Across the 2,641 matched guides, bends over five degrees fall from 7,004 to 3,768
(46.2%), core vertices from 13,360 to 9,773 (26.8%), and measured core length
from 34,075.66 to 33,582.62 feet (1.4%). This describes accepted guide geometry;
it is not a clearance, route-policy or wheelchair certification. Full candidate
compilation took 1,110.09 seconds versus 655.69 seconds for the unchanged-main
baseline. The candidate overlapped the independent normal master import, so this
is not an isolated performance benchmark. No compile/startup speedup is claimed.

The recovered current source differs from the historical attachment diagnosis:
door 1887988 side 1 already has all three incident guides on the current baseline.
The two seam 43:2 anchors improve from 2/4 to 3/4 and 0/4 to 4/4. Do not relabel
these current results as a reproduction of the lost nine-edge diagnostic.

## Implemented boundaries

- `corridor-routing-scope.ts` indexes original eligibility once. Complete-cell
  terminals, incident doors and source-edge requirements precede output edge
  filtering. Unknown/ineligible replay IDs and refused native admission have
  explicit outcomes. Coverage retains non-target circulation fragments and
  unrepresented native levels as review obligations.
- `corridor-centerline.ts` retains checked attachment alternatives and selects
  joins once against complete original source requirements. Numerical proposals
  still require exact native support; only each terminal's own finite door half
  can support its approach. Source graph IDs, direction and policy remain intact.
- `corridor-chain-fit.ts` fits shared chains with protected joins/cycles,
  bounded deviation and exact segment support. Final geometry is checked for
  contacts introduced by fitting; checked original geometry remains the fallback.
- Normal shared routes use compiler geometry. Runtime composition removes only
  exact retraces and exactly collinear subdivisions, keeping real bends and outer
  hallway stops. Routes, stored guides and the hallway overlay share the trunk.
- Prepared routing keeps wire format v1 and advances the resolver to
  `native-walking-guides-4`; stale guides cannot silently inherit new behavior.
- Candidate jobs have source/compiler/runtime/parameter-bound complete-cell
  checkpoints, strict resume/merge validation and display-only native GeoJSON.
  See [candidate commands](../../../../scripts/indoor/corridor-candidates.md).
- [Visual cleanup](VISUAL-CLEANUP.md) changes visitor paint and visual hierarchy
  while retaining native outlines, holes, obstacle geometry and optional 3D.

Report fields describing attempted networks are separate from the accepted-guide
ledger. `approachTopologyConflicts` can include routes later refused by final
compiler checks, and `newTopologyContacts` counts fitting trials that were
reverted or refused. Neither field alone describes a conflict remaining in an
emitted guide.

## Reproduction

Use Node 24.19.0 and the checked lockfile. Preserve the original packages and
write each candidate into a distinct directory. The recovered archive is linked
in the source baseline; local scratch paths are not a portable input substitute.

```bash
node --max-old-space-size=4096 --import tsx \
  scripts/indoor/compile-corridor-candidates.ts "$VISITOR" "$CANDIDATE" \
  --cell native-cell:14.435696:557 \
  --cell native-cell:14.435696:616 \
  --cell native-cell:14.435696:617 \
  --cell native-cell:14.435696:655

# Omit --cell to process every current initial target.
# A changed tolerance is an explicit, separately bound experiment.
# --max-deviation-feet 0.15

python3 scripts/indoor/compare-corridor-candidates.py \
  "$BASELINE" "$CANDIDATE" "$COMPARISON_JSON"
```

The comparison requires the same source geometry key and exact cell scope. It
lists gained and lost accepted guides with refusal reasons. Matched-guide shape
metrics distinguish bends over five degrees from mandatory collinear terminal
joins; they are descriptive measurements, not physical predicates.

`verify-shared-corridor-candidate.ts` performs one normal source import, installs
matching guides into a new authoring candidate, verifies source-member/export
parity and replays the [policy cases](ROUTE-CASES.json), including a serialized
production worker. A successful candidate compile alone does not satisfy it:

```bash
node --max-old-space-size=4096 --import tsx \
  scripts/indoor/verify-shared-corridor-candidate.ts \
  "$SOURCE_MASTER" "$CANDIDATE/prepared-routing.json" \
  docs/continuation/unbc-20261022/pathway-implementation/ROUTE-CASES.json \
  "$NEW_ACCEPTANCE_DIRECTORY"
```

The largest cell's attachment tradeoff and directly qualified original physical
fallback are recorded in [CELL-71-FALLBACK.md](CELL-71-FALLBACK.md). Its scoped
physical result does not replace normal package or route-policy acceptance.

Fresh normal acceptance passes in [NORMAL-ACCEPTANCE.json](NORMAL-ACCEPTANCE.json):
all 2,701 guides bind to the normally imported master, export preserves original
RVT, GLB, rooms, GIS and review-bundle bytes, and all six normal calculator cases
and six serialized production-worker replays pass. Complete worker route values
and instructions match the normal calculator. Selected original edges, door IDs
and policy diagnostics match with guides on/off; all 27 disabled non-walking
transitions remain held. The candidate archive is 247,334,685 bytes, SHA-256
`c11333d9d94d09b80e4ee70069d19960d6787c9eafc5b7ec6773ea6c3d607bc5`.
[CHECKS.json](CHECKS.json) records these artifacts, source bindings, full unit/type/
build results, six browser checks and the separate native visual evidence.

## Release boundary

Native source geometry, access decisions, unknown accessibility and disabled
vertical transitions are preserved. The Building 4–8 link is expected to remain
unavailable for hallway-only and strict step-free directions; walking with
other-room transit is a separate tested option.

This source change does not select independent room-outline simplification, a
new compact runtime schema or the legacy loose hallway-router export as route
authority. Those are separate designs in the larger pipeline package.

Final publication still requires the current handoff's complete source/route
audit, native-level coverage review, rebuilt bound caches and floor-plan assets,
desktop/mobile/offline acceptance, paired development restore and served-byte
checks. The missing historical 09d/oracle and other evidence remain explicitly
listed in the source baseline. No existing acceptance receipt is relabeled.
