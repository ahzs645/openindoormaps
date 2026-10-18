# Directions startup and remaining threshold work

October 18, 2026. **A matching directions cache is freshly generated, tested and
wired into the next application build. It is not live.** No original geometry,
access policy, source door ownership or held staircase was changed. The current
private Site remains version 13, with its 45,519,753-byte visitor package.

## Directions: what the simplified pathways change

The saved hallway guides simplify route shape and reuse a shared centreline.
They do not replace the physical policy graph. The route worker still receives
the complete campus routing projection and prepares physical/policy evidence
before following those guides. Same-floor requests still incur this initial
campus preparation. Display meshes and other unused render products are already
stripped from the worker; physical stair/ramp/material evidence is retained.
Map import, selected-floor display preparation and directions preparation are
separate costs. This work measures directions, not complete page startup.

The current source contains 1,864 places, 7,063 source edges and 1,285 native
circulation cells. It retains the four combined campus floors and their split
native elevations. A simpler displayed line does not prove a new shortcut,
connect an unmatched doorway or authorize a held stair.

The saved version-13 production worker pins a directions receipt for engine
`681e71…`, but its current engine is `93ae97…`; those cannot match. Current local
source also differs: its routing projection is `076230…` and engine `9ff279…`,
whereas the old receipt pins dataset `a7f912…`. The optional cache therefore
misses and the ordinary checks run. `version13-built-worker-cache-miss.json`
checks the preserved production artifact; it is not a fresh live-browser fetch.

## Fresh preparation and measured improvement

One complete unchanged visitor JSON was projected through the production
`routeWorkerDataset`. The complete physical validator, both policy graphs and
original calculator ran in one private immutable session, without reading a
historical cache. Exact supported cells, current policies and existing graph
guards were captured only after those checks finished. Source bytes and the
actual transitive routing implementation were checked again at completion.
The full ZIP/package import was not repeated.

| Observed local stage | Time |
| --- | ---: |
| Complete route-projection validation | 65.6 s |
| Cold public physical/policy graph | 315.3 s |
| Accessible graph after shared preparation | 0.022 s |
| Collect all checked cells/policies | 29.4 s |
| Entire publisher preparation, including sample routes and compression | 436.8 s |
| First route through fresh cached production worker | **36.7 s** |
| Later available routes in that worker | **0.69–2.72 s** |
| Retained completed route after releasing the worker | **0.00038 s**, no new worker |

The resulting carrier is **2,592,076 bytes**, expanding to 13,603,464 bytes.
It includes all 1,285 supported-cell entries and both policy inventories. It
is separate from the unchanged visitor ZIP. Its SHA-256 is
`27ea7e9692a098fd76969d5872ac52259996c2ada56f50f24991097a6e4300b2`.
The production source receipt and public asset now bind this exact snapshot.
The Pages build includes both the new receipt and exact asset bytes.

Eight actual production-worker/client requests match the fresh uncached
calculator's availability, original edge IDs and complete saved JSON route
paths, including every coordinate/support flag: Floor 1 and Floor 3 walks,
Library lift up/down, ramp up/down, the Building 08–10 hallway refusal and the
step-free refusal. Six routes and two refusals remain. No held full stair is
enabled. A second targeted run uses the **actual compiled receipt, with no
receipt substitution**, and records a CPU profile; its first route is 37.2 s
with identical geometry.

The worker ran with a 768 MiB old-generation limit and measured 816 MiB total
heap limit. The largest reported heap usage was about 583 MiB; that is a
sampled observation, not a peak or mobile-browser acceptance result. Browser
network latency, IndexedDB startup and floor-worker co-residency are not included.
Twenty-six focused cache/transport tests, scoped TypeScript, tool ESLint and
the Pages build pass. The first comparison attempt only differed because JSON
omits undefined optional properties; comparison now uses the complete saved
JSON representation without numerical tolerance.

## What still makes the first cached request slow

The 36.9-second CPU profile attributes substantial inclusive time to path
centering/refinement, material-index construction, exact topology checks and
geometry/policy binding. Inclusive figures overlap and must not be added:

- `centeredRoutePaths`: 21.7 s; `refine`: 13.5 s.
- `createNativeRoutingMaterialQuery`: 10.8 s, including corner-seal checks.
- `createNativeExactTopologyIndex`: 9.8 s; topology validation: 8.3 s.
- Geometry/policy binding: 5.5 s; published carrier decode: 5.3 s.

The next performance repair should target those exact immutable-worker indexes
and repeated source bindings. Preserve all original geometry, masks, openings
and access checks. A lean verified route graph with floor-specific physical
chunks is a larger export/loader change; a displayed centreline alone cannot
replace the remaining physical checks. Do not disable validation to claim a
fast route. Reuse this fresh cache while iterating rather than repeating the
seven-minute preparation after an unrelated tool/documentation edit.

## What is missing for the five doorway proposals

The original RVT and all requested records are available. Fresh original-page
replay scanned all 3,666 pages, retained all **15 placed door/host/mullion
records**, then recovered all **eight referenced shared definitions**. No
requested record was missing. Original binary frames and checksums are saved
in the two `original-*` folders; source geometry was not edited.

