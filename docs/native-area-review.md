# Master folder and native area review

Visitor Explore treats hallways as map infrastructure rather than selectable destinations. Hallway clicks and explicit hallway searches are ignored; rooms and named open destinations retain their identities. In mixed native components, source outlines identify the clicked room without replacing the native boundary or certifying separation. Authoring Native areas continues to select circulation for review and editing. This selection policy does not alter physical geometry, graph connections or access permissions.

Open **Review project → Import master folder**, then choose the master directory (for UNBC: `Downloads/UNBC.final`). The directory needs one outer `review-recommendations/manifest.json`; nested manifests in provenance backups are ignored. Multiple equally shallow master manifests are rejected as ambiguous. The importer reads its named authoring ZIP and checks the ZIP hash plus every declared companion file's byte count and SHA-256. Saved companions retain their authoritative ZIP paths so response and evidence references survive folder import. It ignores unrelated archives, provenance and backups; it never guesses which ZIP is newest. A mismatched scan/master pair is rejected while the previously loaded map remains intact.

The **Review files** disclosure opens saved recommendations, JSON scan reports, text and PNG/JPEG evidence. These are source material, not instructions or applied corrections. Folder files are compressed into the project's authoring metadata and survive **Export reviewed project**. Campus viewer exports omit the reports and proposed decisions. Original model, scene and GIS bytes are preserved.

Large exact native datasets allow up to 192 MiB for `viewer/indoor.json`; the whole ZIP and expanded archive remain capped at 900 MiB, and the other entry caps and source/checksum checks remain in force. Import validation runs in the package worker. A separate diagnostic preview can retain the existing pending boundary state to block directions and campus viewer export while source release checks remain unresolved. Its route worker skips graph warmup and returns no reachable destinations. Import such a preview with **Import project ZIP**; importing the master folder still selects the manifest's published master, not a newer preview archive.

ZIP loading reports the current validation stage and elapsed time. Choosing another ZIP, clearing the map or leaving the page cancels obsolete import work. Archive checks, bounded review-companion expansion and actual content hashes remain mandatory. Inside the import worker, exact saved-map validation runs in a second worker while the package checks geometry and material bindings; import awaits both proofs and cancels the parallel proof if another check fails. Historical raised-room meshes are still independently validated, but are omitted from the native-map proof snapshot because that validator does not read them. Within one process, a previously expanded review file can reuse its content proof only while its full compressed string, path, byte count and checksum remain identical. Changed native geometry, source bindings, display certificates or companion bytes require fresh validation. Prepared display assets remain tied to the current preparation engine and dataset; changes to validation code require regenerating them rather than rewriting their binding.

The floor presentation worker supplies both the prepared room display and native area display in one validated response. The map shares that original object graph rather than decoding the same complete asset in a second worker. Cache costs include both graphs, charging shared subtrees once; oversized floors remain displayable but are not cached, and their worker releases its full source dataset after completion. Floor changes cancel old exact picking and never display an old floor under a new level. Retrying native display delegates to the owning floor worker and clears its cache. These transport and retention changes do not change source geometry, access or prepared display bindings.

## Drawing a native selection

Choose **Native areas**, then use **Native area floor** to choose an exact native level (not just a campus floor group). Computation runs in a worker. It unions native slabs, preserves slab openings, and subtracts precise native wall/column faces, fixtures and measured door footprints. Doors are considered closed solely to separate selection regions; their route portals remain intact.

Click a native floor region on the map or find it by room number/name in the region list. Its boundary is drawn in orange. Enable **Add to selection** or Shift-click to select several regions; holes and separate components remain separate, with no enclosing hull. A selection can include multiple original room identities; inspect the source partitions before treating it as a shared area.

Use **Drop pin** or **Reference pins** to mark an area of interest while keeping the native outline visible. Placement temporarily pauses region selection and uses the selected exact native level. Add notes, move the dot, or copy/download its review context from the pin panel. Pins and notes travel with the exported reviewed project ZIP; they do not approve geometry or change routes.

Unlabelled gaps stay open. Approximate curtain-host envelopes are excluded and reported, not treated as certified walls. Missing walls can therefore cause a shared candidate region. The selection is a review aid, not automatic enclosure certification. Strict native projects preserve original IEEE floor vertices, nested holes and original material inputs; selection and source circulation use the same bound overlay engine. Legacy projects retain their existing 0.0000000001-foot selection comparison grid. Neither mode authorizes buffering walls or filling a real gap.

Strict native selections now retain exact rational intersection vertices through wall, opening, threshold and enclosure operations. Every positive native face survives, including a face smaller than one square foot; a real narrow connection remains open until a separately checked correction is applied. The published version 3 floor map carries those exact faces alongside its render representation. Map picking validates and queries the exact faces in a dedicated worker, with old requests cancelled when the floor or dataset changes.

Version 3 rendering decomposes each native face into exact finite-edge vertical cells, then constructs convex numeric drawing pieces wholly inside those cells. Both exact differences must prove that the cells reproduce the source face; numeric pieces may not cross a source wall or floor opening. Every positive portion missing from the drawing pieces is stored in a separate exact residual carrier, without an area cutoff. Original representable vertices are retained unchanged in the source carrier and anchor inventory. Fill pieces never supply routing, exclusion or hit-test geometry. Their interior edges are not drawn as room boundaries. Import validation runs in a worker and checks subset containment, residual equality, per-face inventory and unchanged anchors before accepting the saved map.

Flat walls on strict maps use the exact native material sections and exact checked doorway subtraction before constructing contained drawing cells. Their original material descriptor remains authoritative, including portions too small for a numeric drawing cell. Concave wall shapes are not replaced with bounding boxes, and drawing pieces never refill their doorway cuts or alter original jamb evidence.

Registered room contours supply majority-overlap names and room-type colors only. A small corridor claim cannot color a large unresolved native component green. Exact overlap fractions accompany strict name assignments, including fractions too close to one half to distinguish in a display number. Display approximations cannot become exclusion footprints: applying an IEEE footprint requires an exact equality check against its selected source face; otherwise a separate exact footprint correction is required. None of these selection or rendering operations establishes a new entrance or public access.

**Applied provisional seals** lists human-authorized construction assumptions on the current native level. Each remains labelled **Provisional · revisit required**; **Show provisional seal** locates its measured native contacts. Its authorization, source evidence and assumption state travel with the reviewed master. A later correction requires reviewing the source recipe and regenerating the map and routes; locating it in the interface leaves geometry and access unchanged.

**Check the enclosure** reports measured doors whose two sides occupy the same connected native region. Probes sit 0.25 feet outside the aperture's measured depth on its normal axis. **Show door #ID** centres the map on the native door reference. A bypass at another wall join or opening can produce this result; the count does not mean that those doors are defective in Revit. Missing probe support is inconclusive, and distinct regions alone do not certify the enclosure or access. Orange boundaries also trace excluded holes. Contained source place labels are location hints, not proof that the whole room belongs to the selected region. Unselected candidate areas have a faint neutral fill to distinguish them from selected areas.

**Neighbouring areas across doors** lists measured doors with a selected region on one side and an unselected region on the other. **Show connecting door** locates the threshold; **Add area across door** explicitly adds just that neighbouring region. It never traverses every door automatically, changes access, or certifies a route. This distinguishes regions separated for selection from a routing disconnection. Inspect the neighbouring footprint before grouping it, particularly beside an outdoor link. Selecting regions still leaves all application identities unchecked.

**Preview pass-through threshold #ID** explicitly includes that measured threshold floor in the selection trace. It is available for neighbouring regions and same-region door checks, where a closed selection threshold can still appear as an excluded rectangle. This can join the two regions for inspecting a vestibule; it does not remove a physical door, replace a source door with an opening, or change access and routes. **Open thresholds in this selection preview** lists the chosen IDs; **Close selection threshold #ID** restores an individual selection closure. Other preview options are retained. Saved native-area proposals preserve these threshold choices with their geometry binding. Reselect and inspect the resulting region; place identities remain unchecked for application. A real doorless passage or missing routing connection requires a separate evidence-backed source correction and regeneration.

Analytical wall projections can span a measured doorway. For an explicitly opened selection threshold, an existing enabled native door edge with matching door identity and both place keys permits its exact aperture to be removed from that projected wall mask. This affects the comparison only. Unmatched or disabled doors cannot cut a wall; columns, applied repair faces, fixtures and native floor/stair apertures remain protected. The trace hash includes the supporting portal edges, so changed connection evidence invalidates saved previews. Deliberately opened thresholds are excluded from the unexpected bypass count.

## Open entrances, shutters and area partitions

Use **Native areas → Define open entrances and partitions** when a real area has no conventional door. This includes a bookstore/cafeteria Flexiglide shutter, a doorless washroom entrance, and a front/back pickup boundary. These are **logical selection boundaries**: the line separates authoring selections while preserving the real open passage. It is not a wall repair, a closed shutter schedule, a new navigation portal, or evidence that a raised physical room is complete.

1. Choose the exact native level. Select the boundary kind and give it a label and evidence notes.
2. Draw the two ends across the actual opening, or enter/refine their model-foot coordinates. Bounded endpoint snapping reports original and snapped points and source wall IDs. Compare them with the existing returns in Source model. A source room outline supplies identity, not the missing boundary.
3. **Save area boundary proposal** saves a proposal without applying it. **Add another boundary** saves the current line and clears its endpoints and label for the next entrance, retaining the type and evidence notes. Check the new evidence and endpoints each time; snapping and supporting IDs do not carry over. New proposals join the current **Boundary group**. Existing proposals on this floor can join it using **Include in boundary group**.
4. **Preview area boundary: [label]** compares an individual line. **Preview boundary group** retraces all included proposals together over the applied boundaries. Review the resulting areas; another bypass can leave them connected. After a successful current combined preview, check **I reviewed these boundaries and will use them for selection only**, then **Apply boundary group**. Every boundary is validated again in a worker, and the group applies atomically; one invalid or stale member prevents the entire application. Changing the group or geometry clears confirmation. Single-boundary application remains available as **Apply selection boundary: [label]**.
   These actions apply only analytical selection boundaries. They do not alter physical walls, source model bytes, doors, routing, access, or visitor room blocks. **Show native geometry without area boundaries** compares the unmodified selection; **Restore open selection: [label]** removes one boundary's selection effect but retains its evidence.
