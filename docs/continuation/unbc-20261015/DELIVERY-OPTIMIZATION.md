# UNBC delivery optimization implementation

The application now has **metadata deduplication, a progressive export format, and a new visitor loader at `/projects/visitor`**. It opens overview/search first, decodes selected floors in a worker and fetches exact routing authority directly into its own worker on first directions use. Source coordinates, real floor holes and access rules are preserved. The complete corrected UNBC export now contains all seven floor views and has passed every codec/source/pool check. Final browser route, gallery and offline receipts are tracked separately below.

The previous full-map planning estimate was approximately **111 MB**, with a 100–130 MB range; see [PUBLICATION-SIZE.md](./PUBLICATION-SIZE.md). It is superseded by the complete measured export below. All sizes use decimal MB.

## Final measured seven-view map

| Map request or artifact | Gzip | Brotli |
| --- | ---: | ---: |
| Initial Main overview/search, including final manifest | **2.321 MB** | **1.959 MB** |
| Main detail, fetched on demand | 15.714 MB | 13.449 MB |
| Floor 3 detail, fetched on demand | 7.193 MB | 6.088 MB |
| Exact routing, fetched on first directions request | 24.026 MB | 14.101 MB |
| Complete seven-view map data, including manifest | **88.545 MB** | **68.813 MB** |

The portable map-data ZIP is **88,624,604 bytes (88.625 MB)** and contains 116 entries. It includes one gzip representation per logical asset, the manifest and inventory; the app is installed separately by the visitor's explicit offline action. Hosting both gzip and Brotli representations uses **157,193,438 bytes**, which is storage rather than a visitor download. The separate app-shell inventory is **33 files / 8,721,908 decoded bytes**. App transfer and optional online basemap traffic are additional. Brotli requires the checked HTTP encoding; static hosts use the gzip fallback.

Final manifest: `/workspace/scratch/unbc-progressive-delivery-20261015/visitor-corrected-final/manifest.json`, revision `ce04f9a8f556d5383968d68b25b52a3ba1bd72d8877d09f1275756aefa5057c3`. All **114 assets / 228 stored representations** pass exact codec round trips. The original seven-view export is preserved separately. All **107 non-overview asset descriptors**, seven prepared descriptors/chunk inventories and presentation contexts, routing/search and canonical source provenance are unchanged. The exact overview projection is separately bound to algorithm `1d32794e0505902b71938dcf9f1dd92bf9b3aa42228fc7898b323ca3b21a7e83`; preparation remains `681e71a5…` / 179 modules. Root review independently confirms scope/asset preservation and absence of superseded overview roots.

Map ZIP SHA-256: `21fb0089d602f1b7e13ffa20d21204dd1b3bf9f7b3f22116de468b54dad58deb`. Full per-view transfer table, source pins and reproduction: [PROGRESSIVE-EXPORT-RESULTS.md](PROGRESSIVE-EXPORT-RESULTS.md). Acceptance: `/workspace/scratch/unbc-progressive-delivery-20261015/corrected-final-acceptance-report.json` and `ROOT-FINAL-DELIVERY-REVIEW.json`.

The first actual production browser run completed nine unique calculator/profile cases against the canonical results, with a **715.666 s** cold directions request and approximately **4.423 GB** sampled combined browser RSS. Route-worker heap probes timed out during synchronous work, so their observed heap values are lower bounds. The final rebuilt UI also passes all nine comparisons, with real local-step, lift-arrival and responsive mobile captures and a source-preserving 2D → 3D → 2D check. Its first Theatre–Agora request took **380.532 s**; a different first route and shared-host load prevent a controlled speedup claim. Both actual route runs use the canonical two-floor manifest; its source, preparation, routing and relevant floor assets are identical to the complete final export. No saved route JSON is injected into these workers.

A separate fresh ordinary-UI lift calculation directly against complete manifest `ce04…` also matches the sealed 43.885246 m route, diagnostics and non-display instruction fields. Its request takes **322.416 s**, including transfer/full validation/calculation with overview only resident. Corrected lift screenshots wait for current viewport tiles and a later painted frame; the first two-scope lower capture is explicitly superseded rather than hidden.

