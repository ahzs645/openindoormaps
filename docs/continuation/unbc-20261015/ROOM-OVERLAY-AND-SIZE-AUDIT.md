# UNBC full room overlay and size audit — 15 October 2026

The full computational inventory and old/new overlay comparison are now complete. The latest simplified view retains the original room geometry: all **1,362 compiled source enclosures** match, and all **1,213 prepared/displayed room identities** retain the earlier coordinates across **1,608 per-view occurrences**. The source room area and corner counts have not been reduced. Selected pillar material is recoloured as room paint; it adds no usable floor area.

Visual inspection remains representative. This is not a manual verification of every physical enclosure, access restriction, 3D block or route. No source, canonical master or published map was changed during this audit.

## Whole-map inventory and room statistics

| Measurement | Result |
| --- | ---: |
| Unique place identities inventoried | 1,864 |
| Valid compiled source enclosures compared | 1,362 |
| Unique keys with a prepared/displayed room block | 1,213 |
| Place identities without such a block | 651 |
| Compiled enclosure area, median | 12.03 m² |
| Compiled enclosure area, 90th / 95th percentile | 38.54 / 77.47 m² |
| Compiled enclosure area, minimum / maximum | 0.59 / 783.41 m² |
| Compiled enclosure corners, median before / after | 17 / 17 |
| Total compiled enclosure corners before / after | 33,034 / 33,034 |
| Largest compiled enclosure corner count | 800 |
| Source enclosure area change / symmetric difference | 0 m² |
| Source enclosure minimum intersection-over-union | 1.0 (100%) |

The 651 identities without a prepared block comprise 319 circulation flags, 76 stair flags and 266 other identities. Their absence is not automatically a missing-room defect. There are 149 compiled source enclosures without a displayed block in the exported views. The source-enclosure and prepared-block populations must remain separate. Area distributions are room statistics, not the total campus gross floor area; shared geometry and excluded circulation prevent treating a simple room-area sum as the campus footprint.

Seven exported views were checked. Main and combined Floor 1 overlap; these are not seven independent complete storeys. The Floor 1.5 view contains no matching room inventory and is not certified complete from its sparse physical drawing.

## What the overlays actually compare

1. Match the original sealed style preview to the latest pillar-removal preview by stable room key and exported scope. Verify all coordinate-bearing floor, native paint, wall/column, room-block, stair, door and connector layers are identical. Room identities, names, access and annotation coordinates match for all 1,864 records.
2. Independently compare all valid original and retained compiled source enclosures using union, intersection, added/removed area, symmetric difference and intersection-over-union. Check feet-to-metres area conversion independently. All 1,362 source enclosures are valid and unchanged.
3. Compare actual prepared room-block fill polygons, not selection-outline carriers. Of 1,608 per-view occurrences, 1,599 admit a complete positive-area union comparison; all give zero old/new area difference and 100% overlap. Six unique rounded-display exceptions produce the remaining nine occurrences; their coordinate identity is checked but an invalid polygon is not called a successful geometric overlay.
4. Measure optional pillar-colour additions against valid source enclosures for **all 64 affected room keys**, including a key whose rounded preview fragments are invalid. Keep these apparent additions separate from usable source room area. Check neighboring overlaps on the same native level; do not compare different storeys or sum repeated views.

No invalid polygon was repaired with `make_valid`, `buffer(0)`, snapping or hole removal. Zero/sub-threshold drawing components are counted separately and remain in the input artifacts. The analysis of positive-area unions is not a physical clearance or routing certificate.

## Pillar appearance changes

| Example | Retained source room area | Added room-coloured pillar material | Apparent addition |
| --- | ---: | ---: | ---: |
| 07-790 — Support, largest relative change | 7.62 m² | 0.257 m² | 3.38% |
| 07-114 — Office | 18.83 m² | 0.290 m² | 1.54% |
| 05-136B — Office | 9.45 m² | 0.086 m² | 0.91% |
| 05-324 — Multipurpose Room, largest absolute addition | 161.26 m² | 0.871 m² | 0.54% |

No affected source-room key exceeds the disclosed **5% apparent-addition review threshold**. Every value is retained in the CSV and numeric reports; 5% is a review threshold, not approval or a physical tolerance. The screen-space seam stroke is drawing ink and is excluded from square-metre room measurements. Pillar routing obstacles remain present.

