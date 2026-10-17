# Cold routing preparation and exact publication reuse

Reviewed 2026-10-16 against the frozen production source. No production file, publisher receipt or deployed asset was changed for this investigation.

Subsequent correctness review found that the old v2 qualifier omitted current policy checks on complete flat approaches. The historical old4f calculator/worker timings below remain measurements of that incomplete consumer, not qualified public-route evidence. Its lower claimed cell requires 27 ordinary-room dependencies absent from the stair edge; the additive current-policy guard must refuse it. Finish that correction and validate the actual candidate before preparing or admitting a fresh cache. See [current stair status](STAIR-ORIGINAL-BODY-CLEARANCE-2026-10-16.md).

The existing checked routing-cache format already contains the expensive work identified in the actual stair-route profile. The next useful optimization is to finish the fresh candidate's original QA, retain the cache produced by that same session, and admit that exact artifact after the normal worker tests. A new cache format or changed geometry arithmetic is unnecessary for this first improvement.

## Why the diagnostic took 9 minutes 46 seconds

The bounded original production-worker diagnostic used the finalized **old working dataset**, not the fresh candidate. It supplied no routing cache and replaced no publisher receipt. Its first actual public route took 585,637 ms; its route object exactly matched the separately calculated route through stair 1696006, Building 03, 03-S201 ↔ 03-S301. The measured worker heap limit was 816 MiB, with approximately 659.5 MiB used at the response. This is Node worker evidence, not browser or mobile timing.

The only compiled routing-cache receipt names engine `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d` and routing snapshot `a7f91256cb2bbd8c6951d7fdab154d7f104c5e0c4bd0100b7e2abb1202cd3ddd`. The current frozen engine is `5c3c7e4c0e8160b77a4265d812e2b17411a107e851145a9f143cf87a9134fd1d`. `publishedRouteCellReceipt` therefore returns no receipt before hashing or downloading a cache. The new source index and changed edge also require their own dataset binding. Relabelling the old receipt would be invalid.

The cold actual-calculator CPU sample attributed 97.36% of inclusive sampled time to `nativeCirculationWalkBlockers`, before path search. Of the sample, 77.55% included physical exact-cell preparation and 76.39% rational overlays. The v2 stair kernel was not a sampled hotspot. The separately recorded raw calculator public reverse call took 7,652 ms after preparation, but raw mutable-authoring calls and the production immutable worker have different cache lifetimes; this is not a measured published-cache latency for the new candidate.

## What is already prepared

`PublishedRouteCells` stores the original exact physically supported parts of each prepared cell, including holes and rational coordinates. It also stores the original public and accessible policy result for every edge in both directions, the exact circulation binding, accepted cell IDs, blocked-walk IDs, computed cell-access results and connector anchors.

Admission is the full private routing snapshot plus engine and source identities. The worker first selects a compiled matching receipt; its decoder then checks compressed/logical lengths and hashes, topology binding, exact cell inventory, complete directional policies and guard identities. The decoder is not a replacement for that compiled receipt selection. An uploaded receipt or matching model header cannot admit a cache.

`createPublishedRouteCalculator` seeds the original session keys:

| Retained key | Work reused |
| --- | --- |
| `native-exact-supported-cell:<cell>` | Original floor/envelope/material intersections for that cell |
| `native-circulation-binding` | Current exact physical circulation binding |
| `routing-native-cell-ids` | Original admitted cell inventory |
| `routing-native-walk-blockers` | Whole-campus physical walk preparation |
| `native-exact-face-access:<cell>` | Original computed access-zone result |
| `native-source-connector-anchors` | Original source connector anchors |
| `routing-link-policies` | Original directional physical/access policies for both profiles |

The guards and policies are private decoder-owned WeakMap entries. Copying the decoded Map retains its cell coordinates but loses those approvals, so the original graph and policy checks run again.

## Stair replay and the work that remains

For an ordinary unseeded immutable worker, `stepped-v2-result:<edge>`, `stepped-v2-index:<source-index>:<edge>` and `stepped-v2-binding:<edge>` retain the first exact wire preparation and replay. Endpoint or profile changes in the same worker snapshot reuse them. A new snapshot or worker must prepare again.