5. Export the reviewed project to carry `reviewedAreaPartitions` in the authoring ZIP. Reviter preserves the same source/prepared metadata when regenerating. Visitor exports omit these authoring descriptors. Physical evidence changes invalidate a boundary; stale applications are omitted with a warning until reviewed again.

The analytical strip has an explicit numerical width, not construction thickness. Every segment must remain on supported native floor and avoid real floor/stair openings, excluded footprints, measured doors, fixtures and wall interiors. A declared native endpoint must touch an exact non-approximate wall/column face. An explicitly recorded reviewed assumption remains provisional. A **Missing partition** entry is a virtual review boundary; actual wall construction still uses the separately checked reconstruction/patch workflow.

Strict native projects snap and validate against the current original material
faces at the plan and floor-contact cuts. A historical prepared wall or column
box cannot supply an endpoint when its original material section is available.
The checks retain original slab vertices and every real slab hole; old room
drawing opening annotations do not create additional physical holes. Changed
material, indoor-domain or provisional-correction evidence invalidates saved
boundary bindings. Recheck an old boundary against those faces, retain its
history, and preview its effect before applying the updated selection line.

For **07-252/253**, inspect the pickup-front wall returns and separately identify the public pickup frontage and the back work area. Do not infer staff access or a solid partition merely from the separation line. For **07-240 Bookstore** and cafeteria openings, record the actual shutter span and operating context in the notes; an open/closed shutter policy is a separate access decision. Doorless washroom paths should be outlined across their actual entrance, keeping the original public/restricted access and circulation unchanged.

For an **elevator shaft**, use **Draw non-traversable footprint** and choose **Exclude non-traversable footprint**, preserving the shaft/slab openings and each lobby/entrance. Preview and explicitly confirm the complete footprint before applying. A shaft inspection outline cannot be applied as a doorway partition and does not create a lift connector. Served floors, entrance ownership, physical support and accessible routes need a separate connector review. A flat selection boundary does not prove a shaft is safely blocked on other native levels.

## Indoor versus outdoor connections

Native slab support proves a physical surface, not that a connection is indoors. **Native boundary checks** flags a selected component whose exterior reaches an open outer edge of the unioned slabs (at least 0.1 feet). The length belongs to the entire selected component, not a contained room label. Inner atrium and stairwell holes are excluded. Duplicate/subdivided collinear slab edges are counted once; the comparison tolerance is 0.0001 feet, not a wall-gap repair threshold.

An open slab edge can indicate an outdoor walkway, missing wall/glazing geometry or extraction limits. A component with no exposed outer edge is also not certified indoors: railings, low walls and covered exterior paths can enclose a floor-plan region. This diagnostic never changes geometry, classifications, access or routing.

Compare **Source model → Full model context** with the floor section. The normal source view clips from 0.8 feet below the floor through 4 feet above it (campus groups include their offset native levels), so it can hide an enclosure above the section. Full context removes material clipping while preserving the same registration and floor datum; toggle it off to inspect the floor again. Check actual walls/glazing, overhead enclosure and entry doors at both ends. Bounds or a roof/floor above alone do not prove an indoor corridor. Record a confirmed exterior connection separately from an enclosed hallway; if the exact source identity is uncertain, save Needs investigation and evidence rather than applying Hallway.

Use **Native slab focus** to inspect an exact measured slab independently of other connected slabs. This is useful for links whose connected region also contains indoor rooms. Slab identity alone does not certify outdoor ownership; check its entire selected footprint against the source model.

Choose **Outdoors / exclude from indoor map** for a confirmed exterior footprint. **Save proposal** records the recommendation without changing selection or routing. To apply, record evidence, check the full-source confirmation and choose **Exclude outdoors from selection and routes**. This stores a model-bound `indoorExclusions` footprint in both source room metadata and the prepared dataset. It removes the footprint from native selections and existing hallway comparison overlays, and blocks indoor public and accessible routes that cross it, including links without place labels. Checks use exact segment/polygon intersections and native elevation, preserving polygon holes and unrelated floors. Routes may use another supported indoor connection; an outdoor arrival itself is unavailable.

This restriction preserves physical slab, room, graph, RVT/GLB and GIS data for future outdoor routing. It does not close a real opening, change whole-room access, or claim accessible entrances. Export the reviewed master and regenerate in Reviter to remove the footprint from derived circulation too. Authoring import/export rejects mismatched source/prepared exclusion metadata. Campus viewer exports retain the restriction but omit its evidence notes. Cache keys include exclusions so edits invalidate prepared routes and diagnostics.

**Excluded outdoor areas → Restore indoor scope** removes the restriction and retains its decision as a proposal. Regenerate after restoration when a compiled dataset no longer contains the missing indoor cells/branches. The open-edge scan never applies outdoor exclusions automatically. Confirm each native footprint; do not exclude an entire connected indoor component from an ambiguous screenshot.

## Choosing a decision

Enter a label and evidence notes, then select Hallway/open circulation, Staff only walking area, Enclosed room, Off limits, or Needs investigation.

- **Save proposal** stores the native outlines, source model/geometry binding, existing place keys, floor/door evidence IDs, label and notes. It does not change display, access or routes outside the review overlay.
- **Apply classification to map** changes the checked existing places using their source annotations and the existing access-review system. Hallway permits public through-navigation; staff excludes public navigation; off limits disables walking. Names, identities, source polygons and actual door/graph connections are retained. The new area label is a map annotation. Enclosed room preserves its current access instead of assuming it is public. Needs investigation cannot be applied.
- No place identities are selected for application automatically. Check the listed identities before applying: the operation changes each complete checked place, not an arbitrary clipped fragment of it. Unlabelled native regions can receive proposals and labels but cannot acquire invented routing nodes. Restoring blocked areas or reclassifying vertical connectors requires their dedicated source review.
- **Undo area edit** restores the previous project, including access, classification and labels. Saving a proposal after an application is not an undo.

A classification change invalidates prepared circulation evidence when its geometry/access binding changes. Regenerate the exported authoring ZIP in Reviter to rebuild native circulation and any missing connections or merged boundaries. The runtime does not authorize stale circulation or draw new routes across closed walls. Applying a review is not equivalent to recompiling the master.

Saved decisions are model/geometry bound. Older records remain visible but cannot reuse an old selection after native geometry or place identities change. Select current regions to save a new decision. Imported companions retain their original master hash as scan provenance; they are not relabelled as scans of a later edited ZIP.

## Verification

Run `node --import tsx --test tests/unit/native-area-review.test.ts tests/unit/enclosure-review.test.ts tests/unit/model-section.test.ts`, `npx tsc -p tsconfig.indoor-project.json`, and `npm run build:pages`. Use `INDOOR_MASTER_FOLDER=/absolute/master/folder npx playwright test --config playwright.native-area.config.ts` for actual desktop/mobile folder import, proposal persistence, explicit application, undo and native floor changes.

Do not overwrite a newer canonical master with a browser test export. Compare hashes, preserve user pins and other chats' work, and promote a regenerated candidate only after geometry/routing validation.

The local server configured with `vite.editor-test.config.ts` deliberately disables HMR and file watching. Restart that server after source or validator changes, then reload the browser before importing a newly generated ZIP. A successful build alone does not replace its already transformed worker modules; an old worker can reject a current repair mode or miss the current prepared-display engine binding.

## Wall-gap experiments and source patches

**Maximum wall gap (feet)** controls unlabelled wall-end/doorway recommendations, not holes in slabs. Default 0 keeps the source unchanged; compare 5 and 6. The conservative detector pairs aligned, rectangular precise wall caps separated by 0.02–6 feet. It rejects closures without native floor support or intersecting a protected floor opening. It does not repair arbitrary corners, curved walls or an entirely missing partition. Each candidate lists its width, supporting native wall IDs and any overlapping measured doors. “Preview” closes only the selection trace; “Patch” is a separate explicit choice.

**Room focus** limits inspection to one source identity. The crop uses a bound prepared interior when available, otherwise the source outline, explicitly labelled unverified. A focused crop is not proof that the native wall enclosure has been repaired. **Show existing hallway mapping** compares the current bound prepared cells in light blue with teal selection geometry. Native selection includes supported non-circulation areas; it does not infer hallway ownership. Stale or absent prepared cells are not substituted with old outlines.

Legacy version 1/2 comparison overlays use 32-foot display pieces and native-foot triangulation before map-tile quantization. Strict version 3 maps use the contained finite-edge cells and explicit exact residuals described above. Sources use tolerance zero and higher tile precision. Native perimeter strokes stay separate from fill subdivisions; exact source faces drive strict hit testing and decisions. Rendering is not a source-wall repair.

Choose individual Patch checkboxes, record evidence and use one of these actions:

