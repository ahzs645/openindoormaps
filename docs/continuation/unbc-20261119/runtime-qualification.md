# UNBC runtime qualification for the November 19 PR

## Status and release boundary

This PR implements corridor candidate work and deployment-aware directions-cache
URLs. Keep it **draft** until one exact source/data pair passes the publication
steps below. Unit tests and a successful application build do not admit the old
UNBC caches under changed consumers. No cache admission is granted by this note.

The handoff baseline is OpenIndoorMaps `d89a9355587aaa8c470a8b2796d1a5e3c84e3a65`
with Reviter `4a8fe6a8bd6b085e7725bb4ea18bb32d519e00a4`. Its 1,392 recorded browser
outcomes and checksum/rebuild evidence describe that baseline, including expected
refusals. They are not qualification of this PR or 1,392 successful routes.

The recorded 225.94-second first request ran alongside an audit and build. It is
not an isolated startup measurement. Later warm requests do not establish cold
phone performance. Earlier phone-shaped Chromium runs are emulation, not physical
phone or campus acceptance. Geometry review images likewise do not replace a
production-browser journey, hosted cache check or real-world route inspection.

## Why existing receipts become stale

The binding writers traverse actual module dependencies, including type imports.
The corridor compiler/chain fitter is in the preparation, routing and plan
closures. The URL resolver and its worker callers also change the routing closure.
An opt-in algorithm still changes that closure when its source is imported.

| Changed binding    | Behavior with the old publication                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Route runtime only | `publishedRouteCellReceipt` rejects the old runtime hash before any cache fetch. Both routing workers use ordinary full validation. |
| Preparation engine | The progressive manifest is rejected as an unsupported preparation engine; old project/floor admissions do not become current.      |
| Plan runtime       | Existing precomputed plan receipts no longer match the consumer.                                                                    |

A correct URL or an old carrier already in IndexedDB cannot restore admission.
The offline transport lookup currently checks engine/source/dataset but not the
route runtime: retaining bytes alone must not be reported as a verified fast
offline route. The final route worker remains the authority.

Do not retain stale generated hashes, add binding exclusions, edit historical
runtime hashes or rename old carriers to make these checks pass. Fresh validation
may reproduce identical geometry, but it must produce its own current evidence.

## Inputs and execution prerequisites

- Freeze the implementation and record both repository commits before expensive
  qualification. Use the intended sibling source, not an unexplained older CI pin.
- Restore the handoff's checked source/master or independent complete viewer ZIP,
  companions, source reviews, and exact visitor JSON. Verify their saved hashes.
- A routing projection contains routing evidence; it does not supply all floor,
  model and presentation inputs needed for a complete progressive export.
- Apply the candidate corridor catalogue through its existing checked export path.
  Do not promote a diagnostic preview or edit embedded route coordinates by hand.
- Use new output directories and preserve the previous release. Keep owner-approved
  assumptions, access restrictions and intentional refusals in the acceptance cases.
- Run full imports/exports and physical qualification on the established adequately
  provisioned processing environment. A historical hydration run took about 927
  seconds and 4.66 GB peak RSS; this is a capacity reference, not a current result.

Commands below run from the OpenIndoorMaps checkout. Uppercase arguments stand for
verified paths/hashes, not literal filenames. The manifest SHA is the SHA-256 of
the manifest file bytes, not its internal revision. Record every exit code/output.

## 1. Freeze bindings, export and admit complete progressive floors

Run the writers in separate processes before loading publishers:

```sh
node --import tsx scripts/indoor/prepared-display-engine-binding.ts .
node --import tsx scripts/indoor/published-route-runtime-binding.ts .
node --import tsx scripts/indoor/published-visitor-plan-runtime-binding.ts .
TZ=UTC node --max-old-space-size=8192 --expose-gc --import tsx \
  scripts/indoor/export-progressive-viewer.ts CANDIDATE.zip PROGRESSIVE-DIR \
  --visitor --prepare --checkpoints
TZ=UTC node --max-old-space-size=8192 --expose-gc --import tsx \
  scripts/indoor/admit-published-project.ts CANDIDATE.zip PROGRESSIVE-DIR \
  MANIFEST-FILE-SHA256 NEW-FLOOR-REPORT.json --write
```

The admission command writes a receipt only after ordinary source/visitor import
and independent decoding of every scope. Its `progressive-floors` receipt admits
those floors; it is **not** a full-viewer package fast-import receipt. Extract the
exact `viewer/indoor.json` from the export's independent visitor ZIP for the next
stage, and calculate its complete file SHA. Keep the ZIP/source receipt too.

## 2. Fresh physical hydration and actual worker parity

