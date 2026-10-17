# UNBC navigation and circulation follow-up

Reviewed 2026-10-15 (America/Vancouver). Local evidence was recorded after midnight UTC on 2026-10-16.

The full OpenIndoorMaps viewer retains its interaction, combined floors, hospital example, binary preview link and original map assets. This change improves prepared-floor decoding and reuses publisher-checked routing results for one exact immutable publication. It also colours four reviewed corridor/landing faces green. It does not enable any of the 28 held stair links.

## Grey corridors and ramp landings

The user identified the grey 07-163 corridor, lower ramp approaches around 04-122/04-124, and the upper landing beside 08-S101. The source room 04-122 was already green. The larger native regions were grey because the first had no associated room keys and the generated landing proxies covered too little of their complete native faces to trigger the majority colour rule.

| Native face | Evidence | Native area, ft² | Source corridor overlap, ft² |
| --- | --- | ---: | ---: |
| `native-region:311:232` | Source 07-163 Corridor | 477.2736 | 439.8199 |
| `native-region:311:183` | Source 04-123 Corridor / lower approach | 54.8166 | 49.7555 |
| `native-region:311:80` | Source 04-126 Corridor / lower approach | 302.6628 | 266.3752 |
| `native-region:1487816:38` | User-identified upper ramp landing beside 08-S101; original landing owner `landing:ramp:1622190:upper` | 100.3337 | Not a source-room majority decision |

The separately recorded review binds to the exact dataset, engine, progressive revision and original prepared payload hashes. It applies to both Main floor and combined Floor 1. Individual building scopes that require live preparation do not consume this published-scope paint review. Geometry, slopes, elevations, room associations, portals and access results are unchanged. Green is a display classification, not a new navigation or step-free approval.

Actual payload comparisons found four reviewed faces / 669 feature paint changes in each scope. Main floor checked 314,082 geometry references; combined Floor 1 checked 322,557. Both found zero geometry changes, identical exact topology objects and unchanged room associations. Before/after PNGs are renders of the actual prepared data, not browser screenshots or certification of the complete 3D scene.

## Floor loading

`published-floor-decoder.ts` verifies stored/logical chunk checksums, the pooled payload checksum, scope membership, publication identity and pool grammar. Known publisher-approved payloads restore backward references in place rather than building a second entire restored graph. They retain shared identities and frozen containers. Unknown/stale publications continue through the strict existing decoder. The gzip carrier is decoded directly instead of decompressing, recompressing and decompressing it again. HTTP-expanded bytes remain verified, and downloads have bounded reads.

All seven actual published floor payloads were independently rehashed after restoration. Each exactly matches its original full logical SHA-256. Main floor decoded in 4.1–6.1 seconds locally; combined Floor 1 in 7.1 seconds. These are local decoding measurements, excluding download, transfer to the UI and WebGL rendering. They do not promise a seven-second total browser load.

The original 45,290,239-byte core ZIP still contains campus-wide source and navigation data. This change does not split that core into 2D, 3D and navigation packages or make its download smaller. Prepared display requests remain scoped to the selected published floor view. Large-map routing now waits for both endpoints rather than allocating a whole-campus graph when directions is merely opened or a departure selected.

## Precomputed exact routing results

The original calculator/validator was run on the exact visitor routing projection. The prepared cache contains 1,285 exact physically supported cells (including holes and lossless rational coordinates), both original profile/direction link-policy results, the original source binding and walking-blocker set, per-cell access results, and connector anchors. This is reuse of original computed checks, not newly inferred access. Graph traversal, corridor/path construction and arrival calculation remain the existing implementation.

Admission requires all of the following compiled trust roots, not a flag in an uploaded map:

- Routing dataset SHA-256: `a7f91256cb2bbd8c6951d7fdab154d7f104c5e0c4bd0100b7e2abb1202cd3ddd`.
- Preparation engine: `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`.
- Source model: `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`.
- Source rooms: `f329b643c18c86fa611b0843da0b8c5924b9e211336005eeaf5020c76bffac50`.
- Cache logical SHA-256: `974b55890b0717a2c8bbb286a962c5cacb5dcc6e3ad3e33f505e9ff6ff02fd29` (16,298,818 bytes).
- Stored cache SHA-256: `916af377da94ddda19f1babc063e97d3e9c08cc8af301b5574bd5617068ac6fc` (2,570,788 bytes).