A separate actual browser on the complete `ce04…` manifest saved all **114 verified map assets and the final app shell**, reopened the visitor without network access, and decoded Floor 3 offline with zero page errors. It does not repeat the expensive canonical route calculation offline; the final-bundle synthetic offline calculator test is separate evidence. All seven complete-map overview screenshots are captured with no detail/context/routing GETs and zero page/console errors. The raw log retains one expected cancelled startup HEAD probe. Evidence: `browser/actual-complete-offline/progress.json`, `browser/unbc-corrected-final-ui/progress.json`, `browser/unbc-complete-final-lift/progress.json` and `browser/final-seven-floor-gallery/index.html` under the scratch root above.

This export meets the small initial-download target; active render memory and cold exact routing remain substantial limitations. The later planning/component measurements are retained as history and are not final transfer totals.

## Implemented delivery path

- Metadata version 2 replaces only exact matching dataset fields with checked model/rooms-bound references and restores independently copied, byte-checked logical metadata before existing package validators run. Plain metadata and version 1 imports remain supported.
- `scripts/indoor/export-progressive-viewer.ts` produces a manifest, small shell/search index, separate overviews and lean presentation contexts, exact prepared floor chunks and the unchanged exact route-worker dataset projection. Assets default to deterministic gzip and Brotli quality 5 representations with independent stored/logical hashes and limits. Unused raw identity copies are omitted from hosting storage; `--identity` retains them for debugging and older three-representation inventories remain accepted. Floors are freshly bound to the visitor revision and actual preparation engine; old master descriptors cannot be relabelled.
- The new loader validates manifests and requested assets, cancels stale scopes and uses workers for full-floor decoding and physical routing validation. The routing worker runs the unchanged full dataset validator before its ordinary calculator, sharing only a private immutable calculation session so exact validation indexes are reused. Four optional empty display-only ramp body arrays are omitted from its projection rather than weakening that validator; original physical triangles and ramp certificates remain exact. A content-addressed persistent cache stores gzip records, bounded by bytes and entry count; decoded recent-floor retention has a separate small LRU budget. Active renderer/worker/GPU memory remains an additional budget.
- Complete offline download is explicit, resumable and verifies that the entire asset inventory still coexists after the final write. Missing floors in a preview prevent a complete-map offline claim. A separate versioned service worker saves the visitor dependency graph, workers, WASM and local label glyphs for offline reopening. Its current measured decoded inventory is **33 files / 8.721908 MB**, down from the 68.322041 MB whole-app inventory; app bytes are separate from map download, initial transfer and browser memory. See [offline app evidence](OFFLINE-APP-SHELL.md). External street basemaps remain an optional online layer.
- Brotli selection checks the host's actual HTTP capability with a body-free HEAD request for the small shell representation. Proper `Content-Encoding: br` enables Brotli; raw `.br` files on a static host use the gzip fallback without first downloading a large unusable Brotli asset. The verified logical content identity is shared across representations and cache hits.

Developer usage and hosting details: [progressive visitor delivery](../../progressive-visitor-delivery.md). No website deployment or canonical master replacement is part of this implementation checkpoint. The legacy ZIP importer remains available.

## Measured baseline

| Component | Expanded JSON | Current ZIP storage |
| --- | ---: | ---: |
| Visitor `indoor.json` | 229.16 MB | 44.88 MB |
| Visitor metadata, packed wire representation | 19.15 MB | 14.68 MB |
| GIS references and manifest | Less than 0.002 MB | Less than 0.001 MB |
| Seven previous display scope caches and index | Separate pooled payloads | 51.84 MB |

The original visitor ZIP is 59.57 MB and has no prepared display caches. Earlier Main Floor 1 and Floor 3 preparations matched their previous logical payload hashes and compressed byte counts. Those master-bound caches are historical baseline measurements; the progressive implementation generates independent visitor-bound scopes under the current engine.

