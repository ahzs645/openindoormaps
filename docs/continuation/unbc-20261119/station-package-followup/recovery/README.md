# Coverage proposals and recoverable handoff inputs

This is source analysis begun at OpenIndoorMaps `86a8a9349a858c783c95c326be12cf66c3f56a87`. It does not qualify the ongoing code changes. No route, ordinary package import, export or production-worker replay was executed by this analysis. The existing 96-case input files remain byte-identical.

## New requests to investigate

`changed-guide-proposals.json` contains five groups of real source destinations. Every proposed request keeps `allowOtherRoomTransit: false`, uses an explicit existing endpoint mode and leaves its outcome unset. These files are deliberately not accepted `CandidateRouteCase` inputs.

| Proposed pair | Endpoint mode | Purpose |
| --- | --- | --- |
| 10-3010 Comm ↔ 10-3006 Office | pathway | Inspect the changed branch between original hallway-side doors 2263214 and 2255487. |
| 10-S304 Stair ↔ 10-3012 Office | pathway | Inspect the changed door-2255522 / corridor-seam branch. This is a same-plane destination test, not a vertical stair journey. |
| 10-3008 Corridor ↔ 10-3010 Comm | inside | Inspect the original corridor arrival-to-door guide through the separate source-arrival contract. |
| 10-3008 Corridor ↔ 10-3018 Corridor | inside | Determine which original arrival/seam alternative is actually used. |
| 10-3008 Corridor ↔ 10-S304 Stair | inside | Additional source-arrival probe for corridor/seam/stair-door alternatives. |

These pairs nominate all five previously uncovered guide records, but do not establish that every guide is observable on a real request. Three guides attach to the 10-3008 corridor arrival. `isHorizontalCirculationAnnotation` recognizes this source record as a horizontal corridor; `stopForRoom` rejects horizontal labels as pathway arrivals. Do not invent successful reverse pathway requests to cover those records. A source-arrival audit must be described separately from the public pathway UI, and unused guide records remain explicit geometry/coverage items.

The immutable combined regression inputs are in `../input/b10-cell918-combined-96/`: 96 requests, 24 pairs, 48 expected public routes and 48 recorded accessible refusals. Only two of the seven changed guide records have archived traversal. None of these requests has completed current normal/worker verification as part of this analysis.

## Accessible-route prospects and evidence gaps

`accessibility-prospects.json` preserves the source inventory, original endpoint identities, historical receipt comparison and six unexecuted proposal groups. `preserved-lift-source-review.json` contains the actual small `indoorConnectors` value read by bounded streaming from `floors/rooms.json` inside the original master.

- All **nine lift reviews** explicitly retain `accessible: "unknown"`. Their **43 enabled elevator transfer edges** match that status. Existing reviewed shaft/lobby evidence does not establish positive step-free journeys; the current policy vetoes an unknown edge in accessible mode. A positive lift case needs new source-bound accessibility evidence, regenerated inputs and current approach/door/runtime validation.
- The strongest same-floor prospect is **07-180 ↔ `landing:ramp:1622190:lower`**, using the existing `walk:ramp:1622190:lower` opening. Both arrival identities are at native level 311, elevation zero, and the source edge is explicitly `accessible: "yes"`. Use an explicit `inside` request; this is a generated-landing control rather than ordinary room-to-room pathway acceptance.
- Two direct ramp prospects have source `yes` edges whose endpoints match their records' arrival IDs: **ramp 1622190 lower ↔ upper** and **ramp 1586431 lower ↔ upper**. A two-edge **07-180 ↔ ramp-1622190 upper landing** probe includes the lower approach and ramp body. All outcomes remain unmeasured.
- Ramp **1587605** is marked `yes`, but its upper edge endpoint is `ramp:1587605:upper` while its owner record selects `ramp:1586431:upper`. They are distinct nodes in separate components of the simple yes-edge inventory. Investigate the owner/arrival mapping; do not infer a connection.
- The older `docs/unbc-native-ramp-audit.json` records a successful 07-180 → Conference Centre accessible journey. The current `walk:ramp:1622190:upper` edge is explicitly **unknown**, with evidence that the old access review was not transferred to changed current owners. That old success is not current qualification.
- The 57 source walk edges explicitly marked `yes` remain in isolated components within individual stair-room owners. They do not by themselves establish a positive same-floor journey between two ordinary rooms. This is a source-flag inventory, not a physical accessibility conclusion about the campus.