- **Save checked boundary recommendations** stores `floors/rooms.json.nativeBoundaryPatches` with model SHA, exact supporting wall footprints, measured door IDs, width, notes and proposed status. Geometry and routing remain unchanged.
- **Apply checked boundary patches** adds tagged supplemental wall faces to the reviewed geometry. It preserves RVT/GLB/GIS bytes; it does not rewrite the proprietary RVT. Original native IDs are retained as evidence, not invented for patches. It invalidates prepared display/circulation and marks `boundaryPatchState.regenerated=false`. Directions and campus viewer export remain unavailable until regeneration.
- Export the full reviewed ZIP and prepare it in Reviter. Both the native prepass and circulation compiler consume applied patches; native door portals and protected slab openings remain separate. Regeneration rejects model mismatches, changed supporting walls, or applied patches missing from compiled levels. The rebuilt dataset records `regenerated=true` only after all applied faces are included. Authoring import/export checks metadata, state and tagged geometry agree.
- Saved patch cards show notes/status and can resume a preview. Apply only deliberately reviewed candidates, not every preview assumption. **Undo area edit** restores the previous source project. Applying a classification from a temporary closure preview is disabled; first apply the supported patch and retrace.

## Reviewed non-traversable footprints

Use **Exclude non-traversable footprint** when the full source model and the reviewer confirm that an exact part of a slab is inaccessible, such as the narrow lip between a railing and glazing beside a void. This classification does not assert that the area is outdoors. Glass or a railing establishes a barrier to inspect; native slab support alone does not establish a usable walkway, and small pane/frame seams do not prove the cause of an oversized selection.

Select a complete measured native region, or use **Draw non-traversable boundary → Preview non-traversable boundary** for a partial footprint. The crop is intersected with native floor support and retains actual floor holes, doors and separate pieces. Check the precise railing/glazing boundary and both endpoints in full source context before applying. Keep occupied rooms, served door approaches, real voids and adjacent walkway outside the mask. An outline, exposed-edge warning or missing extraction alone cannot authorize it.

**Save proposal** remains separate from **Exclude non-traversable footprint from selection and routes**. Application saves `indoorExclusions.areas[].reason = "off-limits"` in the authoring room metadata and dataset. The same exact XY/elevation mask removes selection, blocks every indoor route profile and is subtracted during Reviter circulation regeneration. It preserves native slabs and source room identities/access, and adds no floor or wall. This is distinct from the older **Off limits** place classification, which changes explicitly checked place walkability.

`reason` is optional for older masters: omission means a confirmed outdoor mask; explicit `"outdoor"` keeps that meaning. Both reasons share identical geometric guards and portable source/prepared binding. Visitor exports retain the reason and mask but omit authoring notes. The interface and route diagnostics describe non-traversable masks without claiming outdoor ownership. **Excluded footprints → Restore indoor scope** retains the review decision as a proposal; regenerate to restore previously removed circulation cells.

## Draw a repair or a partial outdoor exclusion

**Draw wall gap patch** accepts two map clicks on exact native wall faces. Each click snaps within 0.75 feet, and the supported wall IDs and measured gap appear in the recommendation list. The repair strip extends 0.02 feet into its supporting faces and uses their thickness (0.1–1 foot), supporting short corner/jamb extensions as well as aligned caps. It accepts gaps from 0.02 to 6 feet; approximate envelopes, duplicate walls, unsupported floor and protected openings are rejected. Longer absent walls need source reconstruction. Preview happens automatically, but saving or applying still requires a separate Patch checkbox and evidence. `manualPointsFeet` preserves the original input for portable proposal previews; exact wall footprints remain the binding evidence in both apps. A patch does not certify the resulting enclosure: inspect the retraced regions for other bypasses.

**Draw outdoor boundary** cuts a checked exterior portion out of an oversized connected component. Click a simple polygon around only that portion (3–200 points), then **Preview outdoor boundary**. It intersects the trace with actual native slab support and retains all holes, measured door cuts and separate pieces. It is explicitly labelled a user-drawn crop, not a recovered native enclosure. Inspect its orange preview, add a label/evidence and use the existing proposal or confirmed outdoor application. Applying stores the clipped model-bound footprint in `indoorExclusions`, removes it from selection and indoor routes, and returns selection to the uncropped floor so indoor places remain selectable. Resetting a preview is not undoing an applied exclusion; use Undo or Restore outdoor area for that. Source room records, RVT/scene/GIS and physical slabs are retained.

Drawing modes consume map clicks instead of selecting floor regions. Cancel drawing discards draft points. A level change clears drafts, source proposals remain portable, and applying repairs invalidates stale prepared rooms/circulation until Reviter regeneration. These controls do not bulk repair missing facade geometry or automatically certify an outdoor link.

For the current UNBC master SHA `914761c056c9a112901791ff860b63e3a2648ea462b676a726a23e9383abeb8a`, native Floor 3 #400176 yields 71 candidates at 5 feet and 78 at 6. Previewing all yields 272 and 275 regions, respectively, from a baseline of 256. The broad 60-label component around 10-3004 shrinks to five label hints at either threshold, not a certified single room. These are experiments; no bulk source correction has been promoted. Keep further missing-wall investigations in the companion reports.

## Separate correction files and original-model comparison

**Saved boundary patches → Export geometry patch JSON** saves all correction rows with source model/room provenance, exact supporting wall footprints, native door IDs, notes, manual input points and proposed/applied state. **Import geometry patch JSON** checks the original model and exact current wall/level/door evidence; new rows become proposals, even if the file marks them applied. Existing identical applied rows keep their state, while conflicting IDs are rejected. Importing never silently changes walls or routes. Preview and explicitly apply a proposed correction using the current geometry.

The full reviewed ZIP already includes the authoritative correction history in `floors/rooms.json.nativeBoundaryPatches`. Keep the standalone JSON alongside that ZIP for source-model work later. The ZIP's original RVT and GLB remain byte-preserved. Source model → **Show geometry patches** compares reviewed footprints against that original GLB: applied footprints are magenta, proposed footprints orange. This is a floor-plane overlay, not a newly measured 3D wall solid. Toggle it off to inspect the original scene. Full source context and normal floor clipping remain available.

Native selection and the sibling compiler preserve exact wall-face contacts before coordinate reduction: a native vertex within 0.0000001 ft of another wall edge is inserted into that edge before rounding, so both polygons retain a common grid vertex. The compiler uses the same local origin for the full level throughout contact reduction and enclosure construction. This numerical noding introduces no wall buffer and never closes a measured physical gap. It is versioned in geometry/cache bindings. Floor holes and door portals remain distinct. Source wall coordinates are unchanged. A wall-to-wall interval already occupied by a precise column is not a missing wall patch.

Save source BRep/native-coordinate evidence, before/after traces, rejected alternatives and future source-editor instructions with the reviewed correction. Evidence documents are review records, not executable Revit instructions. Recheck exact native evidence when applying the correction to another source revision.

An early regeneration exposed a lost Building 03 entrance (03-2100, native Floor 3) while compiler precision origins were inconsistent. Keep full-level coordinate normalization consistent; do not repair that numerical regression with an invented wall or door. The final regeneration must preserve the original entrance and pass the unrelated-arrival loss guard before promotion. Compiler and runtime generation keys encode the same contact algorithm.

A native slab perimeter can end at an original inside wall face. An exact proposed continuation may need a **maximum 0.0002-foot contact penetration** into that existing solid to make a positive-area contact. The preview preserves its ordinary full-floor test, and allows this special case only for a validated straight original-axis continuation proof with two current original supports. The complete gap between the original faces must remain on native floor; only the tiny contact strips inside those two exact solids can extend beyond the slab perimeter. Native slab holes, source openings, doors, fixtures and foreign walls/columns still veto the full patch. Curved contact chains, ordinary/manual candidates, broader overlaps and unsupported gap bodies receive no exception. This creates no floor, restores no missing wall geometry and changes no portal or access permission. Retain the exact evidence and rerun the sibling physical compiler before claiming a repaired room.

## Find narrow connections

**Native areas → Find narrow connections** is a read-only diagnostic for unfinished partitions and narrow links between larger areas. Set a minimum and maximum cross-section width (0.02–20 feet), and the minimum supported area on **each** side (default 40 square feet), then choose **Scan connections**. It traces the entire selected native level with measured doors closed, independent of temporary gap previews, slab/room crops and current map selection. Source outlines identify label hints only; boundaries come from native support minus precise barriers, fixtures, protected openings and indoor exclusions.

The scanner tests short vertex-to-edge cross-sections through free space. It measures supported width, rejects cuts through solid geometry/holes, and reports actual polygon separation. A **single cut** separates two sufficiently large parts by itself. **Combined cuts** means separation appeared only when other tested cross-sections in that same region were also closed; the saved experiment is not a minimal repair set. Preview shows the tested cuts in magenta and the resulting supported parts in contrasting colours. Real slab holes stay excluded. The preview runs in a worker and never supplies visitor geometry or navigation.

Precise wall supports are reported separately from floor-only narrow passages. A corridor, outdoor connection or intentional unlabelled opening can satisfy the geometric test. Known measured doors are listed separately, including doors whose two sides remain in the same connected region because another bypass exists. **Investigate wall repair** hands a supported ≤6-foot candidate to the existing exact-wall snapping and floor/door/column/opening guards; it does not save or apply a patch automatically. A thin diagnostic cross-section may pass even when a full-thickness physical wall extension fails those guards.

This is a candidate detector, not an exhaustive enclosure certificate. Curved shapes, entirely absent partitions, missing glazing and alternate connections can escape it. Work is capped at 1,500 tested cross-sections per level; a partial scan explicitly reports that limit. Each scan binds the model, source rooms and native geometry hash, records parameters and warnings, and is discarded when the project geometry, native level or size controls change. Filter results by room number/name; the browser shows the first 100 matching findings and the download contains all findings. `Save scan with project` stores a checksummed authoring companion at `connection-scans/level-<id>.json`; export the reviewed project to persist it. Authoring companions have a 256 MiB total allowance, with a 32 MiB per-file limit and at most 1,000 files. Keep historical evidence when saving new responses or applications; download scans separately if the bundle reaches those limits.

The CLI uses the same detector and reports each native level independently, including unsupported levels and partial scans:

