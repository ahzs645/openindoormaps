# Scoped corridor-run diagnostic

The opt-in fitter generated straighter proposals in both current cells, but the
complete combined-guide guard **withdrew both proposals** because each introduced
three new exact contacts. The guarded outputs contain the corresponding control
guides unchanged. These files provide a reproducible compiler diagnostic and a
current-source regression for the guard; they do not establish improved returned
journeys or qualify a new UNBC publication.

`--straight-runs` remains off by default. The production preparation path checks
the complete cell after fallback and all later recovery/refinement passes before
filtering requested edges. This bounded diagnostic compares the centerline and
legacy fallback stages only; it deliberately does not claim that complete replay.

## Recorded outcome

| Current cell | Physical level | Original eligible edges / terminals | Saved guides | Diagnostic control / proposed / guarded | Fitted runs | Core bends over 5°: control → proposed | New contacts | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `native-cell:24.278215:918` | `400176` | 79 / 53 | 69 | 66 / 66 / 66 | 5 | 50 → 39 | 3 | Withdraw proposal; retain control |
| `native-cell:14.435696:766` | `694` | 74 / 51 | 69 | 66 / 66 / 66 | 5 | 24 → 22 | 3 | Withdraw proposal; retain control |

The bend metric sums **matched guide paths**; the same shared lane may occur in
several guides. It is not a count of unique network turns. No control guide was
lost in either proposal. All saved cores passed the diagnostic's exact support
check. Control has fewer guides than the saved carrier because this diagnostic
uses conservative recorded doorway demand and omits later recovery passes.

Cell 918 is the current Building 10 area identified by stable doors `2262772`,
`2262854`, and `2262984`; the historical run-fit notes called that area cell 852.
Its three new contacts involve the unchanged legacy fallback guide between doors
`2262772` and `2262984` and two fitted primary guides. The actual three-guide
comparison is retained in
[`tests/fixtures/corridor-mixed-network-unbc-918.json`](../../../../tests/fixtures/corridor-mixed-network-unbc-918.json)
and exercised by the contact guard regression test.

Cell 766 maps the historical cell 729 area through source arrivals
`rm-694-e3da0c414247` and `rm-694-e3ff8d414267`, not by assuming stable cell
numbers. Its three new edge-pair contacts occupy one exact location near door
`1522433`. The [review gallery](../route-review/README.md) shows the current
released floor context with the proposals explicitly labelled withdrawn.

The two comparisons took 471.93 s and 227.70 s, respectively. The process recorded
a maximum resident set of 691,068 KiB. The end-of-run compiler binding matched
the start binding; a source change would have prevented the final receipt.

## What was preserved and what was not requalified

The extractor resolves eligibility and original door-edge indices from the
**complete original dataset**, including mixed-level ramp metadata. It retains
the original graph records and exact resolved scope. The replay uses each cell's
complete checksum-matched cached physical face, including all rings and holes.
No obstacle is stripped to obtain a successful fit.

Terminal extensions are limited to the two-foot planar demand of previously
recorded terminal branches whose cores pass exact support. This is conservative
diagnostic support, not a reconstruction or renewal of native doorway-half
admission. Original source edge rows and exact endpoint coordinates accompany
every export. The verifier checks unique guide identities, finite coordinates,
unchanged original endpoints, complete edge/terminal counts, shared provenance,
and the guarded decision's complete guide geometry.

The diagnostic does not run subsequent recovery passes, fresh full-source native
doorway admission, route policy, required journeys, visitor export, hydration,
worker parity, or browser validation. A full-source preparation attempt was
killed with exit 137 before its control completed. Full production build and
broad lint attempts also exceeded the workspace memory limit. Those are explicit
qualification blockers; the scoped outputs carry `navigationAuthority: false`.

## Pinned inputs and output integrity

| Input / binding | SHA-256 |
| --- | --- |
| Original worker dataset | `ecd8af21dd0d83740c5a3b5133298e52d88d71ce1c1db54c46e8642e853f66e3` |
| Extracted source context v2 | `1b6fe9515af82aa9a88de6e55310331063cf86dc686a9e8ecae7c6204e615bdd` |
| Compressed published route carrier | `3afe11db8c36e74b147724290545c77bca4efe0d35718445271f00316611f36a` |
| Logical carrier JSON | `539ec6719ad94448df48b1fde83a126aa464d6a6256bb31b36edfcca8404ffe8` |
| Diagnostic compiler source closure | `293bcbfdec2d82ec113f08c42a1e577b4cafaa2369fd1e702103edb4e956d8dc` |

The original dataset and route carrier are restored through the handoff guide.
This folder contains six complete compact guide exports, the
[producer receipt](diagnostic-receipt.json), and the
[verified export manifest](diagnostic-export-manifest.json): 987,567 bytes in
total. The 18.7 MB intermediate context is reproducible and is not duplicated in
the repository. The manifest binds the receipt and each exact export; the figure
renderer verifies those bindings against the released atlas source.

The recorded carrier engine/runtime hashes identify the old carrier used as
diagnostic input. They do not qualify it for changed consumers. The current
source closure has a separate diagnostic binding.

## Reproduce

From the OpenIndoorMaps repository after restoring the handoff's original
`browser-route-data.json` and route carrier, create the smaller diagnostic
context. Run these commands sequentially, without another memory-heavy compile:

```sh
node --max-old-space-size=600 --import tsx \
  scripts/indoor/replay-corridor-run-diagnostic.ts extract \
  ../browser-route-data.json ../corridor-source-context.json

node --max-old-space-size=640 --import tsx \
  scripts/indoor/replay-corridor-run-diagnostic.ts run \
  ../corridor-source-context.json \
  public/data/unbc-routing/3afe11db8c36e74b147724290545c77bca4efe0d35718445271f00316611f36a.json.gz \
  ../corridor-diagnostic-output \
  native-cell:24.278215:918 native-cell:14.435696:766

node scripts/indoor/verify-corridor-run-diagnostic.mjs \
  ../corridor-diagnostic-output
```

The output directory is diagnostic only. Do not place these exports in an app
data directory, cache, or navigation receipt. Timings and maximum RSS vary
between runs, so a newly generated receipt and its manifest will have new hashes.
The source, context, carrier, compiler binding, and guide geometry should remain
the same for an unchanged checkout and inputs.

Verify the checked-in exports without replaying the compiler:

```sh
node scripts/indoor/verify-corridor-run-diagnostic.mjs \
  docs/continuation/unbc-20261119/corridor-runs
```

## Focused implementation checks

The corridor suite passed 82 tests across these files, including the actual cell
918 mixed-network regression. The run fixture requests all 171 terminal pairs,
checks original endpoints and reverse symmetry, and bounds each final route
against the immutable pre-fit control; several runs cannot compound the detour
budget. It also covers real corners, alternative loop paths and exact support.

```sh
node --import tsx --test --test-concurrency=1 \
  tests/unit/corridor-run-fit.test.ts \
  tests/unit/corridor-guide-contacts.test.ts \
  tests/unit/corridor-chain-fit.test.ts \
  tests/unit/corridor-centerline.test.ts \
  tests/unit/corridor-terminal-approach.test.ts \
  tests/unit/shared-corridor-routing.test.ts \
  tests/unit/corridor-candidate-checkpoints.test.ts
```

The PR's combined focused suite passed 107 tests. Scoped indoor-project and
changed-file TypeScript checks, including the diagnostic CLI, passed. These
checks and the two rejected local proposals do not replace the remaining full
qualification described in the [runtime note](../runtime-qualification.md).
