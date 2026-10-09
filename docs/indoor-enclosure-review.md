# Review native room enclosures

## Human review interface

Load the current master ZIP in `/projects/indoor` and choose **Room review**. The browser runs the same visitor-geometry detector as `indoor:audit-volumes` in a separate worker. It checks ordinary and native-height room blocks on every campus floor and native level. The map remains available while it runs; **Stop audit** cancels CPU work.

The default queue contains missing enclosures and differences between display modes. Filter by building, campus floor or native level, finding and review decision. Search by room number, name, source key or diagnostic text. Select a place to locate it on the correct campus floor, compare **2D**, **3D**, **Native heights** and **Source model**, then use **Previous room / Next room** to continue through the filtered queue.

View comparisons return to the selected room after panning. In Room review, Source model clips the room's own native level while retaining the campus GIS datum, so an offset neighbouring storey's slab cannot obscure the reviewed enclosure. Its loading/ready/error status appears beside the comparison controls. Outside Room review the source view retains the complete campus floor section. Source model requires the full master; campus viewer ZIPs omit the source scene.

**Download review report** exports the complete audit, including every scope and current review notes. **Save room review** records a decision and notes in the authoring project. **Export reviewed project**, followed by **Download reviewed ZIP**, creates the portable project containing those decisions. These notes are deliberately excluded from the campus viewer ZIP. A viewer package can be audited but cannot save authoring reviews or show a source model it does not contain.

Decisions are **To review**, **Needs correction**, **Expected shape** and **Reviewed**. They do not modify access, room footprints, display blocks or routing. The geometry finding stays visible even after a human marks the review complete. Changed audited geometry makes earlier decisions stale, retains their notes and asks for another review. Exporting notes alone does not make them stale. Clearing/importing a ZIP resets the audit worker and results; there is no static list of 200 baked into the app.

### Proposed solutions

Choose **Room review → View proposals** to browse every catalog proposal linked to a place in the loaded map. This resets building, floor, search and decision filters; **Geometry finding → Proposed solutions** provides the same subset while retaining your other filters. Intentionally flat stairs/landings, complete room blocks and text-only suggestions are included, not only missing enclosures. Counts use unique room identities across campus/native views. The audit must finish before opening the list. Historical proposals remain visible with an evidence warning; their disabled preview/application controls do not become approved just because they are listed.

Each measured proposal can appear directly in **Room review**, including its likely cause, suggested correction, confidence, related review-group places and prerequisites. The optional bundled catalog at `public/review/enclosure-proposals.json` is data bound to its source model and audit evidence hash; another model does not receive those proposals. **Import proposals** accepts the same compact JSON schema for future reviews. Changed geometry flags the proposal as historical and disables **Use proposal as review notes** until evidence is rechecked.

**Use proposal as review notes** drafts a Needs correction decision and notes; it does not save them or apply geometry. **Save room review** retains the edited note. **Save proposals in project**, then export the reviewed project, makes the complete catalog portable in `rooms.enclosureProposals`. Downloaded review reports also include it. Campus viewer exports omit this authoring metadata. Saving/exporting proposals does not alter routing, restart the audit or stale the catalog by its own rooms hash.

The UNBC authoring folder keeps its active portable catalog in `review-recommendations/review-proposals.json`, with scan reports and supporting evidence in the dated companion folders. Older catalogs remain historical companions (for example `historical-proposals-before-review.json`); they are not silently combined with a newer catalog bound to different geometry. Inspect or import an older catalog separately to revisit its suggestions, then obtain current evidence before applying them. The master ZIP includes its saved catalog and checksummed companions, so the authoring file remains the portable record.

In the loaded master, **Review files → building03-floor3-review-20261004/historical-proposals-before-review.json** contains the earlier 200-item catalog for archived comparison. **View proposals** shows the active catalog, whose remaining recommendations change as supported fixes are applied and audited again. **Native areas → Saved boundary patches** is the separate physical wall-correction log, including proposed and applied patch states. Do not rebind the archived catalog to a fresh audit without rechecking its individual evidence. A retained record can declare its original `evidenceSha256`; the catalog binding remains the default for legacy records. Both bindings must match the current audit before proposal notes, preview or decisions are actionable. A historical record remains visible, but a current catalog does not refresh its approval. Shared patch decisions group only records with the same effective evidence binding. Exported decisions include `proposalCurrent` so an agent can distinguish current choices from historical replies.