```sh
node --import tsx scripts/indoor/scan-native-connections.ts /path/master.zip /path/connections.json 1 40
# Optional final argument focuses one native level:
node --import tsx scripts/indoor/scan-native-connections.ts /path/master.zip /path/floor4.json 1 40 402367
node --import tsx --test tests/unit/native-gap-scan.test.ts tests/unit/pin-recommendations.test.ts
```

The first two numeric arguments are maximum width in feet and minimum side area in square feet; minimum width is 0.02 feet. The CLI refuses overwriting its input, hashes the actual input archive, and detects a master change during computation. It never promotes a ZIP or applies source corrections.

## Reply to pin recommendations

In **Review project**, open **Pin review** in the header. Recommendations occupy a separately scrolling sidebar beside the full-height map (a map above the scrolling panel on mobile). Choose a recommendation from the list or use **Previous pin** / **Next pin**; unsaved answer drafts survive those switches. The interface reads model/rooms-bound `openindoormaps-pin-recommendations` companions named `pin-recommendations.json`; it does not hardcode campus coordinates, pin numbers or the current unresolved queue. Each entry binds a hash of actual dataset evidence, excluding the archive rooms checksum (which also changes when authoring notes or companion files are exported). Each entry supplies a stable recommendation ID, pin identity, evidence files, explanation, review question and optional saved patch IDs. **Show location** returns to the pin. The comparison controls keep the current implementation and proposed changes distinct:

- **Current map** shows the implemented geometry with no proposed overlay.
- **Before patch** traces the native floor regions without the selected correction, using inside wall faces and measured doorway closures. For an applied correction, only its tagged derived wall is omitted in a disposable comparison; other applied repairs remain.
- **Patch overlay** shows the selected patch in magenta. **Patch scope** defaults to the first patch; **Previous patch** / **Next patch** steps through saved patches and centers the map on each footprint. Wall IDs and measured gap width identify the selected join. **All patches together** remains available for coupled repairs.
- **After patch** retraces all affected regions on a temporary dataset containing only the selected patch (or all patches when that scope is chosen). The comparison keeps the recommendation’s place seed so the area and label counts show the effect on the same region. A single repair can leave an alternate connection open; this is explicitly disclosed rather than presented as a closed enclosure. An optional dashed orange outline shows the current native region for comparison.

Selection previews use the full native level, protect floor openings, columns and fixtures, and check model and original wall identities, floor support and measured doors before previewing a patch. Computation runs in a worker. The updated area and place counts describe a boundary preview, not rebuilt routing. 2D rooms, 3D rooms, native heights and Source model remain available. Source model shows the selected proposed patch overlay only in patch/updated comparison modes. Recommendations without saved geometric patches explicitly show that limitation and disable the patch/updated controls. No comparison applies geometry, changes patch status or modifies route edges.

Choose **Accept recommendation**, **Reject recommendation**, or **Need more evidence**, add a reason and save. These are authoring decisions, not geometry approval or patch application. They preserve source identities, access and routes; unresolved geometry guards still apply. Replies bind the recommendation-file checksum and dataset evidence hash and become stale after geometry or evidence changes. They are saved as a separate checksummed `pin-review/decisions.json` companion and retained in reviewed master exports, excluded from campus viewers. **Copy review decisions** or **Download review decisions** includes both the recommendation questions and saved answers for returning to the reviewing chat. Copy has a visible textarea fallback. Export the reviewed master to retain responses with the project.

### Review each patch and preview accepted changes

Room review can also preview an exact saved original-width wall continuation without manual strip-tool points. The worker rechecks original wall evidence, both wall contacts, native floor support, protected openings, measured doors, columns and fixtures before tracing a disposable copy. It preserves the exact saved footprint rather than reconstructing a strip at a different thickness. Distinct colors show all affected native components, including the neighbouring rooms and unlabelled parts. A room-number legend identifies each color; multiple labels in one color remain connected. **Before patch / After patch** toggles the comparison, and magenta shows the extension; **Show original geometry** restores the current comparison. This does not apply the patch or regenerate navigation.

**Room review → Proposed solution → Review this proposal** offers **Accept proposal**, **Reject proposal**, and **Needs more evidence**, with an optional reason. **Native areas → Saved boundary patches → Review proposal decision** exposes the same decision for a linked room proposal. Rooms referencing exactly the same patch set share one decision, so a dividing partition is reviewed once. Acceptance does not apply physical geometry. **Copy proposal decisions** and **Download proposal decisions** include proposal text, exact patch references and saved replies for returning to the reviewing chat. Export reviewed project preserves the checksummed `room-review/proposal-decisions.json` companion; visitor exports omit it. Each reply binds the model, current audited geometry, proposal text and exact patch bytes. Changed evidence makes a reply stale. Native review computes the full-project evidence hash on its worker; a stale catalog cannot receive a current acceptance. After explicit source application, regenerate in Reviter and recheck actual rooms, doors and routes before promoting a backed-up master.

In **Pin review**, choose a single patch and compare **Current map**, **Patch overlay** and **Updated selection**. **Review patches one by one** records **Accept patch**, **Reject patch** or **Needs evidence** for that exact patch. A note is optional; absent a note, the record describes the review action without claiming source verification. **Move to next patch after saving** is on by default; turn it off to stay on the current join. Revisit any patch to change its decision. The progress count distinguishes reviewed patches from accepted patches.

**Preview accepted patches** retraces the original native region with only the currently accepted patches together. Rejected, unanswered and stale decisions are excluded. Individual comparison still excludes the other proposals, so a single join can leave another connection open. Returning to **Current map** shows the implemented geometry. Acceptance and accepted preview do not apply geometry or regenerate navigation. Actual source application remains a separately checked action in Native areas and the Reviter compiler.

Per-patch decisions are portable, checksummed `pin-review/patch-decisions.json` companions, separate from whole-recommendation answers. Each reply binds the recommendation-file checksum, dataset evidence hash and exact serialized patch checksum. Changing a patch, recommendation evidence or dataset invalidates that reply. The accepted-scope worker rechecks those bindings before adding temporary walls and uses the same footprint, model, support, protected-opening and door guards as ordinary comparison. Reviewed master ZIPs preserve the sidecar; visitor ZIPs exclude it. **Copy review decisions** / **Download review decisions** includes `patchDecisions` alongside the recommendation questions and whole-recommendation answers.

## Persisted landing thresholds and reviewed door apertures

Prepared aperture footprints may list the same exact corners starting at a different corner or in reverse winding. The source-to-prepared binding accepts only those cyclic orders, with identical coordinates, topology and normal. A moved corner or crossed ring remains invalid. The preserved source correction and its geometry key stay byte-exact; this comparison does not round or widen the aperture.

The compiler uses the exact reviewed aperture for its own door. Other doors sharing a cut host retain their original host-face measurements; a doorway cut must not alter a neighbouring door's analytical footprint. An exact repeated closing vertex is removed only for the rectangle check, without changing the physical wall outline. Regeneration checks both the reviewed apertures and unchanged sibling doors against their original measurements.

An aperture correction can still leave an unmatched door if a source room outline retreats around its architectural door swing. Recover only the finite, measured-width approach to the existing physical door on each verified owner side. Keep every old polygon point covered, record the additive source annotation separately, and check native floor support, real openings, columns, foreign walls and third-room overlap. A depth or area heuristic is a review flag, not construction evidence. Require the full regenerated door to be connected and enabled with the same checked owner identities before opening its selection threshold. A physical doorway crossing multiple semantic owners needs an ownership/portal review; do not create a wall or discard an owner to force a two-sided match.

`floors/rooms.json.selectionDoorThresholds` and the prepared dataset carry identical model-bound selection defaults. Each row records exact native level, door ID, point, footprint, normal, both source identities and review reason. Defaults apply only while the exact measured door retains its enabled native door edge; changed geometry or routing fails closed. An explicit empty `passThroughDoorIds` permits a closed-door comparison. This authoring metadata is omitted from visitor exports. It does not classify a region as a public hallway, close navigation or remove physical door leaves.

Overlapping source curtain containers can need a separate explicit aperture correction. The sibling compiler consumes `reviewedDoorApertures`: model SHA, exact original barrier parts, measured door width/normal, four persisted native frame records and reason. It carves only checked barriers inside that finite measured aperture, leaving real jambs, columns and exact floor holes. Missing/stale frames, changed originals, unsupported aperture floor or column intersections veto compilation. This manual source correction is not automatic proof that all nested curtain doors are traversable. Preserve the original RVT/GLB/GIS and the exact earlier source footprints in a checksummed companion and standalone sidecar; regenerate routes and presentation, then check the actual door path.

For a physical door blocked by a small overlapping basic partition, `reviewedDoorApertures` also accepts the explicit `basic-wall-overlap` evidence kind. Preserve the original door oriented box, persisted host ID and both exact wall footprints. The compiler requires rectangular parallel basic walls with positive host overlap, limits depth extension to 0.1 foot beyond the original door, follows the exact outer wall faces and preserves the original clear width. Floor support, columns and native cut height are checked. This does not infer an opening from a gap. If a wall continuation shares that partition, refresh its support evidence to the retained cap after the aperture cut and archive the original full footprint. Check both independently selectable rooms and their real enabled door approaches before promoting the master.

A wall continuation is a barrier, never a floor-bridging patch. Its original wall thickness and exact supporting cap must be proved independently. If part touches a native slab opening, keep that whole opening excluded and inspect source context; do not substitute a new floor strip. Verify the room's supported native interior, both door approaches, native-height display and preserved floor geometry after regeneration. An ineffective continuation must stay unapplied.

### Measured original-axis reconstruction