## Precision findings to resolve before a compact export

The area audit did find unfinished display work:

- **Six rounded-preview room identities** have pre-existing invalid positive-area fragments: **03-1007, 03-2065, 05-176, 07-105, 07-168 and 09-362**. They are unchanged between the earlier and latest previews; their compiled source enclosures remain valid.
- Three additional **projected published-display** fragment cases are **04-339, 04-256 and 04-442**. Their projected positive-area union comparison is withheld. This does not label their valid compiled source enclosures defective.
- Added paint overlaps existing neighboring room masks by small amounts. The largest against rounded prepared masks is approximately **0.00001037 m² (10.37 mm²)**; against compiled source enclosures the largest is approximately **0.00000289 m² (2.89 mm²)**. These are recorded rather than relabelled as zero. They do not change source room geometry or routes.
- The preview's original 0.1 mm drawing grid causes a maximum measured net area difference of **0.00923%** against comparable unrounded prepared fills. It can collapse thin components or alter a long internal boundary, so a small area change alone does not certify topology. The paired-vertex precision check separately measures raw vertex movement and preserves the boundary-distance caveat.

Before baking a smaller visitor export, use a consistent coordinate basis for room paint and column patches, protect thin components and holes, and rerun validity, area, shape and neighbor-overlap checks. A future vertex-reduction algorithm needs the same comparisons against this bound baseline. The current styling changes have not implemented that algorithm.

## Current measured export size

| Transfer | Bytes | Decimal MB |
| --- | ---: | ---: |
| Complete Brotli map + manifest | 68,813,392 | 68.81 |
| Complete gzip map + manifest | 88,545,015 | 88.55 |
| Complete offline ZIP | 88,624,604 | 88.62 |

All **228 stored representations** were freshly hashed against the current manifest. The complete ZIP was rehashed unchanged as well. App code, fonts and basemap are additional. These are the current sealed production package sizes. There is no newly measured smaller full-map export from the pillar-removal styling; hiding/recolouring loaded geometry does not shrink the package.

Manifest revision: `ce04f9a8f556d5383968d68b25b52a3ba1bd72d8877d09f1275756aefa5057c3`.
Canonical dataset SHA-256: `31b3bc2d226fe006c404cfb4914ddac723e984c2d2f42cc91d6bdc095b1f2a27`.

## Review artifacts

- [Interactive all-room overlay reviewer](/workspace/scratch/unbc-room-overlay-audit-20261015/index.html) — original/retained source outlines, optional green pillar-paint additions, detail framing, every identity and quality flags. Serve this directory locally for its JSON request.
- [All 1,864 room statistics CSV](/workspace/scratch/unbc-room-overlay-audit-20261015/all-1864-room-stats.csv).
- [Overlay figure](/workspace/scratch/unbc-room-overlay-audit-20261015/room-overlay-examples.png) and [statistics figure](/workspace/scratch/unbc-room-overlay-audit-20261015/room-statistics.png).
- [Audit summary](/workspace/scratch/unbc-room-overlay-audit-20261015/summary.json).
- [All 1,362 source enclosure overlay checks](/workspace/scratch/unbc-room-overlay-audit-20261015/compiled-source-overlay-checks.json).
- [All room/view results and exceptions](/workspace/scratch/unbc-room-overlay-audit-20261015/all-room-overlays.json).
- [All source-room pillar-paint measurements](/workspace/scratch/unbc-room-overlay-audit-20261015/source-room-column-paint.json).
- [Paired vertex precision check](/workspace/scratch/unbc-room-overlay-audit-20261015/paired-vertex-precision.json).
- [Actual export representation checks](/workspace/scratch/unbc-room-overlay-audit-20261015/current-export-size-verified.json).
- [Desktop/mobile reviewer verification](/workspace/scratch/unbc-room-overlay-audit-20261015/browser-verification.json).
- [Checksummed final receipt](/workspace/scratch/unbc-room-overlay-audit-20261015/receipt.json).

Reproduce the analysis in the candidate directory with `python audit.py`, `python proofs.py`, then `python precision-check.py`. The local analytical reviewer runs on port 42569; `verify-review.mjs` checks every identity, coincident source outlines, reversible paint overlays, room lookup, the precision-warning case and mobile layout. Production rendering and navigation are unchanged and are not retested by this analytical SVG reviewer.