**Preview proposed solution** compares an individual saved `nativeBoundaryPatches` recommendation with the original native regions while Room review stays open. A catalog may link a correction using optional `boundaryPatchIds`; otherwise the panel lists proposed patches on the same native level within 0.75 feet of the selected source boundary as _nearby recommendations_, not certified room ownership. Text-only solutions have no invented geometry preview. Stale linked audit evidence disables playback until the proposal is reviewed again.

Playback rechecks the source model, native level, exact original supporting wall footprints and measured door IDs. The native selection worker must reproduce the saved extension's exact footprint/support/width before the comparison appears. Unsupported slab support, protected openings and changed candidate geometry fail the preview; wall patches cannot close a measured navigation portal. **Show original geometry** exits the transient comparison. The saved master, RVT/scene, room boundaries, access and routes remain unchanged. Applying a checked correction still happens separately in **Native areas → Saved boundary patches**, followed by Reviter regeneration.

Portable walkway previews distinguish two kinds. Legacy `slab-supported-walkway` proposals are explicitly **source-outline crops**: they show clear supported floor inside the old stair annotation, and cannot establish the complete landing boundary. New `native-enclosure-walkway` proposals replay the **full uncropped native connected region** with measured doors closed and the unlabelled gap limit at zero. The source outline supplies a seed/identity only. Exact region rings, region hash, native slab/door IDs, contained labels, exposed outer edges and doorway-side checks are saved with the proposal. The replay worker must reproduce them before showing the overlay; unsupported strips, hulls, crops, filled stair apertures and temporary gap closures are rejected.

A full region that contains enclosed room labels, reaches an exposed outer slab edge, or bypasses a measured door remains a **boundary investigation**, rather than a completed blue walkway. Multiple explicitly classified hallway/stair labels may belong to an open circulation area; their mere presence does not certify or disprove the enclosure. Inspect real native walls/glazing and individual joins before repairing them. Heavy connected-region derivation and polygon-equivalence checks run in the preview worker. Previewing never changes access, navigation portals or the source RVT/scene.

**Preview native windows** compares persisted native glazing/frame/panel members with the simplified display on the selected native level. **Show original windows** restores the previous display option. This is a display comparison only: it does not certify a complete room or remove navigation barriers. Available window members elsewhere on the level do not prove that the selected room's own window assembly is complete.

**Preview proposed walkway** supports portable measured landing comparisons in `EnclosureProposal.displayPreview`. The `slab-supported-walkway` payload records the native level, exact supporting slab profiles, clear polygon parts and `sourceGeometryKey` from `proposalDisplayGeometryKey`; the catalog remains bound to the current volume audit's `reviewEvidenceSha256`. Playback rejects changed evidence, slab profiles or level geometry, checks the source stair place, and vetoes unsupported floor, native solid barriers, fixtures, confirmed outdoor exclusions and protected openings. The blue overlay is explicitly a source-stair-outline crop of supported clear floor, not a certified native enclosure, hallway classification or new stair flight. **Show original walkway** discards the display comparison. Retain all original room identities, stair ownership, access and route portals; application requires a separate reviewed source correction and regeneration.

Prepare a catalog from the consolidated solutions ledger and the audit of the same dataset:

```sh
node --import tsx scripts/indoor/prepare-enclosure-proposals.ts /path/to/suggestions.json /path/to/volume-audit.json /path/to/enclosure-proposals.json
```

The converter refuses mismatched model/dataset identities, keeps only displayable proposal fields and derives related groups without certifying merges. Catalog records are proposals, never accepted room boundaries or access permissions.

As of the October 3, 2026 audit, the UNBC master has 1,859 unique mapped places, 1,267 room blocks, 392 intentionally flat places and 200 unsupported enclosures across 5 campus floors / 12 native levels. These are historical counts, not future acceptance targets. Campus and native scopes overlap; do not add both as unique room counts.

## What counts as evidence