The five sill instances refer to four shared definitions: **1223587, 2464392,
1191708 and 1439914**. Each has six faces, twelve edges, six loops, six planar
surfaces and six `GFilling` records. Their first face uses `faceFlags: 6`, with
the other five using `4`. The available strict planar-prism checker, originally
used for stair source work, supports neither this filling census nor that face
variant. Its refusal is not evidence that the modeled sill body is absent.

The remaining implementation is concrete:

1. Add a source-bound threshold body reader with explicitly supported filled-
   face semantics. Retain the entire FIFO/face/edge/filling ledger, actual
   instance transforms and all original parameters. Do not simply drop fillings,
   mask unknown flag bits or borrow full-stair approval. Verify exact cap/riser
   correspondence and closed body topology with refusal regressions.
2. Check the full two-foot approach and stepped walking/headroom demand against
   the original floor holes and complete current foreign material. Existing
   ankle/torso cuts and eight-corner bounds are insufficient by themselves.
3. Apply the checked original doorway owners/approaches and a dedicated stepped
   threshold connection. Preserve both 50 mm height changes, access and reverse
   traversal; keep wheelchair eligibility false unless separately supported.
4. Calculate the Floor 3 **04-302 ↔ 08-302** connection and corresponding Floor 2
   link through the normal calculator, then the other three proposals. Test
   blocked/narrow/foreign-material cases and relevant ramp/stair dependencies.
5. Batch stable fixes with the missing **05-S204 / 03-S104** arrivals before
   full native regeneration, preservation, export and browser acceptance. The
   failed prepared snapshot remains unaccepted and all **28 full stairs remain
   held**. Other unmatched entrances and Building 08–10 coverage remain separate.

The [previous four-floor survey](../door-threshold-workflow/README.md) still
owns the 42 matching sill doors, 22 unpaired owners and five strongest proposals.
This new source replay advances the body diagnosis; it does not enable them.

## Finish the loading publication

Run `check-published-directions-cache.ts` against the **final actual source and
publication root**, after the final build. It checks the current source engine,
actual routing projection, compiled receipt, complete carrier, inventory and
policy decode. It took **10.9 s**, without repeating physical preparation, and
fails explicitly on a stale receipt or absent asset. This is now part of the
UNBC publication procedure, preventing a silent fallback to long preparation.

Copy the cache to the declared root URL `/data/unbc-routing/…json.gz`; copying
only the nested viewer directory is insufficient for that absolute URL. Pair
the asset with the rebuilt viewer, normal-URL publication checks and current
development download. Update the progressive/offline companion for its actual
current engine as well; offline download completion must retain the exact cache.
Do not relabel old prepared floor assets or manifests. Verify desktop/mobile
directions, a floor transition, offline reload and memory while a floor is shown.
Browser control is unavailable in this session, so this acceptance and Site
publication remain pending. No new native master is needed for this loading-only
update to the existing accepted visitor, but a native geometry repair still
requires a newly accepted master.

## Reproduce the targeted checks

From OpenIndoorMaps:

```sh
node --max-old-space-size=8192 --import tsx \
  scripts/indoor/prepare-directions-candidate.ts COMPLETE-VISITOR.json \
  EXPECTED-JSON-SHA256 CASES.json NEW-PREPARATION
node --expose-gc --import tsx scripts/indoor/benchmark-directions-candidate.ts \
  COMPLETE-VISITOR.json NEW-PREPARATION/report.json CASES.json NEW-BENCHMARK
node --max-old-space-size=4096 --import tsx \
  scripts/indoor/check-published-directions-cache.ts COMPLETE-VISITOR.json \
  EXPECTED-JSON-SHA256 PUBLICATION-ROOT NEW-CHECK.json
```

The benchmark additionally accepts `--compiled-receipt` and `--profile-first`.
Its default candidate receipt substitution is isolated from production; its
compiled mode verifies the literal source receipt. The preparation's original
receipt uses a candidate URL. The reviewed compiled receipt changes only that
transport URL to `/data/unbc-routing/…`; carrier/logical/source hashes stay exact.
When replaying compiled mode, use the same reviewed transport receipt, as shown
by `compiled-worker-profile.json`. Do not overwrite old preparation reports.

From Reviter, use the [source inspection workflow](../../../../../reviter/docs/source-model-inspection/README.md)
and `inspect-native-element-bodies.ts` with the saved requests. Source hashes,
full preparation implementation bindings, actual worker reports and CPU
profile are retained here and covered by `SHA256SUMS`.

The [verified private 3.42 MB continuation increment](https://drive.google.com/file/d/11mNt4D-03QLXvEIMbIinA8arQfqAGKq9/view)
contains OpenIndoorMaps `6fae647` and Reviter `c2f6dab`, including the matching
directions asset. Fresh Git restoration checked all **3,978 tracked files**;
complete Drive readback matched the archive SHA-256 and every entry. See
`portable-backup.json`. This receipt-only follow-up is outside those bundled
commits; large native inputs remain separate dependencies linked by its manifest.