The automatic gap detector and two-click repair tool retain their 6-foot limit. A separately reviewed straight reconstruction can carry `continuationProof: {sourceWallId, sourceCapFeet, targetContactFeet, evidenceSha256}` and span up to 20 feet. This is a source-backed reconstruction capability, not a larger automatic gap threshold. Preserve the complete original wall cap, its measured thickness and perpendicular continuation axis; never split a long span into smaller patches or invent intermediate supports to bypass the limit.

An oblique supporting face may already touch one exact original cap corner. A continuation can retain that zero-distance contact only when the other corner has a positive missing run and the complete original width, axis and first supporting face still pass validation. Negative contact depths and an entirely touching cap are rejected. A sub-nanometre endpoint or T-junction artifact with no missing original material belongs to numerical selection topology review; it does not justify construction geometry. Door, floor-opening, column, fixture, stale-source and compiler/runtime parity checks remain mandatory.

Both cap endpoints must match one whole original source edge, with the original wall behind that cap. Both target endpoints must lie on one original support face. The target may be a native column recorded with `wallEvidence.kind = "column"`; only that exact supporting contact is permitted, while unrelated columns and fixtures remain protected. The footprint retains the whole source cap width and original perpendicular axis. At an oblique target face its far end can be trapezoidal: each endpoint terminates at its independently measured contact, with at most 0.02 feet of overlap. A rectangle that over-penetrates that oblique face is rejected. A rectangular source wall’s long face cannot be supplied as its end cap. Partial caps, lateral shifts, manual click evidence, physical doorway intersections and unsupported floor or protected openings fail the checks.

Save the native element IDs, full footprints and independently registered drawing comparison in a checksummed evidence companion. `evidenceSha256` binds that record; it does not independently certify the layout or approve geometry. Preview the complete repair set, verify actual native enclosures and preserved door approaches, then explicitly apply and regenerate in Reviter. Check visitor blocks in ordinary and native-height modes, routing and unchanged physical floors before promoting the candidate master.

### Coupled room corner previews

A room may have more than one wall bypass. Link the exact saved proposed patch IDs in its enclosure proposal. **Room review → Preview complete boundary solution** traces the complete linked set in a worker, while individual **Preview proposed solution** controls show each join alone. A single repaired join must not be presented as a separate enclosure if another bypass remains. All joins retain their original native wall evidence, full cap width and axis, and pass floor/void, actual doorway and column/fixture checks independently. Each continuation must positively overlap its own original cap. A coupled corner may reach its second original support through other linked continuations only when every link has positive intersection area; point or edge contacts do not certify a complete corner. Single corrections still require both original supports directly. The result must match every saved footprint and the complete linked set; changed model or native evidence invalidates the comparison.

Green shows the disposable resulting region and magenta shows every linked wall continuation. This comparison does not change saved walls, visitor blocks or routes. **Accept proposal** records the room's shared patch-set decision; physical application and sibling Reviter regeneration remain separate checked steps.

Protected-face intersection checks translate both polygons to a local origin and node their comparison coordinates on a 0.00000001-foot grid. This prevents sweep-line failures at nearly coincident exported faces; it does not change the saved source geometry, extend a real gap, or relax floor support. Positive-area overlap with a door, column or fixture still vetoes the preview.

For a missing surround or partition, compare the same model footprint on lower floors as well as the independently registered drawing on the target floor. Save source element IDs, elevations, measured widths and registration evidence. A repeated layout can establish the feature while room use, thickness or end positions differ between floors. Describe reconstructed walls as reconstruction, and expose any adapted dimensions in the proposal; do not call them extensions of a differently sized existing wall. Preview the complete linked set and check both room seeds, floor support, doors, columns, fixtures and openings before application. Lower-floor evidence does not establish a new target-floor door or route.

For curtain joints, report normal gap width separately from directional cap-extension distance. Keep precise glass/frame host membership and assembly-end contacts in the evidence. A candidate that straddles an outer slab edge remains vetoed by the ordinary floor-supported patch workflow; never add floor or fill an inner aperture to make it pass. Separate an incomplete facade loop from intentionally open corridor approaches or a real doorway. A partial preview must remain labelled partial, even if some contacts pass all checks.

### Registered missing structural pieces

A separately checked `drawingReconstructionProof` identifies the preserved drawing checksum, section, independent evidence checksum and exact registered four-corner footprint. It does not treat a room outline as a wall. Explicit contact adaptation is limited to 0.15 feet per corner while preserving the measured transverse width. This capability is reserved for a missing piece supported by independently registered drawing geometry and actual target-floor native wall contacts; its checksum is provenance, not automatic approval.

A missing body may contact both original native supports through a complete positively overlapping set of measured cap continuations. Every member must be connected to both supports through that set. A floating body, widened or self-crossing quadrilateral, unsupported floor, protected floor opening, physical door intersection or unrelated column/fixture still vetoes the whole preview. Apply only after the complete set isolates the intended areas; retain door metadata and regenerate the sibling compiler.

### Lossless historical scan archives

Historical companion scans may be collected into a checksummed `openindoormaps-lossless-historical-scan-archive` inside a `openindoormaps-packed-review-evidence` wrapper. Each original path remains as an `openindoormaps-archived-review-reference` with its original byte count and SHA-256. Decode `contentBase64` with zlib inflate, verify `originalBytes` and `originalSha256`, then recover each `files[].contentUtf8` exactly and verify its saved per-file hash. Current proposals, human decisions and active source recipes stay directly readable. Large immutable source scans may instead use `openindoormaps-lossless-historical-source-archive`: decode each `entries[].contentBase64` with Brotli, then verify that entry’s original `bytes` and `sha256` before restoring it to its declared path. Never overwrite a current file while restoring historical evidence. This saves repeated historical audit data without raising package safety limits or discarding evidence.

### Whole-wall placement and doorway outline corrections

`nativeWallPositionRepairs` preserves the complete original native footprint and a model-bound replacement. A measured normal translation is limited to 0.01 feet; every vertex receives the same offset, retaining the original axis, transverse thickness and length. A named original parallel wall face must establish the actual gap and positive final contact. Runtime and compiler bind both originals, reject stale geometry and protect native floor support/openings, measured doors, columns and fixtures. The compiler can defer physical checks while collecting levels, but must perform full checks before preparing rooms. The prepared footprint is validated idempotently; this is a separately saved source correction, never a thin added wall or RVT byte mutation.

`nativeDoorBoundaryClosures` corrects only the disposable outline threshold at a measured door. It binds the original doorway geometry, enabled physical portal and two exact native jambs. The normal depth remains unchanged, tangent extension is limited to 0.15 feet, and each threshold end needs finite jamb contact over more than half the original depth. Floor holes, unsupported floor and foreign wall/column/fixture intersections veto it. Native selection and room recovery use disposable closure copies; physical door geometry, navigation portals, access and clear width remain original. The early routing pass retains the original physical thresholds; disposable selection closures are checked after real floor and portal evidence exists. Full physical validation remains mandatory before export. Authoring ZIPs retain the descriptor; visitor assets omit the authoring evidence.

A full-cap continuation at a convex native column may declare `targetContactPathFeet`: two first-hit cap-ray contacts joined by consecutive actual original column vertices. Rectangular corners and certified curved sections use the same checks; every intermediate point must be an original vertex and each segment must follow a finite original face. The path progresses strictly across the original cap width. Its footprint retains the original cap width and axis, follows parallel bounded contact overlaps and cannot pass through the column or target its far side. An arbitrary notch, omitted corner, self-crossing polygon or invented support path is rejected.

Legacy comparison recovery used a 1/10,000-foot wall grid and a separate 1/10,000,000,000-foot slab-contact grid. Those grids are not used by strict version 3 native selection or native route authority. Strict operations retain original IEEE coordinates as exact dyadic rationals and generated intersections as exact rational values through serialization. Real nonzero gaps and floor holes remain; no display rounding establishes a contact. The gap-size diagnostic remains separate from physical repair and source-backed corrections still require the ordinary geometry and routing checks.

When a certified native curved column section replaces an approximate box, compare all previously raised visitor blocks before promotion. Keep the certified curve. A missing wall-to-column join may require extending the original full-thickness wall cap to the first native face contacts, following only consecutive convex source faces inside that cap's original strip. Never restore an inaccurate column box or copy stale prepared blocks to hide a preservation regression. Preserve original physical doors and rerun native selection plus ordinary/native-height visitor checks.

### Unmatched measured doorway boundaries

A physical doorway with exactly one known original room side can have an explicitly checked `nativeDoorBoundaryClosures` record with `selectionBarrierOnly: true`. This corrects only a tangent endpoint miss at two distinct original finite jambs. The saved and current doorway must remain unmatched, with the exact original point, normal, rectangular footprint and one room key; no enabled edge for that physical door is allowed. Normal depth, maximum 0.15 ft tangent extension, native floor/opening and foreign wall/column/fixture guards still apply. The correction cannot enable routing or make the doorway a selection pass-through. Connected doorway corrections continue to require their original enabled two-sided physical portal. Record an unmatched arrival separately from successful enclosure recovery and preserve it during compiler regeneration.

Exact column cap chains may preserve notches outside the contacted strip. Require a simple original native column outline, a consecutive locally convex chain containing every intervening original vertex, monotonic lateral coordinates and the first actual column contact across the entire wall width. Test all projected original column vertices and interval midpoints; two endpoint rays alone cannot certify a nonconvex support. Preserve the original column profile and use only bounded cap contact overlaps.

A connected two-sided physical door with its existing supported portal may explicitly declare `measuredTangentLimitFeet` from 0.15 to 0.2 ft for a documented measured jamb miss. The default remains 0.15 ft; unmatched selection barriers cannot use this exception. Both finite original jambs, unchanged normal depth, bounded penetration and every floor/opening/foreign-obstacle guard still pass. Record the exact measured extent and independent physical proof; this field cannot create a portal, change access or widen a normal-depth footprint.

