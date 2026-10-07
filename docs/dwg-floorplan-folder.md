# Local floor-plan folder review

`review-floorplan-folder.py` stages the UNBC composite CAD drawings as a separate,
portable review. It compares their named sheets and room identities with the
current prepared master. It does not replace the master, fabricate native Revit
geometry or admit new routes.

```sh
brew install libredwg
python3 -m venv work/cad-review-venv
work/cad-review-venv/bin/python -m pip install -r scripts/dwg-import/requirements.txt
work/cad-review-venv/bin/python scripts/dwg-import/review-floorplan-folder.py \
  --folder '/Users/ahmadjalil/Downloads/UNBC Floorplan' \
  --master '/Users/ahmadjalil/Downloads/UNBC.final/UNBC.master.reviter.zip' \
  --out work/floorplan-review
python3 -m http.server 8765 --directory work/floorplan-review --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. The folder must contain one file with `floor` in
its name and an optional campus DWG/DXF. Conversion preserves the original
bytes and checksums. The UNBC layer and building rules live in `config.unbc.json`.
The composite drawing is **not** globally mapped to GIS: independently drafted
sheets have different origins and may contain multiple levels.

## What the review provides

- A large pan/zoom drawing with a sheet sidebar and searchable room identities.
- Current prepared room polygons in blue, transformed back through the saved
  Reviter registration. Each section needs the same original DWG SHA-256,
  at least three consistent saved anchors, one native level and maximum residual
  of 0.1 ft. Mixed-level sheets retain separate registrations.
- Tentative wall-line polygons in green when they contain a label, or dashed
  orange for nearby matches. Both remain unverified; linework can include door
  swings, frame strips, shared rooms and incomplete walls. Polygon holes survive
  recovery and export. No gap closure is performed by this scan.
- Missing-building and unregistered-floor queues, original source omissions,
  unassigned anchors and separate room-number/sheet-floor evidence. A room digit
  is not used to manufacture a native level or an elevation.
- Per-room responses saved locally, and **Download decisions** / **Download import
  draft**. Responses are bound to the original drawing, exact master and recovered
  candidate evidence. An import draft is authoring evidence, not an applied repair.
- A checksummed candidate ZIP with original CAD files, previews, candidates,
  coverage, registration evidence and campus sidewalk/trail edges. It can travel
  alongside the master and later be attached as its checksummed review companion.

`--reuse-stage` is for local iteration against an existing output directory;
ordinary runs regenerate recovery. Do not use it after changing configuration or
geometry algorithms. Always rescan after canonical master changes; the script
refuses a master changed during its run. The viewer uses the served comparison,
not browser storage from the main project.

## Reviter handoff

The sibling repository already owns saved drawing registration and preparation:
`lib/reviter/dwg-layouts.ts`, `lib/reviter/room-boundaries.ts`, and
`scripts/register-room-boundaries.ts`. Generated `reviter.entities.json` and
`reviter.catalog.json` match that CLI's input shape. A candidate invocation is:

```sh
cd ../reviter
node --experimental-strip-types scripts/register-room-boundaries.ts \
  /path/to/preserved-rooms.json \
  /path/to/review/reviter.entities.json \
  /path/to/review/reviter.catalog.json \
  /path/to/candidate-registered-rooms.json
```

This reconstructs registered wall references without modifying room polygons.
Do not overwrite a curated reference or canonical master from this output without
comparison. For new buildings or missing levels, review panel-to-campus
registration, native floor/elevation ownership and the intended boundary first.
The existing RVT does not gain native slabs/walls by importing a drawing.

To move a reviewed candidate into the prepared project: reconcile against the
latest master, preserve stable original keys and review metadata, register its
sheet/panel, assign a supported native level, resolve shared areas and holes,
review physical or logical entrances, then use the sibling compiler to regenerate
presentation and circulation. Follow `docs/indoor-enclosure-review.md` and the
sibling `docs/indoor-project-pipeline.md`. Visitor elevation, access and routing
require their own evidence; a flat CAD comparison cannot certify a raised room.

## Pathways

`campus-path-edges.json` preserves sidewalk and trail **edge linework** in the
campus drawing's own coordinate system, with no graph edges. Register it using
independent GIS control points and reconstruct walkable polygons before deriving
centerlines. Inspect crossings, outdoor/indoor transitions, door approaches,
stairs and access. Outdoor edges must not become indoor routes. Keep original
path edges as provenance even after a later graph has been reviewed.

## Checks

```sh
work/cad-review-venv/bin/python -m unittest discover -s tests/unit -p dwg_review_test.py
node --test tests/unit/dwg-polygon-holes.test.mjs
```

Also exercise sheet switching, current/candidate toggles, room focus, response
save/export and desktop/mobile layouts in a browser. A generated SVG alone is not
browser proof.

## Separate unplaced building intake

After the coverage review, build a **new file** for the missing buildings. This
is deliberately independent of the canonical master and the coverage viewer:

```sh
work/cad-review-venv/bin/python scripts/dwg-import/build-building-intake.py \
  --review work/floorplan-review \
  --out work/cad-building-intake