| Evidence / symptom                                           | Review action                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source outline / boundary review needed                      | Treat the drawing annotation as a seed or identity hint. Trace native walls, floor support and measured door apertures before certifying a block.                                                                                                                                                                                                                                                                   |
| Prepared display block, but selection has a door-swing notch | A door swing is not a hole in the room floor. Recover the closed-door room enclosure for display; retain the measured threshold and original safe navigation interior.                                                                                                                                                                                                                                              |
| Wall-face mask without a complete enclosure                  | Useful for selection, but insufficient to raise a room. Examine missing wall endpoints, door widths and registered partitions.                                                                                                                                                                                                                                                                                      |
| Room looks depressed                                         | Check actual `stairCutRooms` features in both height modes before changing elevation. Missing volume is often unsupported enclosure evidence.                                                                                                                                                                                                                                                                       |
| Hallway / vestibule / alcove / reception                     | Confirm actual open circulation and named-place identity. Use native floor and wall circulation geometry; do not fill it with a raised room block. Names alone do not establish walkability.                                                                                                                                                                                                                        |
| Staff / off-limits area                                      | Use an explicit reviewed access boundary. Render flat with the restricted colour, exclude public routes and preserve native walls / entrances. An unassigned pin or a closed door leaf does not establish the extent of a restriction.                                                                                                                                                                              |
| Adjacent annotations describe one actual room                | Compare the native partition and doors. Merge with source provenance and retired-key ownership retained; keep distinct enclosures and independent arrivals when a partition exists.                                                                                                                                                                                                                                 |
| Gaps or slivers near stairs                                  | Compare native slab profiles/holes, flight treads, turning landings, terminal risers and door thresholds at their actual elevations. Keep apertures open; a stair outline is not a flat walkable slab.                                                                                                                                                                                                              |
| Huge triangles/strips or fine striping at some zooms         | Inspect validity and tiny clipping fragments; check overlapping/coplanar room and wall faces. Bound numerical cleanup, avoid deleting real narrow partitions, and inspect several zooms/pitches on desktop and mobile.                                                                                                                                                                                              |
| Curtain wall analytical face extends far beyond its host     | Bound any fallback to the native host bounds consistently in both display and routing. Never clip only the renderer and leave a phantom routing barrier.                                                                                                                                                                                                                                                            |
| Square or diamond at a window                                | Check whether a curtain host without solid/oriented geometry fell back to an axis-aligned bounding rectangle while its persisted panels and mullions have precise diagonal footprints. Reconstruct proven host/member sections at the actual cut height, preserve glazing/sill metadata, and use those sections consistently for display and routing. Do not delete unknown assemblies or turn glazing into a door. |
| Nearby elevator / staircase                                  | Match native shaft/flight and served landing geometry. Verify each stop/entrance; never invent stops or wheelchair accessibility from proximity.                                                                                                                                                                                                                                                                    |

Native model coordinates are in feet; display/geographic transforms use the package alignment. A campus floor can include several native levels and elevations. Use the room's actual native slab/elevation, not the nominal campus-floor number.

### Triangles in the source model

Distinguish polygon/clipping errors from lighting and coplanar-depth artifacts. A planar GLB proxy may share vertices with its perpendicular side faces; the exported area-weighted vertex normals then shade the slab along its triangulation diagonals. Compare supplied normals against geometric face normals before changing positions or adding a wall patch. The source renderer uses face shading on non-stair display proxies, preserving the existing reconstructed stair treatment.

Repeated native faces and proxy/native overlaps can independently produce stippling or strips. Test strict depth ordering and bounded native/proxy bias separately from the normal correction. Do not retain a depth experiment merely because the broad shading triangles disappeared: fine interference can remain, especially in software rendering. Preserve transparent glazing and disclose any unresolved overlap. This changes only rendering: preserve GLB/RVT/GIS bytes, real apertures, and routing. Check the actual source view at several zooms and full context on desktop/mobile; inspect both broad planar shading and fine interference separately. A rendering fix does not approve an enclosure or prove the original mesh is complete.

## Reviewing a whole queue

Partition a multi-agent review by building, then check that the combined ledgers contain every expected room key exactly once. Bind each ledger to the same model and dataset revision. Separate automatic measurements, visually inspected native evidence, proposed fixes and applied repairs. A completed investigation does not certify or repair an enclosure.

