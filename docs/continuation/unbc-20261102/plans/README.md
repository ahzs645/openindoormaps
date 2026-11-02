# Checked 2D visitor plans for the chosen candidate — November 2, 2026

Branch `claude/visitor-plans` (from `6acc5ca`). Candidate: source ZIP
`1a127847…` → visitor dataset `39e9fed5…` → progressive revision `bdea9eb5…`
(manifest file `84450df2…`, 7 scopes), engine `9ee1cb8c…` (213 modules),
directions cache `dec83a46…`. Nothing was published.

**Result.** The first corridor route (04-204 → 08-267, default) was shown with
its floor ready in 55.8–64.6 s. It now takes 16.9–21.6 s. Later routes took
17.4–18.9 s and now take 5.2–5.5 s. Peak renderer memory fell from 3.2 GB to
2.6–2.8 GB. Opening the page now takes about 6 s longer before the first floor
is drawn (see "What remains").

## 1. Measured split before the change (this candidate)

Collector: [tools/profile-route.mjs](tools/profile-route.mjs), adapted from
the November 1 tool. It observes only and does not change the page. It records:

- page-side worker messages, creation and termination;
- CDP `Network` events inside each worker (routing parts, directions-cache
  carrier, floor chunks);
- the IndexedDB write of the carrier, which `prepareProgressiveRouteCalculator`
  makes only after the cache decodes and the calculator is built ("cache
  admitted");
- DOM mutations of `route-status` and `visitor-render-status`;
- worker and page V8 heap through `Runtime.getHeapUsage`, and renderer RSS
  from `/proc`.

Runs were cold Chromium (`/opt/pw-browsers/chromium`) at desktop 1440×900 and
iPhone 13, two runs each, served by `python3 -m http.server` from the existing
root `/home/user/unbc-work/vp/public` (build of `6acc5ca`). Every run ran
under the shared heavy-job lock. The raw logs are in [runs/](runs/) and the
summary is in [SPLIT.json](SPLIT.json).

Each value is seconds after "Get directions", for desktop run 1 / run 2 and
mobile run 1 / run 2.

| Event                                                 | Desktop                  | Mobile                   |
| ----------------------------------------------------- | ------------------------ | ------------------------ |
| Route worker created, request posted                  | 0.05 / 0.04              | 0.07 / 0.05              |
| Routing asset (3 parts, 37 MB gzip) downloaded        | 1.0 / 0.7                | 0.7 / 0.6                |
| Directions cache downloaded                           | 6.5 / 4.9                | 5.4 / 6.1                |
| Directions cache admitted (decoded, calculator built) | 9.7 / 7.9                | 8.3 / 9.1                |
| Route result message                                  | 14.1 / 11.9              | 12.3 / 13.7              |
| **First route paint** (status "121 m")                | 14.1 / 11.9              | 12.3 / 13.7              |
| Route worker terminated (floor needs detail)          | 16.7 / 13.7              | 14.5 / 16.0              |
| Floor worker created, detail request (decode start)   | 23.3 / 20.3              | 21.4 / 23.0              |
| Last Floor 2 detail chunk downloaded                  | 27.1 / 24.0              | 25.2 / 27.2              |
| Floor worker detail response (decode end)             | 55.2 / 48.2              | 50.6 / 54.8              |
| **Floor ready** (`visitor-render-status` = ready)     | 63.5 / 55.8              | 58.3 / 64.6              |
| Later route 04-255 → 08-272: shown / floor ready      | 17.5 / 18.9, 16.7 / 17.4 | 17.1 / 18.4, 16.7 / 17.7 |
| Peak renderer RSS (GB)                                | 3.20 / 3.23              | 3.20 / 3.24              |

So, on this candidate, the cost after the first route paint (about 44 s) is:

| Part                                                                                     | Seconds |
| ---------------------------------------------------------------------------------------- | ------- |
| Route worker kept 2 s, then terminated; the floor waits for actual teardown              | about 9 |
| Floor 2 detail chunks downloaded (sequential, with IndexedDB writes)                     | about 4 |
| Floor-worker decode and validation (`decodePreparedDisplayAsset`), then structured clone | 24–28   |
| Main thread receives it and MapLibre draws it                                            | 7–10    |

The later route also starts a fresh route worker. The page released the first
worker for the floor, so each later route repeats the routing load and cache
admission (about 8 s) before it calculates.

In Node, on the same scopes, the established decoder takes 82 s for Floor 1 ·
Main floor and 30 s for Floor 2. The admitted in-place decoder takes 6.6 s and
4.2 s ([PROJECT-ADMISSION.json](PROJECT-ADMISSION.json), per scope). Most of
the difference is the summary pass, the restore copy and the full logical
SHA-256 traversal.

The worker V8 heap samples (about 0.3–0.5 GB) are lower bounds only.
`Runtime.getHeapUsage` is answered only between tasks, so a sample cannot be
taken while a worker runs a long decode. The renderer RSS is the reliable
memory figure.

## 2. What was missing, and what was implemented

The current code still matched the October 31 diagnosis.

- **Gate 5** needs gate 4. `export-published-visitor-plans.ts` decodes each
  scope with `decodePublishedProgressiveFloor`, and that function returns
  nothing unless a `PUBLISHED_PROJECT_RECEIPTS` entry matches the engine,
  revision, dataset and package. The two existing receipts pin older engines
  (`9ff27953…`, `681e71a5…`).
- **Gate 4.** Nothing wrote `published-project-receipts.ts`.

### Gate 4 producer: `scripts/indoor/admit-published-project.ts`

The script writes a receipt only after all of these pass, in one process under
the unchanged engine:

1. The exact source package passes the ordinary full importer,
   `readIndoorProject`. The import must report its checksums, geometry,
   materials, routes, mapping and identity stages.
2. For an authoring package, the visitor projection is exported exactly as
   `export-progressive-viewer.ts --visitor` does it, and that projection
   passes the same importer.
3. The visitor dataset hash, its source identity and its routing projection
   equal the manifest provenance and routing asset.
4. Every stored representation passes the exporter's own
   `verifyProgressiveDeliveryDirectory`.
5. Every scope decodes through the established decoder,
   `decodeStoredProgressiveFloor`, which runs all chunk, pooled and logical
   checks. The admitted in-place decoder then reproduces the same logical
   SHA-256 for every scope.
6. The engine binding, manifest bytes and package bytes are unchanged at the
   end.

The receipt binds the package hash, the ZIP entries, the dataset, the source,
the engine, the revision and the SHA-256 of the report. It is marked
`admission: "progressive-floors"`, and `tryReadPublishedProject` ignores such
receipts. That package therefore keeps the full importer, and the receipt
admits only that revision's floors. No validator or decoder check was removed
or relaxed. The tests are in `tests/unit/admit-published-project.test.ts` and
in new cases in `published-project.test.ts` and
`published-floor-decoder.test.ts`.

Run on the chosen candidate (2,486 s; child peak RSS 4.9 GB;
[PROJECT-ADMISSION-EXECUTION.json](PROJECT-ADMISSION-EXECUTION.json)):

- source import 940 s and visitor import 602 s, both passing every stage;
- dataset `39e9fed5…` and routing projection `c4c3ea4f…` matched;
- 124 assets and 248 representations verified;
- 7/7 scopes gave equal logical checksums in both decoders;
- report `0cf77449…`, receipt
  `unbc-progressive-floors-1a127847…` (commit `f6c442d`).

The re-exported visitor ZIP is `199d4996…`. The exporter's checkpoint ZIP was
`70656510…`; the ZIP bytes are not deterministic, but the dataset is.

### Gate 5: existing producer and admitter, unchanged

`export-published-visitor-plans.ts` ran in 56 s with peak RSS 1.6 GB.
`admit-published-visitor-plans.ts` then repeated the export independently (59 s)
and reproduced 7/7 scopes. Runtime `d3b16bc4…` is unchanged
([PLAN-ADMISSION.json](PLAN-ADMISSION.json), [PLAN-PROOF.json](PLAN-PROOF.json),
[PLAN-CANDIDATES.json](PLAN-CANDIDATES.json)). The generated
`published-visitor-plan-receipts.ts` (file sha `64cb795b…`, as recorded by the
admitter) is committed as written.

The carriers are in `public/data/unbc-plans/` and are served at
`/data/unbc-plans/`. There are 7 files, 12,612,136 bytes in total; the largest
is 5,241,896 bytes:

| Scope                | Carrier (gzip)             | Logical |
| -------------------- | -------------------------- | ------- |
| Floor 1 · Main floor | 251,812 (delta on Floor 1) | 44.7 MB |
| Basement             | 93,117                     | 0.7 MB  |
| Floor 1              | 5,241,896                  | 45.9 MB |
| Floor 1 · Floor 1.5  | 340,240                    | 4.2 MB  |
| Floor 2              | 2,842,316                  | 28.8 MB |
| Floor 3              | 2,149,804                  | 20.4 MB |
| Floor 4              | 1,692,951                  | 15.1 MB |

New public root: `/home/user/unbc-work/plans/public`, built by
[tools/build-public-root.sh](tools/build-public-root.sh). It contains:

- `openindoormaps/`, a build of `c38ce3e` made with
  `TZ=UTC SITE_DEMOS=indoor … vite build --mode pages`;
- `data/unbc` pointing to the same progressive export;
- `data/unbc-routing/<dec83a46…>`;
- `data/unbc-plans` pointing to the build's carriers.

Two publication checks passed on that root:

- `check-published-visitor-plans.ts`: 7/7 scopes online and offline, no
  fallback ([PLANS-CHECK.json](PLANS-CHECK.json)).
- `check-published-directions-cache.ts`: `currentCompiledReceiptMatches: true`
  ([DIRECTIONS-CACHE-CHECK.json](DIRECTIONS-CACHE-CHECK.json)).

`check-published-project.ts` does not apply. It reads the hosted full-viewer
package `data/unbc-full/project.json`, which still has no producer for this
candidate, and the floors-only receipt deliberately does not admit a package
import.

### Route worker residency (point 3)

No page change was needed. In 2D with an admitted plan, `requestDetail` is
false, so the scope effect never calls `routes.dispose()`. The schedule never
marks `floor` busy, so the warmup's `releaseIdle` does not fire either. The
route worker therefore stays resident under the unchanged
`heavy-worker-schedule.ts`. 3D, a missing plan and review still dispose it
exactly as before. The runs below confirm it: there is no `terminate` and no
second route worker, and later routes reuse the warm graph.
`progressive-visitor-page.tsx` is unchanged.

## 3. After (new root, same collector, same journeys)

Each value is seconds after "Get directions", for run 1 / run 2.

| Event                                        | Desktop                  | Mobile                   |
| -------------------------------------------- | ------------------------ | ------------------------ |
| Directions cache admitted                    | 8.5 / 9.7                | 8.1 / 7.8                |
| **First route paint** (status "121 m")       | 12.8 / 14.3              | 12.4 / 11.4              |
| Floor 2 plan requested / downloaded (2.8 MB) | 14.2 / 14.8, 15.8 / 16.4 | 13.8 / 14.5, 12.6 / 13.1 |
| Route worker terminated                      | never                    | never                    |
| Detail decode                                | none                     | none                     |
| **Floor ready**                              | 19.2 / 21.6              | 18.8 / 16.9              |
| Later route: shown / floor ready             | 4.6 / 5.2, 4.7 / 5.4     | 4.8 / 5.5, 4.4 / 5.2     |
| Peak renderer RSS (GB)                       | 2.58 / 2.65              | 2.77 / 2.65              |
| Floor ready after page load                  | 12.6 / 15.3              | 13.5 / 12.9              |

Summary (before → after, range over 2 runs):

- First route, shown with its floor ready: desktop 55.8–63.5 → 19.2–21.6 s;
  mobile 58.3–64.6 → 16.9–18.8 s.
- Later route: 17.4–18.9 → 5.2–5.5 s.
- Peak renderer RSS: 3.2 → 2.6–2.8 GB.
- Floor ready after page load: 5.9–10.2 → 12.6–15.3 s (slower).

Route results are unchanged: 120.96 m with 12 steps, and 186.35 m with 19
steps. There were no page errors. Screenshots:
[runs/](runs/) `*-corridor-default.png`.

The host load average was about 1.2–2.2 during the runs. Other agents' jobs
were queued or running on the host, so absolute seconds vary by about 2–3 s.

## What remains

1. **Page-load regression.** The page loads the plan for the default scope
   at any zoom. `planWanted` does not depend on `detail`. Before the change,
   the opening view drew only the overview. The main floor's plan (delta and
   Floor 1 base, 5.5 MB gzip, 45 MB logical) is downloaded at about 4–6 s and
   drawn by about 12–15 s. Gating plan loading on
   `detail || requestedDetailScope` in `progressive-visitor-page.tsx` around
   L601–656 would restore the overview-first opening. A route would still
   focus a zoomed floor and load its plan. This is a page behaviour change and
   needs its own measurement and tests, so it was not made here.
