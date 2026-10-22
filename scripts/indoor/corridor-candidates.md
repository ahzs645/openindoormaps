# Complete-cell corridor candidates

Compile the original eligible edges of each native physical cell once. Building
codes and viewer floors do not partition the physical input. These outputs are
geometry candidates: they do not replace normal import, route qualification,
worker replay, publication receipts or venue/access review.

```sh
# Start a new candidate directory; omitting --cell selects every current target.
node --max-old-space-size=4096 --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip candidate-a --cell native-cell:14.435696:655

# Resume that exact scope, source, compiler, runtime and parameter set.
node --max-old-space-size=4096 --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip candidate-a --cell native-cell:14.435696:655 --resume

# Compare a separately bound fitting experiment in another new directory.
node --max-old-space-size=4096 --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip candidate-b --cell native-cell:14.435696:655 --max-deviation-feet 0.15

# Merge disjoint complete-cell shards. Every requested cell must be present;
# merge never fills a missing cell by compiling or borrowing another version.
node --max-old-space-size=4096 --import tsx scripts/indoor/compile-corridor-candidates.ts visitor.zip merged --cell native-cell:14.435696:557 --cell native-cell:14.435696:655 --merge shard-557 --merge shard-655
```

Use repeated `--merge DIRECTORY` arguments. The default maximum chain deviation
comes from `app/indoor-project/corridor-routing-parameters.ts`; any override is
part of the binding. Preserve the same Node command flags when resuming or
merging, including the heap/loader options. The compiler is sequential and reuses
one immutable physical context, rather than cloning the whole campus into a
worker pool.

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