The worker verifies its private full dataset snapshot before admitting the receipt. Source, door, room, geometry, access or engine edits miss that receipt and take the ordinary path. The precomputation is scoped to this immutable worker session. The checked compressed cache is retained best-effort in IndexedDB. If an offline browser has never fetched it, or it is unavailable from the server, the ordinary calculator remains the fallback. The existing complete-offline downloader does not yet include this supplemental cache; open directions online once to retain its speed benefit offline. Corrupt fetched cache bytes fail validation.

The reusable publisher command is `node --max-old-space-size=4096 --import tsx scripts/indoor/export-published-routing.ts INPUT.zip OUTPUT_DIRECTORY`. It runs normal source validation, builds both original graphs and exports checked results. Its receipt is inert until reviewed and compiled into the publication. The actual UNBC artifact was produced by the equivalent local baseline/precomputation programs and checked against original routes; this new convenience command was typechecked and its usage checked, not separately rerun through another long UNBC export.

## Actual navigation checks

The full JSON route output, path coordinates, diagnostics, arrivals and reachability were compared against fresh results from the unchanged calculator for these pairs in both public and accessible modes:

- 05-136 → 05-173 (same floor).
- 05-136 → 05-342 and reverse (cross-floor).
- 09-200 → 07-180 and reverse (local steps).
- 04-108 → 07-158 and reverse (ramp-area diagnostic).

All 14 results match. The first five public requests return routes. The ramp-area pair remains unavailable, as in the original. All seven accessible requests remain unavailable under the existing source/access evidence. The green landing changes do not change these outcomes, and held stair links remain disabled.

Local direct-calculator replay reduced the first request from about 709 seconds to 108 seconds; hashing plus cache decoding added about 13 seconds. Subsequent available requests measured approximately 10–24 seconds. The remaining expensive work includes live path centering/straightening. The original check and the fast replay ran alongside other local tasks, so this is indicative CPU evidence rather than a controlled browser benchmark.

The production worker and actual RouteWorkerClient were also exercised with the decoded 2,128-region Main floor kept resident and one worker reused for all requests. All 14 results matched in that test too. Node was launched with a 768 MiB old-generation limit; the actual reported total V8 heap limit was 960 MiB including other generations. The first request took 139 seconds and subsequent available routes took 8–15 seconds. Sampled worker heap usage stayed below 582 MiB. The complete process, including the resident floor, used approximately 1.4–1.5 GiB RSS; the worker limit is not a browser-wide memory bound. This uses Node worker transport and local filesystem fetch, excluding browser rendering, network delays and IndexedDB persistence. It does not reproduce or certify resolution of the user's browser crash.

## Verification and publication limits

- 27 focused publication, decoding, paint, checksum, policy, guard, source-change and startup tests passed.
- 29 existing route worker/client lifecycle and scheduling tests passed.
- Scoped TypeScript checking, including the new export command, passed.
- Hospital-only deployment-profile production build passed; preparation engine binding is unchanged.
- All seven floor logical payload hashes match; both paint-scope geometry comparisons passed.
- All 235 previously committed data and entry files remain byte-identical. The routing cache is supplemental.
- Static output is approximately 246.37 MiB, under the 256 MiB expanded archive limit. Its largest asset is 24,026,121 bytes, under the 25 MiB file limit. This is the entire hosted artifact with parallel formats and examples, not the visitor download size.
- Canonical master remains SHA-256 `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520`.

Supported browser automation was unavailable in this session. Actual desktop/mobile interaction and WebGL screenshots remain unverified. The data renders and production worker tests are labelled accordingly. Remaining work is to measure the published page on the user's browser, reduce the remaining path-centering cost, add the supplemental cache to explicit offline inventory, and eventually split the campus-wide core by 2D/3D/navigation needs.

Evidence: see the sibling `navigation-evidence` directory. Large baseline route JSON, source intersection evidence and the before/after renders remain in `/workspace/scratch/unbc-navigation-fast-20261015`.
