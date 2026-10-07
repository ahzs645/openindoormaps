# Room-by-room display review

Architectural plans sometimes encode a door swing as many ordinary wall-layer lines. The registered display compiler previously polygonized those lines as part of the room boundary, leaving a curved cutout inside an otherwise enclosed room.

The Reviter registered-room compiler now recognises a circular quarter swing only when a corresponding open leaf and straight wall continuation on both jamb sides establish its closed position. It excludes the tessellated swing from display wall barriers and closes the measured threshold along the supported wall faces. The regenerated enclosure must still preserve native walls, columns, floor holes, the unique source label, neighbouring room identities and exact floor support. It does not add a door, graph edge, access grant or routing boundary. Original annotations and architectural reference segments remain unchanged.

The 2026-10-03 review checked all **1,861 mapped areas**, recompiled all **158 registered room enclosures** without losses, and corrected **29 display rooms**: Building 03 (1), Library/05 (4), Building 08 (24). The examples are 05-170 Counsellor PT (one swing, 6.70 ft² restored) and 08-129 Lab (three swings, 34.58 ft² restored). Neither example lost any interior area. Their former swing wedges are visibly filled on desktop and mobile, including selection by map click, preferences updates and switching between 2D and 3D.

The scan still reports **310 source-outline locations** for further native/source review. A separate exact-floor comparison flags **16 non-stair prepared footprints** for review; some involve stepped or tiered spaces, so this flag is not proof that their display is wrong. These areas have not been automatically reclassified or altered. Native stair identities are reported separately from room floor interiors.

Run the read-only per-area scan:

```sh
node --max-old-space-size=4096 --import tsx scripts/indoor/audit-room-display.ts \
  /Users/ahmadjalil/Downloads/UNBC.final/UNBC.master.reviter.zip \
  work/door-swing-review/current-display-audit.json
```

The JSON contains one entry per mapped area, sorted by building, level and number, with boundary provenance, source-geometry binding, exact-floor comparison, closure evidence and any remaining recognised door-swing notch. Repeated scans verify that the input dataset is unchanged. The existing `audit-outline-boundaries.ts` additionally reviews unfinished native wall-face display masks and records their assumptions.

The authoritative working file remains `/Users/ahmadjalil/Downloads/UNBC.final/UNBC.master.reviter.zip`; `UNBC.campus-viewer.zip` is its derived viewing export. Backup and per-area evidence are preserved under `UNBC.final/provenance/` and `UNBC.final/verification/`.

## Measured doorway recess option

Map preferences and project review provide **Show doorway recesses** (off by default). **Show door locations** independently exposes native portal markers in the visitor map. Door identity, connected room keys, measured aperture and route thresholds stay in the dataset regardless of display state. The source model is preserved.

The display helper `display-doorway-recesses.ts` requires a connected measured native door and matching wall-face anchors on both jamb sides. It restores only the supported shallow roomward strip within the measured aperture; it never fills the whole aperture into a corridor, closes an unmeasured wall gap, hulls a room, or changes routes. It clips additions against exact native floor support, walls/columns, protected openings and neighbouring identified interiors. Actual floor holes remain holes. Unsupported/asymmetric alcoves keep their existing shape.

Prepared blocks are assessed before the expanded rendering aperture is subtracted. Only independently verified closure IDs bypass that expanded room-display cut. Native walls retain all actual aperture cuts. Filled door rectangles no longer paint over the continuous room tint; native door markers remain available. Blocks and first-click selection use the same closed display footprint, in 2D and both 3D modes. Both floor presentation and worker cache keys include the option, so changing it cannot reuse the opposite mask.

The 2026-10-04 scan of the canonical master found 674 qualifying measured recesses across 580 prepared rooms on the 12 native levels. These are geometry-qualified display fills, not manual certification of every enclosure. The pictured 10-2036 doorway #2200058 restores only 0.082 ft depth / 0.287 ft² in the prepared block. Other unverified openings remain detailed. Source geometry, source review, access, portals and routing are unchanged.

Shared-region audits are separate. A native cell containing multiple labels can indicate an unfinished partition, a missing curtain extraction, an intentionally open area or a deliberate merge. Preserve source-bound ledgers and propose specific patches; do not turn all shared cells into missing-wall fixes. The new all-building ledgers, source bindings, local correction experiments and doorway display proof are carried under `UNBC.final/review-recommendations/doorway-mask-review/` and embedded as checksummed review companions in the master ZIP. The full preserved native cache supplies original source evidence; derived scan extracts are not replacements for it.