Native region identity uses a retained arrival anchor where available. Rooms without an arrival use a polygon area centroid checked against the existing room interior; a concave boundary or floor hole uses a checked interior triangle instead. Adding finite cap vertices must not move a label into an excluded recess. This label calculation changes neither native boundary geometry nor routing anchors.

### Explicit provisional boxed-entry assumptions

When the human explicitly authorizes an assumption for a missing boxed entry detail, save it as `assumedEnclosureProof`, separate from certified drawing reconstruction. Preserve the three independently registered outer segments in ring order, declare the fourth closing segment as assumed, bind drawing/model/evidence checksums, retain the exact authorization and set `revisitRequired: true`. The supported construction assumption is a small `solid-enclosed-box`; it remains within the ordinary 6-foot limit and at most 0.15 feet of declared rigid translation to reach native contacts. Convex original/final footprints and every exact registered side remain checked; stretching a trapezoidal body or replacing it with an equal-sided approximation fails validation.

This descriptor records provisional construction, not source certification. It cannot add a door, delete a doorway or bypass native floor/opening, fixture, exact original support or whole-set contact checks. Keep it in the separate source patch recipe, proposal text and review report; regenerate before verifying the resulting native selection and actual visitor geometry. Count successful assumption-based enclosures separately from source-verified repairs. Revisit against a site photo or corrected native body; undo only its linked supplemental pieces and regenerate if the detail is actually an open recess. Original RVT, GLB, GIS, physical doors and access remain preserved.

For an existing physical doorway whose one original **basic** host still masks the opening, the separate `basic-host-missing-opening` aperture variant requires one exact native rectangular host, its persisted door-host relation and unchanged native door oriented box. Save the original enabled two-owner prepared door point, normal, footprint and owners with a checksummed evidence file. The aperture follows the exact physical tangent width and normal depth; it cannot reach a host end, cross another wall/column or fill a slab opening. The variant is bounded to a 10-foot measured door width and 2-foot normal depth; curtain-frame and overlapping-wall variants retain their existing 6-foot schema bounds. It cuts only the analytical host mask, preserves RVT/GLB physical leaf geometry and existing access/portal ownership, and requires full regeneration. Compare closed-door enclosure selection separately from the explicit pass-through selection; floor rounding or missing approaches can still prevent the latter even when the host cut is valid.

When an analytical doorway cut and a previously saved wall continuation share an original host, both corrections retain their original source evidence. Restore only host evidence referenced by the wall continuation, and only in a proof copy after checking the current host equals the exact original or the exact original minus all reviewed apertures. For a continuation binding the archived full host, require every actual original contact to remain on retained host material and reject any overlap with the doorway cut. Contextual evidence need not imply physical contact. A continuation already binding an exact retained post-cut piece keeps that ordinary current-piece evidence; proof copies retain both original and current support faces so mixed references cannot overwrite one another. Keep the cut parts in prepared and plan geometry; a native element ID may identify multiple retained polygons. Reimport and preview repeat these bindings without rewriting historical patch bytes.

Unrelated aperture-cut supports do not become precision-certified wall-continuation evidence. They retain their existing native aperture checks, including exact prepared original-minus-cut geometry. A continuation referencing such a support still requires a precise original wall; historical analytical frame masks are not a precision exception.

## Native floor mapping in Explore map

**Explore map → Native floor map** opens a read-only 2D trace of the current campus floor's native levels. Importing or restoring a master or viewer starts in this mode when matching native floor evidence is available. Entering Explore from the authoring project also selects it; **2D rooms**, **3D rooms** and **3D relative heights** retain the prepared room presentation. Projects without matching native floors retain their prepared map.

The native explorer shares the reviewed region tracer with Native areas, using connected regions and a zero wall-gap experiment limit. It retains exact floor/stair holes, checked indoor exclusions, measured door closures, applied/revalidated analytical partitions and persisted selection pass-through thresholds. Unapplied wall proposals, transient experiments, source-outline crops and proposed partitions are excluded. A dashed purple line denotes an applied analytical boundary, not a constructed wall. Stale logical boundaries are omitted with a warning. Native floor support by itself still does not certify an indoor enclosure.

Click a native area to inspect its associated named places. A singleton selects the existing place; a shared region offers individual named-place buttons without merging identities or inventing destinations. Overlapping native levels offer their places with native-level IDs. Search, entrance arrivals, physical door portals, access rules and every directions profile continue to use the same prepared graph. The native outline is a flat map presentation, not approval of a raised room or a routing repair.

Shared areas expose **Find a named place in this area**, matching room number, name, building or native-level ID. The first 20 matches remain visible; **Show more named places** exposes subsequent matches without removing destinations. Physical door and stair controls retain their routing selection when clicked above a native area. Published warning summaries display the full source evidence warning count, even when several warnings are represented by one level summary; unavailable levels add their own warning; strict native levels never retain an outline-based fallback.

Floor tracing and exact display tessellation run in a cancellable worker. Changing floor/building, importing a project or editing its dataset invalidates old results. Strict native mode owns the requested floor immediately: loading, failure and unavailable geometry never expose old prepared room outlines. Worker errors permit retry; failed native levels remain individually flagged. Legacy non-strict projects retain their historical presentation for comparison. Explicit `view=2d`, `view=3d`, `view=relative` and `view=native` links override the import default (`native` is the source-model view). Retain desktop/mobile proof when changing this mode.

New campus viewer exports include a derived `nativeExploreMapping`: exact native region rings and applied dashed boundary lines compiled from the full master, with native floor/door IDs and place associations. It contains no authoring notes, support-proof paths, proposals, decisions or change history. The viewer's physical source/alignment/floor/wall/door/place/fixture/exclusion geometry and supported door ownership are hashed, and the mapping has its own checksum. Viewer import and native playback reject changed or stale bindings. Display preferences can change without changing that physical hash. Older viewer ZIPs can show their available native geometry, but must be re-exported from the current master to reproduce its applied area-selection boundaries and pass-through choices.

Browser viewer export compiles native outlines in a separate worker; the CLI performs the same compilation directly. Export remains asynchronous. These published flat selection outlines are separate from the prepared graph and raised-room presentation: exact master/viewer outline parity does not certify new routes or room volumes.

Native trace workers are one-shot: completion, failure or scope cancellation releases their cloned dataset. Startup/clone/message failures show a retryable native-map error; strict native scopes keep their verified native pieces and never expose old contours. Route workers reuse a completed graph for endpoint or profile changes on the same dataset; importing, editing or clearing a dataset releases the previous graph even before new route endpoints are chosen. Route coverage and destination arrival checks run in that worker too: the directions sidebar never builds a routing graph during React rendering. Import starts an off-thread graph warmup, and a real request can reuse its same-snapshot work while ignoring the obsolete readiness reply. Active route changes still terminate pending CPU work and reject stale responses. Worker input omits only display meshes, native selection tessellation and authoring issue text; physical floor/wall/door/connector evidence and access data remain exact. Persistent policy/geometry caches are confined to the worker's private, immutable clone. Mutable authoring and CLI calls retain per-calculation evidence checks. Profile switches reuse exact ordered physical/access blocker templates and supported native walking checks; public mode removes only step-free vetoes, and wheelchair mode still requires explicit confirmation on every connection.

### Color-coded patch effects

**Native areas → Saved boundary patches → Show applied boundary / Preview saved boundary** opens **Compare this patch** at the top of the sidebar. Use **Before patch / After patch** to see every component of the original connected area in a distinct color, with its room numbers and area in the legend. The preview keeps real polygon holes and measured doorway boundaries; it never invents an independent polygon per room label. Shared labels remain one color and are marked **still shared**. The map fits the complete affected area, including both sides of the correction. Applied corrections have a reconstructed before view; only the selected tagged wall continuation is omitted, leaving other applied repairs intact. Comparison is worker-based, disposable, cancelled when its input changes, and does not alter saved geometry, routes, access or decisions. Room review and Pin review use the same region/color contract.

### Published Explore map and patch colors

Explore uses native floor faces by default when the project has matching source floor geometry. Version 3 of `nativeExploreMapping` retains complete exact rational topology, all positive native faces, contained numeric drawing pieces, positive residual authority, unchanged anchors and room associations for each supported native level. Export reviewed project saves this mapping in the authoring ZIP; Export campus viewer carries the same read-only mapping. For command-line preparation, run `node --max-old-space-size=6144 --import tsx scripts/indoor/prepare-native-explore.ts input.master.zip output.master.zip`, then export the viewer from that candidate. Validate and compare before promoting the canonical package.

Named source outlines assign metadata when strictly more than half their area overlaps one native region. Real holes are subtracted from the overlap. Several identities matching one component stay several identities in one shared area; their names never authorize a partition or replace route ownership. Original seed associations without a majority are retained explicitly as `seed-fallback` for review. Label points lie in the overlap, and only validated displayed levels use them. This changes display positions, never arrival nodes. Native fills use the existing room-type palette independently of custom outline paint; the overview/detail transition uses the existing zoom thresholds. Hallways remain non-selectable. Floor menus use Basement and Floor 1–4 consistently while keeping actual level IDs and graph connectors.

Publication binds original native geometry and applied analytical partitions. Source edits invalidate the saved mapping and require recompilation. Strict native projects never substitute prepared room contours for a missing trace: unsupported scopes remain flagged and unavailable. Older non-strict packages remain readable for review; their historical presentation is not evidence of a repaired enclosure.

Patch comparisons color each actual connected component separately in Before patch and After patch. A multi-patch room proposal compares the whole checked patch group and shows all resulting components, including unlabelled ones. A single patch comparison removes only that patch from a disposable before view. Several labels in one color are still connected; four colors require four actual resulting areas. Current 07-145 / 07-148 / 07-148A / 07-148B remains a shared native enclosure awaiting a supported boundary solution, not a certified four-room split.

### Quiet campus overview