Full normal admission, native surface and policy checks, endpoint selection and actual worker parity are still required. No access flag, source geometry or routing rule was changed here.

## Existing inputs to reuse

`recovery-inputs.json` records exact bytes, SHA-256 values, Drive IDs, original manifest entries and current local paths. It distinguishes local bytes freshly streamed through SHA-256 from remote assets whose distribution checksums were preserved without downloading them again.

| Input | Bytes | Recovery source |
| --- | ---: | --- |
| Original full authoring master | 247,419,905 | Four existing `UNBC.rotunda.reviter.zip.partNN` files. Full restored ZIP is already local at `pr4-inputs/UNBC.rotunda.reviter.zip`. |
| Original full viewer | 198,325,469 | Three existing `UNBC-upper-landing-viewer.zip.partNN` files. Keep explicitly labeled as the historical viewer. |
| Compressed route dataset | 37,004,453 | Existing `UNBC-continue-01-workflows.zip`, member `input/browser-route-data.json.gz`. |
| Expanded route dataset | 200,425,392 | Stream-decompress that gzip; no separate upload needed. |
| Complete original indoor member | 302,032,680 | `viewer/indoor.json` in the full master; no separate upload needed. |
| Diagnostic source context | 19,413,188 | Reproducible from the route input using the existing extractor; it does not replace full source admission. |
| Original issued routing carrier | 7,210,332 | Tracked application `public/data/unbc-routing/3afe11db8c36e74b147724290545c77bca4efe0d35718445271f00316611f36a.json.gz`. |

Do not re-upload the unchanged original master or original viewer just to save a new development continuation. A versioned new guide/manifest can reference their exact existing Drive IDs and checksums. New source changes, evidence and any genuinely new accepted output need their own versioned artifacts. This does not change the existing Drive folder's access settings.

The original native model, floor reviews, GIS, GLB and review companions are all preserved inside the master. The separately extracted rooms and companion buffers were deliberately removed as redundant scratch copies; the master remains complete and byte-identical. The existing member-verification receipt identifies each original member.

## Restore the historical archives

Download `restore_archives.py`, `archive-parts.json` and all seven original master/viewer parts into one directory, keeping their names. The recorded portable command restores and verifies both:

```sh
python3 restore_archives.py
```

The helper defaults to its own directory. It verifies every part and the reconstructed total SHA and size, writes through a temporary file and refuses to replace an existing archive with different bytes.

If only the full authoring master is needed, download its four parts plus the same two small files and invoke the existing helper function for that archive only:

```sh
python3 - <<'PY'
import json
from pathlib import Path
import restore_archives

directory = Path.cwd()
name = "UNBC.rotunda.reviter.zip"
record = json.loads((directory / "archive-parts.json").read_text())[name]
restore_archives.restore(directory, name, record)
PY
```

Calling the unmodified script normally with only the master parts would restore the master, then fail when it reaches absent viewer parts. The master-only invocation avoids that unnecessary viewer download.

For the historical viewer, extract its restored ZIP, run `python3 serve.py` from the directory containing that file, open `http://127.0.0.1:8000/projects/indoor`, and import the restored master. This reproduces the old distributed viewer, not a new candidate.

## Restore a new development handoff

The original continuation kit's source snapshots are OpenIndoorMaps `5e2df1507676d83a71c31159b700dde42f4a8aff` and Reviter `7088e7876992c59ae9885fd49161e35a21be1ed1`. They are not interchangeable with the published handoff commits or current PR source. The current local application checkout is shallow; do not treat an incremental bundle made from it as a self-contained archive.

