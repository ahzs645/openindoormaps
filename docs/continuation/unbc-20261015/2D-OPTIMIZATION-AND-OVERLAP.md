# UNBC 2D export: repeated data and a lossless optimization candidate

Measured on 15 October 2026 against the same immutable inputs as the [dimension split study](/workspace/openindoormaps/docs/continuation/unbc-20261015/SIZE-BY-DIMENSION-AND-ROUTING.md).

The **21.73 MB simplified 2D draft contains substantial repeated data**. A generated lossless candidate measures **9.66 MB of Brotli assets, or 9.73 MB including its compressed manifest**. That is a conservative **55.2% reduction** against the original 21.73 MB asset-only figure. Every source value is restored exactly; all seven views remain available. This is an isolated transport/export experiment, **not a change to the production exporter or viewer**.

![Measured size comparison](/workspace/scratch/unbc-2d-optimization-20261015/optimization.png)

## Comparison basis

All figures below are decimal MB, using **Brotli quality 5** throughout. The content population includes shell/search, all seven overview assets, shared room/selection/height/label/connector data, and the seven simplified 2D drawing assets. It excludes the navigation asset, exact native picking/validation support, 3D add-ons, app code, fonts and basemap. The earlier draft was already a proposed mode split, not the current published visitor package.

| Representation | Assets | Compressed manifest | Total |
| --- | ---: | ---: | ---: |
| Previous separate JSON draft | 21.727957 MB | 0.009023 MB | **21.736980 MB** |
| Shared subtrees, compact JSON | 13.124791 MB | 0.070963 MB | **13.195754 MB** |
| Shared subtrees, lossless binary values | 9.662157 MB | 0.070963 MB | **9.733120 MB** |

The two compact variants encode the same graph. Binary replaces decimal number text with exact IEEE 754 float64 values and safe-integer varints; it does not round coordinates. JSON and binary representations restore the same values. The candidate manifest conservatively lists both formats and both compression alternatives. A production manifest could omit unused alternatives.

With gzip level 6, the optimized binary assets are **11.920460 MB**, plus **0.073044 MB** for the manifest, versus **24.582131 MB** of previous gzip assets.

## Where the repetition comes from

The original seven views are overlapping source scopes, rather than seven independent campus storeys. Exact feature multiset comparisons found:

| Layer | Main floor view | Combined Floor 1 view | Identical occurrences |
| --- | ---: | ---: | ---: |
| Room footprints | 398 | 398 | **398** |
| Native fill features | 24,090 | 24,715 | **24,090** |
| Native wall features | 44,183 | 45,418 | **44,183** |

The auxiliary Floor 1.5 view's **625 fill features and 1,235 wall features** also occur identically in the combined view. Removing a view would remove a useful floor choice; sharing its data avoids that tradeoff.

There is repetition between roles as well:

- Overview and detailed 2D layers frequently store the same coordinate geometry with different feature properties.
- Room footprints and visitor labels carry repeated source-native geometry and properties. Label points can differ while the embedded room metadata remains identical.
- Different features can share properties, geometry arrays or larger source subtrees even when their complete JSON documents differ.
- The previous draft deduplicated complete assets only. Scope bindings, labels or a few additional floor features made otherwise similar files different.

Across all FeatureCollections there are **398,856 feature occurrences**, **274,652 distinct complete features**, and **139,564 distinct coordinate geometries**. Exact geometry repetition represents **74.85 MB of repeated uncompressed geometry JSON**. Complete feature repetition represents 67.40 MB of repeated uncompressed JSON; these measures overlap and **must not be added** or treated as compressed savings. Repetition within one drawing collection was retained in the decoded output too, rather than deleting potentially meaningful render instances.

The largest original fields, measured independently across scopes, were walls (~5.88 MB Brotli), fills (~3.38 MB), overview geometry (~3.28 MB), overview ground (~2.97 MB), visitor labels (~2.49 MB) and room footprints (~2.13 MB). Standalone field compression is diagnostic and not additive to document compression. Column overlays were only ~0.205 MB, so deleting pillars or changing room shapes is not the largest transport opportunity.

These counts establish **stored-data repetition**, not unintended physical room intersection. A floor fill, room selection mask, outline and wall are separate roles that may legitimately overlap. The candidate preserves all instances and their order. It neither dissolves overlapping polygons nor changes the existing room-overlay findings.

## What the candidate does

1. Finds byte-identical object/array subtrees of at least 256 JSON bytes across the 22 source documents.
2. Stores repeated subtrees once, referenced by indices. Inlines 24,331 entries that would have only one stored reference, retaining 185,496 shared entries.
3. Places entries in pages grouped by their document consumers. Overview dependencies remain distinct from detail-only data; cached pages can be reused by another floor view.
4. Uses compact, lossless value encoding. The browser decoder reconstructs ordinary objects and GeoJSON, with separate mutable objects for repeated instances.
5. Retains source document checksums and both stored/decoded representation checksums.

No snapping, angle adjustment, ring repair, vertex reduction, room merge, hole removal, obstacle removal, access change or staircase admission was performed. The original master and canonical dataset remain unchanged. Existing invalid/sliver/display-precision geometry is retained, rather than silently repaired to obtain a smaller export.