```sh
TZ=UTC node --max-old-space-size=9216 --import tsx \
  scripts/indoor/export-published-route-hydration.ts COMPLETE-VISITOR.json \
  VISITOR-FILE-SHA256 EMPTY-HYDRATION-DIR --cases EXTRA-ROUTE-CASES.json
node --import tsx scripts/indoor/benchmark-published-route-hydration.ts \
  COMPLETE-VISITOR.json VISITOR-FILE-SHA256 EMPTY-HYDRATION-DIR \
  EMPTY-WORKER-BENCHMARK-DIR candidate
node --import tsx scripts/indoor/benchmark-progressive-route-hydration.ts \
  PROGRESSIVE-DIR EMPTY-HYDRATION-DIR EMPTY-PROGRESSIVE-BENCHMARK-DIR
```

The publisher performs fresh physical validation, both policy graphs, supported
cells, original topology/material/access-zone/support-tile parity and normal
route cases. It reads no historical cache. Its `proof.json` records
`actualRouteParityCases: 0`; the following worker benchmarks establish that parity.
Do not set a parent heap override for the benchmarks: it defeats their intended
768 MiB worker cap and is explicitly rejected by the full-worker benchmark.

After the evidence passes, add the fresh receipt to the compiled directions list
and copy its exact carrier into `public/data/unbc-routing/`. Its transport URL may
change to that directory; preserve every newly generated source/runtime/hash/size
field. Keep the fresh proof, normal results, runtime closure and worker reports.
Run the release's explicit route matrix as well; the publisher's small default
case set is not a replacement for the candidate's required coverage.

## 3. Independently reproduce plan assets

```sh
node --max-old-space-size=8192 --expose-gc --import tsx \
  scripts/indoor/export-published-visitor-plans.ts PROGRESSIVE-DIR \
  MANIFEST-FILE-SHA256 EMPTY-PLAN-DIR
node --import tsx scripts/indoor/admit-published-visitor-plans.ts \
  PROGRESSIVE-DIR MANIFEST-FILE-SHA256 EMPTY-PLAN-DIR NEW-PLAN-REPORT.json
```

The second command independently regenerates every plan before writing pins.
Place the verified plan carriers and complete progressive inventory in the final
publication root. Preserve source ZIP and manifest references across all stages.

## 4. Build, check the artifact and verify real delivery

```sh
PAGES_BASE_PATH=/openindoormaps/ npm run build:pages
node --import tsx scripts/indoor/check-published-directions-cache.ts \
  COMPLETE-VISITOR.json VISITOR-FILE-SHA256 FINAL-PUBLIC-ROOT \
  NEW-CACHE-REPORT.json https://ahzs645.github.io/openindoormaps/
node --import tsx scripts/indoor/check-published-visitor-plans.ts \
  FINAL-PUBLIC-ROOT NEW-PLAN-CHECK.json
```

If the release claims full-viewer fast import, also require
`check-published-project.ts FINAL-PUBLIC-ROOT NEW-PROJECT-CHECK.json`; the floor
admission above does not satisfy that claim by itself. Pair committed sources and
the final visitor using `package-development-snapshot.py`, verify a fresh restore,
and retain the missing-native-input inventory as required by the portable procedure.

The cache gate verifies local bytes and reports `hostedResponseVerified: false`.
Verify the real resolved HTTP URL, status, byte length and SHA, then use the built
app for cold/warm directions, cancellation/return, floor changes and offline reload
on desktop and mobile emulation. Record status, first route paint and floor-ready
time separately without concurrent heavy work. Physical phone/campus checks remain
separate. Never substitute a diagram or manually adjusted screenshot for this proof.

## Transport regression coverage and follow-up alternative

The focused URL/preparation/offline suite passed 25 tests during this PR's work:

```sh
node --import tsx --test --test-concurrency=1 \
  tests/unit/published-route-asset-url.test.ts \
  tests/unit/progressive-route-preparation.test.ts \
  tests/unit/offline-route-cell-cache.test.ts
```

It covers root/nested bases, bundled base injection, external manifests, absolute
CDN and relative receipts, profile parity, checked offline retention and publication
path containment. It does not qualify UNBC physical data or actual hosting. Current
supported mounts are absolute `/` or `/openindoormaps/`; relative `./` build bases
need a separate page/worker application-root contract before claiming support.

A separate transport-only follow-up could serve the unchanged carrier at its
existing root URL, or serialize only deployment-specific receipt URL literals at
build time. URL-only moves are already supported by the publication contract;
all source/carrier/runtime identities must remain unchanged. Do not hide arbitrary
runtime logic in excluded receipt files. This would avoid a consumer change for
that isolated transport fix, but cannot resolve this PR's independent corridor,
preparation and plan binding changes. Until the complete candidate is qualified,
leave the deployed baseline intact and keep this PR draft.
