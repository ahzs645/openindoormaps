# UNBC visitor-map detail study — 15 October 2026

The hospital comparison supports a simpler visitor drawing for UNBC. Keep room identities and real shapes; reduce architectural layer emphasis, repeated paint edges, column contrast and label density. A source-derived interactive 2D preview is complete at [/workspace/scratch/unbc-visitor-style-20261015/index.html](/workspace/scratch/unbc-visitor-style-20261015/index.html).

This is a display study, not a production map change or a new navigation/accessibility certification. The canonical authoring ZIP, source model, published map assets, room geometry and navigation remain unchanged.

## Complete computational inventory

All **1,864 unique place identities** were inspected, counting each identity once across the **seven overlapping exported floor views**. All seven prepared payloads were decoded with the existing checksum/binding-checking decoder, under the final `ce04f9a8…` manifest and `681e71a5…` preparation engine. Source annotations, source compiled enclosures, actual exported raised blocks and native paint fragments are separate populations.

These are seven exported scopes, not seven independent complete campus storeys. The auxiliary Floor 1.5 view contains sparse published physical geometry and no matching room-annotation inventory. The preview draws that scope as provided and fits its physical floor bounds; it does not reuse another floor's rooms or certify a complete floor from a sparse view.

| Population | Count | Median outline vertices | 95th percentile |
| --- | ---: | ---: | ---: |
| Hospital room/unit polygons | 5,591 | 5 | 9 |
| UNBC source compiled enclosures | 1,362 | 17 | 63 |
| Source enclosures of UNBC exported raised blocks | 1,213 | 16 | 60 |

Vertices exclude an exactly repeated closing point. These populations have different semantics and campus coverage; the table compares drawing complexity, not equivalent room counts or physical correctness. **5,144 / 5,591 hospital units (92%) have eight vertices or fewer.** The hospital retains irregular rooms and detailed exterior walls; it is not just a collection of rectangles.

UNBC has 1,835 identities associated with native paint and 1,213 with a raised block in at least one exported view. The remaining 651 have no such block: 319 carry circulation flags, 76 stair flags and 266 neither. Absence of a raised block is not automatically a defect: open named areas, restricted/staff spaces and unsupported enclosures require their own interpretation. This study does not silently close or raise them. Visual inspection is representative; computational inventory coverage is complete.

The Main scope alone contains **24,090 native fill pieces** and **44,183 material pieces**, including **8,716 column-classified fragments**. Those fragments correspond to 788 distinct level/element keys, not 8,716 separate pillars or a certified count of free-standing physical columns. Across the source dataset, window presentation retains 45,669 component records. Much of the apparent detail is architectural segmentation rather than additional rooms.

## Representative rooms

| Place | Compiled enclosure vertices | Associated native paint pieces, maximum per view |
| --- | ---: | ---: |
| 05-342 — Seminar | 10 | 8 |
| 09-200 — Theatre | 29 | 19 |
| 05-173 — Classroom | 116 | 110 |
| 05-324 — Multipurpose Room | 252 | 182 |

Paint-piece counts can be shared across several identities in an open native area. They are not exclusive pieces owned by each named room. The audit records the maximum per view instead of summing overlapping Main/combined-floor copies.

Room 05-173 demonstrates why its 110 paint pieces should receive one exterior selection outline. The preview uses the exported `nativeBoundaryPartsFeet` perimeter; it does not stroke every contained piece as a room division. Earlier prototype captures with internal highlight edges are explicitly retained as superseded files.

## Recommended final presentation

1. **Campus overview:** grey building areas, mint circulation and major building labels. Structural columns, room numbers, member outlines and detailed connector symbols recede. Preserve real openings and floor boundaries. Automatic zoom reveal remains the natural default; the existing permanent-overview preference can remain available.
2. **Building/floor view:** quiet room blocks and thin true room boundaries, restrained colours for destinations such as washrooms and teaching spaces, source connector icons, and room numbers when there is enough screen space. Show long names primarily for the selected place or on request. Keep every room identity searchable.
3. **Columns:** retain free-standing obstacles at close zoom. Use one neutral grey fill shared with walls and no extra ring outline. The optional **Merge enclosed / between rooms** comparison absorbs eligible column paint into adjacent room masses and continues source straight-wall profiles only inside original column material. Simply hiding column paint leaves white circular cut-outs in some room footprints; that separate comparison is not the recommended visitor display.
4. **Architectural detail:** keep individual window/frame members, detailed doors and stair surfaces in a separate detail/inspection mode. Their geometry and navigation restrictions remain effective even when their drawing emphasis changes. A stair symbol does not approve a held connection.

The hospital has no separately named Column layer in the imported source. That does not prove that it contains no physical columns: they can be represented inside generic walls or unit outlines. Its clearer appearance comes from its drawing hierarchy and relatively simple unit silhouettes.

## Corner angles and viewing angles