The legacy package importer reads the whole ZIP. Its prepared floor chunks inflate lazily; per-floor network loading is supplied by the new progressive visitor path. Moving only the floor caches to separate URLs would still leave the approximately 59.57 MB core package in the first load. Legacy ZIP cache hits also hash and validate the complete dataset. Progressive overview startup does not load or validate physical routing authority; full physical validation still runs in its worker when directions are requested.

## 1. Replace exact metadata duplicates with checked references

Four substantial metadata fields are exactly equal to fields already in the visitor dataset: `nativeMaterialSections`, `nativeProvisionalCornerSeals`, `nativeDerivedFrameReturns` and `nativeSourceStairMaterials`. Their separately gzipped sizes are 8.24, 4.72, 0.13 and 0.046 MB, respectively; compressed-field sizes are not strictly additive.

A read-only projection replacing exact duplicate top-level metadata values with dataset-field references measured **0.388 MB gzipped**, versus **14.295 MB** for the current packed metadata under the same compressor. The current ZIP stores that metadata in 14.684 MB. This is the clearest low-risk saving: approximately **14 MB**, while retaining the original evidence once and restoring exactly the same logical metadata before existing binding checks.

Implement this as a new versioned wire representation. Each reference must identify its field and expected logical hash/length; resolve only against the bound dataset revision. Validate the reconstructed metadata and all existing connector, floor-opening, stair and access bindings. Do not merely delete evidence or relax the existing viewer validator.

Removing issue text or room properties should come later: experiments saved only **0.037 MB** and **0.273 MB** gzipped, respectively. Neither is worth compromising useful diagnostics or semantics.

**Implemented metadata checkpoint:** `viewer-metadata-wire.ts` now emits version 2 references bound to original model/rooms identities, per-field SHA-256/length and the reconstructed full metadata SHA-256/length. Package import/export passes the matching dataset; plain metadata and version 1 imports remain supported. Hydrated values are independent copies, preserving mutable source isolation. Existing source/connector/stair/access binding checks still run after hydration.

A metadata-only repack of the actual no-cache visitor ZIP measured **59,569,210 → 45,290,239 bytes**: **14.28 MB saved (23.97%)**. The metadata ZIP entry fell from 14,684,194 to 405,220 compressed bytes. All original indoor/GIS entry bytes, logical metadata and both source archive hashes remained unchanged. This candidate does not contain newly generated floor caches or claim a new geometry/route audit. Fourteen relevant helper/package tests, focused strict TypeScript and ESLint passed. Evidence: `/workspace/scratch/unbc-delivery-optimization-20261015/metadata-v2-repack-report.json`; candidate SHA-256: `8e4441c190e9223173f16b4b05c1ce0e06880048b8335e9903e035c66b4f731e`.

The separate actual final-engine export now confirms these progressive asset sizes:

| Actual canonical visitor asset | Logical bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Search and display configuration shell | 552,542 | 72,596 | 62,725 |
| Exact routing projection | 116,495,882 | 24,026,121 | 14,100,933 |

The shell excludes the selected floor's overview geometry and app traffic; 62,725 bytes is not a complete startup measurement. Routing is fetched on first directions request. Real Chromium transport tests fetched the complete actual gzip and HTTP-Brotli routing assets and verified identical decoded SHA-256 `a7f91256cb2bbd8c6951d7fdab154d7f104c5e0c4bd0100b7e2abb1202cd3ddd`. This proves codec/hash transport, not route calculation or full geometry validation. The ordinary visitor projection's nine label/display/note/historical-tread changes are separately reproduced exactly against the canonical projector; all physical, access, record/node/edge and evidence fields are unchanged. Proofs: `/workspace/scratch/unbc-progressive-delivery-20261015/browser/real-codec-proof.json` and `canonical-visitor-routing-projection-proof.json` in that scratch root.

Both the normal master import and the independent visitor import passed before the final-engine restart. The independent visitor is 45,290,239 bytes, SHA-256 `6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22`; its receipt binds the canonical authoring package. The final `681e71a5…` process also completed an ordinary fresh visitor import and receipt verification. Scope chunks are freshly prepared under that engine, with Main and Floor 3 prioritized for actual browser proof. The complete seven-scope measurements and offline/gallery results are recorded above; the following preview and planning figures remain historical checkpoints.

