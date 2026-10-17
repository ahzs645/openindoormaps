# Visitor offline app shell

The visitor's explicit **Download complete map for offline use** action now saves both verified map data in IndexedDB and the app files needed to reopen it. Ordinary browsing does not install the service worker or download the complete app inventory. Completion requires both inventories to remain readable and verified.

## Measured production build checkpoint

| App inventory | Files | Decoded static bytes |
| --- | ---: | ---: |
| Initial whole-site offline inventory | 116 | 68,322,041 (68.32 MB) |
| Visitor dependency graph | 33 | 8,721,908 (8.72 MB / 8.31 MiB) |
| Reduction | 83 | 59,600,133 (87.23%) |

The current measured visitor inventory revision is `bc41b4b9f3e123d794f726552667bf0c81f9cab3364a4fe96b18a00069fbf444`, read from the successful production build's `dist/visitor-offline-shell.json`. Later app rebuilds produce a new checked inventory. These are app files for explicit offline preparation, separate from map payloads, initial HTTP transfer, the portable map ZIP and browser memory. The registered service-worker script and small manifest metadata add installation overhead outside this file count.

The build follows the app entry, the progressive visitor page, static module imports, Vite asset/CSS dependencies and emitted worker/WASM URLs. It retains progressive floor/routing workers, the precision union worker, GEOS WASM and same-origin Noto Sans glyphs with their original license. Unrelated lazy pages, demo datasets, RVT converters, source RVT/GLB files, ZIPs and raw map JSON are excluded. A few existing map-renderer worker modules remain conservative static dependencies of shared components.

## Integrity and lifecycle

- Every app asset has a SHA-256 and decoded byte length. The manifest has its own revision hash, strict schema, same-origin scope and bounded inventory.
- Preparation verifies network bytes, cached reusable assets and the complete retained inventory before pinning a revision. Failed or cancelled updates preserve the previous completed revision.
- At most two bounded app revisions remain cached, each limited to 128 MiB. Map storage has its own independent compressed LRU and complete-inventory checks.
- Offline fallback rechecks cached bytes. It supports the site's actual HashRouter app entry: fragments such as `#/projects/visitor` are not visible to service-worker fetch events. Navigation uses the network first, then the checked app index when offline.
- Authoring writes, source models, map JSON/ZIPs and third-party basemaps are not cached by this worker. The visitor's default blank basemap uses local glyphs for offline labels.

Implementation: `public/visitor-offline-sw.js`, `scripts/indoor/visitor-offline-shell-build.ts`, `app/indoor-project/visitor-offline-shell-client.ts`, minimal `vite.config.ts` plugin wiring, and the visitor page's explicit offline action.

## Verification

All six focused shell tests pass. They cover emitted and Vite metadata dependency edges, required workers/WASM/glyphs, unrelated asset exclusion, no precaching on installation, corrupt or oversized bytes, damaged manifests, cancellation, eviction, retained inventory checks and bounded revision reuse. Focused strict TypeScript, ESLint and whitespace checks pass.

A real Chromium run against the production Pages build completed an explicit offline download, disabled network access, reloaded the HashRouter visitor page, decoded another floor in its actual worker and calculated a 5 m route with the actual route worker. It reported no page errors. This used a synthetic two-floor delivery fixture; it verifies app/cache/worker integration and **does not establish UNBC staircase approval or final UNBC map export completeness**. The browser test exposed and verified the HashRouter navigation fix.

Evidence:

- `/workspace/scratch/unbc-delivery-optimization-20261015/offline-app-shell-build-audit.json`: all emitted asset hashes/lengths, retained dependencies and bytes.
- `/workspace/scratch/unbc-progressive-delivery-20261015/browser/offline-proof.json`: Chromium offline reload, floor decoding and actual calculator result.
- `/workspace/scratch/unbc-progressive-delivery-20261015/browser/offline-reopened-floor2.png` and `offline-reopened-actual-route.png`: screenshots of that synthetic integration fixture.
- `/workspace/scratch/unbc-progressive-delivery-20261015/browser/idb-proof.json`: actual browser compressed storage, round trip and LRU capacity checks.
- `/workspace/scratch/unbc-delivery-optimization-20261015/adversarial-delivery-review.json`: independent startup inventory and corruption/fallback/eviction/manifest-retention probes.

The final source-frozen UNBC production build also passes a separate **actual complete-map offline check**. The browser opens complete manifest `ce04f9a8…`, explicitly saves all 114 verified map assets and app revision `bc41b4b9…`, then performs fresh offline navigation and decodes Floor 3 in its actual worker. It reports zero page errors. Observed browser storage is approximately 93.55 MB, including cache/database/service-worker overhead; that is not HTTP transfer or a portable ZIP size. The expensive canonical route calculator is not rerun in this offline UNBC session. Nine actual canonical online route/profile comparisons and the final-bundle synthetic offline full-validator route remain separately attributed evidence.

Actual UNBC evidence: `/workspace/scratch/unbc-progressive-delivery-20261015/browser/actual-complete-offline/progress.json`, `complete-download.png`, `offline-overview.png` and `offline-floor3.png`. All-scope export and portable ZIP acceptance are recorded in [PROGRESSIVE-EXPORT-RESULTS.md](PROGRESSIVE-EXPORT-RESULTS.md).