For a shared native cell, inspect all labels and partial partitions. Tiny unfinished T/return joins can connect otherwise distinct offices into one large cell. Measure the end-cap-to-supporting-wall continuation and compare registered wall faces. Before proposing a closure, independently veto door thresholds, slab voids, neighbouring room ownership and unsupported floor. A failed 5-ft/6-ft doorway experiment does not prove that a wider global limit is appropriate.

Combining named work/reception/counter zones can be appropriate when they occupy one supported open enclosure. Preserve their named places and source keys, distinguish internal back circulation from a public hallway, and retain existing access. Large cells spanning offices, washrooms and stairs are evidence of missing barriers, not permission to merge the entire cell.

Check rejected polygon topology separately from label containment. A `source-label-outside-interior` diagnostic may conceal an invalid or self-touching ring even when the label remains inside. Validate outer rings and native holes explicitly: passing a validator directly to `Array.every` can accidentally use the array index as a geometric tolerance. Small legitimate holes must remain preserved. Numerical normalization candidates require bounded area change, wall/slab support and independent containment checks before promotion.

## Recover an enclosure

1. Start from the authoritative master and record its ZIP SHA-256, dataset revision, model hash, room key, native level and elevation. Check `current-version.json` in the master folder. For UNBC, the authoring file is `/Users/ahmadjalil/Downloads/UNBC.final/UNBC.master.reviter.zip`; derived viewers and branch ZIPs are not independent masters.
2. Inspect the room in the review interface and source GLB/native cache. Trace inside wall faces; inspect nearby native doors, slab edges and holes. Compare independent architectural partitions only when their registration is verified. Store native IDs and measurements in notes.
3. Use measured native door widths to close the display boundary. Unlabelled wall-end gap closure is a bounded display assumption requiring enclosure, alignment, floor and neighbour checks; never globally bridge all gaps or turn a door swing into a floor cutout. Existing 5-ft/6-ft experiments are options, not a blanket default.
4. Diagnose the cause: source classification, unsupported boundary, missed native opening, stale binding or renderer defect. Prefer a general compiler/renderer correction with bounded evidence to an arbitrary polygon drawn around one screenshot. A genuinely manual source review should be model-bound, explicit and repeatable.
5. Preserve room identity, merging provenance, pins, GIS alignment, source RVT/GLB bytes, access rules and connector ownership. A display-only fix must preserve the routing interior and graph. Source geometry/classification changes require native regeneration so prepared presentation, circulation cells and routing share the new binding.
6. Check that the corrected enclosure fits inside native floor support, keeps apertures and adjacent rooms separate, closes door openings only for display, and appears raised consistently in the intended room modes. Verify selection fills on the first click without toggling modes.
7. Test route approaches through the actual door thresholds; test same-floor and relevant multifloor paths. Check that segments avoid native solid walls, voids and restricted areas. Public review allows unknown access with warnings; step-free routing needs reviewed edges and cannot use stairs. A closed source-model door leaf is not itself an access prohibition.
8. Re-run the coverage audit, targeted geometry/routing tests, scoped typecheck and Pages build. Inspect actual 2D/3D/source-model behaviour at several zooms on desktop and mobile. Report exact unresolved evidence rather than claiming all outlines are fixed.

## Commands and code entry points

From OpenIndoorMaps:

```sh
npm run indoor:audit-volumes -- /path/to/master.zip /path/to/report.json /path/to/report.md
npm run indoor:audit-isolation -- /path/to/master.zip /path/to/output-directory
node --import tsx scripts/indoor/audit-outline-boundaries.ts /path/to/master.zip /path/to/outlines.json --report /path/to/outlines.txt
node --import tsx scripts/indoor/audit-room-display.ts /path/to/master.zip /path/to/display.json
node --import tsx --test tests/unit/enclosure-review.test.ts
npx tsc -p tsconfig.indoor-project.json
npm run build:pages
INDOOR_PROJECT_ZIP=/path/to/master.zip INDOOR_VOLUME_AUDIT=/path/to/report.json npm run test:room-review
```

The browser test checks desktop/mobile filtering, floor selection, view comparisons, saved notes, reviewed ZIP export/reimport and audit cancellation against the CLI report. Generate that report from the same master first. Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if an existing Chromium installation should replace Playwright's default browser.

