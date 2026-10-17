# UNBC pillar removal and wall continuity follow-up — 2026-10-15

The optional **Remove enclosed pillars — join walls** 2D preview removes the circular pillar silhouette, outline and cut-out at the Library junction shown by the user. Incoming wall profiles meet across the former pillar. The earlier junction near **05-136B**, source column `311:1576205`, also loses the unwanted rounded tip beyond its T intersection. The four-way Library example is `311:1576356`.

This is an isolated visitor drawing study, not a production source repair or a newly published map. The original columns, room polygons, real apertures, doorways, access rules and routing obstacles remain unchanged. Free-standing circulation columns and door/connector approaches remain outside this enclosed-column option. The original/subdued column presentation is still selectable.

## Evidence and correction

The earlier checks tested area coverage but did not establish continuity of every incoming wall arm. Historical `data.walls` column records can also be rectangular proxies even when `approximate:false`; their squares are not the actual native circular material sections.

This follow-up reads the canonical original native material query at each relevant level +4 ft, including validated placement corrections, with the checked GEOS engine initialized. It uses actual native column material, retains existing published wall paint, and derives incoming rectangular wall directions from both native and published walls. A T arm stops at the first crossing wall instead of emerging as an unwanted tip in the far room. Only native/published positive material supplies wall paint; original approach gaps outside that material are not physically closed.

The first native-only connectivity check missed two published arms at the four-way junction; visual review caught that omission. The final diagnostic includes published incoming-arm landing probes as well. The 3 cm buffered probes are diagnostics inside existing column material, not physical wall evidence or new map geometry. Some published rectangular profiles stop up to 2.2 cm from the native column section; those original outside gaps are preserved.

A separate drawing-ink collar lets the existing room-colour seam stroke cover the faint circular raster fringe by at most 0.75 screen pixels, bounded to 2.5 cm around the junction. Original walls redraw last. This changes ink coverage only; it does not buffer physical material or routing geometry.

## Scope and verification

- All **37 unique candidate level/column keys**, occurring **56 times** across seven overlapping exported views, are included in the geometry review. These are the optional candidates, not every column or wall in the campus.
- The earlier room-colour overlay could cover existing wall fragments at **14 unique candidates**. Those fragments are now protected and walls redraw last.
- Source-positive/material partition checks and wall-arm connectivity diagnostics are saved with the candidate. Numerical residual tolerance is 1e-9 m² for coverage and 1e-7 m for contact diagnostics; this is not physical clearance or enclosure certification.
- Actual Chromium screenshots show the reported T junction and the four-way junction, other floors, and mobile. Browser checks cover reversible settings, all seven view bindings, automatic zoom reveal and locked overview. Production 3D is unchanged and is not retested by this Canvas study. Navigation is unchanged; no new route calculation is claimed.
- All 46 artifacts in the previous sealed follow-up receipt, the canonical dataset, master ZIP and published manifest were rehashed unchanged.

Candidate and reproducible scripts: `/workspace/scratch/unbc-wall-column-joins-20261015/`. `rebuild.sh` regenerates the isolated drawing from its bound native-material extraction and read-only published inputs. `verify-continuity.mjs` runs against a local server on port 42568. Review the final `receipt.json` for actual check outcomes and hashes.

## Visuals and reports

- [Pillar removed at four-way junction](/workspace/scratch/unbc-wall-column-joins-20261015/join-311-1576356-after.png)
- [05-136B T junction](/workspace/scratch/unbc-wall-column-joins-20261015/reported-junction-map-after.png)
- [Mobile](/workspace/scratch/unbc-wall-column-joins-20261015/reported-junction-mobile-after.png)
- [Preview](/workspace/scratch/unbc-wall-column-joins-20261015/index.html)
- [Material/coverage audit](/workspace/scratch/unbc-wall-column-joins-20261015/wall-continuity-audit.json)
- [Published/native wall-arm audit](/workspace/scratch/unbc-wall-column-joins-20261015/published-wall-arm-connectivity.json)
- [Browser verification](/workspace/scratch/unbc-wall-column-joins-20261015/browser-continuity-verification.json)
- [Preservation verification](/workspace/scratch/unbc-wall-column-joins-20261015/preservation-verification.json)

The full published package remains **68.81 MB with Brotli** or **88.55 MB with gzip** (88.62 MB offline ZIP). Hiding/recolouring this drawing layer does not change that export size. Integrating and benchmarking a separate simplified visitor drawing asset remains a separate exporter step.