Strict native Explore uses the same contained native floor pieces at overview and detail zoom. Light green identifies public circulation; other areas use their room-type palette or neutral grey. Restricted corridors, non-walkable shafts, real floor openings and checked exclusions remain outside the public circulation tint. The complete exact carrier, positive drawing residuals and original anchors are retained separately from the numeric drawing.

**Highlight mixed hallways** in the Native floor map status panel adds a magenta review overlay for displayed non-green native components containing both circulation identities and other room or staff identities. Choose **Mixed hallway area** to focus one component and inspect its labels. The overlay uses existing native drawing pieces and original perimeters, preserving holes without drawing old identity contours or paint subdivision edges. A missing enclosure or a lone unclassified hallway is outside this mixed-component highlight. Hiding the overlay restores the usual map; it does not apply a patch, alter access, select a destination or change routes. Floor/building changes refresh its issue scope.

Names and type claims come from old room outlines, but those outlines never crop, buffer, restore or supply native floor geometry. Mixed shared components use exact overlap and a unique strict type majority; a small hallway label cannot turn an entire dining hall green. Overlapping claims of the same type cannot double-count their area, and unresolved conflicting claims stay neutral. Unlabelled native faces remain distinguishable from missing geometry. This coloring does not separate rooms, certify an enclosure or change access.

Architectural walls, windows, doorway edges and selection borders appear at closer zoom; review modes retain their evidence detail. Floor borders follow original outer and hole perimeters rather than contained-paint subdivision seams. Outdoor basemap fills are hidden in visitor Explore, with roads retained as context. Source model view keeps the original scene and explicit correction evidence without historical contour or rounded route-cell floor overlays, including when a required native material descriptor is missing. Ordinary and native-height visitor modes share the physical floor datum for floors, stairs and ramps. No display adjustment changes source coordinates or directions.

### Visitor stairs and linked floors

Ordinary walkable stair areas use the same light green circulation palette as
hallways and vestibules. Restricted stair areas retain their access colour.
This presentation does not change the source classification or route permissions.

Select a stair, ramp or lift marker to inspect its compiled connection and use
**Show Floor …** to focus the original landing on that floor. Native floor
polygons are independent two-dimensional surfaces; stair treads and shaft
apertures need not be contained by the flat floor tint. Floor navigation uses
saved enabled connector endpoints, never an inferred overlap between polygons.
An unconnected source assembly remains a review item.

Lift controls show every enabled connected served stop. Stair controls can
continue across flights only through an original shared landing node or an
existing enabled stationary transfer edge with the same room, native level,
surface and exact 3D point. Changing floors selects the actual target flight.
Same-floor landings at different native elevations show their building and
height; matching coordinates alone never establish a route.

Checked `nativeDisplayScopes` can restore exact indoor pieces omitted by the
temporary registered-coverage crop. These are portable presentation corrections,
bound to the original model, native level, region identity and exact region-ring
hash. Clip each correction to the current native face, preserving every physical
opening. Changed native rings invalidate the correction and produce a warning.
Source/prepared package bindings must agree. These scopes never alter selection,
physical walls, access, route nodes or connector edges. An exposed slab or roof
alone does not justify restoring the surrounding apron. Preserve the source-view
review evidence and any incomplete enclosure joins with the master companions.

Native mode hides prepared room geometry for the requested levels while its
worker loads or fails. It shows a loading/error state instead of silently using
old outlines; **2D rooms** remains an explicit prepared-map choice. Native
selection highlighting and camera focus must follow the displayed native faces.
Original names and room types remain identity metadata, not substitute polygons.

`native-slab-ownership.ts` can associate an otherwise unclaimed face with an
offset room on the same campus floor. Require current native-enclosure preparation,
one uniquely matching physical elevation, original floor support, a supported
interior/arrival seed and at least 95% ownership of the whole exact native face.
Competing identities, other campus floors, holes and circulation cannot qualify.
Preserve the original source storey identity, permissions and graph; this recovers
display ownership, not a new route or a physical level correction.

The visitor room map suppresses internal lecture steps when source context marks
tiered seating, or when at least 95% of the exact tread union lies inside one
teaching room on one known floor group. Any enabled native connector prevents
suppression. Preserve room holes; uncertain, cross-floor and outdoor assemblies
remain visible. Source model and authoring review retain the full stair geometry.
`lecture-stair-display.ts` implements this display-only rule; it must not change
arrivals, physical source assets, doors or routing.

Native Explore also associates otherwise unclaimed offset seating slabs with
their theatre in the flat campus view. `native-lecture-ownership.ts` requires
source-matching internal steps, one known campus-floor group, the source building,
a unique teaching-room identity containing at least 95% of the actual tread
union, and at least 95% containment of each exact native component. An enabled
native connector, ambiguous room identity, different campus floor or exterior
component cannot qualify. Named components retain their existing ownership.
Only the flat outline unions these supported pieces, so their native elevation
seam does not resemble a wall. The analytical regions, physical holes, native
levels, graph and source geometry remain separate and unchanged. Authoring
**Native stairs and seating** identifies these as **Tiered seating / internal
aisle steps**; this is a presentation classification, not a new route approval.
At overview zoom, whole native faces render without the small detail triangles;
the grey prepared backing stays beneath both native fill layers. Preserve
physical columns and openings rather than broadly filling small native holes.

An exact native full-cap continuation may declare `targetWallFaceChain: true` when the two first cap rays contact consecutive finite faces at an original basic wall corner. Apply the same local convexity, original-vertex, monotonic width and all-breakpoint first-contact checks as a column chain; do not substitute a target bounding box. Decoded native basic-wall and registered drawing evidence must accompany application. A curved column chain may explicitly declare its exact `originalCapMiddlePenetrationFeet` only for an existing middle contact no deeper than 0.00025 ft, while both original cap corners remain outside. This does not authorize moving the original cap, widening it, deleting a column or choosing its far face. All original physical floors, holes, doors and foreign fixtures remain protected.

### Reviewed lift shaft display and exclusion

A checked `off-limits` footprint may carry `connectorId` to identify its existing lift recipe. The footprint excludes the shaft interior from selection and indoor walking; its lobby stop, served levels, access and source geometry remain separate. For the display icon, use a checked interior area-centroid of the matching exact shaft footprint on that served level, retaining any holes. A legacy compiled lift without a footprint uses its source-bound reviewed shaft reference. An unserved or stale connector retains the old entrance display anchor. Grey shaft shading is architectural context only and never enters the selectable native floor-region list or asserts supported floor in a real shaft void. This calculation never moves a routing node or replaces an enabled connector edge. Source footprint application still requires the current native wall faces, real shaft openings, surrounding floor and preserved lobby/door approach checks.

The exclusion query retains strict walking and arrival checks. Only an exact enabled elevator edge owned by a current source-bound reviewed lift may pass its own shaft footprint during vertical transit. Forward and reverse geometry must match the saved edge and its supported lobby nodes; foreign shafts, exterior masks, walking paths and unsafe endpoints remain blocked. The runtime, diagnostics and sibling compiler use the same guard. Changes to connector, shaft or node evidence invalidate cached routing calculations. Unknown accessibility remains unknown.

### Source-defined indoor routing coverage

An explicitly authorized incomplete corner uses the separate
`nativeProvisionalCornerSeals` descriptor. It binds the exact original finite
contact faces, model and material checksums, physical owner census, immutable
floor support and openings, foreign obstacles and unchanged physical door
portals. Its supplemental footprint does not move or rewrite either original
body, and does not weaken the full-width original-axis continuation contract.
Applied rows require a recorded human authorization checksum, retain
`sourceVerified: false` and `revisitRequired: true`, and can be restored by
removing only that supplemental correction and regenerating. Enclosure rows
using it explicitly bind its descriptor checksum and applied IDs at the actual
finite section heights. Record the human statement and revisit note in the
authoring companion; visitor assets carry only the technical safety binding.
Report these assumption-based enclosures separately from source-verified ones.

A regenerated project can include `nativeIndoorEnvelopes` version 1 in both its source room file and prepared dataset. These model-bound, independently checked native BRep enclosure sections intersect exact native slab support; they do not inherit room trace contours. Each elevation retains native element IDs, section heights, evidence checksums and a checksum of its exact geometry. Import and export reject altered geometry or mismatched source/prepared evidence.

With this evidence present, the compiler builds complete native room/circulation faces, retains physical slab holes and barrier/threshold exclusions, and replaces old walk branches with checked native-cell branches. Source room contours classify ownership only. An ambiguous face overlapping a restricted or nonwalkable identity is unavailable as a whole; clipping the old restricted contour cannot create a public passage. Unproved components remain unavailable, rather than falling back to old outline paths. Existing physical door and vertical connector identities remain separate and keep their access rules. Legacy archives without this evidence retain their earlier bindings until regeneration.

### Native indoor geometry for the main map and routes

A source-regenerated project can provide `nativeIndoorEnvelopes`: exact original
native wall/glazing sections or certified source-owned material footprints,
intersected with original slab support. Each native elevation retains its source
material and floor identities, source-model binding, evidence checksum and exact
geometry checksum. Source annotations and prepared data must carry identical
values. The compiler and reader reject changed checksums or mismatched evidence.

In this mode, registered room outlines provide majority ownership, names, types
and existing access metadata. They never crop the visitor floor, create walking
surfaces or become routing obstacles. Shared native faces with majority-assigned
restricted identities remain restricted as a whole until their physical division
is checked. Physical doors, fixtures, columns, original floor apertures and
reviewed non-traversable footprints remain authoritative. Unverified outer slab
extents stay hidden instead of receiving a registered-outline fallback.