| Responsibility                                         | Entry point                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Shared actual-volume detector / browser worker         | `app/indoor-project/volume-coverage.ts`, `volume-coverage.worker.ts`                                                                |
| Review queue, decisions and stale bindings             | `enclosure-review-panel.tsx`, `enclosure-review.ts`, `package.ts`                                                                   |
| Actual visitor footprints / selection masks / blocks   | `prepared-floor.ts`, `wall-face-floor-masks.ts`, `display-doorway-closures.ts`, `floor-presentation.ts`                             |
| Native floor / stair / ramp clipping                   | `native-floor-ground.ts`, `stair-floor-apertures.ts`, `stair-slab-ground.ts`, `ramp-floor-apertures.ts`                             |
| Runtime route admission and evidence                   | `route-policy.ts`, `routing-graph.ts`, `native-circulation.ts`, `centered-route.ts`                                                 |
| Native extraction and source review in sibling Reviter | `lib/reviter/architectural-plan.ts`, `registered-native-interior.ts`, `model-boundary-review.ts`, `registered-room-presentation.ts` |
| Shared source compilation in Reviter                   | `lib/reviter/indoor-pipeline.ts`, `native-circulation-geometry.ts`, `native-circulation-links.ts`, `room-directory.ts`              |

The native-cache regeneration command is `indoor:regenerate-cache`; inspect its arguments and model hash before use. See Reviter's `docs/indoor-project-pipeline.md` for full source preparation/export. Audit commands produce reports and never silently repair the archive.

Native-cache regeneration also accepts `--native-workers 2` and an optional
`--checkpoint-dir /absolute/path/native-floor-checkpoints` after its three
positional paths. Omit these flags to retain sequential calculation. The
default checkpoint directory is `<output-directory>/native-plane-checkpoints`.
Only completed native physical floor calculations are reused with identical
input/compiler bindings; conversion and earlier connection checks still rerun.
Source identity, retained arrivals, physical connectors and export guards remain
active. See the sibling pipeline guide for deterministic merging and memory
limits; worker checkpoints do not approve geometry or routes.

## Scan curtain-host rectangle fallbacks

`scripts/indoor/audit-curtain-fallbacks.py` compares actual approximate exported host polygons with native bounds and persisted precise panel/frame members. Run it in a task-local Python environment with Shapely 2.x:

```sh
python scripts/indoor/audit-curtain-fallbacks.py /path/to/master.zip /path/to/native-cache.json /path/to/report.json --markdown /path/to/report.md --pins /path/to/pins.json
python tests/unit/curtain-fallbacks_test.py
```

The optional pins file contains an array of `{label, levelId, pointFeet: [x, y]}`. The scanner refuses mismatched model hashes or output paths that overwrite inputs, checks both input hashes again on completion, and counts physical hosts once while retaining every native-level occurrence.

Distinguish broad skewed host bounds from mixed/bent assemblies and aligned host-thickness differences. Area inflation alone does not prove a visible artifact. Report missing native members, actual sill/height, materials and owned doors; incomplete membership prevents automatic replacement. Nearby room/building attribution is a proximity hint and can overlap. The report locates candidates, not approved source corrections or public portals. Check actual cut-height sections and viewer rendering before rebuilding any assembly.

## Publishing a new master

Build a candidate in a task-specific work directory. Reopen both full master and derived viewer exports; verify notes/provenance roundtrip and preservation of original model/GIS bytes, existing unrelated arrivals, connector stops and ramp/stair reviews. A deliberately restricted or merged arrival may change only within the reviewed scope.

Before replacing the canonical master, compare its current hash with the hash captured at the start. If another chat changed it, reconcile the new master instead of overwriting it. Preserve a backup, replace the master and regenerate its viewer together, then update `current-version.json` and verification evidence. Reload/import that exact ZIP for browser proof. Repository pushes and public deployment follow the user's actual authorization; this review workflow adds none.

## Companion folders and native selections

See [Master folder and native area review](native-area-review.md). Import the checksummed master folder to keep reports and recommendations with the authoring export. Native areas uses slabs, precise walls and measured closed door thresholds for review selection; proposals and explicit applications are separate. Applying a classification changes complete checked source identities and may invalidate prepared circulation; regenerate in Reviter before claiming rebuilt connectivity. Preserve voids, disconnected parts, source bytes and portal geometry. Never certify a shared region solely because a native partition is missing.