python3 -m http.server 8766 --bind 127.0.0.1 --directory work/cad-building-intake
```

The output includes `intake.json`, individual `building-XX.json` files, a
`campus-reference.json`, the original DWGs, a standalone viewer, checksums and
`UNBC.building-intake.zip`. No main map, original Revit geometry or route graph
is changed. The source and conversion hashes must still match the coverage scan.

- Dimensioned geometry is stored in **building-local metres**. Scale is derived
  only from at least three mutually consistent saved drawing registrations.
- Named single-level sheets retain their drawing level. Mixed sheets are split
  into wall-network drafting panels; explicit drawing floor titles take priority
  over room digits. Buffered panel grouping is never exported as a room or slab.
  Preserve detached panels, original labels, panel extents and numbering conflicts.
- Floor orientation uses dimension-preserving quarter-turn/translation comparison
  of straight wall linework. Save both the fit and competing orientation score.
  All non-base fits are provisional; low or ambiguous fits need review. Building
  placement, physical elevations and native level IDs remain null.
- Room rings and holes remain tentative candidates alongside the original wall
  lines. Missing polygons retain their label and source handle. The label count
  is not a verified enclosure count. No physical wall, closure, slab or height is
  fabricated by this stage.
- Stair labels suggest connections only within the same building and matching
  label family. Regular parallel tread runs are independent schematic hints;
  unique nearby runs can suggest an unlabelled link after provisional alignment.
  Label anchors are not landing positions. Entrances, intermediate levels, rise,
  floor support and access remain unverified. Lift lobbies/mechanical rooms do
  not certify a shaft or its served floors. Every link stays ineligible for routing.
- The viewer offers floor selection, ghosted comparison, room focus, stair hints
  and separate orientation/translation reviews. Browser replies are keyed by the
  intake evidence hash. **Download floor reviews** preserves adjustments in a
  separate JSON; it never rewrites the original intake or main master.
- Campus sidewalk/trail edges are approximately georeferenced with the existing
  configured building-centroid controls. Store the unsurveyed method, full control
  pairs, transform and RMS in the separate reference. Edge lines are not walkable
  polygons or route centrelines. Review independent GIS control before merging.

For later consolidation, validate with `app/indoor-project/cad-intake.ts`, review
panel ownership and every uncertain alignment, establish campus control/elevation
and entrance/access evidence, then reconcile the current master. A future intake
UI can retain this JSON as a checksummed authoring companion using
`cad-intake/intake.json`; this stage does not install it into the main project.

Focused checks:

```sh
work/cad-review-venv/bin/python tests/unit/cad_intake_test.py
node --import tsx --test tests/unit/cad-intake.test.ts
```

Exercise orientation save/reset/export, paired stair focus, room search, campus
reference switching and desktop/mobile views. Keep visual proof with the separate
package and report unpaired stairs, missing elevations and uncertain alignments.

## Structured shape reconstruction (separate authoring package)

After building the independent floor intake, extract its CAD shapes:

```sh
work/cad-review-venv/bin/python scripts/dwg-import/abstract-building-geometry.py \
  --intake /path/to/cad-building-intake \
  --review /path/to/floorplan-review \
  --reviter /path/to/reviter \
  --out /path/to/cad-geometry-reconstruction
python3 -m http.server 8767 --bind 127.0.0.1 \
  --directory /path/to/cad-geometry-reconstruction