Every corner in all 1,864 annotation outlines, all 1,362 compiled enclosures, the 1,213 exported-block source enclosures and all 5,591 hospital unit polygons is retained in [the complete corner CSV](/workspace/scratch/unbc-visitor-style-20261015/all-angle-corners.csv). The following summary uses interior-angle bins within ±1° and excludes corners with either adjacent edge shorter than 1 cm. Those short corners remain in the audit and source geometry. Winding is normalized; hole angles face the room interior.

| Interior angle category | UNBC compiled enclosure corners | Hospital unit corners |
| --- | ---: | ---: |
| 90° | 13,131 | 23,867 |
| 270°, inward notch | 9,013 | 2,042 |
| 45° / 135° | 145 | 417 |
| 225° / 315°, inward diagonal | 58 | 164 |
| 60° / 120° and inward equivalents | 40 | 6 |
| Approximately 180° | 2,105 | 4,324 |
| Other oblique / faceted angles | 3,961 | 569 |
| Near 0° / 360° | 9 | 0 |

UNBC's many short recesses and inward notches contribute to its complicated silhouettes. “Other” is not a count of curves: polygonal facets and irregular straight boundaries also appear there. Keep intentional diagonals, curves and recesses; do not snap every room to 90°. Nearly straight vertices are candidates for separately checked redundant-vertex removal, not automatic deletion under this diagnostic binning tolerance. [Full angle report](/workspace/scratch/unbc-visitor-style-20261015/angle-types.json).

Camera angles are separate. The hospital example has flat 2D at 0° pitch and 3D at 40° pitch, with a −45° default bearing. The UNBC prototype is flat 2D. The actual hospital 2D/3D captures are included in its reference tab.

## Optional column absorption study

The classifier examined all **1,512 source level/element keys**, of which **1,413** occur in the published column layer. These are source/display keys, not a certified count of free-standing physical pillars. Overlapping views are deduplicated for the unique-key counts.

There are **15 keys with a display-only proposal in at least one view**. Per-view proposal counts are 8 Main, 3 Floor 3, 1 Basement, 8 combined Floor 1, 0 Floor 1.5, 0 Floor 2 and 3 Floor 4. Main and combined Floor 1 repeat the same eight proposals. The initial broader 20-candidate Main inventory was reduced to eight after checking the actual published column footprints; the other twelve remain unchanged.

Eligibility requires source/published footprint agreement, checked published floor coverage, separation from door/connector approaches and open circulation, plus an enclosing room mass or a supported junction between room blocks. For junctions, the diagnostic classifier derives a straight band from an adjacent rectangular source wall profile and clips it to original column material. The remaining material receives the adjacent room colour. The renderer clips overlays to that material mask. It adds no physical wall area, does not close actual source-wall gaps, and keeps original geometry in the embedded dataset. The comparison also suppresses original column paint for those candidates and trims their circular room/selection-outline ink with a 0.3 mm drawing tolerance, so a faint outline halo does not remain. This trims drawing strokes, not physical geometry; the first halo-bearing capture is retained as superseded.

The classifier uses floating-point geometry, a 6 cm diagnostic collar, 2.5 cm near-wall queries, a conservative 75 cm approach query and small numerical residual limits. These are display-proposal guards, not exact physical clearance certificates. Invalid inputs and uncertain source/published matches are retained. Floor 2's projected numeric floor guard is unavailable, so all its columns remain unchanged; that is not a new physical-source defect or a routing finding. [Full classification and retained reasons](/workspace/scratch/unbc-visitor-style-20261015/column-classification-summary.json).

## Settings and smaller published exports

**Simplification must be optional and reproducible.** The prototype now provides remembered, reversible controls for columns, palette, room outlines and names, plus automatic zoom reveal, locked grey overview and locked room view. Detailed mode restores the original architectural drawing while preserving visitor choices. Reset restores the starting settings. **Save settings recipe** downloads the selected choices and source binding. This recipe explicitly marks production export options as proposals; no production exporter consumes it yet.

View controls change the drawing after data is loaded. They do not reduce the current download size. A separate export preset must produce smaller visitor display assets:

| Option | View effect | Export effect / requirement |
| --- | --- | --- |
| Palette, labels, zoom reveal | Changes emphasis and clutter | No material saving by itself |
| Architectural presentation layers | Suppress window/frame members and stair treads | Omit those presentation assets from the core visitor download; retain connector markers and separate exact route obstacles |
| Same-material batching / duplicate metadata removal | Suppresses repeated paint edges | Write compact display carriers with stable identity lookup; preserve holes and shared boundaries |
| Selective column absorption | Simplifies approved room-wall junctions | Bake a checked, derived display representation; keep all physical column obstacles in routing |
| Redundant collinear vertices | Can reduce outline complexity | Apply a checked display-only algorithm with protected door/connector anchors; retain the original room source |
| Detailed inspection pack | Restores the full drawing | Fetch it on demand, or include it as an explicit offline option |

Offer full-detail and simplified-visitor export presets. A compact export can omit the detailed inspection pack while retaining the canonical authoring ZIP for re-export. A browser can only restore original detail immediately if that detail is already loaded or available as an optional asset. It should fetch that asset on request rather than pretending a styling toggle can reconstruct discarded geometry.