### Versioned delta package with an explicit Git prerequisite

For a smaller continuation delta, after the final changes are committed, use the already-published starting commit `86a8a9349a858c783c95c326be12cf66c3f56a87` as the explicit prerequisite. From the directory containing the repositories:

```sh
git -C openindoormaps merge-base --is-ancestor 86a8a9349a858c783c95c326be12cf66c3f56a87 HEAD
git -C openindoormaps rev-parse HEAD
git -C openindoormaps bundle create ../openindoormaps-from-86a8a93.bundle 86a8a9349a858c783c95c326be12cf66c3f56a87..HEAD
git -C openindoormaps bundle verify ../openindoormaps-from-86a8a93.bundle
sha256sum openindoormaps-from-86a8a93.bundle
```

Package that bundle with the new guide, input references, final receipts, 96 cases and separately labeled proposals. Record the prerequisite commit, exact final commit, bundle digest and Reviter commit in the delta manifest. This avoids packaging unchanged model/viewer bytes and unchanged repository history. It is a recoverable **delta**, not a stand-alone source archive.

The receiving checkout must contain the prerequisite object. Starting from a clean new clone, restore with:

```sh
git clone https://github.com/ahzs645/openindoormaps.git openindoormaps
git -C openindoormaps fetch origin 86a8a9349a858c783c95c326be12cf66c3f56a87
git -C openindoormaps bundle verify /absolute/path/openindoormaps-from-86a8a93.bundle
git -C openindoormaps fetch /absolute/path/openindoormaps-from-86a8a93.bundle HEAD
git -C openindoormaps checkout --detach FETCH_HEAD
git -C openindoormaps rev-parse HEAD
git clone https://github.com/ahzs645/reviter.git reviter
git -C reviter checkout --detach 4a8fe6a8bd6b085e7725bb4ea18bb32d519e00a4
```

Compare the resulting application commit against the delta manifest before using its commands. If the receiver cannot recover the prerequisite from GitHub, provide a complete source snapshot as described below; the old four-ZIP snapshots are not that prerequisite. Do not claim a delta alone supports fully offline recovery from an empty machine.

### Complete source snapshot fallback

After final changes are committed, create complete tracked source archives from the exact chosen revisions, preserving the required sibling layout. For example, from the directory containing both repositories:

```sh
git -C openindoormaps rev-parse HEAD
git -C reviter rev-parse HEAD
git -C openindoormaps archive --format=tar --prefix=openindoormaps/ HEAD | gzip -n > openindoormaps-source.tar.gz
git -C reviter archive --format=tar --prefix=reviter/ HEAD | gzip -n > reviter-source.tar.gz
sha256sum openindoormaps-source.tar.gz reviter-source.tar.gz
```

Those commands are packaging instructions, not actions performed in this analysis. Record both exact commit IDs and both artifact hashes in the new manifest. If the upload service requires parts, split only oversized new artifacts at 75 MiB, record ordered part hashes and the whole archive hash, and use the same verified reassembly scheme. Keep root's final validation reports and case/proposal files with the source archives. Source archives exclude untracked working changes, so commit the intended source first.

Extract the archives into the same empty work directory. Install locked dependencies in both sibling repositories:

```sh
cd openindoormaps
npm ci --no-audit --no-fund
cd ../reviter
npm ci --no-audit --no-fund
```

The current qualification environment used Node 24.22.3. Record the actual final environment rather than assuming byte parity with the historical Node 22.22.0 kit.

Restore the original master using the existing Drive parts. Recover the route gzip from the existing workflows ZIP when diagnostic extraction or historical replay is needed. Use a streaming decompressor; for example:

