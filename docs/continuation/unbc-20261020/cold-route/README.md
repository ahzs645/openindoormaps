# Cold first route: where the time goes

Recorded October 21, 2026. The source is the saved CPU profile of the first route request in the real progressive route worker. It comes from [EVIDENCE-016](../../unbc-20261018/completion-work/checkpoints/EVIDENCE-016-current-delivery-RESTORE-INDEX.json) (`actual-progressive-worker-768/first-request.cpuprofile`), restored from Drive with every part and the joined archive verified against the index. That run took 21.2 s in Node, reading local files, with no network and no IndexedDB. A browser adds network transfer and main-thread work on top.

The historical 308-second result came from the older full-viewer path, which imports the whole visitor ZIP ([READINESS.json](../../unbc-20261018/ship-readiness/loading/READINESS.json)). The progressive visitor replaced that path. Its measured first routes are about 21–34 s, and the targets are 10 s for the directions action and 15 s from opening to a full route.

## Timeline of the 21 s first request

| Seconds | Dominant work                                                                     |
| ------- | --------------------------------------------------------------------------------- |
| 0–3     | Read routing parts, SHA-256 of parts and logical bytes                            |
| 3–6     | gzip decompression (native `DecompressionStream`, shows as idle) and cache write  |
| 6–8     | **SHA-256 of the same logical bytes again**, inside `parseVerifiedRoutingDataset` |
| 8–12    | `JSON.parse`, deep freeze, garbage collection                                     |
| 12–15   | Inflate and hash the route-cell carrier, decode cells, hydrate topology           |
| 15–21   | The route itself: exact rational overlay, door-approach queries, refinement       |

About 15.5 s is loading and checking that does not depend on the chosen start or destination. Only the last ~5.5 s is the route, and part of that is one-time lazy setup.

The same run's later requests on the loaded worker confirm it (`results.json`):

| Request (same worker, after the first) | Seconds     |
| -------------------------------------- | ----------- |
| Main route reversed                    | 2.03        |
| Floor 1 / Floor 3 routes               | 0.94 / 0.54 |
| Lift up / down                         | 1.53 / 1.54 |
| Ramp forward / reverse                 | 0.67 / 0.37 |
| Step-free refusal                      | 0.14        |
| Unavailable route (search exhausts)    | 6.50        |

The two other recorded workers show the same pattern: first route 24.9 s and 25.8 s, then 0.1–3.4 s.

Self time by function (top entries): pure-JS SHA-256 (`@noble/hashes`) 2.96 s, `freezeOwnedGraph` 2.74 s, garbage collector 1.68 s, BigInt rational `gcd`/`compare` 2.4 s, `parseVerifiedRoutingDataset` 0.64 s.

## Micro-benchmarks on this machine (34.7 MB logical carrier)

| Step                                         | Median |
| -------------------------------------------- | ------ |
| `@noble/hashes` SHA-256                      | 278 ms |
| WebCrypto `crypto.subtle.digest`             | 105 ms |
| Node `createHash` (reference only)           | 33 ms  |
| fflate `gunzipSync`                          | 261 ms |
| `DecompressionStream("gzip")` (Node)         | 537 ms |
| `TextDecoder` (fatal UTF-8)                  | 37 ms  |
| `JSON.parse`                                 | 328 ms |
| `JSON.parse` + current `freezeOwnedJsonTree` | 641 ms |

Current `main` already replaced the profiled `freezeOwnedGraph` with the lighter `freezeOwnedJsonTree`. Freezing still roughly doubles parse time.

## Changes in this branch

1. **Prepare routing on intent.** The visitor page now starts a background preparation once a start or destination is chosen, or a directions link fills one. It uses the existing `scheduleRouteWarmup`, so it yields to floor preparation and review, waits for the 5 s idle gate, and restarts after floor work releases the worker. A route request takes over an unfinished preparation in the same worker. If a preparation fails, the request retries it once and reports its own error. With ~15.5 s of loading moved off the critical path, a visitor who spends _T_ seconds choosing the second place (plus the 5 s idle gate) waits about max(0, 20.5 − T) + 5.5 s, instead of about 21 s. Once preparation has finished, the wait is at most the ~5.5 s route phase. This is an estimate from the profile, not a new measurement: the saved delivery is bound to an older engine and runtime, so current `main` cannot load it for a browser timing.
2. **No second hash when HTTP already decoded the asset.** The synchronous logical check is now the only verification on that path.

Neither change alters route results, checks or receipts.

## Remaining opportunities, by expected impact

1. **Remove the parse-time rehash** (~1 s on the profiled path). `parseVerifiedRoutingDataset` rehashes bytes that `logicalBytes` verified a few lines earlier. Its synchronous check-then-parse guarantee could instead be kept by transferring ownership (`ArrayBuffer.prototype.transfer`) right after verification and registering the transferred buffer privately.
2. **Hash with WebCrypto where the caller can await** (~2.5× faster than `@noble/hashes` in the benchmark above). The large-buffer callers are asynchronous already.
3. **Freeze only in development**, or freeze lazily. The routing graph never leaves its worker.
4. **Per-building or per-floor routing tiles.** Load only the buildings between the chosen endpoints, the way Valhalla tiles its graph. This is the structural fix, but it changes the delivery format.
5. **Cheaper exact geometry on the route itself** (5.5 s). BigInt rational `gcd`/`compare` dominate. Cache door-approach queries per published revision, or precompute them at build time.

Phone, fixed six-sample cold-performance and offline measurements remain pending under the unchanged targets.