```

`geometry.json` retains analytic arcs/circles/ellipse parameters, original polyline
bulges, local metre tessellations, original entity handles and source/DXF/intake
checksums. Floor orientation is inherited from the provisional intake, not a new
native/GIS registration. Extraction algorithm and Reviter recognizer hashes are
recorded; the package includes the recognizer snapshot and pipeline source.

Door extraction reuses Reviter's `registered-single-door-swings.ts`: a measured
quarter swing must have a straight open leaf and wall continuation on both jamb
sides. Door swing/leaf strokes are removed only from derived region recovery,
and measured thresholds close those regions independently of visible door
metadata. Unmatched quarter arcs retain their original geometry and individual
review entries. Double doors, unmodelled jambs and doorless openings may remain
unresolved; a curved shape never independently becomes a portal or access grant.

Regular tread runs retain each exact source segment, width, run axis and spacing.
Their rise, direction, landing and served floor support remain unassigned.
Removing a tread or leaf segment must not remove other strokes of the same source
polyline. Parallel face pairs retain measured thickness and footprint as
**candidates**: this shared drawing layer also contains windows and frames. They
are not automatically material-classified walls. Recovery preserves holes and
flags shared room seeds; it never buffers across unsupported wall gaps.

The separate viewer provides original/derived layer controls, individual feature
focus and a 3D schematic with an explicitly illustrative wall height. It does not
certify physical volumes or manufacture stair rises. `reviter.dwg-entities.json`
contains source-coordinate `DwgEntity` input with analytic arcs and exact original
centres/radii; it is not a native Revit model. Reviewed registrations, native floor
support, height, openings/material and connector ownership must precede native
preparation. The original DWGs and current master remain unchanged. No graph
edges, routing admissions or access changes are generated by this pipeline.

Each floor also exports `models/<floor-id>.schematic.glb`: candidate wall strips,
independent door-symbol planes, hole-preserving drawing regions and flat tread
strokes. glTF extras retain source IDs, evidence hashes and the explicit 2.7 m
wall / 2.1 m door preview-height assumptions. These GLBs are review schematics,
not regenerated native scenes. The ZIP preserves the converted floor DXF and a
pinned recognizer snapshot so reconstruction can be rerun without changing the
main master; see its README for the self-contained command.

### Selecting CAD spaces

Every room label in the reconstruction has a clickable, keyboard-selectable map
badge and a matching searchable list entry. Selecting a space shows its identity
and boundary state on the map. A label with no recovered region gets a reference
marker, not an invented enclosure. Shared regions retain all room identities:
clicking their interior chooses the closest label, and the selection card lets
reviewers switch between the spaces in that region. Door/stair/wall inspection
remains separate. Map dragging captures the pointer only after actual movement;
a simple click must reach its label or feature. These selections do not apply
geometry, classification, access or routes.

### CAD preview colours and stair limits

Green marks a recovered drawing region containing one room label; tan marks a
shared region containing multiple labels. These colours express reconstruction
status, not room use or access. A room such as 11-108 Work Area can remain tan
when doorway or partition recovery still connects it to other labels.

Magenta marks exact measured tread runs, not complete stair footprints or
verified inter-floor connections. The detector can retain one terminal stroke
at each end with a bounded 120 mm width variation, at least 90% overlap, one
endpoint aligned within 25 mm and the measured regular spacing within 20 mm.
Ambiguous strokes and arbitrary landing gaps are excluded. Terminal variants
retain original segment provenance; no missing tread, landing or riser is
fabricated. Landings, rise, direction, served floors and routing remain flagged.

### Source-bounded stair and door reconstruction

The abstraction supplements the Reviter single-door recognizer with original
analytic quarter arcs, a measured radial leaf (open or closed), and matching
finite jamb-face contacts. Short jamb caps require an original perpendicular
wall continuation. Ambiguous orientations, absent leaves, floating caps and
solid crossing strokes remain rejected. Thresholds connect the original
contacts; no physical door, access grant or portal is created.

Stair footprints use polygonized original faces and terminal risers, retaining
holes. Tread strokes that extend through a railing may be clipped to the
inside source face; the footprint must cover at least 85% of the measured
treads and cannot contain non-stair room labels. An adjacent closed source
cell sharing at least half a terminal riser can be a landing candidate. This
does not certify a floor, landing height, complete stairwell or route. No
convex hull or buffer becomes a footprint. Four- or five-tread runs are admitted
only near a stair label or recognised flight and after the bounded source-cell
check; the standalone regular-tread detector still requires six.

Use **Source stair footprints and landing candidates** in the separate viewer.
The extracted-feature list focuses each footprint, every unresolved stair item
and provisional matches on another drawing floor. Floor matches require unique
reciprocal footprint overlap under the intake's provisional alignment; physical
elevations and served stops remain unknown. `graphEdges` stays empty.

`detection-review.json` lists remaining shared/missing room boundaries, rejected
door arcs and unresolved stair coverage, bound to the regenerated geometry
evidence hash. Purple dashes show bounded drawing stair footprints, gold shows
possible landing parts. Authoring source DWGs and the native master stay intact.

When polygonization cannot close a flight, the extractor can intersect two
original finite side faces with the original first and last risers. Each corner
must lie on both source strokes; only a 20 micrometre terminal contact tolerance
is allowed for the intake's five-decimal metre rounding. This is not a general
wall-gap closure. Original vertices are retained. Finite-face footprints retain
their four source handles and precision tolerance, and keep closed inner profiles
excluded. A non-stair room label in a flight is an explicit ownership conflict.