A fully decoded published cache additionally supplies the complete original `routing-link-policies`. `projectLinkPolicy` returns that original row before calling `nativeStairRouteQualified`, the route-time entry to v2 replay. Thus a complete matching cache reuses that completed qualification too. It does **not** seed an arbitrary v2 approval flag, alter the source-index bytes, or disable explicit strict dataset validation. Calling the v2 validator independently still replays the current proof; `createVerifiedProgressiveRouteCalculator` likewise validates before creating its calculator. This cache improves the admitted full-viewer's published worker path and does not eliminate unrelated source-import validation.

The published first request still initializes the exact overlay engine, hashes the complete private routing JSON, reads/downloads and verifies the cache, restores exact topology, constructs graph/passages, searches the selected route, checks and shapes live walking paths, resolves arrivals, and calculates reachability. Route-specific centering/straightening remains original. The session retains its computed bindings; graph profiles, resolved routes, arrivals and reachability have their existing bounded caches. The UI also keeps eight completed route results, and a new in-flight user calculation can terminate the previous worker. Releasing that worker loses its decoded heap, although verified compressed bytes can be retained in IndexedDB.

The earlier publication measured a 13-second hashing/decoding overhead and a 139-second first worker route, followed by 8–15-second available routes. Those are historical measurements for a different engine/map, not a forecast for the new candidate. No cached first-route timing has yet been measured for this fresh source revision.

## Minimal fresh-candidate generation and consumer contract

1. Finish source compilation and all correctness reviews, then freeze the final source and refresh the official engine binding. Do not prepare a cache against an intermediate engine or unresolved physical contract.
2. Run `scripts/indoor/audit-pathway-candidate.ts` on the actual independent candidate. It uses one immutable session for original physical checks, both graphs and the actual route cases. Its `collectFreshCandidateRoutingCache` captures those same completed results; it does not import an old cache or repeat the cold preparation.
3. Keep its `fresh-routing-cache/receipt.json` and exact compressed artifact. The receipt binds full routing projection, engine, source, topology, logical bytes/hash and compressed bytes/hash. It is inert until reviewed; `freshOriginalCalculation` is an audit receipt, not uploaded runtime authority.
4. After original QA passes, run the existing `audit-candidate-route-transport.ts` with that candidate and report. It checks the candidate/projection/cache bindings, uses the original `RouteWorkerClient` and production worker, requires a measured worker heap limit no greater than 960 MiB, checks the real cache fetch, and compares every result with the original calculations. Keep floor-residency/browser claims separate.
5. Only after those results pass, compile the exact reviewed routing receipt and serve its exact verified URL and bytes with the matching publication. Verify the final official build leaves the engine unchanged. Publisher receipts are outside the engine's preparation graph, so the established workflow has no receipt/engine self-reference.

There is no need to rerun `export-published-routing.ts` after the candidate audit: that standalone command would perform another import and original preparation. Source, doors, access, physical cells, shared stair operands or engine edits must miss the old receipt. A missing/unavailable supplemental cache falls back to original checks; corrupt fetched bytes fail validation. The complete-offline downloader currently omits this supplemental cache, so explicit offline inventory remains a separate follow-up.

## Isolated verification

The original five published-cache tests and three worker-calculation tests passed. Four new **scratch-only synthetic** counter tests also passed. They instrument only function-entry counters in an isolated esbuild output; no arguments, return values or production files change.

| Synthetic preparation | Whole-campus walk preparation | v2 wire preparation/replay |
| --- | ---: | ---: |
| Original immutable session, first graph | 1 | 1 |
| Same session, other profile/repeated graph/cache collection | No additional calls | No additional calls |
| Fully decoded guards plus policies, first graph | 0 | 0 |
| Decoded guards without policies | 0 | 1 |
| Decoded policies without guards | 1 | 0 |
| Copied decoded Map | 1 | 1 |
| Independent explicit v2 validation after published session | Not required by this call | 1 |

Additional controls reject changed engine, source rooms, room access, enabled edge, physical cell or stair wire, and corrupt bytes. Mutable authoring calculations and a replacement immutable snapshot do not borrow old session values. The compiled publisher pins never admit this synthetic fixture. These tests establish reuse and invalidation semantics, not original-RVT authority, a new UNBC cache or a candidate QA pass.

Evidence and runnable scratch harness: `/workspace/scratch/unbc-pathway-repair-20261015/stair-clearance/routing-preparation-audit/`. The `build-receipt.json` records all 438 original input file hashes and the three counter-only substitutions. `synthetic-session-contract-results.json` contains the observed counts. The complete source freeze remains separately checked; publication and fresh-candidate cached timing remain pending.