## Loading individual floors

The following sums include shell plus the chosen scope's overview, shared and 2D data, with each dependency counted once. They exclude the manifest; add 0.071 MB once for the candidate. Scope sizes are not additive because the candidate shares pages across views.

| View | Previous cold assets | Optimized cold assets | Optimized overview + shell |
| --- | ---: | ---: | ---: |
| Floor 1 · Main floor | 6.391 MB | **3.848 MB** | 1.574 MB |
| Floor 3 | 2.779 MB | **2.044 MB** | 0.918 MB |
| Basement | 0.167 MB | **0.142 MB** | 0.067 MB |
| Floor 1 · combined | 6.518 MB | **3.926 MB** | 1.614 MB |
| Floor 1.5 · auxiliary | 0.226 MB | **0.181 MB** | 0.099 MB |
| Floor 2 | 3.595 MB | **2.555 MB** | 1.260 MB |
| Floor 4 | 2.428 MB | **1.806 MB** | 0.824 MB |

With the main-floor dependencies already cached, the combined Floor 1 view requires only **0.190 MB** more. After the combined view, the auxiliary Floor 1.5 view requires **0.0063 MB** more. All seven overview views plus shell cost about **4.292 MB** in the candidate; a single selected overview fits comfortably below that. This is not a newly simplified campus outline.

The prototype has **203 assets**, including 181 pool pages. A cold main-floor load references 117 assets, and the combined floor references 127. This is too many requests to adopt blindly: production integration should batch pages, investigate coalesced range loading or use suitable floor bundles, then measure remote-network latency. Size savings alone do not establish loading speed. JSON compaction is a useful intermediate option if introducing binary decoding is deferred.

## Verification

- **22/22 source documents** restore to their original SHA-256 and exact byte length after compact JSON serialization. The first shared-JSON candidate also passed an independent deep comparison to the original source objects.
- All **812 compact encoded representations** (203 assets × binary/JSON × Brotli/gzip) passed stored checksum, decompression, decoded checksum and value-parity checks.
- The restored population contains the same **398,856 feature occurrences**, **3,321,375 coordinate-pair occurrences**, **444,593 polygon occurrences** and **104 interior-ring occurrences**. Counts include repeated views/layers; coordinate-pair counts also include native-property/overlay arrays. Whole-document equality, rather than these counts alone, establishes preservation.
- A **real Chromium worker** fetched all 203 gzip/binary assets, checked their stored and expanded hashes, decoded them with browser APIs, and restored all 22 source document hashes. This was a localhost transport check, not a rendering, picking or remote-speed benchmark.
- Reference decoding checks cover tagged-array ambiguity, missing/invalid references, cycles, invalid tags and independent mutable copies. Binary checks cover Unicode, integer limits, subnormal/large floats, negative zero, truncation, invalid headers and trailing bytes.
- Rechecked all **120 sealed artifacts** from the preceding dimension study; all are unchanged. Master, canonical dataset and current published manifest hashes still match the prior receipt.

No production UI/build/routing code changed, so this is not new desktop/mobile rendering proof or navigation certification. Existing room precision flags remain open, and the 28 held stair links remain disabled as before. Transfer compaction also does not reduce the fully expanded data population automatically; decoded-floor cache and GPU/memory limits remain separate loader work.

## Recommended implementation order

Implement shared immutable assets and compact encoding as export options, with a compatible versioned loader and checksummed cache. Batch small pages and retain bounded decoded-floor caching. Preserve exact native picking/validation dependencies, fetch navigation when directions are requested, and keep 3D/inspection roles separate. Then verify the real viewer's floor switching, picking, zoom reveal, column option, desktop/mobile rendering and navigation against the canonical source before publication.

Consider geometric simplification only as a separate, explicit option after resolving existing precision flags. It needs area/topology/door/opening overlays, and should not be conflated with the lossless 55% transfer saving demonstrated here.

## Reproducible artifacts

- [Comparison values](/workspace/scratch/unbc-2d-optimization-20261015/comparison.json)
- [Component and duplicate audit](/workspace/scratch/unbc-2d-optimization-20261015/audit.json)
- [Exact scope overlap counts](/workspace/scratch/unbc-2d-optimization-20261015/scope-overlap.json)
- [Compact candidate manifest](/workspace/scratch/unbc-2d-optimization-20261015/compact/manifest.json)
- [Complete round-trip verification](/workspace/scratch/unbc-2d-optimization-20261015/compact/verification.json)
- [Browser worker results](/workspace/scratch/unbc-2d-optimization-20261015/compact/browser-verification.json)
- [Hash-bound receipt](/workspace/scratch/unbc-2d-optimization-20261015/receipt.json)

Scripts in the same scratch directory reproduce the experiment in order: `audit-and-pack.mjs`, `verify.mjs`, `compact.mjs`, `verify-compact.mjs`, `browser-verify.mjs` (with its local HTTP server), and `report.py`. They read the prior immutable candidate and write only the new study directory. The reference decoder and binary codec are experiment code, not production-approved APIs.