2. **First-route remainder is about 17–21 s.** It splits into:

   - routing load and integrity checks: about 5 s;
   - directions-cache decode: about 3 s;
   - calculation and steps: about 4 s;
   - scope switch, plan download and draw: about 5.5–7.5 s.

   An idle-time warmup on directions intent already exists, but this measured
   journey clicks immediately.

3. **Small visual differences.** The 2D plan renderer
   (`published-visitor-plan-layer.tsx`) draws the same admitted layers with
   lighter door and opening ticks than the detailed renderer. It also shows
   one more room label (04-240 Washroom) at the same zoom; compare the
   before and after screenshots. The admission proves layer and geometry
   equality with the projection, not pixel parity. A reviewer should check
   this.
4. **3D still prepares detail.** It still releases the route worker and decodes
   the detail. With the new floors receipt, the floor worker now uses the
   admitted in-place decoder for this revision. That decoder is about 7×
   faster in Node, but it was not measured in the browser because the 2D
   journeys no longer reach it.
5. **Hosted full viewer (`data/unbc-full`).** There is still no producer for
   this candidate, so `check-published-project.ts` cannot run.
6. **New final candidate.** A new engine will need the whole chain rerun:

   - progressive export and hydration;
   - `tools/admit-chain.sh REPO CANDIDATE.zip PROGRESSIVE MANIFEST-SHA WORK`
     (gate 4, then gate 5; resumable);
   - replace `public/data/unbc-plans/` with the new carriers, then commit the
     receipts;
   - `tools/build-public-root.sh REPO PROGRESSIVE CARRIER NEW-ROOT VISITOR-JSON VISITOR-SHA`;
   - `tools/run-measurements.sh BASE OUT LABEL --later`.

   The receipts here are bound to engine `9ee1cb8c…` and revision `bdea9eb5…`
   and will not match another candidate. The stale entries are inert and can
   be removed when the new ones are admitted.

## Reproduce

```sh
T=docs/continuation/unbc-20261102/plans/tools   # HEAVY_LOCK overrides the lock file
$T/admit-chain.sh "$PWD" CANDIDATE.zip PROGRESSIVE 84450df2… WORK
cp WORK/candidate-plans/*.json.gz public/data/unbc-plans/
$T/build-public-root.sh "$PWD" PROGRESSIVE CARRIER.json.gz NEW-ROOT VISITOR.json 39e9fed5…
(cd NEW-ROOT && python3 -m http.server 42818 --bind 127.0.0.1 &)
$T/run-measurements.sh http://127.0.0.1:42818 OUT after --later
node $T/summarize-split.mjs SPLIT.json OUT
```