Do not remove room identities, doorway/connector positions, holes, access rules or exact routing obstacles to achieve a smaller display. Actual-gap closure and angle snapping need separate evidence. Before publishing a new preset, measure real gzip/Brotli core, floor, routing, full offline and optional-detail sizes independently. This study makes no new total-package size claim.

## Existing simplification code

The legacy rectangle-generalization path explicitly returns original geometry when `nativeIndoorEnvelopes` is present: [generalized-room-geometry.ts](/workspace/openindoormaps/app/indoor-project/generalized-room-geometry.ts:454). The corresponding wall and doorway helpers have the same guard. Turning on that older option will therefore not simplify this strict-native UNBC map.

Do not replace irregular rooms with bounding rectangles. If a later export needs fewer vertices, build a separate display representation with protected doorway anchors, openings, shared boundaries and corridor widths; verify overlaps and clearances independently. Exact source/navigation geometry remains separate. The preview does **not** rewrite room rings, snap angles, close real gaps or remove source holes. Its optional column overlays are derived with numeric diagnostic checks and affect paint only. It projects retained polygon vertices to a 0.1 mm drawing grid and changes fill/stroke hierarchy and batching. It is not a new package-size or mobile-performance benchmark.

## Preview and evidence

- [Interactive preview](/workspace/scratch/unbc-visitor-style-20261015/index.html): all seven floor views, building selection, room search, suggested/detailed modes, column comparisons, hospital/mint palettes and a complete searchable place table. Its drawing data is embedded; reference images and downloadable audits are sibling files.
- [All 1,864 places, CSV](/workspace/scratch/unbc-visitor-style-20261015/all-1864-places.csv).
- [Full audit and source bindings](/workspace/scratch/unbc-visitor-style-20261015/all-room-detail-audit.json).
- [Final artifact receipt](/workspace/scratch/unbc-visitor-style-20261015/final-receipt.json): source/manifest checksums, artifact hashes, complete inventory counts and both browser-check receipts.
- [Browser checks](/workspace/scratch/unbc-visitor-style-20261015/browser-verification.json): all identities loaded, style/column modes, room 05-173 and its 116-vertex statistic, audit/search parity, all seven floors, room 05-342 on Floor 3, both hospital reference images, and responsive mobile layout.
- [Settings and column checks](/workspace/scratch/unbc-visitor-style-20261015/settings-verification.json): persistence/reset, automatic and locked zoom modes, all seven proposal counts, same-camera junction comparison, detailed-mode restoration, downloaded recipe, angle table and mobile layout.
- [Downloaded settings recipe](/workspace/scratch/unbc-visitor-style-20261015/verified-settings-recipe.json): actual browser download; export flags are explicitly proposals, with real-gap closure and angle snapping disabled.
- [Numeric column-proposal invariants](/workspace/scratch/unbc-visitor-style-20261015/column-proposal-checks.json): per-view key/count coverage and no derived wall-band area outside original column material. These are not independent physical-clearance proofs.
- [Hospital current-app proof](/workspace/scratch/unbc-visitor-style-20261015/hospital-current-proof.json): actual 2D/3D app captures after source indexing and later rendered frames. The first premature blank captures are retained and are not used as reference images.
- Actual prototype images: [Library proposed](/workspace/scratch/unbc-visitor-style-20261015/suggested-library.png), [same-camera detailed drawing](/workspace/scratch/unbc-visitor-style-20261015/detailed-library-same-camera.png), [hidden columns comparison](/workspace/scratch/unbc-visitor-style-20261015/hidden-columns-library-comparison.png), [05-173](/workspace/scratch/unbc-visitor-style-20261015/complex-room-05-173.png), [mobile](/workspace/scratch/unbc-visitor-style-20261015/suggested-mobile.png).
- Optional merge comparison at one source wall junction: [before](/workspace/scratch/unbc-visitor-style-20261015/column-junction-before.png), [merged](/workspace/scratch/unbc-visitor-style-20261015/column-junction-merged.png). Other round columns remain where they did not pass the merge guards. [Locked overview](/workspace/scratch/unbc-visitor-style-20261015/locked-overview-zoomed-in.png).

The prototype is a Canvas 2D redraw of checked published geometry, rather than a capture of a newly implemented production visitor mode. Hospital images are actual app captures. No route calculation was injected or performed by the prototype. All 28 held stair links remain disabled in the unchanged map.

## Implementation sequence after this study

Build the visitor paint representation separately from exact picking/routing; reuse exported outer perimeters and batch same-material drawing. Add the chosen palette and scale-dependent structural detail to the existing visitor renderer. Preserve the detailed mode and source IDs. Verify all-floor room/picking parity, holes, door/connector locations, desktop/mobile visuals and the existing canonical navigation cases before a new published export. Vertex reduction and low cutaway 3D require their own checked display work; they are not claimed by this 2D study.
