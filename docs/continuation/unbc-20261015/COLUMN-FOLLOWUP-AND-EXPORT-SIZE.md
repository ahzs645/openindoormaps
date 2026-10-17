# UNBC columns and export size — 15 October 2026

The column follow-up is an isolated, reversible 2D display candidate. It preserves the sealed visitor map and original detailed source. It does not alter navigation, physical wall geometry, access, rooms, doors, floor openings or the 28 held stair links.

## Current complete visitor export

Measured from the actual content-addressed files in `/workspace/scratch/unbc-progressive-delivery-20261015/visitor-corrected-final`, with stored paths deduplicated and the manifest included. These are decimal MB (1 MB = 1,000,000 bytes).

| Map-data download | Brotli | Gzip |
| --- | ---: | ---: |
| Initial overview and search | 1.96 MB | 2.32 MB |
| Complete visitor map | 68.81 MB | 88.55 MB |
| Routing asset, fetched on first directions request and included in the complete-map total | 14.10 MB | 24.03 MB |

The complete offline ZIP is **88.62 MB** (88,624,604 bytes). App code, fonts and basemap traffic are additional. These sizes are for the current sealed export, before this column candidate. The previous 100–130 MB estimate has been superseded by measured files.

Hosting both compressed representations plus the manifest uses 157.19 MB. The whole export directory, including both variants, offline ZIP and report/inventory files, contains 245.87 MB of logical file bytes. That directory size is not the amount an individual visitor downloads.

[Actual-file size report](/workspace/scratch/unbc-column-followup-20261015/current-export-size.json). The ZIP checksum still matches `21fb0089d602f1b7e13ffa20d21204dd1b3bf9f7b3f22116de468b54dad58deb`; manifest revision is `ce04f9a8f556d5383968d68b25b52a3ba1bd72d8877d09f1275756aefa5057c3`.

## Column improvements

The earlier review found 15 supported display-merge keys. The follow-up expands this to **37 unique level/element keys**, retaining all 15 earlier candidates and adding 22. Main and combined Floor 1 repeat the same physical-level records, so their counts must not be added as unique columns.

| Exported view | Earlier proposals | Follow-up proposals |
| --- | ---: | ---: |
| Main Floor 1 | 8 | 19 |
| Floor 3 | 3 | 9 |
| Basement | 1 | 1 |
| Combined Floor 1 | 8 | 19 |
| Auxiliary Floor 1.5 | 0 | 0 |
| Floor 2 | 0 | 3 |
| Floor 4 | 3 | 5 |

The wider initial candidate count was 38. One new Agora candidate (`311:2079451`) is retained in its original form because its published column drawing contains invalid zero-area pieces. This stricter output check does not discard or repair those pieces to increase the merge count.

Two changes account for the additional supported cases:

1. **Check the visible published material against the original full column body.** A published column can be clipped by adjacent walls, so requiring it to cover the entire source footprint rejected valid visual candidates. The follow-up recolours only the intersection of retained published column material and the original body. Any other published material remains grey. Floor, doorway, circulation and room-enclosure guards still use the entire original body footprint.
2. **Use valid original floor pieces as a conservative support subset.** A single invalid projected piece previously stopped the whole Floor 2 guard. The follow-up requires the full source column to be covered by valid original floor polygons, preserving their holes. Invalid pieces are neither repaired nor removed from the map and cannot supply support. A column that needs them for support is retained. Floor 2's positive-area invalid piece is approximately 4.1e-11 m²; other degenerate projected pieces are also excluded from the numeric guard, while remaining in the original drawing.

A precision check also caught invalid derived patches caused by rounding narrow pieces to 0.1 mm. Derived column masks, bands and fills now retain their original floating-point output coordinates. They are not repaired with a buffer or snapped to a grid. The separate baseline preview geometry retains its earlier drawing precision. Final checks validate polygon validity and source/published coverage with a disclosed 1e-9 m² floating-point area residual; this is a display diagnostic, not a physical-clearance certificate.