## Optional native window comparison

For the native/simplified export options, measured member roles, conservative display wall cuts and portable comparison files, read [native window export comparison](native-window-export-comparison.md). Keep source room boundaries, routing barriers and original model bytes intact. A display window opening never authorizes navigation through glazing. Preserve incomplete-assembly fallbacks and distinguish low room-wall display heights from full source geometry. Test both 2D plan openings and separate 3D sill/head bands, the unmapped-structure preference, fresh import resets and both viewer round trips.

### Certified curtain member sections

A glazing member can appear as an approximate envelope in the architectural plan even when the conversion cache contains its closed native BRep triangles. Before declaring an office partition unsupported, check `nativeMeshBarrierCuts` against `native-brep` mesh source, native render provenance and per-triangle element ownership. The compiler's `architecturalPlanGeometry` recovers only complete, unbranched sections of curtain panels/mullions; unresolved proxies remain approximate. Do not fill holes to fit the single-ring plan contract.

Native scene positions use Float32 coordinates. A complete certified section may independently validate the same member's persisted double-precision placed corners within 0.0001 ft (0.0305 mm), preserving physical contacts without converting scene quantization into a wall-gap repair. Cyclic vertex matching, including reversed winding, is required. Mismatching boxes do not replace the section. This tolerance never authorizes closing a physical gap. Record any actual wall continuation separately in `nativeBoundaryPatches`, preserving the original wall thickness and exact supporting source faces. Regenerate both routing and native selection, retain evidence and history in master companions, and compare original source assets and arrivals before promotion.

### First selection camera proof

After a fresh import, select the first review room once and immediately switch to 2D. Wait for floor preparation and camera movement to finish, then verify that the actual room anchor is inside the viewport and its projected boundary occupies a useful number of pixels. A correct evidence panel at campus zoom is not visual proof. Preserve a failed first capture; selecting the room twice must not substitute for a first-click check. Room review's selected-bounds fit controls its pitch together with centre and zoom. A separate pitch-only animation must not cancel that fit.

For a growing authoring bundle, keep a readable compact per-room ledger and retain exact raw scans. New large scans can use an `openindoormaps-packed-review-evidence` JSON companion with `encoding: zlib-deflate-base64`, `originalBytes`, `originalSha256` and `contentBase64`. Decode and verify the original bytes before using them; the canonical verification folder should also retain decoded copies. Never silently replace historical evidence or replies to make space, and keep the existing file/count/total bounds. Packed scans remain evidence, not geometry approval.

When the authoring rooms JSON would exceed its existing 64 MiB limit, package export stores only its review bundle in the `openindoormaps-review-bundle-wire` binary container. Import hydrates the same normal `ReviewBundle` before validation or editing. The length-prefixed JSON header and concatenated file payload are compressed together; raw file storage is allowed only when default recompression reproduces the original companion stream exactly, otherwise that original compressed stream is retained. File order, paths, hashes, bytes, human responses and original `compressedBase64` remain identical after hydration. Existing smaller masters retain their legacy JSON encoding. Decode enforces 1,000 files, 32 MiB per file, 256 MiB total file content, a 1 MiB header allowance and exact whole-container/per-file hashes. This does not raise the rooms JSON limit, archive limits or evidence approval authority. Original model/GIS assets remain separate and unchanged; the source rooms checksum binds the actual serialized wire bytes.

If the packed bundle still exceeds the JSON ceiling because historical scans already contain compressed data, the same container is stored in the fixed `review/companions.bin` ZIP entry. Source rooms retain a small bounded reference; both the reference and optional manifest entry bind its exact length and SHA-256. Import rejects missing, altered, unlisted or incorrectly bound payloads before hydration. The existing 900 MiB archive total and all companion content limits remain in force. Visitor export excludes this authoring entry. Re-export of a smaller hydrated bundle returns to legacy storage and removes the obsolete binary entry.

The whole-level [room selection audit](room-isolation-audit.md) counts every room key once, rejects stale or experimental traces, and records shared or missing native regions without treating label overlap as wall approval.