The first **actual Main preview** is now independently prepared, replayed and codec-checked under that engine. Its initial map/search request totals **2,059,717 bytes gzip / 1,724,841 bytes Brotli**, including the 43,927-byte partial manifest. Main detail adds **15,714,190 bytes gzip / 13,449,283 bytes Brotli** on demand; its logical prepared payload is 349,125,903 bytes across 27 chunks. Production Chromium confirms three startup GETs plus the body-free shell HEAD, with zero detailed-floor, context or routing downloads at overview. These are map bytes, excluding app traffic. The final seven-scope manifest will be larger and needs a new total. Six scopes remain explicitly unavailable in preview 1, so complete offline download stays disabled.

Those initial browser images exposed pale speckles and short white fragments in some grey buildings. The corrected final projection and remaining bounded raster artifacts are described below and in the current handoff. The initial partial preview is preserved as the failing checkpoint.

The provisional real Main display-only Chromium run samples main JS peaks of **75.7 MB at overview / 478.7 MB in detail / 483.9 MB in native 3D**, and combined browser descendant RSS of **1.19 / 2.84 / 3.04 GB**, respectively. A floor-worker sample reaches 268.9 MB; the GPU-process subset reaches about 275 MB. This shared-host software-WebGL run is not a mobile-hardware benchmark. RSS can count shared pages more than once; sampled maxima are lower bounds. The 128 MiB decoded-floor LRU controls inactive retention, not this active-render or worker cost. Download splitting has not solved active-floor RAM usage. Final route/offline measurements remain separate.

The first detailed 2D capture was taken before native MapLibre sources finished indexing. The two-floor run, with an additional settled-render wait, displays the expected room and Library fills. The existing `data-floor-detail=true` marker proves decoded payload availability, not painted readiness. The final UI adds the stronger readiness assertions described below; the initial blank capture is retained as failure evidence.

The independent follow-up measured 56 seconds of source indexing after decode. A new visible render status waits for the actual nonempty source uploads, indexing, custom-layer union completion and a later rendered frame; six lifecycle regressions and independent review pass. A persistent 3D cover was separately isolated to the flat `project-overview-floor-fill`, and its visibility now excludes 3D without changing the floor geometry. The lean adapter's fresh inline pick callback and fresh empty 3D level array also rebuilt all prepared layers on unrelated form updates; both references are now stable. The final browser mode/control pass preserves all 16 floor backings with the same data hash through 2D → 3D → 2D, restores native feature counts, and produces the actual calculator captures.

The white slits have a source-independent display cause: repeated geographic polygon clipping fails and silently drops five of the 16 retained Main physical-floor backings. The separately reviewed projection uses original prepared post-ramp/stair-cut exact native-foot carriers, applies exact current exclusions and emits a checked contained display drawing. Independent checks preserve all 16 exact results against every current-level mask, restore all 34 sampled supported white probes and preserve a genuine hole; seven additional adversarial controls pass. Corrected overviews receive new asset hashes, projection provenance and a new manifest revision. The normal decoded prepared pools, routing bytes and 681e/179 preparation binding remain unchanged. Original producer output stays preserved; new final size/browser measurements must use the corrected candidate, rather than relabel old preview totals.

## 2. Serve compressed resources rather than recompressing the ZIP

Read-only Node compression benchmarks on actual bytes produced these results. Times are single local observations, include CPU contention, and are not production throughput measurements.

| Resource | Gzip level 6 | Brotli quality 5 | Brotli quality 9 |
| --- | ---: | ---: | ---: |
| Visitor `indoor.json` | 42.58 MB / 6.10 s | 29.73 MB / 5.45 s | 27.38 MB / 65.73 s |
| Main Floor 1 pooled cache, one stream | 13.97 MB / 1.72 s | 12.91 MB / 2.51 s | 12.80 MB / 10.53 s |
| Floor 3 pooled cache, one stream | 5.71 MB / 0.90 s | 5.02 MB / 1.05 s | 4.87 MB / 3.23 s |