Regeneration removes legacy walking links and rebuilds them within these native
cells while retaining original measured portals and source-supported connectors.
Both stairs and local steps require the same complete original flight, walking
body, width, foreign-material and terminal evidence before routing. A local-step
label or a direct link between room annotations cannot bypass those checks.
Internal tiered-seating steps remain part of the room display rather than an
inter-floor connector. The strict circulation policy binding changes when this
qualification policy changes; an older compiled graph must be regenerated.
An offset native-level alias is valid only on the same independently checked
original slab and physical elevation. A fresh ZIP import opens the native floor
map. Historical contours remain identity evidence; even authoring proposal
previews must use complete native regions in a native-only project.
Preparing the map and routing graph runs in workers. Route profile warmup and
bounded private caches do not change permission or wheelchair-access evidence.
Within a source preparation phase, complete native slab/enclosure intersections
may be reused by exact operand bytes, model, kernel and elevation. This bounded
cache retains every floor hole and positive component; each doorway still
recomputes its own host opening, foreign barriers and complete-face ownership.
Exact orientation predicates compare integer determinants without rounding or
reducing intermediate fractions. These optimizations never approve a connector
or replace missing native geometry.
Local path and footprint checks omit only support shells and holes whose exact
bounds are strictly disjoint from the query tile, before the existing exact tile
intersection. Tangent contacts, intersecting holes and every positive
component remain in that intersection. This broadphase changes no source
coordinates, floor coverage, walking width or permissions.
Exact area comparisons may reuse determinant terms from complete, recursively
frozen rings within a 512-ring, 16 MiB cache. Mutable rings recompute their terms;
every hole, exact multiplier and full-fraction equality check remains unchanged.

For regenerated native projects, reopening the ordinary `view=2d` URL also keeps
the native floor map. The main **2D floor map** control cannot switch that project
back to registered room footprints. A named-room focus selects its complete
native connected component; the registered contour supplies only its identity.
Historical presentation crops can be retired with checksummed source evidence
when their old approval did not establish an enclosure. Retirement preserves
the old review, creates no replacement geometry and does not classify the
uncertified remainder as outdoors.

Strict native mode ignores legacy `record.properties.floorOpeningsFeet` as a
physical mask; original `walkingSupport` slab inner loops already contain the
model openings. Historical doorway paint is likewise omitted. Exact measured
portals remain navigation evidence, and reviewed selection closures still
control how the native floor is partitioned.

A non-traversable named void whose historical outline extends onto supported
floor can carry `nativeFloorOpeningOwnership` in its source annotation and
prepared properties. This is identity evidence, not a new exclusion or access
change. It binds the model checksum, original slab element, actual elevation and
every coordinate of one existing original slab hole. Cyclic start and winding
may differ; displaced coordinates, a different hole, or a walkable identity are
rejected. Name/type association then uses that exact hole instead of the old
void contour. Source floor geometry, physical portals and permission metadata
remain unchanged, and its old review evidence travels with the authoring ZIP.

Strict native publication resolves connected regions within exact native slab support intersected with the verified physical indoor envelope **before** assigning room identities or colors. An exterior apron therefore cannot merge indoor rooms that are separate within the actual enclosure. Registered room outlines supply majority identity/type claims only. The enclosure, floor holes, physical barriers and measured display thresholds supply geometry. **Native slab focus** remains a full-support diagnostic so authors can investigate unenclosed pieces; this diagnostic does not certify them as indoor or outdoor. The source slab bytes stay unchanged, and changes to the verified indoor domain invalidate stored selection and published-map checksums.

Large original material descriptors use a lossless archive representation inside
room metadata. `openindoormaps-native-material-wire` carries bounded DEFLATE JSON,
the exact expanded byte count and SHA-256. Both package readers hydrate and verify
the descriptor before validating source/prepared parity or compiling geometry.
No coordinate is rounded, and the existing 64 MB metadata entry limit stays in
place. This archive representation is separate from review decisions and native
geometry approval.

Separately preserved native frame continuations use `nativeDerivedFrameReturns`.
They retain original native member, host and target identities, original finite
body profiles, exact source floor bindings and a physical-placement checksum.
Original material sections never include the derived continuation. The runtime
replays the measured original full-width axis against the first consecutive
finite target contacts; changing a footprint and recomputing a checksum does
not authorize additional material. Upper rails and headers retain their actual
height and refer to an independently checked floor-supported sibling. They do
not become full-height selection walls. Selection, physical plan material and
routing use only the portion present at the actual queried cut. New descriptor
bytes invalidate native region, published map, route worker and foreign stair
clearance bindings. Removing a correction requires source regeneration.

The native map worker sends verified floor faces and their exact picking carrier before fine wall detail. Its final response contains only wall drawing features, so adding detail does not replace the mounted floor carrier or restart exact picking. Cancelling or changing the floor discards unfinished detail; only a successful complete response enters the floor cache. If wall drawing fails, the verified native floor remains visible with a retry message. Ordinary and native-height visitor modes reuse the same contained native wall pieces rather than repeating rounded plan cuts. A missing strict floor trace never falls back to prepared contour surfaces or rounded route cells.

Finalized packages can retain pre-generated native display assets separately from
source geometry. After source regeneration, exact mapping validation and final
metadata edits, run `node --expose-gc --import tsx
scripts/indoor/prepare-display-assets.ts input.zip candidate.zip`; add
`--native-levels` to prepare individual native scopes as well as public floors.
The command writes a new candidate, prepares the actual visitor defaults, checks
full payload round trips and verifies that every existing source entry byte is
unchanged. Public floor composites, their actual main physical planes and offset
planes receive separate assets; missing published scopes remain unavailable.
Generate viewer assets from the finalized viewer package separately, or request
`exportCampusViewer(project, { preparedDisplay: true })` in the package worker.
Viewer export prepares its stripped, published metadata projection independently,
including edited public names and colors. It never copies or rebinds master
display payloads. Existing prepared masters regenerate viewer assets by default.

`viewer/display/index.json` declares bounded, checksummed compressed chunks.
Only the selected worker inflates them. Exact topology, positive residuals,
source anchors, room associations and contained drawing pieces remain in the
complete payload. Current dataset bytes, preparation engine, floor scope,
building, windows and settings must match. Edits invalidate the assets; damaged
matching assets produce an explicit failure. Cache loading also compares the
native drawing directly with the complete current published exact face inventory,
contained pieces, unchanged anchors and deterministic type fills; a rehashed
payload cannot invent or omit native floor pieces. Wall and raised-room approval
remain separate physical checks. These are display assets, not
geometry approval, enclosure certification or route reconstruction. Unprepared
scopes run current native preparation in workers and never use room outlines as
a floor fallback. Complete in-memory caches also have byte budgets; an oversized
result may display without being retained for reuse.

Importing a ZIP with identical saved review pins keeps the validated project and
original archive bytes. It does not run a pin merge or authoring export merely
to preserve unchanged notes: rewriting the room file changes its source hash and
can invalidate the saved display assets. Genuine pin changes still use the
normal merge and export rules. Folder imports additionally reconcile companion
files; changed companions can therefore require a fresh authoring export.

### Provisional source contact repairs

`contactMode: "original-free-cap"` handles a checked short original member cap that already intersects its convex target over part of its width. It also admits a convex four-corner native member whose actual sides are slightly skewed. The complete original cap, source component and target component remain authority; no vertex is snapped and no saved crop is accepted. Exact target vertices and cap crossings define each free lateral interval. Each added interval must reach the first actual target material within `1e-7` feet, with the named original face participating in a positive interval. Existing target intersections remain unchanged. Long sides, nonconvex bodies, zero contacts, invented subcaps and larger gaps are rejected.

Import and selection independently reconstruct the same free-interval mask from the uniquely matching retained original components. The entire original cap must remain supported by floor outside protected openings. Door, fixture, excluded-area and foreign-material vetoes still apply, including other components of either owner. This mode corrects provisional selection topology only; it does not construct a wall, certify a raised room or change navigation. A combined native region trace is required to establish which identities actually become independent.

`nativeSelectionContactRepairs` records individual selection-only corrections for positive gaps no larger than `1e-7` feet between verified original native member caps and finite supporting faces. The exact rational mask is reconstructed from current source coordinates; it does not move a wall, add a physical wall or change a doorway, route, access rule or raised room. The original material checksum, model, level, elevation, full source rings and contact edges must still match. Entire gap coverage by original floor and exact positive-intersection vetoes for openings, doors, fixtures and foreign material are replayed on import and selection. A sub-epsilon forbidden intersection still rejects the repair.

Each entry remains a provisional construction-contact assumption with evidence and a revisit flag. `applied` affects native outlining; `proposed` and `restored` do not. A complete group must be traced again before calling its rooms independent: one accepted contact can leave another connection. Keep intentional shared open reception/circulation areas shared. These authoring corrections travel with the master and invalidate native mapping and prepared display bindings. Visitor exports retain only applied source evidence and generic provenance, without the author’s notes. They do not establish public access or certify reconstructed physical routes.

An individual contact may explicitly declare `contactMode: "finite-cap-overlap"` for a documented finite wall-corner incidence. The descriptor still stores the full original cap and full original source/target rings. The exact maximal lateral interval is recomputed from that cap and the named original finite face; each omitted end is bounded to `1e-7` feet, independently of the same normal-depth limit. Every projected target vertex and interval midpoint must reach that face as the first actual material. Both whole original cap retention and whole-cap original floor support are required; an overlapping slab cannot hide a protected aperture beneath an omitted end. The exact gap mask must contact the complete derived source interval and retained target interval. The default remains full-cap contact and still rejects partial-width cases. No outside-corner wedge, invented subcap coordinates, rounding, extrapolated face, penetration or source vertex change is authorized. Independently registered drawing incidence may support the provisional assumption through the checksummed evidence, but does not substitute drawing wall thickness for native material. A local contact is not a complete enclosure claim; combined exact selection and physical visitor checks remain separate.