```sh
python3 - <<'PY'
import gzip
import hashlib
import shutil
from pathlib import Path

compressed = Path("browser-route-data.json.gz")
expanded = Path("browser-route-data.json")
with gzip.open(compressed, "rb") as source, expanded.open("xb") as destination:
    shutil.copyfileobj(source, destination, 1024 * 1024)
with expanded.open("rb") as source:
    actual = hashlib.file_digest(source, "sha256").hexdigest()
assert actual == "ecd8af21dd0d83740c5a3b5133298e52d88d71ce1c1db54c46e8642e853f66e3"
PY
```

That example uses Python 3.11 or later for `hashlib.file_digest`; the original continuation helper requires Python 3.12. Preserve complete source inputs and normal source-validation gates.

### Current candidate qualification commands

Run from OpenIndoorMaps, sequentially on the chosen runtime, with each output directory new. Paths below are placeholders for restored input/output locations, not existing claimed successes:

```sh
node --max-old-space-size=1400 --expose-gc --import tsx \
  scripts/indoor/compile-corridor-candidates.ts \
  /absolute/path/UNBC.rotunda.reviter.zip \
  /absolute/path/new-cell-918-candidate \
  --cell native-cell:24.278215:918 --straight-runs

node --max-old-space-size=1400 --expose-gc --import tsx \
  scripts/indoor/verify-shared-corridor-candidate.ts \
  /absolute/path/UNBC.rotunda.reviter.zip \
  /absolute/path/new-cell-918-candidate/prepared-routing.json \
  /absolute/path/b10-cell918-combined-96/cases.json \
  /absolute/path/new-normal-worker-run \
  --connection-inventory /absolute/path/b10-cell918-combined-96/inventory.json
```

The heap size is a bounded parent runtime setting, not a guarantee that all ordinary import/export/worker phases fit. Root is separately repairing and qualifying the package memory path. Rebind and rerun after any implementation change in the compiler or runtime closure. The new proposal files above must not be substituted for acceptance cases until their unmeasured outcomes have been assessed.

The previously successful scoped Pages invocation was:

```sh
NODE_OPTIONS=--max-old-space-size=1000 \
RAYON_NUM_THREADS=2 \
PAGES_BASE_PATH=/openindoormaps/ \
SITE_DEMOS=indoor \
npm run build:pages
```

This target is narrower than the all-venues default build. Preserve that distinction in the final report and rerun against the final source as required.

## What the old continuation commands prove

With all four original ZIPs extracted into one kit directory, these are the original portable commands:

```sh
python continue.py verify
python continue.py prepare --work unbc-work
python continue.py atlas --work unbc-work
python workflows/check-graph.py unbc-work
python continue.py deps --work unbc-work
python continue.py build --work unbc-work
python continue.py routes --work unbc-work
python continue.py unit --work unbc-work
```

They deliberately enforce the old dataset, worker, cache and atlas identities. The old build copies the already-issued carrier. `workflows/check-master.py` hashes source members and calls the published-cache verifier with a 4,600 MiB heap; it is not the new ordinary import/export/worker verifier. Do not alter those pinned expectations and describe the result as the old exact rebuild.

Fresh native conversion is another process: `regenerate-from-native-cache.ts` expects the complete original master **and an exact-model decoded native ConvertResult cache**, plus any applicable checked reviews. Neither `browser-route-data.json` nor the issued routing carrier is that native conversion input. This audit does not establish that the old full native conversion cache is present. Use the original RVT and Reviter's documented conversion pipeline when it must be regenerated.

## Final handoff contents and limits

Include final source identities, small provenance and validation reports, the unchanged 96-case set, these separately marked proposals, required reference-input Drive links/hashes, exact restore/setup/rebuild commands, and a short status guide. Include a newly exported viewer/model only if its real ordinary admission/export and worker qualification succeeds; otherwise label the package as a development continuation. Keep the old viewer and 1,392-trip baseline clearly historical.

The preparation scripts copied into the repository retain historical scratch-layout assumptions. The precomputed 96-case files are portable; reproducing their generation needs the documented original layout or a separately reviewed path-parameter adaptation. Preserve the original archives and input hash identities instead of silently rewriting those provenance paths.