Current cache storage is 15.16 MB for Main and 6.20 MB for Floor 3. Those use independently gzipped 4 MiB chunks and a different compressor, so the table combines codec and stream-boundary effects. Retain bounded independently decodable chunks in production and benchmark that layout before claiming the whole-stream savings. Gzip level 9 reduced the core only to 42.11 MB while taking 9.81 seconds; Brotli gives substantially more benefit.

Serve precompressed JSON/binary resources with correct `Content-Encoding`, a gzip fallback and representation-aware caching. Applying Brotli to an already-deflated ZIP will not recover the core saving. The current base64 metadata wrapper also gains little from further compression; references should precede codec tuning.

The app currently deploys through GitHub Pages. The preserved published/imported map remains unchanged; the new remote-asset format is being verified locally before publication. A read-only header check of the documented custom-domain homepage on 15 October returned `Content-Encoding: gzip` even when advertising Brotli support; this single HTML response does not establish every asset's compression behavior. Verify the actual map asset host's encoding, CORS and cache headers before budgeting Brotli savings. A compatible asset CDN/object store can serve the map separately while retaining the existing app host. Merely adding `.br` files to the Pages output does not establish correct HTTP decoding.

**A delivery-format estimate of approximately 82 MB** follows from measured components: 29.726 MB Brotli core + 0.388 MB referenced metadata + 51.841 MB existing cache storage. This is **not an implemented or verified export**. It retains the previous cache total as a planning proxy, excludes app/basemap traffic and does not yet include further scope sharing or Brotli cache savings.

With gzip level 6 for the core instead, the same planning calculation is approximately **95 MB** (42.58 + 0.388 + 51.841 MB). This is the relevant fallback budget until actual hosted Brotli delivery is verified; it has the same unfinished-export and cache-proxy limitations.

Make compression deterministic. All 13 examined Floor 3 chunks in the old and fresh caches had identical expanded hashes and differed only in gzip timestamp bytes. Set a fixed gzip timestamp so unchanged payloads retain content addresses across rebuilds.

## 3. Give the first view its own small contract

Separating files alone is insufficient. Introduce a visitor renderer/search contract that can display an already prepared floor without holding or recomputing the entire physical authority. Existing components cannot consume the following projections unchanged:

| Read-only candidate | Raw JSON | Brotli quality 5 |
| --- | ---: | ---: |
| Shell/search index: all 1,864 room labels, floor/building/access labels and available arrival coordinates | 0.564 MB | 0.063 MB |
| Main native-area overview drawing | 13.77 MB | 0.895 MB |
| Floor 3 native-area overview drawing | 7.92 MB | 0.437 MB |
| Existing `routeWorkerDataset` projection | 116.50 MB | 14.10 MB |

The overview drawings alone do not compose the complete current grey view: physical backing, grey wall/window materials and prepared stair/atrium holes must also be exported. These are measured projections, not validated formats. The matching `presentation.overviewGeometry` and native overview collections are identical in the examined scopes; count them once.

A reasonable **implementation target**, pending complete export and image checks, is **1–3 MB of map data for overview/search**, then approximately **5–16 MB for the chosen detailed floor** based on the measured floor payloads. App JavaScript, fonts, basemap traffic and decompressed memory are additional. With only metadata references/Brotli and per-floor URLs, but no new viewer contract, the first detailed map would still require approximately **35–45 MB of core plus floor data**.

Fetch the exact routing projection on first directions use, or idle after the first floor is interactive. The measured existing projection is 14.10 MB Brotli / 22.71 MB gzip. It is not a tiny graph: native material, support, door and stair evidence must remain available to the actual calculator. Load and validate that evidence before calculating; a display cache is not route approval. This split improves map startup but does not itself fix the previously measured long cold routing validation.

