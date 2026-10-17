# Progressive visitor delivery

The progressive viewer loads an independently verified overview and search shell before detailed floor geometry or routing authority. The current exporter requires an already validated version 3 native mapping; it does not manufacture missing native scopes. Legacy master and campus-viewer ZIP imports remain supported separately.

## Export

Freeze preparation-source edits, refresh the generated preparation binding, then export to a new directory:

```sh
node --import tsx scripts/indoor/prepared-display-engine-binding.ts .
npm run indoor:export-progressive -- /absolute/path/master.reviter.zip /absolute/path/new-delivery-directory --visitor --prepare
```

`--visitor` first exports and independently imports the ordinary campus viewer. `--prepare` prepares every supported campus/physical-display scope through the existing native preparation engine and independently replays each exact prepared payload. Master-bound display descriptors are never relabelled as visitor descriptors. A normally validated independent visitor ZIP and source receipt are saved next to the output directory before floor preparation. A later transport-only export can use that ZIP with `--source-receipt=/absolute/path/checkpoint.zip.source.json`; it still performs normal visitor validation and verifies the original authoring bytes against the receipt. The input archive, original model/rooms identities and exact source dataset are checked again before writing a manifest. Actual preparation-module hashes must match at both ends of export.

Without `--prepare`, only independently matching existing prepared scopes are exported. Missing scopes are listed explicitly; such an export is not a complete map. `--no-offline` omits the convenience offline ZIP.

Repeat `--priority-scope=LEVEL_ID,...` to prepare specific supported exact scopes first; this changes preparation order only. `--checkpoints` writes independently verified preview manifests after the first and second scopes, with remaining scopes explicitly unavailable, before completing the entire inventory.

For the separately audited floor-backing projection, write a new candidate from a sealed manifest and the same independently checked visitor ZIP:

```sh
node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/reproject-progressive-overviews.ts /absolute/path/original/manifest.json /absolute/path/new-corrected-directory /absolute/path/independent.campus-viewer.zip
```

This stage normally decodes each exact prepared payload, subtracts exclusions in native feet from its retained post-cut physical floor carriers, and replaces only `overview.floor`. It preserves prepared holes, ramp/stair cuts, all other overview fields, prepared descriptors/chunks, contexts, search and routing. The manifest and each revised overview explicitly record a separate `displayProjection` version, complete helper/dependency digest and prior revision/input hashes. The preparation engine binding remains unchanged. Full exact cut/residual receipts stay in the adjacent `.projection-proof` review directory; they are not required visitor downloads.

A sealed partial preview is also accepted. Its unavailable scope inventory remains explicit and no complete offline ZIP is produced. The complete corrected manifest and offline ZIP require a complete input inventory. Geographic exclusion clipping previously dropped entire valid floor backings when a rounded Boolean operation failed; this stage uses retained exact native carriers and fails on source escape or exclusion overlap instead of substituting an uncut slab.

## Version 1 inventory

`manifest.json` contains the original package/source hashes, exact visitor dataset hash, preparation-engine hash, complete scope inventory and content-addressed asset descriptors. Its revision is a canonical JSON digest excluding the revision field itself. Each asset has separate logical byte/hash limits and stored byte/hash limits for deterministic gzip and optional Brotli quality 5 representations. The exporter includes both by default; `--gzip-only` saves hosting storage when the host serves raw Brotli without browser decoding. Gzip remains mandatory for prepared-floor carriers and offline use. Raw identity files are omitted by default; `--identity` adds them for debugging. Existing two- and three-representation exports remain readable.

Compressed routing representations larger than 16 MiB use ordered `parts`, each with a content-addressed `assets/<sha256>.part` path, SHA-256 and byte count. Every part is bounded to 16 MiB; the manifest bounds the count and requires their total to equal the unchanged complete compressed byte count. The loader checks every part and the reassembled compressed SHA before the existing bounded decompression, logical SHA/byte checks and routing structural validation. The complete-stream `path` is a virtual identity when parts are present; only declared parts are written or fetched. Geometry, exact rational values and access evidence remain unchanged. This addresses static-host file limits; decoded routing assets still have their existing 256 MiB bound.

The assets are:

- **Shell:** floor/building/search labels, original arrival coordinates and explicit display configuration flags. It contains no walking authority.
- **Overview per scope:** the current prepared area tint, checked physical slab backing, original wall/window material paint, labels and prepared holes.
- **Presentation context per scope:** the existing relocated visitor labels, connector markers, ordinary/native-height extrusion inputs and complete original scoped ramp bodies/platforms with their original edge policy and endpoint nodes. This is fetched with details, not at startup.
- **Prepared chunks per scope:** exact existing pooled prepared JSON, including all rational topology, IEEE coordinates and source identities. Only transport compression changes.
- **Routing:** the existing exact `routeWorkerDataset` projection. It is fetched and independently validated before the calculator runs; a display asset never approves a route.

All version 1 dependencies are explicit manifest roots and scope references. The reserved asset `dependencies` list must be empty, preventing an overview from implicitly fetching routing or other floors. Unknown, unreachable, wrong-scope, changed-engine, corrupt or oversized assets fail closed.

For detail replay, `decodeProgressiveFloor` rebuilds the deterministic gzip carrier from verified pooled bytes, then uses the established prepared-display decoder and its complete logical graph checks. This preserves the existing preparation contract without copying the full physical source dataset into the visitor UI.

## Hosting and offline data

Serve the generated directory over HTTPS with appropriate CORS for the app host. `assets/<stored-sha256>.*` can use long-lived immutable caching; revalidate the manifest. The explicit `.gz` and `.br` files do not require a host to add `Content-Encoding`. The gzip fallback remains usable where browser Brotli decoding or suitable HTTP content encoding is unavailable. Verify actual hosted behavior before claiming Brotli transfer sizes.

For automatic browser HTTP decoding of a cross-origin Brotli representation, send `Content-Encoding: br` and expose that response header with `Access-Control-Expose-Headers: Content-Encoding, Content-Length`. Without the exposed encoding header, the loader safely uses the explicit gzip file. Raw gzip files need no `Content-Encoding` header.

`complete-map.offline.zip` includes the manifest, checked offline inventory and every gzip representation needed for the map, including all real routing parts for a chunked representation. It contains map data, not a separately installed application bundle or external basemap. The application also offers verified persistent asset caching and explicit complete-map download; ordinary browsing should fetch only the current overview/floor and, on first directions use, the routing dataset.

`export-report.json` records actual first-view and complete-map transfer sizes, all-representation hosting storage, offline ZIP size, scope coverage, route projection hash and timings. The first-view measurements include the manifest. Hosting both gzip/Brotli variants uses more storage than any one visitor downloads; optional raw identity files add the full expanded geometry again and are unnecessary for production delivery. App code, fonts, external basemap requests, decoded visitor memory and routing CPU time are separate budgets; exporter peak RSS is not a visitor-memory measurement.
