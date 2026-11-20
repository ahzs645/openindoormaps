# Complete-cell corridor candidates

Compile the original eligible edges of each native physical cell once. Building
codes and viewer floors do not partition the physical input. These outputs are
geometry candidates: they do not replace normal import, route qualification,
worker replay, publication receipts or venue/access review.

```sh
# Start a new candidate directory; omitting --cell selects every current target.
node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip candidate-a --cell native-cell:14.435696:655

# Resume that exact scope, source, compiler, runtime and parameter set.
node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip candidate-a --cell native-cell:14.435696:655 --resume

# Compare a separately bound fitting experiment in another new directory.
node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip candidate-b --cell native-cell:14.435696:655 --max-deviation-feet 0.15

# Reproduce the previous terminal approaches (no shaped approaches and no
# join sliding) as a separately bound experiment.
node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip candidate-c --cell native-cell:14.435696:655 --legacy-approaches

# Fit complete corridor runs as an explicit candidate (default is off).
# Resolve cell IDs from this exact input; IDs can change between rebuilds.
node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip candidate-runs --cell native-cell:24.278215:918 --straight-runs

# Merge disjoint complete-cell shards. Every requested cell must be present;
# merge never fills a missing cell by compiling or borrowing another version.
node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip merged --cell native-cell:14.435696:557 --cell native-cell:14.435696:655 --merge shard-557 --merge shard-655
```

Use repeated `--merge DIRECTORY` arguments. The default maximum chain deviation
comes from `app/indoor-project/corridor-routing-parameters.ts`; any override is
part of the binding. Preserve the same Node command flags when resuming or
merging, including the heap/loader options. The compiler is sequential and reuses
one immutable physical context, rather than cloning the whole campus into a
worker pool. The input reader verifies the original archive and all three bound
members, then releases the ZIP, unrelated member buffers and source text before
the next large allocation. `--expose-gc` allows collection at these boundaries;
it changes memory scheduling only. The complete parsed dataset, all physical
and policy fields, and the exact JSON serialization used by the mutation check
are preserved. This does not replace native admission or normal package import.

`binding.json` records exact ZIP/JSON/model/physical-policy identities, resolved
local code and WASM dependencies, lockfile, Node/V8/platform/architecture, process
flags and numeric compiler parameters. Each `cells/*.json` checkpoint binds the
complete original eligible edge/terminal/incident-door set and has a payload
checksum. Validation rejects partial cells, duplicate/foreign/missing outcomes,
changed endpoints, stale bindings, corrupt payloads and conflicting merge input.
Both accepted guides and explicit refusals are retained, including refused native
cell admission. A cached candidate never restores physical or navigation
validation authority.

The command writes each checkpoint through an atomic temporary-file rename and
locks its output directory. An interrupted job may leave `.candidate.lock`; check
that its recorded process has stopped before removing that file and resuming.
Temporary `.tmp` files are never imported as checkpoints. A source/compiler
change during an attempt discards that attempt's newly written checkpoints.

Final artifacts are `prepared-routing.json`, `report.json`, `preview.json` and
`shared-guides-display.geojson`. The GeoJSON is WGS84 display-only data with exact
native `pointsFeet`, original edge/from/to/cell/elevation identities and separate
`approach-start`, `core` and `approach-end` roles. It explicitly declares
`candidate-display-only` and `navigationAuthority: false`. The legacy hallway
routing export is a separate product and is unchanged by this command.

## Terminal approaches and trunk refitting

`shapedApproaches` (default on) proposes, before the previous candidates, a
straight branch along the original doorway normal to its crossing with the
receiving lane, a straight branch to the projection, and a doorway-normal elbow
whose second leg is perpendicular to the lane and never runs past it. The
previous candidates follow as the fallback, with an elbow that runs past its
receiving point tried last. `slideJoins` then removes short sampled spurs that
only carry a terminal join to a junction, refits each trunk through
pass-through joins and reattaches those terminals to the refitted trunk. A
terminal is moved only if its new branch is no less clean than its previous
branch plus the removed spur; otherwise it keeps its join and spur.