Scope sharing can further reduce total storage. Main and combined Floor 1 caches contain 6,062 directly equal encoded pool entries totaling 25.67 MB of JSON. Their individually gzipped sum is 5.41 MB; that is evidence of duplication, **not a guaranteed net saving** in the existing chunk stream. Use stable component/content hashes shared across scopes instead of duplicating complete scope pools. Floor 3 topology coordinates/faces also match between the master cache and visitor source, but their source-geometry bindings differ: share geometry only with separate correct bindings, never relabel a complete descriptor.

## Manifest and cache design

Publish a small versioned manifest that identifies the map revision, original model/rooms hashes, visitor policy/geometry revision, preparation engine, supported scope/options inventory and every asset dependency. Each immutable asset needs its schema/encoding, source/scope binding, byte limits, stored and decoded lengths/hashes, and dependency hashes. Keep exact geometry and access values unchanged; no lossy coordinate rounding belongs in the routing authority.

Use content-addressed asset URLs with long immutable caching, and a short-lived/revalidated manifest. Separate logical content identity from HTTP compression bytes. Cache verified assets in IndexedDB/Cache Storage by content hash; retain reusable assets across revisions when hashes match. Fetch only dependencies of the requested view or calculator. Cancel obsolete floor requests and reject stale replies. Missing or mismatched route dependencies must leave directions unavailable until valid evidence loads.

Add a new loader/schema alongside backward-compatible ZIP import. Verify the complete export and existing source/binding checks during publication, then retain bounded client integrity checks for each requested asset and complete physical checks in the route worker. Do not bypass current checks by describing an unchecked mesh as prepared authority.

## 4. Bound memory and offer full offline download explicitly

Keep only the active decoded floor and a small bounded recent-floor cache. Release abandoned worker, source, hit-test and GPU buffers; avoid retaining original JSON byte arrays alongside their parsed objects after verification in the visitor path. Do not hold the full physical dataset in the UI merely to pass it to a route worker. Preserve the existing heavy-worker scheduling and cancellation guarantees.

Provide **Download complete map for offline use** as an explicit option that fetches and verifies all assets or the portable full ZIP. Initial browsing should not implicitly download the complete offline package.

Map download, website deployment and RAM require separate budgets. The current whole website is 68.13 MB uncompressed and includes unrelated demos/authoring code. A prior authoring-map run recorded a 1.70 GB main JavaScript heap peak, excluding workers/GPU; final visitor memory is unmeasured. A smaller compressed file does not by itself solve memory use.

## Acceptance checks before shipping

- Verify exact round-trip geometry, IDs, coordinate values, holes, heights, door approaches, stair/lift ownership, access and route policy. Compare the existing exact calculator outputs/diagnostics against the same source revision, including stairs, lifts, inaccessible and restricted cases.
- Require complete asset inventory and source/engine/option binding checks. Exercise corrupt/missing chunks, wrong scope/revision, cancelled loads and stale cached manifests. Keep decompression limits and fail before publishing a partial floor as complete.
- Compare actual desktop/mobile screenshots in 2D, ordinary/native-height 3D, overview and zoom-to-reveal modes. Preserve grey windows/walls, true voids, picking, navigation overlays and smooth floor surfaces.
- Measure a cold cache, warm repeat visit, floor switch and first directions request on representative desktop/mobile hardware. Record transferred bytes, time to overview/detail, route validation time, main/worker heap and process/GPU memory separately. Confirm startup does not fetch route authority or other floors, and repeated unchanged assets do not redownload.
- Verify full offline download, interruption/resume, complete offline reopening and backward-compatible legacy ZIP import. Test cache invalidation after geometry/access changes and source-byte preservation.

## Detailed measurements

Read-only scripts and JSON evidence are under `/workspace/scratch/unbc-delivery-optimization-20261015/`: `dataset-measurements.json`, `compression-measurements.json`, `projection-measurements.json`, `overview-measurements.json`, `cache-duplication-measurements.json` and `deterministic-compression-measurements.json`. The original archive sizes/hashes are in `/workspace/scratch/unbc-stair-review-20261015/size-estimate.json`. The original measurement probes changed no source geometry, app code, canonical package or publication. The implementation described above changes app/exporter code while preserving canonical source archives and geometry.