Eligible columns blend into adjoining room masses, with a nearby straight source wall profile continued only through existing column material. Free-standing circulation columns, door/connector approaches, unsupported room boundaries and uncertain original drawing parts remain visible. No real wall gap is closed. The settings remain optional, with original/subdued/merged comparisons, detailed restoration and saved/resettable preferences.

The drawing suppresses circular outline ink over each eligible column's full checked source footprint. Recolouring remains limited to the supported published material. This removes the separate outline stroke where a published column was clipped by a wall; it does not expand a physical wall or remove an obstacle. Representative Library captures still show faint paint seams at some clipped junctions. The candidate does not claim a completely seamless final production rendering, and it does not fill unsupported paint gaps merely to hide them.

[Interactive column candidate](/workspace/scratch/unbc-column-followup-20261015/index.html) · [All candidates, CSV](/workspace/scratch/unbc-column-followup-20261015/column-candidates.csv) · [Classification and retained reasons](/workspace/scratch/unbc-column-followup-20261015/column-classification-summary.json).

[Six new cases, before and after](/workspace/scratch/unbc-column-followup-20261015/new-column-gallery.html): Library, Teaching and Learning Centre and additional floors, captured from the actual source-derived canvas at matching cameras. Every comparison checks that the canvas drawing changes when the merge setting is enabled.

## Measured column-layer export optimization

A separate exported 2D layer combines valid positive-area paint fragments only within the same level/native column owner. It preserves the column footprint, curves and holes. For any invalid or zero-area input owner it retains all original records. It does not replace circular columns with boxes, simplify corner angles or alter source/routing geometry.

Across the seven overlapping views, the layer has 19,050 original drawing records and 5,848 combined records; these are drawing records, not physical column counts. The comparison files use identical metadata and original floating-point projection precision.

| Standalone 2D column drawing layer | Original fragments | Combined by owner | Reduction |
| --- | ---: | ---: | ---: |
| JSON | 6,270,560 bytes | 3,725,712 bytes | 40.6% |
| Gzip | 1,460,211 bytes | 1,288,388 bytes | 11.8% |
| Brotli quality 5 | 288,740 bytes | 221,634 bytes | 23.2% |

The Brotli saving is about **67 kB in this standalone drawing-layer sample**. It cannot be subtracted directly from the production package: the current prepared format shares and compresses geometry differently. Columns are worthwhile to simplify visually, but they are not the largest transfer-size target. The bigger export task remains a compact visitor drawing representation, reduced repeated metadata and optional architectural inspection assets.

[Layer benchmark and exact compression round-trips](/workspace/scratch/unbc-column-followup-20261015/column-layer-benchmark.json) · [Independent footprint samples](/workspace/scratch/unbc-column-followup-20261015/column-layer-membership-checks.json).

## Verification and delivery limits

- [Column overlay checks](/workspace/scratch/unbc-column-followup-20261015/column-verification.json): all per-view proposals checked against original source and published material; all earlier candidates retained; independent output validity/coverage checks.
- [Browser checks](/workspace/scratch/unbc-column-followup-20261015/browser-verification.json): all 1,864 identities, seven views, source-room selection, detailed/suggested comparisons, hospital images and mobile layout.
- [Settings checks](/workspace/scratch/unbc-column-followup-20261015/settings-verification.json): persistence/reset, automatic/locked zoom modes, per-view candidate counts, detailed restoration, downloaded source-bound recipe and mobile layout.
- [Final receipt](/workspace/scratch/unbc-column-followup-20261015/final-receipt.json): source/manifest checksums and artifact hashes.

The interactive candidate is a Canvas 2D study. The compressed column files are standalone 2D display exports; the production loader does not consume them, and they do not represent three-dimensional column heights. No new complete production-map size is claimed. Exact route obstacles and the sealed published assets remain unchanged. Computational review covers every source column key; visual inspection is representative and does not certify every physical enclosure or clearance.