Neither option adds physical authority. Every proposed approach is checked with
the terminal's own exact doorway half, both receiving pieces and every refitted
core piece are rechecked, and the final edge check is unchanged. Any other
failure retains the already checked network. In `prepareSharedCorridorRouting`,
an edge refused by the shaped network is compiled from the unchanged previous
network and listed in the cell's `legacyApproachFallbackEdgeIds`, so a cell
never loses a guide the previous proposal would have accepted.

`compare-corridor-candidates.py` additionally reports complete-guide bends,
zigzag reversals (a turn over 120 degrees with an adjacent leg of at most two
metres, split into approach/join and core), approach elbows, core dead ends and
dead ends at arrival points. These are descriptive drawing diagnostics, never
physical predicates or route acceptance.

## Opt-in complete corridor runs

`--straight-runs` enables `straightRuns` in the bound compiler parameters. It
is disabled by default and cannot be combined with `--legacy-approaches`.
It is an adaptation of the held November 3 experiment to the current pipeline,
including the later recovery, ramp-landing and doorway-station passes.

The fitter follows a straight continuation through room branches and genuine
junctions, fits corridor cross-section midpoints, and re-proposes short door
branches against the result. Real corners end runs. Island sides and loops
remain separate alternatives. Every changed piece and terminal approach keeps
the existing exact two-foot support check, original terminal coordinates, and
final edge checks. It checks detours for every required original edge, including
journeys passing through a changed run whose own terminal branches did not move.

The opt-in compiler builds its complete unfitted control first. Each primary
physical part then receives every control guide outside that primary network as
a fixed constraint: legacy fallbacks, later refinements, other physical parts,
and guides with missing origin metadata. The constraint contains the entire
polyline, including both terminal approaches. A run that creates or moves a
contact with one of those paths retains its checked geometry; independent runs
can still be fitted. The diagnostic replay uses this same retained-path selector.

Internal contact identity includes both original path participants and the exact
contact location. Original run identities survive removal or replacement of a
doorway station and splitting into new pieces. A new connector receives a new
identity. An unrelated pair's old contact at the same point cannot authorize a
new crossing or overlap. Retained paths share endpoints only through their
original source terminal identities.

The final **complete cell** is compared with a no-runs control after all recovery
passes. A new or moved topology contact between different primary networks,
legacy fallback guides, or later refined guides withdraws the whole cell's run
proposal. Losing a previously accepted guide also withdraws it. Contacts are
compared by original edge pair and exact rational location, including point
touches and overlaps; a lower total crossing count cannot compensate for a new
crossing elsewhere. This corrects the held experiment's cell-852 guard failure.
Original terminal identities qualify endpoint contact. Coordinate coincidence
does not create a route junction or change permissions.

An unchanged checked network retains its own internal topology acceptance:
different returned routes intentionally reuse its same corridor lanes. A guide
changed by a later recovery pass receives a distinct origin, so that pass cannot
borrow the topology approval of geometry it replaced. This is conservative:
fixed control constraints may refuse a useful fit, and later candidate recovery
can still change the mixed network. That is why the final complete-cell guard
remains necessary after the individual run checks.

`report.json` records `straightRunsWithdrawn`, missing guide IDs, the complete
new-contact count, up to twenty exact contact examples, and the attempted
network statistics. Branch statistics count accepted placements, not attempts
subsequently withdrawn within a run. A withdrawn cell emits its complete current
no-runs control, without a mixture of accepted and rejected run geometry.

Successful local compilation is candidate evidence. To enable it for a release,
rebuild and qualify the complete catalog, ordinary and step-free policy cases,
journey distances/instructions, overview parity, exports, hydration, browser
worker, and exact published receipts. Do not relabel a held catalog or the old
November 3 measurements as the result of this current compiler.
