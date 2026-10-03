# Prepared Revit indoor projects

**Map editing:** choose **Edit map** after importing a project to place labels, draw highlighted areas, and use undo/redo. See [the editor guide](indoor-map-editor.md) for saving and source-geometry limitations.

The current UNBC preview package is `/Users/ahmadjalil/Downloads/UNBC.indoor.open-fronts.reviter.zip`. It is still a partial campus review map. Library Services Desk `05-136` now has a source-supported doorless entrance to `05-137 Open Area`; the same preparation recovered five other entrances. The desk's striped roof was a display subtraction failure, now repaired without replacing its approximate source outline with a claimed verified enclosure. See the October 2 desk correction below for measured coverage and remaining gaps.

### Simplified visitor geometry (October 2)

**Map preferences → Simplify map geometry** defaults on in the visitor map, on desktop and mobile. It hides classified pillars and recognizes compact hollow posts assembled from short native walls. Within each supported post footprint, adjoining walls continue at their original thickness and adjoining room edges flatten locally. Doors, small labelled rooms and arrival points protect nearby details from removal; larger or uncertain geometry remains visible. Larger floor openings remain open. Turn the preference off to restore the detailed layout, or use **Review project** to inspect source geometry.

This is a reversible viewer treatment. It does not repair Revit walls, change room-boundary evidence, modify the ZIP, or remove collision obstacles from routing. Source fallback outlines can still include architectural door-swing curves. Missing entrances and unresolved source boundaries remain separate review tasks.

Verification uses actual Agora wall-built posts plus a room/courtyard fixture, source-preservation assertions, and desktop/mobile browser checks covering the toggle, 2D/3D views, overview transitions and the existing Library corridor → Services Desk route. Screenshots are in `docs/screenshots/unbc-agora-simple-*`.

### Progressive visitor labels (October 2)

Room geometry begins appearing before every room receives text. Building names remain through the department-scale transition; curated landmarks appear next, followed by public destinations such as washrooms, reception and lecture rooms. Ordinary room labels wait until a closer view and initially show their room number; full names appear closer in. Storage and mechanical labels arrive later. A selected destination always uses its full name and wins collisions with other labels, while labels still avoid the navigation cards and map controls.

Both 2D and 3D use these tiers and wider label spacing at medium zoom. The 3D view also limits the label count according to viewport size. Invisible 2D labels release collision space rather than hiding useful labels. Source review labels, search results and room information cards keep the full information. No source metadata or route data changes.

**Map preferences → Map labels** now offers **Minimal**, **Balanced** (the default), and **Detailed** presets. Open **Adjust labels** to set room-number reveal zoom, full-name zoom and label spacing; changing a slider selects **Custom**. Higher zoom values reveal text closer in. Full names cannot reveal before the room-number threshold. Presets also adjust the building/landmark handover and the 3D viewport label budget. Selected destinations retain their full names.

**Review project → Campus floors → Combine campus floors** combines the selected visitor floor with another visitor floor under a shared name. Export the reviewed project to save it in browser storage and the ZIP. Both native levels remain visible under one selection in 2D and 3D; their elevations, room geometry and routing graph are preserved. Vertical instructions within a grouped floor describe movement “within” that campus floor and retain the native departure/arrival levels. Grouping does not create connections between disconnected buildings.

The grouping is saved as `rooms.campusStoreys` with `user-reported` evidence, which Reviter already uses during regeneration. For a repeatable offline update:

```sh
node --import tsx scripts/indoor/combine-floors.ts input.zip output.zip "Campus Floor 3" storey:400176 storey:1487353
```

The command validates the input/output packages and verifies that every dataset field other than the floor catalog and source hash binding, plus the original model/GIS/scene files, survives unchanged. UNBC's Floor 3 (327 records) and Conference Centre Floor 3.5 (47 records) now share Campus Floor 3, preserving their approximately 1.7 metre native elevation difference.

These are browser preferences, remembered across reloads and imported maps. They do not alter the prepared ZIP or its source metadata. Desktop/mobile browser checks verify live preset changes, custom slider values, restoration after reload and 2D rendering; unit checks cover clamping and selected-label priority.

Open **Prepared indoor projects** under **Revit Imports** on the welcome screen (`/projects/indoor`) and use **Import project ZIP** to load a prepared version 2 Reviter project. The browser validates the original model, reviewed source records, GIS pairs and compiled floor/routing data. No UNBC-specific geometry is bundled into this app.

The end-to-end preparation, review, regeneration and validation guide is in the companion Reviter repository: `docs/indoor-project-pipeline.md`. It documents every step, schema, evidence rules, metadata responsibilities and current UNBC limitations.

## Run locally

```sh
npm ci
npm run dev -- --port 5174 --strictPort
```

Open `http://localhost:5174/projects/indoor`, import the prepared ZIP, choose a floor/building, select areas or door/stair markers, assign start/destination, and use **Fit route**. **Circulation only** retains architectural walls and source outlines. **3D rooms** is the default hospital-style presentation: solid low room blocks that include adjoining wall thickness, white flat circulation and pale blue native entrances. **2D rooms** shows the same geometry from above; **Source model** retains the native GLB floor section, model origin, units and GIS alignment. The floating floor picker is available on desktop and mobile. Room names use existing arrival anchors. Each room has one continuous block roof rather than an inset volume surrounded by a taller wall shell. Room and wall display heights match; entrance heights are illustrative; source elevations and geometry remain preserved.

Area/connection review changes immediately recalculate routes. **Export reviewed project** prepares the complete archive and saves it in IndexedDB at the same browser origin. Click the visible **Download reviewed ZIP** link to save your portable backup. Unsaved reviews are in memory. Original RVT bytes and GIS pairs remain unchanged. New boundaries, arrival positions, door sides or stair entrances must be corrected and regenerated in Reviter.

Unknown public access remains visible as a warning in public review routes. Staff/voids are blocked. Step-free routes require explicit verification of every edge; stairs and local steps cannot be marked step-free. This is a review workspace with a conservative, partial source graph, not a completed accessibility survey or public campus navigation release.

## Validate the pipeline

```sh
npm run test:indoor
npx tsc --project tsconfig.indoor-project.json
npm run build
npm run indoor:audit -- /absolute/path/prepared.reviter.zip \
  --cases tests/fixtures/unbc-indoor-routes.json \
  --out /absolute/path/validation.json
```

For another model, provide another case JSON. Each case has `name`, `start` and `end` (`key`, or `number` plus `levelId`), `expect` (`route`, `blocked`, `review`), and optional `profile` (`public`, `accessible`). The audit verifies registration and package/review round-trip; `route`/`blocked` mismatches fail. `review` records current gaps without hiding them.

The runtime project engine uses stable graph IDs with explicit building/level/surface identities, so identical XY coordinates on separate floors never imply adjacency. Existing static venues retain their routing code and data. The portable contract is `app/indoor-project/contract.ts`, copied from Reviter `lib/reviter/indoor-contract.ts`; synchronize contract changes and migrations in both repositories.


Prepared native entrances (October 1, 2026)
-----------------------------------------

Reviter now includes an optional `doors` array in `viewer/indoor.json`: native level/element IDs, position, recovered oriented footprint when available, candidate/source room keys and connected/unmatched/ambiguous state. Older prepared ZIPs still load, with graph markers and a notice to regenerate for actual apertures. Door geometry is display evidence; it never creates or enables a routing edge. Reviewed disabled connections remain disabled through export and regeneration.

OpenIndoorMaps subtracts precise door footprints from the displayed wall and room footprints; original polygon rings and graph coordinates are unchanged. Position-only doors remain markers without guessed widths. Amber entrances open the review inspector and require source correction, rather than offering an unsupported routing toggle. Lower rooms are clipped to actual upper-floor polygon holes or explicitly reviewed open drops; ordinary access restrictions do not create floor openings.

The updated example is `/Users/ahmadjalil/Downloads/UNBC.indoor.hospital-style.reviter.zip`. It retains the original RVT, room JSON, GIS and GLB bytes, 5,730 nodes and 5,459 edges. It carries 1,886 native door positions, including 1,883 precise footprints. The existing 411 unmatched-door issues remain. Polygon subtraction falls back to the original geometry for three invalid source surfaces (two on Campus Floor 1 and one on Floor 4); source boundaries still need review in those locations.

Browser regression command (uses the supplied local fixture; does not bundle the model):

```sh
INDOOR_PROJECT_ZIP=/absolute/path/UNBC.indoor.clean-routes.reviter.zip npm run test:e2e -- tests/e2e/indoor-project.spec.ts --workers=1
```

Checks cover solid room blocks with open hallways, native entrance geometry, clickable entrance review, 2D/3D camera and floor state, Library–Agora routing, staircase transitions and step-free exclusion on desktop and a 390×844 mobile viewport. Unit tests cover source holes, per-floor aperture cuts, display-only lower-floor context, invalid geometry rejection, and review/export preservation.


Cleaner walls and routes (October 1, 2026)
-----------------------------------------

Use `/Users/ahmadjalil/Downloads/UNBC.indoor.clean-routes.reviter.zip` for the current preview. Reviter separates native wall and column footprints with optional `walls[].kind`. Pillars are hidden by default in 2D/3D rooms and can be restored with **Show pillars**. Original Source model presentation is retained. Old ZIPs remain importable; they require regeneration to identify columns. Unclassified shapes are never guessed to be pillars.

Visible wall faces are unioned per native floor before precise door footprints are subtracted, eliminating overlap seams while retaining real wall corners, openings and curved faces. Where a straight wall touches a hidden column, its existing thickness continues through the column footprint, avoiding both a pillar bump and a new gap. Door subtraction runs afterwards. Display geometry never removes an obstacle from routing or changes original room/model bytes.

The compiler now aligns its four-neighbour grid with each region's dominant boundary direction. Multi-source wavefronts connect neighbouring arrivals/entrances, replacing the single rooted BFS forest. Each orthogonal shortcut checks every grid cell and complete native-barrier segment. Dijkstra still selects the shortest route in the exported graph; this sparse grid graph does not guarantee the continuous geometric optimum or corridor-centre placement.

Current UNBC: 4,809 nodes, 5,343 edges, 1,610 supported arrivals, 134 components, 421 arrivals in the largest component; 411 unmatched doors remain. Library–Agora decreased from 20.793 m / 52 vertices to 17.484 m / 11 vertices. Both staircase cases retain their source transitions; the Rotunda drop is blocked. All 7,997 walking segments were checked against native walls and columns with zero crossings. 1,225 classified column footprints remain in the archive and in routing. RVT, room JSON, GIS pairs, GLB and native entrance metadata remain unchanged. Three malformed source room surfaces retain their display subtraction fallback.

Evidence: `docs/unbc-clean-route-audit.json`, `docs/unbc-clean-geometry-audit.json`, `docs/unbc-clean-preservation.json`; desktop/mobile browser regressions additionally cover pillar visibility and the regenerated route.


## Centred corridor routes (October 1, 2026)

The remaining Library–Agora zigzag came from using a whole circulation region’s averaged grid direction across differently angled corridors, plus a visit to an unused side-door anchor (#863700). OpenIndoorMaps now resolves continuous same-floor walking legs after source graph search, using native wall directions and free corridor cross-sections. It prefers a straight or single right-angle path with centred corridor arrivals. Room arrivals, stair entrances and actual floor-transition geometry retain their original endpoints. The map, route fit and displayed distance use the resolved geometry; source graph IDs, reviews and archived geometry remain unchanged.

Every proposed segment is checked continuously against source room coverage, holes, staff/nonwalkable masks, native walls and columns. Only selected connected doors with recovered footprints can cut a wall; doorway coverage can span recovered room-boundary gaps only to that door’s approved graph anchors, without widening its native opening. Hidden pillars still block routes. Candidates that cannot be validated retain the saved geometry. The initial single-elbow resolver retained complex multi-turn routes; the corridor-lane extension below handles additional corners. Confirmed step-free paths retain their saved geometry because their approvals are geometry-bound. Older unclassified or aperture-free packages retain their source paths.

With the existing `UNBC.indoor.clean-routes.reviter.zip`, 05-120 → 07-101 is now **15.755 m**, with **three vertices / two straight legs / one 90° right turn**. An independent native-barrier audit found zero wall or column crossings; the reverse route matches. The selected native doorway remains #868723. This viewer change requires a refreshed app, not ZIP regeneration. Missing campus connections and the 411 unmatched doors remain source-review work.

Validation: 18 unit tests, desktop/mobile browser regressions with the actual prepared ZIP, TypeScript check, production build, and the seven-case project audit. Evidence: `docs/unbc-centered-route-audit.json`, `docs/unbc-centered-geometry-audit.json`, and `docs/screenshots/unbc-centered-route-desktop.png` / `unbc-centered-route-mobile.png`. The repeatable `indoor:audit` report now includes source-graph distance and each rendered path’s centring state, vertex count and native levels.


## Multiple turns and the hospital-style visitor interface

The project opens into a full-map visitor view with a floating search/category card, source room details, direction endpoints, floor picker and 2D/3D switch. Categories are derived from existing campus room names, rather than invented hospital departments. **Review project** opens the original package import/export, building filters, pillar/network controls and source review inspector; **Explore map** returns to navigation. Room and entrance geometry still comes from the same prepared ZIP.

Route preview reuses the BC Hospital direction-card component: orange active instructions and an interactive progress bar on desktop, current-step and summary cards with a building/floor chip on mobile. Next/Previous and optional autoplay focus the relevant section, use padding for those cards, and switch to the actual native floor at a staircase. Directions are generated from the resolved path rather than the coarse grid. Unknown public access remains visible before preview. Unverified step-free routes stay unavailable; native stairs are never presented as elevators.

When no valid single elbow exists, a sparse graph connects corridor centre lanes derived from source-path cross-sections. Each link needs continuous clearance through the selected native areas and actual door apertures. Search includes heading and a bend cost, removes collinear vertices and retains a walking-distance budget. Original opening edges and vertical connections remain exact source geometry; source graph IDs and reviews stay intact. Unsupported candidates still fall back to saved geometry. Native ring bounds speed repeated clearance checks; the demonstrated longer route resolves in roughly 150 ms on this machine rather than roughly one second.

Demonstrated examples:

| Route | Result |
| --- | --- |
| 05-120 Corridor → 05-165 Vestibule, Campus Floor 1 | 68.589 m, three straight legs and two turns; saved graph was 93.635 m |
| 05-120 Corridor → 05-S203 Stair, Floor 2 | 58.585 m, native stair transition; Next/Previous switch Floor 1 ↔ Floor 2 |
| Rotated synthetic serpentine corridor | Five corners, native obstacles respected, reverse route matches |

The second example retains its saved walking geometry where the full centre-lane candidate cannot be validated. This does not repair the existing disconnected campus cases or 411 unmatched doors.

Validation: **20 unit tests**, **four desktop/mobile browser regressions**, nine-case CLI audit, TypeScript check and production build. Independent native-barrier checks covered **37 centred segments across 18 longer-route cases**, with zero wall/column crossings and native stair geometry preserved. The browser tests exercise search → room details → directions → preview, rendered multi-turn geometry, camera movement, forward/back floor switching, step-free exclusion and mobile overflow. Evidence is in `docs/unbc-complex-route-audit.json`, `docs/unbc-complex-geometry-audit.json` and screenshots prefixed `unbc-project-navigation-`. No ZIP recompilation is needed for this receiving-viewer update.

## Solid room blocks with open hallways

The 3D prepared-project view uses one solid low block per room, including adjoining native wall material. The room and remaining walls share a 0.75 m display height, eliminating the taller wall shell around an inset volume. Wall material included in room blocks is subtracted from the remaining wall extrusion to avoid duplicate roofs. Circulation stays flat and white; rooms never expand into corridor floor space. Native doorway cuts and real floor openings remain open. 2D uses flat room footprints, preferring wall-defined enclosures where verified, and Source model retains the native model.

Geometry is calculated from local native wall pieces and retained between route/selection changes. Selection changes the block colour without rebuilding geometry. Original room records, source model and routing are unchanged; existing ZIPs need only a refreshed viewer.

The new geometry regression checks adjoining wall thickness, open hallways, doorway apertures, floor holes and source preservation. Desktop/mobile browser checks exercise room blocks, room labels/details, 2D/3D switching and staircase navigation.

Validation: 21 unit tests and all four desktop/mobile browser checks passed, together with the project TypeScript check, production build and focused application/browser-test lint. Screenshots: `docs/screenshots/unbc-solid-room-blocks-desktop.png` and `docs/screenshots/unbc-solid-room-blocks-mobile.png`. These replace the preceding open-box presentation.

## Rooms defined by native wall faces

Prepared-project displays now prefer room enclosures recovered from the native wall footprints on the same floor. A recovered door footprint temporarily bridges its threshold for enclosure discovery; its actual aperture is then cut back out of the display. Columns do not define rooms. Source room labels/outlines select the enclosure and retain the original room key, access metadata and arrival identity. A candidate must cover at least 80% of the source room, have at least 80% of its area covered by that room, and contain no more than 5% circulation/open-drop coverage. An ambiguous, invalid or incomplete enclosure retains the source outline. The resolver never closes a missing wall using an annotation edge or infers a new room/route.

Native wall coordinates are rounded to 0.0001 feet for stable display polygon operations. Source floor holes remain subtracted. Both 2D fills and solid 3D room blocks use the resolved boundary; source polygons, model bytes, graph geometry and routing stay unchanged. Existing prepared ZIPs need only a refreshed viewer.

The actual UNBC package provides **539 wall-defined rooms of 1,566 eligible room records** after native junction repair: 147 on Campus Floor 1, 148 on Floor 2, 118 on Floor 3, 120 on Floor 4, five on Floor 3.5 and one on Floor 0. The remaining 1,027 retain source footprints. In Building 05, examples include 05-107 Meeting, 05-108 WC, 05-109 Kitchen, 05-101 Office, 05-141A Office and 05-219 Study Room. Classroom 05-154 lacks a qualifying closed native enclosure and retains its source boundary. Evidence and before/after coordinates: `docs/unbc-wall-room-boundaries.json`.

Geometry regression checks cover wall-face replacement of an inset source outline, door thresholds, source holes, missing-wall fallback, native floor isolation and unchanged source data. Desktop/mobile checks require wall-defined room features and exercise room selection, 2D/3D switching, route following and staircase transitions.

Final room validation: 23 unit tests, both desktop/mobile prepared-room browser cases, project TypeScript check, focused boundary-renderer lint and production build passed. The initial broader visitor run was invalidated by live UI changes (map context reload and revised floor-selector expectations), so this boundary change does not claim a fresh full visitor-navigation pass. Compiled preview: `http://127.0.0.1:5175/projects/indoor`; screenshots: `docs/screenshots/unbc-wall-defined-rooms-desktop.png` and `unbc-wall-defined-rooms-mobile.png`.

## Native wall junction gaps and inset room corners

The Meeting/WC screenshot showed source fallbacks even though the native walls visually enclosed those rooms. Measurement found wall end caps stopping 0.0123–0.0125 feet (about 3.8 mm) short of the adjoining wall. Those gaps broke the polygon enclosure test, preserving the beveled annotation blocks.

`wall-junctions.ts` adds display-only patches when both corners of a short wall end cap are within 0.02 feet (6.1 mm) of another classified wall on the same native floor. It never uses annotations, columns or door footprints as a target for junction repair, and larger openings remain unresolved. A spatial index limits comparisons to nearby wall ends. Boundary discovery and wall rendering use these same patches. Local wall faces are clipped to a room neighbourhood before enclosure discovery; the clipping window never supplies a boundary.

05-107 Meeting, 05-108 WC and 05-109 Kitchen now use wall-defined boundaries, filling the old clipped corners and absorbing adjoining wall material into their room roofs. Their separate grey perimeter shells disappear. Corridors, recovered door apertures and source floor holes remain open. This is a viewer display repair; the package, source geometry and navigation graph are unchanged. Some other rooms still retain source fallback geometry and visible exposed walls; hiding all unresolved walls would conceal incomplete boundaries.

Validation: 24 unit tests, both prepared-room desktop/mobile browser checks, focused renderer lint, project TypeScript and the production build passed. Rotated gap regressions check filled room corners, wall ownership, intact door/hall space, source preservation, and rejection of larger gaps. Browser checks explicitly require the three formerly inset rooms to use native-wall boundaries, alongside 2D/3D and staircase routing checks. Compiled preview: `http://127.0.0.1:5175/projects/indoor`. Screenshots: `docs/screenshots/unbc-room-junctions-desktop.png`, `unbc-room-junctions-mobile.png`, and `unbc-room-junctions-2d-mobile.png`.

## Searchable directions and building/level selection

Visitor directions use searchable From/To fields with room number/name and human building/floor subtitles. Type by room number, name, building or floor; choose a result by pointer or Arrow keys/Enter. Keyboard selection scrolls the active result into view. Clear and Swap update the committed endpoints; typing a new query clears the previous endpoint so an old route is never shown for uncommitted text. Choosing a location highlights it and focuses its native floor. The mobile directions sheet has room for the endpoints and route warning, and the presentation controls no longer overlap Review project.

The top-right selector now opens a hospital-style building/level menu. Change opens building search; choosing a building filters both the floor choices and map geometry, retaining the current floor when available. Selected floors have an orange row and blue level badge. Staircase preview and Previous/Next still update the same floor state. The prepared source has no outdoor map, so this menu does not invent an Outdoors entry. Native IDs and the original selectors remain available in source review.

The specific **03-015 Meeting → 05-154 Classroom**, both on native level #311, cannot route in the current prepared package. Meeting's native door **#706556 is connected** to 03-013 Circulation. Its entire saved graph component contains only **22 nodes**, even including disabled/restricted edges, and does not reach the destination. Public traversal reaches 10 nodes. This is a source topology gap; changing the route profile cannot bridge it. The visitor warning now identifies the missing Building 03–05 connection and offers **Review connection**, which opens the Meeting room's source inspector. Actual connecting entrances/circulation must be corrected in Reviter and the ZIP regenerated before this route can work. No shortcut or route approval was fabricated. Evidence: `docs/unbc-meeting-classroom-route-audit.json`.

Validation: **23 unit tests**, both source-review desktop/mobile browser checks, and both visitor-navigation desktop/mobile checks passed. Visitor checks also verify typed/keyboard selection, swapping, no-match handling, the specific source-gap warning, building-filtered map geometry, centred multi-turn routes, staircase floor changes and step-free exclusion. The visitor checks were rerun after the final mobile layout changes. TypeScript and production build pass; focused lint has no errors (one existing custom-CSS-class warning). Screenshots: `docs/screenshots/unbc-search-floor-selector-desktop.png`, `unbc-search-directions-mobile.png`, and `unbc-search-destinations-mobile.png`. The UI update needs only a refreshed viewer; the missing source connection requires a corrected package.

## Custom visitor controls

Route profile and the home card's Navigation preference now share a custom popup menu with icons, selected-state checkmarks, descriptive rows and keyboard navigation. No native select remains in the visitor navigation card. The building/floor popup and endpoint result lists also use custom rendered rows.

Typing fields use the same rounded styling, a custom focus ring and a single application clear button. Endpoint fields retain standard accessible text input and the mobile search keyboard while disabling the browser search widget's extra clear icon. The custom profile popup renders above the sheet with viewport collision handling on mobile.

Validation: both desktop/mobile navigation regressions passed, including keyboard activation of preference options, endpoint typing, swapping, staircase transitions and step-free exclusion. Project TypeScript and production build pass; focused lint has no errors and one existing custom-class warning. Screenshots: `docs/screenshots/unbc-custom-profile-desktop.png`, `unbc-custom-profile-mobile.png` and `unbc-custom-search-mobile.png`.

## Source processing audit for remaining room corners

The majority of room blocks still retain approximate source geometry: the current package has 1,776 annotations marked `derived`, 76 `vector-walls`, and eight from other methods. Reviter's approximate grid-region extractor simplifies raster contours, and its indoor exporter copies source room polygons directly. Viewer wall-enclosure recovery fixes a subset (539/1,566 eligible records), while most remaining rooms still require source/presentation boundary preparation in Reviter. Re-exporting unchanged annotations will preserve their clipped corners.

The existing registered-wall rebuild was probed on all 212 records in the two Level 1 plan sections covering Building 05. It rebuilt 69 and retained 143; 05-139C Office resolved, while 05-154 Classroom did not. One recovered outline contains drawing arc detail, reinforcing the need to separate structural wall faces from door-swing symbols before broadly applying reconstruction. The six existing Reviter room-boundary tests passed. This diagnostic changed no source geometry, routing, or packages. Full provenance counts, probe coordinates and the required processing steps are in `docs/unbc-room-source-processing-audit.json` and the Reviter pipeline guide.

### Every-room and multi-floor route coverage

The visitor picker includes every walkable, non-staff location, including rooms
without a prepared arrival. Missing entrances and disconnected destinations now
show a review note in the custom search results instead of disappearing. The
selected departure and route profile determine each destination's connection
status. Choosing a room still focuses its actual building and floor; a missing
connection opens source review rather than drawing a shortcut through walls.

Shortest paths and destination coverage share `routing-graph.ts`. Walking,
verified doors, registered openings, and explicit stair/local-step transitions
form one graph across all native floors. Ordinary rooms are permitted as the two
endpoints only. The coverage flood first reaches circulation and the start room,
then explores each possible destination separately; it never allows a third room
as public transit. Confirmed step-free coverage requires confirmation on every
edge and excludes all stairs and local steps.

For a same-floor leg that cannot be centred as one continuous path, verified
native door thresholds stay exactly on their saved geometry. Walking runs on
either side are independently centred where continuous clearance checks succeed.
A missing precise door aperture retains the complete saved leg. Native staircase
geometry and geometry-bound accessibility approvals remain unchanged.

Run a complete endpoint audit on any prepared package:

```sh
npm run indoor:audit-rooms -- /absolute/path/prepared.reviter.zip \
  --out /absolute/path/room-routing-audit.json
```

This checks exact reachability for every endpoint pair under both profiles. For
every connected endpoint it also realises one same-floor and one other-floor
route where available, checks graph continuity, restricted-room exclusions,
finite distance, arrival floor, each floor-change instruction, and preservation
of the source stair geometry. `--topology-only` skips realised paths for a faster
connectivity report. Physical floors are counted using the prepared floor
catalog, so coincident native level IDs are not reported as extra floors. The
report lists every room and its missing review evidence. The audit does not infer
new connections, public access, elevators, or clearance from room proximity.

The UNBC example `08-161` (Classroom, Building 08, Campus Floor 1) to `10-4588`
(Classroom, Building 10, Floor 4) follows three successive stair flights. Desktop
and mobile browser checks exercise the Floor 2, Floor 3, and Floor 4 instruction
selection, then swap endpoints and follow the journey down again. Rooms such as
`09-273` remain searchable with an explicit missing-entrance explanation.

UNBC every-room results (`docs/unbc-all-room-routing-audit.json`): 1,855 eligible
locations, 1,579 with a usable Public review connection, 840 with another-floor
connection, 100,964 reachable unordered pairs, and 69,182 pairs spanning physical
floors. The remaining 245 locations lack prepared entrances and 31 have arrivals
but no route to another location under this profile. Floor 0 remains isolated
from other floors. No routes are yet confirmed step-free in this source package.
These counts describe graph reachability, not confirmed public access; unknown
access remains visible in the route review notice.

The realised-path audit passed 2,407 journeys, including 1,572 source stair or
local-step transitions. An independent check of 3,066 centred path sections
(17,025 segments) found no native wall or column crossings. One intersection fell
exactly on a matched doorway edge and required a `1e-8` foot boundary tolerance
for floating-point rounding; the source doorway and walls were not changed.
The original dataset remained unchanged throughout the audit. Source fallback
sections are reported separately, and are not counted as newly centred geometry.

Successive stair flights now receive separate progress-bar positions, with a
28px minimum spacing for the floor markers where the available width allows it.
Walking dots interpolate between these milestones. Floor markers sit above
walking-dot hit targets and the progress fill uses the same adjusted positions.
Desktop/mobile checks exercise the actual three-flight classroom example and
its reverse, rather than bypassing overlapping controls with forced clicks.


## Native wall room presentation (2026-10-01)

The pipeline now adds optional `presentation` geometry. Source `records[].ringsFeet`, room annotations, native geometry and graph remain separate. Model SHA and each source record's floor/polygon serialization bind prepared visual geometry to its source. Imports reject malformed, wrong-floor or stale presentation entries. Metadata review/export preserves valid presentation; marking a room nonwalkable removes its display block.

To add it to an existing prepared archive without re-reading the RVT:

```sh
cd /Users/ahmadjalil/github/reviter
npm run indoor:presentation -- --input /Users/ahmadjalil/Downloads/UNBC.indoor.clean-routes.reviter.zip --out /Users/ahmadjalil/Downloads/UNBC.indoor.native-wall-rooms.reviter.zip
```

Use a new output path. The CLI writes a companion `.presentation-report.json` and verifies source rooms, architectural records and graph are unchanged. Normal `indoor:prepare` also runs this stage.

UNBC: 889 verified native enclosures, 881 retained display blocks out of 1,566 eligible rooms. Eight recovered cells disappear after protected geometry subtraction and are reported instead of guessed. 685 rooms retain fallback display with diagnostics; missing partitions, unclosed cells and ambiguous labels still require source corrections. Viewer partial recovery may improve some fallbacks but does not replace this provenance.

Visitor 2D/3D now share the same block geometry; native doors remain gaps and review metadata, with door volumes hidden in visitor mode. Pillar visibility continues to affect presentation only. Original room holes and explicit open-drop areas remain protected. Lower-floor context is still clipped planar geometry, not a complete physically elevated floor stack.

Validation reports and primary-source research: `/Users/ahmadjalil/github/openindoormaps/docs/indoor-boundary-research.md`, `unbc-native-room-enclosure-audit.json`, `unbc-prepared-room-presentation-audit.json` and `unbc-wall-rooms-route-audit.json`. The geometry audit preserves RVT/scene/annotations/GIS bytes and graph, with no prepared-block overlap above 0.01 ft² against tested protected masks/apertures/holes/other blocks at 0.0001-ft precision.

Actual navigable interiors have **not** been replaced by visual wall-absorbing blocks. Correcting navigable interiors must regenerate native door matching, anchors, regional graph and geometry-bound approvals. The source still reports 411 unmatched doors; elevator/escalator connectors require explicit native or reviewed evidence and a richer contract. See the research document's prioritized work list.

Final validation: 31 unit checks, TypeScript, and the production build passed.
Desktop/mobile visitor browser checks passed on the prepared wall-room package,
whose records, nodes, edges, native walls/doors, alignment and source hashes match
the audited clean-routes package. The active desktop instruction now scrolls into
view during step selection. Screenshots: `unbc-three-flight-desktop.png` and
`unbc-three-flight-mobile.png` under `docs/screenshots/`.


Final validation for this change: 33 targeted Reviter unit tests and 31 OpenIndoorMaps unit tests passed. Four real-package desktop/mobile browser workflows passed, covering room geometry, common 2D/3D footprints, visitor door visibility, native pillar toggles, complex right-angle routing, stair floor-following/reversal, consecutive floor milestones and unconfirmed step-free rejection. Both production builds passed. OpenIndoorMaps scoped TypeScript and new geometry-module lint checks passed; Reviter's focused preparation-module TypeScript passed. Full Reviter TypeScript still reports pre-existing errors under `work/**` copies and audit scripts. The first development browser run was invalidated by hot reload; final browser validation ran on a fresh server with watching/HMR disabled.

## Doorway context and remaining raster zigzags (2026-10-01)

The all-room connectivity audit did not imply that every displayed leg was
centred. The `08-161` → `10-4588` example exposed three refinement failures:

- Splitting a floor leg at doors discarded the adjacent native aperture. A
  corridor portal inside the wall thickness was then classified as blocked.
- Prepared circulation walking branches sometimes already cross an internal
  native door, without selecting its separate door edge. Refinement omitted
  that aperture and rejected the continuous corridor region.
- The shortest cross-section at a doorway can snap along the doorway instead
  of across the hall. A valid source anchor then has an invalid snapped lead-in.

Split walking runs now retain their immediately adjacent selected door edges.
Internal openings are recovered only when a connected, enabled native door
joins two rooms in the same allowed leg and its precise footprint intersects
that leg's original source geometry. Unmatched, disabled, position-only and
unused side doors do not authorize new openings. Fixed-anchor lane search is
tried when snapped lead-ins fail. Collinear portal overshoots are removed only
when the replacement segment passes continuous clearance checks.

On the actual classroom example, the Agora section now has two straight legs
and one right turn (three vertices instead of five); the main Floor 4 section
uses seven vertices instead of 21. All seven circulation sections resolve in
both directions. The three native stair transitions retain their exact source
geometry. Independent native-barrier checks covered 56 centred segments of
this journey and its reverse, with zero crossings and continuous joins. See
`unbc-zigzag-repair-audit.json`. Geometry excerpts from the two troublesome
corridors are retained in `tests/fixtures/unbc-corridor-regressions.json` as
regression inputs; these excerpts are not importable project packages.

Validation: 39 unit checks, focused centring-module lint, scoped TypeScript,
production build, and both actual-package desktop/mobile visitor workflows
passed. Updated screenshots are `unbc-three-flight-desktop.png` and
`unbc-three-flight-mobile.png`. The viewer update does not require recompiling
the source ZIP.

The full every-room realised-path audit was rerun after these repairs: all
2,407 journeys passed, including 1,572 original stair/local-step transitions.
Successfully centred sections increased from 3,066 to 3,951; 10,978 sections
still retain their source geometry. Endpoint connectivity and review status
counts are unchanged. The independent native-barrier check covered 18,571
centred segments, with zero wall/column crossings; one exact doorway-boundary
contact used the same `1e-8`-foot rounding tolerance as the preceding audit.
There were 309 uses of verified internal apertures already crossed by source
walking legs. Evidence: `unbc-zigzag-all-room-audit.json` and
`unbc-zigzag-geometry-audit.json`. Source fallback sections are excluded from
these newly-centred clearance counts.

### Source interior and hospital-style review upgrade

Use `/Users/ahmadjalil/Downloads/UNBC.indoor.hospital-review.reviter.zip` for the current regenerated example. Reviter promoted 866 independently checked interiors and recompiled routes/door matching. Unmatched doors dropped 411→378; model, scene and GIS hashes remain unchanged. Visitor metadata names Library/Agora from their existing source scopes and preserves native room names separately.

Source review now includes **Visitor names, categories and colors**. Names, descriptions, category, department, room color, landmark priority and building badge export to the source room directory and survive Reviter regeneration. Review also distinguishes regenerated native interiors from display-only recovered blocks and unresolved source outlines.

The viewer shares low blocks in 2D/3D and renders actual lower rooms beneath verified openings, using measured relative depths and a perspective aperture mask. Source column recesses remain solid. 3D labels sit above their roofs and retain landmark hierarchy; 2D uses native symbols. Elevators/escalators are supported only from explicit model-bound served-floor reviews, while UNBC continues to use verified native stairs. Exterior selection needs exterior data.

Repeatable commands, semantic Finish export requirements and remaining source work: [Reviter pipeline guide](/Users/ahmadjalil/github/reviter/docs/indoor-project-pipeline.md), [boundary export requirements](/Users/ahmadjalil/github/reviter/docs/room-boundary-preparation.md). Remaining source coverage and navigation comparison: [boundary coverage](unbc-boundary-coverage-audit.json), [navigation upgrade](unbc-hospital-navigation-upgrade-audit.json), [all-room topology](unbc-hospital-all-room-routing-audit.json). Raster clearance and broad reachability counts do not certify accessible passages or individually verified routes.

Validation: 50 targeted tests in each app, both scoped typechecks and both builds passed. Four real-package desktop/mobile workflows cover room display, visible 3D labels, multi-turn routing, three-floor stairs, reverse navigation and accessibility rejection. Two synthetic floor-opening browser tests prove actual rendered lower-room pixels in both 2D and 3D on desktop/mobile, with column recesses excluded. Synthetic aperture coverage must not be interpreted as proof of unresolved UNBC source floor coverage.

## Reusable routing-system completion (2026-10-02)

This implementation runs for any imported prepared project. There are no room
numbers, UNBC keys, floor counts or route-specific coordinates in the resolver.
The actual UNBC corridors are regression fixtures, not special cases in the app.

The system has three stages:

1. `routing-graph.ts` applies current room access, endpoint-only ordinary rooms,
   enabled edges, direction and step-free reviews. `routing.ts` searches that
   graph using source identities; matching coordinates never create an edge.
   Saved walking branches can cross a native internal door implicitly.
   `route-passages.ts` recovers those exact threshold dependencies and applies
   the door's current reviews, including when a source vertex lies on its plane.
   The destination selector and shortest path use this same graph.
2. `centered-route.ts` resolves continuous walking sections in the corridor's
   local axes, keeping portal and stair anchors fixed. Every segment must stay
   inside permitted floor polygons and outside holes, restricted rooms, walls,
   columns and supported native junction barriers. Only selected, precise native
   apertures can cut a wall. Candidate threshold crossings must also retain the
   source route's doorway permissions and direction. Sparse lane search prefers
   fewer turns and then distance, retaining shorter alternatives within its
   length budget. If lane search fails, a continuously validated source guide
   can supply conservative right-angle shortcuts. Those paths are labelled
   `orthogonal`, separately from corridor `centered` paths. They are not a claim
   that every section follows the geometric middle of its corridor.
3. `navigation-steps.ts` derives instructions from displayed geometry. Sub-0.5 m
   alignment movements retain their geometry and distance without creating
   separate turn instructions. Native stairs, local steps, elevators and
   escalators retain their actual geometry, direction and served floors.
   Step-free approvals preserve saved geometry. Consecutive floor milestones,
   forward/reverse following, and the desktop/mobile route view are tested.

Fallback reasons are explicit. Native doors, room interiors, stair landings and
vertical transitions normally retain source geometry. `validated-source` means
continuous clearance passed but cleanup found no simpler shape; it must not be
reported as a failed clearance search. Missing native apertures, unsupported
anchors and actual clearance failures enter a deduplicated geometry review
queue with the source edges, floor, rooms and an example journey.

The final source example is
`/Users/ahmadjalil/Downloads/UNBC.indoor.joint-repaired.reviter.zip`.
Audits used an immutable copy and confirmed its full ZIP SHA-256 equals the
Downloads file:
`ed20d302971a6e35dd23819a67b2100637cc3094ee815e6b9ff0784e20d17fe5`.
Routing does not mutate the dataset or source model. This viewer update also
works on older ZIPs; packages without native apertures retain their source
paths rather than gaining guessed connections.

Repeat the endpoint and geometry checks with the Reviter sibling checkout
available (the independent geometry checker uses its native barrier module):

```sh
npx tsx --test tests/unit/centered-route.test.ts tests/unit/indoor-project.test.ts
npm run indoor:audit-rooms -- /path/to/prepared.zip --shard 0/4 --out /tmp/routes-0.json
npm run indoor:audit-rooms -- /path/to/prepared.zip --shard 1/4 --out /tmp/routes-1.json
npm run indoor:audit-rooms -- /path/to/prepared.zip --shard 2/4 --out /tmp/routes-2.json
npm run indoor:audit-rooms -- /path/to/prepared.zip --shard 3/4 --out /tmp/routes-3.json
npx tsx scripts/indoor/combine-room-audits.ts /tmp/routes.json /tmp/routes-0.json /tmp/routes-1.json /tmp/routes-2.json /tmp/routes-3.json
npx tsx scripts/indoor/audit-resolved-geometry.ts /path/to/prepared.zip /tmp/routes.geometry-input.json /tmp/resolved-geometry.json
npx tsx scripts/indoor/audit-walking-geometry.ts /path/to/prepared.zip /tmp/source-geometry.json --doors
```

The combiner rejects missing/duplicate shards or different source/profile data.
It requires a realised same-floor and other-floor journey for every eligible
endpoint wherever that class is reachable. It does not geometrically enumerate
every possible endpoint pair. `--topology-only` performs the full reachability
check without resolving sample paths. Audits distinguish directed reachability
from unique unordered pairs, so one-way connectors do not produce fractional
pair counts.

Final reachability: **1,855 eligible destinations**, **1,606** able to reach
another destination, **766** with routes to another floor, and **80,793** unique
reachable endpoint pairs. The audit realised **2,361 journeys** and retained
**1,557 exact native stair/local-step transitions**. It resolved **4,034 walking
sections**: **3,926** through corridor-centre lanes and **108** through validated
orthogonal source shortcuts. Source fallbacks are reported separately. Twenty-six unchanged walking sections
also passed continuous clearance; their sampled source legs already use straight
segments and right-angle turns. Only one deduplicated refinement section remains
in the geometry queue: the native opening from `03-2002 Corridor` to `03-2007A
Copy` has no precise aperture. Its saved geometry is preserved.

The independent path audit checked **4,060 walking sections / 15,423 segments**,
including those unchanged guides, with **zero native wall or column crossings**.
One exact aperture-boundary contact requires the documented `1e-8`-foot rounding
tolerance. This covers supplied walking geometry, not a physical clearance or
step-free certification.

There remain **216 missing entrances** and **33 arrived but isolated
destinations** for Public review. Confirmed step-free coverage remains zero;
unknown door/accessibility reviews cannot become approvals through geometry
cleanup. The independent saved-edge audit checked **5,348 enabled walking/door
edges and 9,742 segments**, with zero native wall/column crossings. It flagged
**ten native door links** whose side-anchor floor coverage is incomplete. These
need source boundary/entrance review. A narrow native opening cannot supply a
missing floor polygon or connect disconnected buildings.

Evidence: `unbc-routing-system-audit.json`,
`unbc-routing-system-geometry.json`, and
`unbc-routing-system-source-geometry.json`. Fifty-one targeted unit checks,
scoped TypeScript, focused routing-module lint, production build, and the two
actual-package desktop/mobile visitor tests passed. Browser tests exercise
multi-turn routes, all three successive stair flights, reverse following,
selector behavior and step-free rejection. Updated views are
`docs/screenshots/unbc-three-flight-desktop.png` and
`docs/screenshots/unbc-three-flight-mobile.png`.


## Local wall-joint completion pass (2026-10-02)

Current review package:
`/Users/ahmadjalil/Downloads/UNBC.indoor.local-repaired.reviter.zip`. Import it
under `/projects/indoor`. The production preview is
`http://127.0.0.1:5180/projects/indoor`. The preceding hospital-review archive
is preserved for comparison.

Reviter now seals supported native wall end caps up to 24.4 mm and supported
corner wedges up to 12.2 mm, excluding actual doorways. Unclosed room queries
retry the complete native floor barrier union without relaxing ownership,
source-overlap, column, circulation or opening checks. Derived patches have
native source IDs and measured gap polygons in the Reviter joint inventory.
The original RVT, native wall geometry, GLB and GIS references remain unchanged.
Studio 05-122 now uses its native wall enclosure. Physically adjoining column
material can finish its low roof while detached hall pillars stay hidden.

Prepared blocks increase 881 → 1,042, with 161 added and none lost. Strict
navigation interior promotions increase 866 → 1,026. Remaining ordinary-room
fallbacks: 469 (230 unenclosed, 233 source-overlap conflicts, five shared-label
enclosures, one without local walls). There are another 55 stair-area fallbacks;
these are not unfinished private-room blocks. Door matching improves 378 → 351
unmatched doors, with 1,647 arrivals in the graph. The stricter source coverage
checks also remove unsafe shortcuts and can split previously connected regions.

Every enabled saved walking edge was independently checked: 3,919 edges /
8,354 segments, zero native/derived-joint crossings or unsupported floor
intervals. A separate door-inclusive audit checks 5,406 edges / 9,841 segments,
zero failures, including native clear-width side-anchor envelopes. That door
envelope proof is not a physical floor survey. Thirty-six concrete directional
cases retain all 28 previously available outcomes; 582 realized flat segments
have zero native/derived-joint crossings. Stair flights keep source geometry.

Reports: [presentation](unbc-local-repair-presentation-audit.json),
[walking geometry](unbc-local-repair-walking-audit.json),
[door approaches](unbc-local-repair-door-audit.json),
[complex journeys](unbc-local-repair-complex-audit.json),
[topology](unbc-local-repair-room-topology.json).

Two real source phases were independently recovered; no complete native Room
or RoomTag instances were found in the supported in-page source scan. Room
reconstruction therefore remains wall/drawing based. Full details and repeatable
source repair inventories are in
[Reviter's pipeline guide](/Users/ahmadjalil/github/reviter/docs/indoor-project-pipeline.md).
UNBC lift stops and accessible connections remain unverified. Native Rooms,
missing partitions and accurate doorway approach outlines cannot be invented
from nearby labels alone.

Room focus now honors the requested 2D/3D camera mode even when selecting a
room interrupts a view-switch animation. The synthetic aperture test uses a
deterministic aligned camera and proves actual lower-floor pixels, rooftop
labels and removal of those pixels when the custom layer is disabled on both
desktop and mobile. These synthetic tests validate the renderer, independently
of unresolved UNBC source openings.

The earlier `08-161` → `10-4588` demonstration now stops at source review:
08-161 has no safe prepared doorway anchor within the native jamb width and
snap limit. Its coarse outline reaches only a 0.022-ft slice of that width;
the recovered native cell is much larger (99% source coverage but only 8.3%
cell coverage), so it cannot establish an independent classroom partition.
A finer grid alone cannot provide reliable source-supported entry. This is a
reported source limitation, not a passing route. The verified three-flight
browser journey uses `10-1018` → `10-4018`, then its reverse.

Final browser verification runs four actual-package workflows (desktop/mobile
room display and desktop/mobile navigation) plus two synthetic aperture
workflows. All six pass. The navigation workflows follow a multi-turn path,
three successive flights, uphill/downhill floor selection and active-step
visibility; they reject unconfirmed accessibility and the unsupported 08-161
entrance. They do not certify 08-161 as routable. Camera mode selection and
actual Studio screenshots are included in the room workflows.

Final shared-column rendering assigns only actual native column material inside
each touching roof's perimeter continuation. Competing claims remain neutral;
room-key order cannot give one room the entire column. Existing wall roofs,
door gaps, circulation and genuine floor openings remain protected. The actual
Studio fixture and rotated two-room/key-order regressions cover this behavior.
The final targeted suite passes 71 Reviter and 64 OpenIndoorMaps tests, with
both scoped typechecks and production builds passing. Desktop/mobile Studio
proofs are `docs/screenshots/unbc-joint-repaired-studio-desktop.png` and
`unbc-joint-repaired-studio-mobile.png` in OpenIndoorMaps. The retained live
preview screenshot is `docs/screenshots/unbc-local-repaired-studio-preview.png`.

### Stair symbols, unassigned structures and elevator reviews

The project preview draws blue stair/elevator/escalator symbols at their actual
served-floor entrances, with blue-grey stair room blocks. Disconnected source
stairs still receive a stair symbol; their entrance warning remains visible.
Circulation landings stay open rather than becoming solid room blocks.

Visitor view hides disconnected native wall components with no mapped walkable
area within three model feet. These are source structure cuts without nearby
room coverage, not inferred upper-floor rooms. **Map preferences → Show unmapped
structures** restores them. Review project always retains all native geometry;
this display filter does not alter walls, room polygons or routing barriers.
The current local-repaired UNBC Level 2 package has 5,811 exposed wall components;
936 lack nearby room coverage and are hidden by this presentation filter.

**Review project → Elevators → Add elevator** records a model-bound elevator
review. Supply the native lift element ID, evidence and a native entrance element
ID, room and actual model X/Y point for each served floor. The suggested point is
only a room anchor and must be adjusted to the real doorway. More than two stops
are supported. Entrance points must lie inside public walkable source room
boundaries, with distinct floors in the same building. Existing compiled
connectors cannot be edited or removed without regeneration.

Save elevator review adds proposed symbols labelled “awaiting validation,” and
preserves the version-1 `indoorConnectors` source metadata in the reviewed ZIP.
Export reviewed project saves the draft across browser reloads. **Download
connector review JSON** also exports the schema accepted by Reviter:

```sh
npm run indoor:prepare -- --input /absolute/reviewed.reviter.zip --connectors /absolute/indoor-connectors.json --out /absolute/prepared.reviter.zip
```

Run that command in Reviter. Regeneration verifies actual native element IDs,
floor associations, walkable anchors and walking links before adding routing
edges. Saving a source review in this viewer alone does not authorize an elevator
route. The present UNBC package still has no verified native elevator entrances.

## October 2: doorless service-desk access and fragmented roofs

`UNBC.indoor.open-fronts.reviter.zip` is regenerated from `UNBC.indoor.local-repaired.reviter.zip` with the same RVT, scene, room annotations and GIS bytes. The compiler now recovers a doorless ordinary-room entrance only where a well-registered drawing seam meets circulation, the entire two-foot swept footprint is covered by native floors, and native/repaired walls, columns, drawing walls, other rooms and all recorded holes veto the connection. Existing matched entrances are retained. This creates geometric access evidence without inventing a Revit door or confirming public access or accessibility.

For `05-136 Library Services Desk`, the verified connection reaches `05-137 Open Area` between native counter/wall elements 2438907 and 2438956. Its drawing seam is 0.038095 feet; 2.076190 square feet are continuously supported by native floor geometry. The same processing recovers `10-3042`, `10-4306`, `10-4302`, `03-1081` and `03-1038`. All six actual snapped portal spans also pass independent native-floor and continuous native/repaired-wall checks (`unbc-open-fronts-entrance-audit.json`).

The desk roof is still an unresolved source footprint. It no longer claims wall-top material: native wall/column clipping retains its principal 202.62-square-foot component and removes detached strips. A remote malformed roof can no longer restore uncut walls beneath the entire floor; component-local subtraction with a microscopic precision retry eliminates the demonstrated 68.25-square-foot coplanar overlap. Verified prepared rooms retain their wall-defined blocks. Cached wall bounds also reduce full-campus geometry processing from 4.7–5.1 seconds to about 2.1 seconds in Node; this is not a browser frame-rate benchmark.

Current coverage: 1,653 arrivals, 4,922 nodes, 5,460 edges, 142 graph components, 351 unmatched doors, and 1,042 prepared room blocks. Of 1,855 eligible destinations, 202 still lack arrivals and 33 have no public-review route to another destination. The 524 unresolved room/stair outlines remain; access and lift entrances remain unverified. The campus is not complete.

Checks: six desk journeys in both directions (open area, main corridor and Floor 2), plus step-free exclusion; desktop/mobile desk directions; 36 existing directional campus cases retain all 28 available outcomes with zero realized flat-path native-barrier crossings. Exhaustive saved walking/door checks cover 5,423 edges and 9,878 segments with zero failures. Original room/model/GIS hashes are preserved. Reports are `unbc-library-desk-route-audit.json`, `unbc-open-fronts-walking-audit.json`, `unbc-open-fronts-complex-audit.json` and `unbc-open-fronts-room-topology.json`.

```sh
INDOOR_DESK_PROJECT_ZIP=/absolute/path/UNBC.indoor.open-fronts.reviter.zip npm run test:e2e -- tests/e2e/indoor-library-desk.spec.ts --workers=1
npm run indoor:audit -- /absolute/path/UNBC.indoor.open-fronts.reviter.zip --cases tests/fixtures/unbc-library-desk-routes.json --out /absolute/path/desk-route-audit.json
```

### Pass-through presentation and uncertain wall envelopes (2026-10-02)

The visitor map keeps vestibules and named rotundas at floor level, even when a
source annotation lacks its circulation flag. Map preferences offers **Show
pass-through places** and **Show vestibule doors**, both off initially. These
controls affect place cards, labels and entrance markers. Door openings, floor
apertures, routing obstacles and graph connections remain intact.

Room and wall sources use zero vector simplification and zoom 22 detail. Wall
tops are one centimetre above room roofs to prevent depth-buffer flicker along
quantized shared boundaries. UNBC wall #948595 was additionally identified as a
bounds-only native footprint: its broad rectangular envelope is omitted from
visitor extrusions, and remains available in source review. Reviter now exports
the existing architectural footprint `approximate` flag. Only broad approximate
wall envelopes (both plan dimensions exceeding three feet) receive this visitor
filter; narrow legacy wall envelopes retain their previous presentation.

The prepared example is `/Users/ahmadjalil/Downloads/UNBC.indoor.pass-through.reviter.zip`.
It retains the currently reviewed 4,922-node graph. The package audit confirmed
identical model/GIS/floor/scene assets, source room records, node/edge/door data,
and native wall footprints. The addition is wall quality metadata. Filtering
an uncertain envelope does not prove the underlying space is a navigable room.

Validation: 56 viewer unit checks, nine Reviter pipeline checks, desktop and
390px mobile workflows, three camera bearings each, scoped viewer typecheck,
and both builds. Actual-package browser tests are in
`tests/e2e/indoor-pass-through.spec.ts`; the source-region regression fixture is
`tests/fixtures/unbc-pass-through-display.json`.

### Source wall selection and AI review (2026-10-02)

In **Review project → Wall area review**, enable **Select source walls** and
click/tap a footprint in 2D or 3D. This uses a separate layer of unmerged native
wall geometry, so room blocks and merged display meshes do not erase source
identities. Thin walls take priority over overlapping broad bounding envelopes.
**Native wall ID → Find wall** also selects an element on the current floor;
**Show wall on map** frames its footprint.

The inspector shows model element ID, native level, footprint quality and nearby
rooms/doors. **Copy AI context** copies JSON. **Download AI review** saves a ZIP
with `map.png` (current highlighted map view), `review.json` (source hashes,
original footprint parts in feet, alignment, nearby room/door geometry, related
issues, camera and review notes), and instructions. Attach the image and JSON to
a human or AI review. No automatic external AI request is made. Notes belong to
this review download; this inspection does not change the model or route graph.

Approximate source envelopes are identified explicitly; packages without quality
metadata remain “not specified.” They are not promoted to verified wall faces.
Unit coverage verifies multipart source identity, geometry preservation,
uncertainty and floor/building filtering. Actual-package browser coverage in
`tests/e2e/indoor-wall-review.spec.ts` verifies desktop/mobile wall picking,
2D/3D switching and exported image/context.


## Native curved stair selection (2026-10-02)

Prepared projects can now include `stairDisplay`: original native tread polygons bound to a stair place by overlap and the physical flight endpoint at its recovered slab elevation. 3D treads retain their measured elevation above or below the recovered slab and native thickness metadata. Display risers join adjacent measured treads without filling the entire space below a flight. In 2D, treads above a 1.2 m display cut appear as dashed overhead context and leave the ground area selectable. Lower treads provide the stair click surface. They replace the approximate stair room block for presentation; the original room outline remains available in source review. Empty space is not filled using a stair bounding rectangle.

04-S103 previously ended at y=339.75 ft in its imported source outline. Native assembly #2140032 / run #2140042 contains 31 curved treads extending to y=350.87 ft, at the recovered lower slab elevation of 3.28 ft rather than native level #311's nominal zero. Clicking these steps now selects 04-S103 instead of the overlapping Rotunda source area. The unresolved entrance still cannot be used as a route start/destination.

Normal Reviter preparation exports this geometry. To augment a prepared ZIP while retaining its existing graph and reviews, run from Reviter:

```sh
node --experimental-strip-types scripts/prepare-stair-display.ts input.reviter.zip new-output.reviter.zip
```

The viewer validates the model digest, room geometry/elevation binding, native IDs, and finite tread polygons. Source model/GIS/scene, original source boundaries, and graph are preserved. Shared or equally overlapping stair owners remain unresolved. Display geometry never creates a routing edge, a floor surface, or an arrival anchor.

Current preview package: `/Users/ahmadjalil/Downloads/UNBC.indoor.native-stairs.preview.reviter.zip`, preserving the project exported from the browser before the update. Audit: `docs/unbc-native-curved-stair-review.json`. Browser checks click beyond the old source outline in desktop/mobile, 2D/3D.

### Free reference dots for review (2026-10-02)

**Review project → Reference pins → Drop review pin** switches to the 2D floor
plan for accurate placement. Click/tap any spot, including a wall or a gap. The
magenta dot stores the native level and the original model coordinates; it does
not need a room block. Add a label/notes, move the pin with a second click, remove
it, or use **Show pin on map**. Pins remain available in 3D review.

Pins are optional, model-bound `reviewPins` metadata in `floors/rooms.json` and
survive OpenIndoorMaps reviewed-ZIP export/reimport. **Save pin notes** updates
the current project; export the project to keep them. Pins do not modify walls,
room boundaries or the routing graph. **Download pin review** includes a map
image with the dot, its coordinates, notes, nearby rooms and an optional nearby
source wall reference. A wall within one foot supplies a proximity hint; the
pin is never snapped or claimed to be a surveyed wall-face attachment.

Tests in `indoor-review-pins.test.ts` and `indoor-review-pins.spec.ts` cover
coordinate preservation, model/floor validation, desktop/mobile placement,
moving, image export and reviewed-package round trips with unchanged nodes and
edges.

### Campus viewer export: 2D and 3D rooms (2026-10-02)

The repeatable delivery pipeline is **Reviter preparation → OpenIndoorMaps review
→ full reviewed master ZIP → campus viewer ZIP → OpenIndoorMaps visitor**.
In Review project, choose **Export campus viewer**, then **Download campus viewer
ZIP**. This exports the currently applied map state without replacing the loaded
master or marking unsaved authoring changes as saved. Continue using **Export
reviewed project** for the editable/regenerable source backup.

The CLI writes and validates the same viewer format:

```sh
npm run indoor:export-viewer -- /absolute/reviewed-master.reviter.zip /absolute/campus.campus-viewer.zip
```

Import either ZIP through **Import project ZIP**. A version-1
`openindoormaps-viewer` manifest identifies the read-only visitor package. It
contains `viewer/indoor.json`, `viewer/metadata.json`, GIS reference points and
SHA-256/length metadata. Source model and original room-directory identities are
retained as hashes, not disguised empty model files. Viewer metadata has a
separate digest from the original source room directory. The loader rejects
extra assets, damaged payloads, incompatible versions, stale source identities,
unbound native stair ownership and mismatched lift/accessibility reviews.

The prepared indoor dataset is preserved exactly: floor polygons/holes,
lower-floor context, room presentation, remaining native wall geometry, doors,
native stair treads, colours/place metadata, registration, nodes, edges,
direction/closure/access rules and model-bound connectors. Visitor map edits,
managed locations, floor names and combined campus floor selections survive. Minimal shared-room stair ownership
and connector/accessibility bindings remain necessary. RVT/GLB assets,
duplicated authoring annotations, regeneration metadata, review pins and room
review notes are omitted. This first version retains dataset diagnostics and
source record properties to avoid changing rendering/routing semantics.

The viewer exposes 2D/3D rooms, search and navigation, without the source model,
editor or source-review interface. Re-exporting a viewer through the CLI is
supported; converting it into a full source master is rejected. This is map
data for the OpenIndoorMaps app, not a standalone HTML application or an offline
basemap/font bundle. It does not implement tiled floor streaming yet.

Observed downloaded references are inventoried in
[`indoor-export-reference-comparison.json`](indoor-export-reference-comparison.json).
The hospital MVF payload is 1,730,403 bytes, with 41 floor-space GeoJSON files,
7,246 routing nodes, 132 connections, style/facade and enterprise place/category
metadata, and no RVT/IFC/GLB/OBJ entries. Older Mappedin mall captures include
optional OBJ/MTL/image scene data. Indoor3D stores outlines, floor height and
amenity/category metadata; Pointr uses published vector layers and POIs; Situm
captures include building registration, floor maps, POIs and path nodes/links.
The recovered folder is a browser response capture, not complete vendor source
or authoring storage. Absence from a viewer capture does not establish what a
vendor stores internally. No vendor assets are included in our exported viewer.

The initial generated UNBC viewer is `/Users/ahmadjalil/Downloads/UNBC.campus-viewer.zip`
(3,946,403 bytes versus 89,213,955 bytes for its saved source ZIP: 95.58% smaller).
Its sibling `.report.json` records hashes, counts, sizes and exact dataset
round-trip equality. `indoor-campus-viewer.spec.ts` verifies browser export,
import/persistence, identical visitor geometry sources, both room views and the
three-floor 10-1018 → 10-4018 route on desktop/mobile. Unit tests cover source
preservation, combined campus floors, closure policy, corruption rejection and viewer/master separation.
The currently loaded preview was also exported as
`/Users/ahmadjalil/Downloads/UNBC.current-preview.campus-viewer.zip` (3.72 MiB).
It has 4,922 nodes, while the saved master above has 4,973; the exporter preserves
each input exactly and does not replace an older map with a newer compilation.


## Native door orientation and campus routing continuation (2026-10-02)

The regenerated example is `/Users/ahmadjalil/Downloads/UNBC.indoor.door-axis.reviter.zip`. It uses the exact embedded RVT's decoded 3D geometry, checked against model SHA-256 `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`, rather than inferring openings from the visitor display. RVT, room JSON, scene and GIS entries remain byte-for-byte identical to the native-stairs input.

The root cause was a doorway orientation assumption: an aperture rectangle extended through its host wall can have more depth than width. Using its longest edge as the jamb axis rejected legitimate room-side anchors and misidentified the doorway plane. Reviter now carries the original native unit normal into grid terminals and optional portable `doors[].normalFeet`. OpenIndoorMaps uses that normal for implicit doorway dependencies and supported room coverage. Legacy packages retain their existing fallback; regenerate to obtain native directions. Continuous wall/column checks, native jamb width, room containment, maximum snap distance and access reviews remain mandatory. Rotated/deep-host regressions cover compilation, centred routes, direction/closure policy and package validation.

Five native door links recover without losing an existing door link: 1080812 (03-S203 ↔ 03-2010), 2096063 (04-342 ↔ 04-330), 1069898 (03-S303 ↔ 03-3065), 2130487 (04-430 ↔ 04-431), and 2092621 (04-245 ↔ 04-244). Native host IDs and unique IDs are recorded in `unbc-native-door-axis-repair.json` for model inspection. Public graph reachability increases from 1,620 to 1,621 destinations, from 722 to 772 destinations with another-floor routes, and from 81,603 to 82,450 unique reachable pairs. These counts describe graph reachability, not accessibility certification.

Validation reports:

- `unbc-native-door-axis-repair.json`: all five recovered links, both directions, actual native jamb containment, preserved source assets and unknown accessibility.
- `unbc-door-axis-walking-audit.json`: all 9,913 saved walking/door segments pass independent native obstacle and floor-support checks.
- `unbc-door-axis-all-room-audit.json`: 2,382 realized journeys across every eligible endpoint, including 1,568 retained native stair/local-step transitions.
- `unbc-door-axis-resolved-geometry.json`: 15,576 segments in 4,045 resolved walking sections and 27 unchanged clearance-validated guides have zero native obstacle crossings. One strict aperture boundary contact is within the stated 1e-8-foot numerical tolerance. Other preserved source sections and physical passage-width certification are outside this report.
- `unbc-door-axis-complex-audit.json`: the existing complex directional sample retains all previously available routes.
- `unbc-door-axis-remaining-review.json`: per-destination remaining source/access reasons and native references.

There are still 201 endpoints without supported entrances and 33 isolated public-profile arrivals. The review inventory distinguishes 25 retained staff-egress restrictions, three ordinary-room transit cases, five isolated source components, 21 arrival-location issues, 56 unresolved native side ownership cases, 122 unsupported entrances and two matched approaches needing review. Seven distinct doorless source openings retain their saved geometry and appear as `missing-native-aperture` in the centred-route review queue; they are not silently converted into native doors. No lift stops or step-free routes are approved by this repair.

To reproduce the five-link preservation/geometry proof from OpenIndoorMaps:

```sh
npx tsx scripts/indoor/audit-native-door-axis.ts before.reviter.zip after.reviter.zip model-bound-native-cache.json report.json
```

The cache must carry the matching `sourceModelSha256` and native model filename. Normal Reviter `prepare-indoor-project.ts` regeneration includes the fix for other models.

Final continuation checks: 31 targeted preparation tests and 60 viewer unit tests pass, as do both scoped TypeScript checks. Desktop and mobile hospital-style navigation tests pass using the regenerated package: the centred Library route, custom search/profile controls, inaccessible-route messages, three-floor journey and its reverse, Next-step camera following and selected-floor transitions. The tests explicitly enable pass-through places when searching a vestibule because those places are hidden by default. Browser report: `unbc-door-axis-browser-tests.json`; screenshots: `screenshots/unbc-three-flight-desktop.png` and `screenshots/unbc-three-flight-mobile.png`. Reproduce with `INDOOR_PROJECT_ZIP=/absolute/prepared.zip npx playwright test --config work/door-axis-playwright.config.ts tests/e2e/indoor-project.spec.ts --workers=1 --grep 'hospital-style project navigation'`.

## Full remaining-case source review (2026-10-02)

The subsequent package is `/Users/ahmadjalil/Downloads/UNBC.indoor.connectivity-reviewed.reviter.zip`. Three subagents reviewed all 234 missing/isolated cases against the exact native model. Shared compiler fixes recover 18 public-connected destinations and 3,575 reachable pairs. There are now 184 missing entrances and 32 public-isolated destinations: 25 staff restrictions, three Gallery transit/access decisions and four unsupported native approaches. Lift assembly and served-floor evidence remain unverified.

See [the complete continuation report](unbc-connectivity-continuation.md) and `unbc-connectivity-case-review.json` for every case, native source references, reproducible preparation and independent geometry/preservation proofs. The earlier “five isolated source components” classification is superseded: matched display-door ownership did not establish saved routing edges. Pass-through place search, selection and cards now consistently honor the map preference.


## Stair depth and visible doorways (2026-10-02)

Descending treads now use MapLibre's shared 3D depth buffer rather than a depth-free framebuffer composite. Walls and ascending flights can occlude them normally. Their measured footprints cut the flattened display floor in 3D so overlapping native levels do not conceal a descending flight; stair landing floor remains visible. Polygon cuts use a local integer grid to avoid geographic shared-edge precision failures.

Adjacent treads in the same native run gain display risers based on their measured rise. Original tread elevations, thickness, room geometry, source IDs and graph remain unchanged. The viewer does not bridge unsupported gaps between runs or declare new routes.

A recovered doorway cuts all copies of its physical wall element on the combined campus floor. The display cut extends across wall thickness while retaining the native door width, including prepared room blocks. Doors appear as low floor thresholds in both visitor and review views rather than 25 cm raised barriers. Orange remains a review indicator; unmatched door #1948987 is still unmatched for directions.

Regression coverage: descending stairs on desktop/mobile in 2D/3D, three rotated review views, existing curved stair selection, hallway selection/contrast, source immutability and repeated-wall doorway clearance.

## Directions endpoint picking (2026-10-02)

The directions card places Swap at the top right beside Back on desktop and
mobile. Selecting a place and choosing Directions keeps it as To and activates
From. From here keeps it as From and activates To. The active field has a blue
outline and explains that a departure/destination can be typed or picked on the
map. Focusing either field changes the active map endpoint without clearing the
other endpoint. Search continues to support keyboard selection and clearing.

Room surfaces and managed places linked to a room fill the active endpoint.
After choosing the first endpoint by typing or clicking, an empty opposite
endpoint becomes active.
Picking another room changes the active endpoint and recomputes the route.
On mobile, autocomplete temporarily hides the route summary or warning so more
of the map remains available; selecting a result or tapping the map restores it.
Back and route preview leave endpoint-picking mode; ordinary browsing and source
review clicks keep their existing behavior. Routing still requires supported
room arrivals and respects access/connection review. The current preview retains
a missing connection between 05-108 WC and 05-107 Meeting; the picker correctly
reports that source gap rather than inventing a route. Blank basemap coordinates
do not create navigation nodes.

`tests/e2e/indoor-direction-picking.spec.ts` exercises the place-card Directions
and From here flows, typing, changing both endpoints by actual room-surface
clicks, swapping, 2D/3D picking, Back, header alignment and mobile overflow.
Run with:

```sh
INDOOR_PROJECT_ZIP=/absolute/campus.zip npx playwright test --config work/direction-picking-playwright.config.ts
```

Validation: both browser cases passed, including mobile touchscreen taps,
alongside 69 indoor unit tests, the scoped TypeScript check and the build.
See `unbc-direction-picking-validation.json` and `screenshots/unbc-direction-picking-mobile.png`.

### Local steps, ramps and combined-floor markers (2026-10-02)

Local step connections are labelled “Steps up/down · local level change”, with
one connector marker on a combined campus floor. The marker uses the lower
visible native endpoint; filtering to the upper level or building uses that
endpoint and its downward direction. Endpoints, routing IDs and source geometry
are preserved. The inspector distinguishes generated landings from source rooms
and shows the elevation change within the campus floor.

The connectivity-reviewed UNBC archive identifies connection
`local:local:07:311:08:1487816:1620957` as native-supported local steps. Its route
contains five distinct tread elevations between 0 and 3.28 feet; native run
#1620963 belongs to stair assembly #1620957. Review pin 3 at X41.788/Y465.161 feet
is about 20.35 feet from this route. A neighbouring ramp must be represented by
its own source connection rather than relabelling these steps or granting them
step-free access.

The viewer now accepts explicit `ramp` edges, uses a slope icon and ramp
instructions, and preserves their original 3D route geometry. Unknown or denied
accessibility remains excluded from step-free routing; an elevation change alone
never implies either steps or verified ramp accessibility. Regeneration must
supply the separate ramp's supported geometry and review.

Importing an updated archive for the same model preserves reference pins and
uses the incoming graph and source metadata. Incoming pins take precedence on
matching IDs, and stale wall proximity hints are removed. Pins are never carried
to a different model. Desktop/mobile regression tests cover the single marker,
inspector wording, accessibility state and pin preservation on re-import.

Source-model connector icons also use the actual endpoint/tread elevation
relative to the native scene's shared datum. This avoids placing a local-steps
icon on a lower projected floor or glass facade when a combined campus floor
contains several native heights. Simplified room views retain their own display
anchors; both presentations use the same unmodified connection geometry.

The user subsequently confirmed that Review pin 3 marks the separate ramp beside
the stairs. `UNBC.indoor.ramp-review.reviter.zip` records that exact reference as
“Ramp · accessibility needs review” with notes requesting its own source
connection. It is based on the currently loaded connectivity package with the
two compiled lifts, retaining those routes. Export/re-import assertions confirmed
identical nodes, edges, room geometry, connectors, RVT identity and scene bytes.
That initial pin-only review is superseded by the source-supported connection below; the stair connection remains unchanged.

### Route diagnosis and automatic transit (2026-10-02)

Route failures and shortest paths use the same physical links, including native
doors crossed inside saved walking branches. Failures distinguish missing
arrivals, disconnected source graphs, staff/non-walkable areas, disabled
entrances, saved travel direction and unconfirmed step-free access.
A diagnostic witness uses the fewest blocked links, then shortest source distance;
it is not a visitor route or proof that every source path has the same blocker.
**Review connection** selects the implicated area or native connection.

Ordinary walkable rooms with existing entrances are now traversable automatically.
The route prefers corridors: transit through an ordinary room costs four times
its edge distance plus one metre per referenced ordinary room per edge. Departure
and destination rooms are exempt. `preferenceCost` selects the path;
`sourceDistanceMetres` and displayed walking distance remain actual geometry
lengths. Explicit staff access, non-walkability, disabled entrances, travel
direction and accessible-profile exclusions remain hard constraints. Unknown
access continues to be included only as the existing **Public review** policy
permits; routing does not certify public or step-free access.

**Prefer as a through passage** is optional reviewer metadata. A geometry-bound
confirmation removes the room preference penalty, without changing the room's
classification or block. It creates no new doorway, floor link or accessibility
approval. A missing, stale or revoked confirmation restores the preference
penalty; it does not disconnect a viable ordinary-room route.

The source field `indoorReviews.records[key].throughNavigation` stores notes and
`throughNavigationGeometryKey`, bound to the model hash, source key, native
level and exact rings. The prepared record carries
`properties.throughNavigationReview`. Reviter restores it only against matching
geometry and emits `through-navigation-review-stale` otherwise. Both master and
optimized viewer exports preserve it.

The earlier [route-failure report](unbc-route-failure-review.json) is a historical
snapshot of the removed endpoint-only policy. Its 66,076 failing pairs are not
a current repair queue. The current algorithm, complete pair audit, source
preservation checks and prioritised work are documented in
[the systematic routing roadmap](unbc-systematic-routing.md) and its
[repeatable inventory](unbc-systematic-routing-audit.json). The audit now includes
Building 07 ↔ Building 10, whose physical graph connection remains missing.
Desktop/mobile tests exercise 09-230 → 09-232 without passage approval and the
newly recovered 07-240 → 07-244 entrance, including direction preview.

### Separate Agora wheelchair ramp (2026-10-02)

`UNBC.indoor.wheelchair-ramp.reviter.zip` prepares native **Ramps #1622190**,
separate from curved stair assembly #1620957. The same-model certified native
BRep contains two sloping runs joined by a turning landing (seven top faces),
with a 1.00 m total rise. Neither the ramp sketch helper #1622189 nor the ramp
symbol #1622191 is treated as a physical connector. Matching the ramp body
requires its own native category, complete plan extents, both heights and the
turning landing; a nearby sloping parapet cannot qualify.

The reproducible preparation script is `scripts/indoor/prepare-unbc-ramp.ts`.
The compiler now proves every segment continuously against the owned native ramp
triangles and named lower/upper slabs #400238/#1514723, and rejects native wall
or stair crossings. A bounded ramp-to-endpoint-slab seam is a separate explicit
native recipe proof; it is never a generic walking tolerance.
The prepared wheelchair route goes from 07-180 to the Conference Centre ramp
landing through two explicitly reviewed approach edges and `ramp:1622190`.
The ramp path retains both runs and the turn; shortest-path display must never
replace it with a straight connection across the parapet. Both directions work.
The existing stair edge remains non-accessible, and both compiled elevators,
the RVT identity, native scene and all pre-existing edges are retained.

The reference pin is labelled “Ramp · wheelchair route”. A distinct slope icon
sits at its real source location/elevation, and simplified 3D views draw the
measured ramp faces with a continuous rise. Source view uses the existing native
model. The inspector reports the maximum native slope (about 9.5%). This is a
user-requested, source-supported step-free route review, **not a certification
of wheelchair suitability or building-code compliance**; actual slope, clearance,
handrails and access should be checked on site. Other unreviewed campus edges
remain excluded from the wheelchair/step-free profile.

`rampDisplay` is optional in the portable dataset and binds source faces to an
explicit `ramp` edge, native element ID and model SHA. Display cannot change
routing eligibility. Changing the edge to unconfirmed, disabling it, or changing
its source binding blocks the reviewed route; stairs cannot become a fallback
in wheelchair mode. `rooms.indoorRamps` retains the source review evidence. Reviter now consumes
that field directly during normal preparation and regenerates the native ramp,
landing approaches, display faces and explicit reviewed accessibility. The
UNBC preparation script is a historical recipe authoring tool; a post-processing
pass is no longer needed after regeneration.

Validation: forward/reverse routing and instructions, exact turning-path
preservation, disabled/unconfirmed rejection, stair fallback exclusion, native
marker height/model binding, archive round trip, and desktop/mobile UI checks.
The geometry and route report is `docs/unbc-native-ramp-audit.json`.

Visitor navigation was also checked on desktop and mobile: select the reviewed
step-free profile, preview directions, and activate “Take the ramp up within
Campus Floor 1”. The map follows the ramp's U-turn with a ribbon at the measured
surface height, separate from the curved stairs. All 67 relevant unit checks,
the two visitor navigation browser cases, TypeScript checking, the production
build and targeted lint passed. The browser proof is
`docs/screenshots/unbc-wheelchair-ramp-directions.png`.

### Full locally recoverable preparation (2026-10-02)

The current result and exact inventory are in [Systematic routing](unbc-systematic-routing.md).
Preparation independently derives unique native wall enclosures in memory before
matching entrances. Exact same-height floor support must preserve the enclosure
exterior and source/reviewed anchor; real inner openings remain holes. The
original authoring contours and reviews stay unchanged. Registered DWG wall
enclosures and source-backed wall joins have separate display provenance and
cannot authorize routing. Corridor-to-corridor seams require two-foot continuous
native support and explicit wall, doorway, column, void and third-room vetoes.

The portable dataset now includes model-bound `walkingSupport` floor profiles.
Route centering checks continuous floor membership, retains every selected native
door crossing and fixes doorway/opening/vertical anchors. Known native slab
openings require a supported detour or another graph branch. Ordinary transit
preference is proportional to distance (four times ordinary-room length), so
subdividing an edge does not change route choice. Missing profile coverage remains
source geometry with unknown proof; `nativeFloorSupported` is a centerline proof,
not a body-clearance or accessibility certification.

Repeat an exact-model local regeneration using the full reviewed master and its
hash-bound decoded native cache:

```sh
npm run indoor:regenerate-cache -- /absolute/master.reviter.zip /absolute/native-cache.json /absolute/new-output-directory
```

The driver refuses a foreign model cache, lost existing arrivals/lift stops/ramps,
changed source assets or mismatched master/viewer data. It creates new master and
2D/3D viewer files without overwriting originals.

### Finite seams, drawing-only doors and exact room contacts

An `openingSpan` permits a route to choose a crossing within a finite, certified
doorless circulation seam. Its model hash, native level, named physical floor
IDs, two endpoint coordinates and convex aperture are validated on import.
Endpoint margins reserve the prepared two-foot strip. The resolver rechecks each
candidate strip against the exact floor, aperture and barriers; it never moves a
native doorway or treats the rest of a corridor as body-clearance certified.

A `sourceDoorProof` represents a doorway independently identified in a registered
drawing when there is no usable native door element. It binds the exact model and
drawing hashes, section, physical elevation, named native floors, jamb indices,
leaf/swing indices, registration error and walking aperture. Its
`doorSymbolCollection: "wallSegments"` records where those actual drawing
primitives were stored. It remains a fixed `door` edge without a fabricated
`nativeElementId`. Saved closure, direction and access rules still apply;
unknown accessibility stays unknown. Stale proofs reject the connection.

Registered room presentation can normalize contact-only clipped rings by splitting
exact repeated contacts and removing zero-area backtracks. Original filled region
and hole area must remain identical within numerical tolerance. True crossings,
disconnected positive cells and real tiny holes retain diagnostics. This display
repair neither edits the source outline nor authorizes a new routing interior.

The remaining source repair groups and authoritative examples are in
[Source repair queue](unbc-source-repair-queue.md). Genuine shared open zones need
an explicit area/POI classification; distinct labels alone do not justify invented
walls or merged room boxes.


## Curved corridor routing (2026-10-02)

The Pub Entrance 06-260 → Bookstore 07-240 example exposed a limitation in rectilinear path refinement: preferring a small number of native-axis elbows also made a genuinely curved lobby look angular. `curved-route.ts` adds a geometry-derived bend candidate to the existing resolver. It detects sustained, consistently turning circulation boundaries, traces local free-corridor cross-section midpoints, relaxes the trace and validates every chord continuously. Thin columns, walls, room masks, selected native apertures, physical-height native slabs and holes retain their original vetoes. The candidate must respect the walking budget and doorway direction/policy. Fixed endpoints and source graph identities remain intact. A nearby curved column, rectangle or raster staircase cannot authorize a curve.

This implementation adapts the corridor-centre principle described in [the Explicit Corridor Map research](https://arxiv.org/abs/1701.05141). [Godot’s navigation documentation](https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationpathqueryobjects.html) distinguishes a raw polygon search corridor from its final refined path and explains funnel-based refinement. The viewer still uses its existing graph and clearance queries; it does not introduce a full ECM/navmesh replacement or claim a clearance-radius certification.

Resolved paths carry optional `curveRanges` with coordinate indices. Navigation instructions use one “Follow the curved corridor” step instead of treating each curve facet as a turn; the curve’s final tangent supplies the heading for the real exit turn. The same coordinates drive 2D lines, 3D ribbons and Next-step following. Confirmed step-free profiles continue using their saved geometry.

On the reviewed all-ramps package, this example preserves the exact selected graph nodes, doorway dependencies and elevator edge, with measured distance 103.17 → 103.14 m and turn instructions 7 → 5 plus one curved-corridor instruction. The runtime improvement needs the updated viewer, not a source-model edit. `scripts/indoor/audit-curved-route.ts` checks the example and its reverse plus the straight Library route in both directions against exact native slabs, walls, columns and supported joints. All 73 checked resolved segments pass; source dataset JSON is unchanged. Evidence: `unbc-curved-route-proof.json`.

Validation passed: 99 unit tests, scoped TypeScript checking, the production build and targeted lint. Both browser journeys passed through to the Bookstore and Campus Floor 1, with desktop in 2D and mobile in 3D. They verify the curved instruction, displayed route geometry, camera following and Next-step completion. Browser results: `unbc-curved-route-browser.json`; screenshots: `screenshots/unbc-curved-corridor-desktop.png` and `screenshots/unbc-curved-corridor-mobile.png`.

### Shared landing connectivity (2026-10-02)

The apparent break at the northeast end of the curved Conference lobby exposed a preparation exclusion: all stair-labelled areas were omitted from circulation seam recovery, including 06-S204 whose existing human review identifies a shared hallway landing. Consequently the Pub Entrance → Bookstore route used native doors through 06-205 Multi Purpose Seminar instead of the open landing. A source outline gap of 0.052197 ft (15.91 mm) also separated the landing and 06-210 corridor.

The generic seam finder now accepts a stair-labelled area only when its saved `spaceUse` explicitly marks a user-reviewed hallway and `stairAccess` is `flight-and-landing`. Exact coplanar native floors must support the full two-foot crossing footprint; source/native walls, columns, third-room masks and holes retain their vetoes. The actual stair identity and vertical flights remain intact. The same eligibility governs finite opening-span preparation. This is a repeatable preparation change, without hard-coded room identities or global polygon-gap tolerance increases.

The viewer paints only the model-bound prepared opening apertures, clipped to same-height floors and excluding walls, columns, other rooms and holes. These small floor patches remove a visible contour seam; presentation cannot create a graph connection. Runtime source polygons remain ownership/classification constraints, while physical support and barriers decide whether a seam is usable.

The rebuilt example now traverses 06-214 Lobby → 06-S204 shared landing → 06-210 Corridor, avoiding Seminar room transit, and measures 99.05 m forward. Both directed journeys passed 82 independent flat-segment native floor/wall checks, including fixed threshold sections. Original source assets and review JSON are byte-preserved; master and viewer dataset equality was checked. The final packages and proof reports are in `/Users/ahmadjalil/Downloads/UNBC.shared-landing-fixed`. Native evidence: `unbc-shared-landing-openings.json` and `unbc-shared-landing-route-proof.json`.

Validation: 16 source seam/span tests and seven focused viewer tests passed; the desktop 2D and mobile 3D journeys passed through arrival and floor change, including the two painted landing apertures. TypeScript, build and targeted lint passed. The broader 104-test viewer run has 103 passes and one failing existing Agora route-length assertion (`centered-route.test.ts`, certified opening case); the runtime route resolver was not edited in this junction pass. This failure is recorded in `work/corridor-junction/viewer-tests.log`. Browser proof: `unbc-shared-landing-browser.json`; screenshots: `screenshots/unbc-shared-landing-desktop.png` and `screenshots/unbc-shared-landing-mobile.png`.

```sh
node --max-old-space-size=4096 --import tsx scripts/indoor/audit-curved-route.ts prepared.zip exact-native-cache.json proof.json
INDOOR_PROJECT_ZIP=/absolute/prepared.zip npx playwright test --config work/curved-corridor/playwright.config.ts --workers=1
```

### Pin 4: circulation outlines versus physical floors (2026-10-02)

Review pin 4 at model feet (-141.213935, -89.495983), native level 694, is inside the reviewed 06-S204 shared landing. The native GLB section visibly confirms that the traced green circulation contour does not follow all wall faces or the stair footprint. The pin itself is supported by native slab 1327372 at elevation 14.4356955 ft and lies outside the prepared native obstacles. This is a boundary mismatch, rather than missing slab support at the pin or a different model registration.

The repeatable, read-only `scripts/indoor/audit-pin-floor.ts` validates the project/cache/pin model identity and compares a 28 × 28 ft patch against exact coplanar slab profiles, native barriers, low stair projections, holes and noncirculation/private room claims. At this pin, 55.5332 sq ft of physical clear floor falls outside the traced circulation, while 34.7342 sq ft of traced circulation overlaps native obstacles (34.3354 sq ft overlaps the low stair projection). No traced circulation in this patch falls outside the native slab. Report: `unbc-pin-4-floor-audit.json`. Visuals: `screenshots/unbc-pin-4-source-model.jpg` and `screenshots/unbc-pin-4-floor-comparison.png`.

The preparation currently promotes uniquely owned, noncirculation room interiors from native wall enclosures; it explicitly excludes circulation and stair records. Thus 06-S204 retains its source trace without a `nativeRoutingBoundary`. The native-model overlay also paints the record rings directly. Certified threshold patches solve a connection seam, not the remainder of that outline. Curved path refinement likewise cannot recover clear space omitted by its input region.

The required geometry correction is to derive circulation cells from exact same-elevation slabs and native wall faces, retaining columns, doors, floor holes and actual stair/headroom barriers. Source labels and reviewed access should assign identities to those cells, and the same derived region should drive display, graph rebuilding and centreline refinement. A complete physical slab alone does not establish public circulation: unlabelled space and ambiguous room ownership require review. The orange comparison patches are diagnostic candidates, not newly authorized routes. This audit does not change the live routing graph or claim that all corridor boundaries have been rebuilt. Pin edits were exported and preserved.

```sh
node --max-old-space-size=4096 --import tsx scripts/indoor/audit-pin-floor.ts prepared.zip exact-native-cache.json pin-review.json audit-output
```


### Native floor-bound circulation (October 2, 2026)

Reviter's preparation pipeline now produces optional `circulationGeometry` cells directly from coplanar native floor profiles and their holes, with walls, columns, native door footprints, protected room claims and low stair projections subtracted. Original room outlines classify whole connected cells; they no longer define the recovered circulation boundary. A cell needs at least 65% circulation ownership coverage. Unlabelled slabs or incomplete enclosures stay in the review report; no hull, dilation or bounding rectangle fills their gaps. Native coordinate booleans use a 1e-6 ft numerical precision grid to dissolve duplicate floating-point faces.

Both OpenIndoorMaps routing and its 2D/3D/source-model overlays consume those cells. Room identities and ordinary room blocks are retained. Fixed door/stair/elevator anchors and the original rules for thresholds and floor changes are preserved. The cell graph rebuild replaces its own older generated branches. Geometry/access edits invalidate the prepared cells and block their new branches until regeneration; a label-only edit does not invalidate them. New branches retain unknown accessibility pending clearance/access review.

The rebuilt example is `/Users/ahmadjalil/Downloads/UNBC.native-circulation/UNBC.master.reviter.zip`; the companion `UNBC.campus-viewer.zip` carries the same compiled dataset. Source RVT, GLB, GIS, room review metadata and reference pins are preserved. Rebuild an existing reviewed master without decoding the RVT again using the exact-model native cache:

```sh
node --max-old-space-size=6144 --import tsx scripts/indoor/rebuild-native-circulation.ts   /absolute/path/reviewed.master.reviter.zip   /absolute/path/exact-model-native-cache.json   /absolute/path/new-output-directory
```

Validation: 144 native cells, 1,784 walking branches and 7,173 continuously checked cell-contained line segments with no boundary violations. Around pin 4, 31.17 sq ft of previously omitted clear floor is recovered; overlap with native obstacles drops from 34.73 sq ft in the old trace to 0.000005 sq ft of numerical residue. Some nearby clear floor remains unclassified; native geometry does not by itself prove public access. Pub Entrance → Bookstore passes independent native floor/wall checks in both directions, with the curved corridor preserved. Library and Tea Lab stair pairs and both compiled lift routes still change physical levels. The Library corridor → upper stair, Conference stair destination pair and Meeting → Classroom cases remain unavailable in this reviewed source package; they are recorded rather than silently joined.

Evidence: `docs/unbc-native-circulation-audit.json`, `docs/unbc-native-circulation-route-proof.json`, `docs/unbc-native-circulation-browser.json`. The compiler has 21 focused passing tests, the viewer has 10, both scoped TypeScript checks pass and both production builds pass. Five passing browser tests cover desktop/mobile native cells, actual rendered curve coordinates, Next-step camera follow, arrival, all seven lift stops, both lift previews and their destination floor changes. A production-build test verifies preserved pin 4 and the native GLB section at Floor 2; see `docs/screenshots/unbc-native-circulation-pin-production.png`. Broader existing test/lint failures outside this change are not represented as a clean whole-repository result.


## Continuous native corridor bends (2026-10-02, 15:45)

The 06-260 Pub Entrance → 06-204 Service Pantry example was 74.7 m with four reported turns. It combined fixed sample anchors at semantic corridor seams with cross-section centres pulled towards side outlets. Those seams now permit continuous refinement only when the current native circulation cell contains the entire saved crossing, both owners are walkable circulation with matching access, the model-bound opening proof is valid, and the edge is enabled and bidirectional. Physical doors, directed openings, access changes, stale proofs and disconnected cells retain their thresholds. Graph edges, room identities and access reviews remain unchanged.

Repeated circular native facets can now supply a stable circular walking lane with tangent approaches. Median cross-section measurements select its radius; a bounded adjustment handles tighter wing junctions. Every arc chord and approach is checked continuously against the original floor, hole, wall, pillar and room constraints. Unsupported bends retain the existing trace refinement. This applies to imported geometry generally, with no Building 06 coordinates or room IDs in the resolver.

The pantry route is now 71.7 m, one curved-corridor instruction and one remaining right turn, in both directions. Its 11 unknown public-access areas remain unknown. The selected native doors retain their exact geometry. The Bookstore multi-floor route retains its selected elevator and floor transitions. The independent audit checks 230 resolved segments against native slabs/walls and checks curved paths against native circulation cells. See `unbc-smooth-bend-route-proof.json` and `screenshots/unbc-smooth-bend-overview-desktop.png`.

Validation: 52 unit tests, four desktop/mobile pantry and multi-floor Bookstore preview/Next-step journeys, native GLB review on the master package, scoped TypeScript and the production build. The updated viewer uses the existing native-circulation package; no ZIP regeneration is needed. Targeted new-module/test lint passes; `centered-route.ts` has existing broader lint findings outside this change.

## Destination arrival options (2026-10-02)

Directions and the review Route test panel now have a custom **Stop directions** menu: **Inside room** (default), **At doorway**, and **Hallway outside door**. The browser remembers the choice. It is a viewer preference, not a project geometry edit, so no prepared ZIP regeneration is required.

The resolver shortens the selected, policy-checked route at its actual final entrance. The doorway option intersects the resolved path with the verified aperture's threshold plane; the hallway option stops on that entrance's saved hallway-side approach plane. Both use the same truncated coordinates for map drawing, distance and the final navigation instruction. Native or source-certified doorway/opening geometry must be present. Source nodes and edges remain unchanged, and floor transitions remain intact. These options require a valid full route under the selected access profile; they do not authorize a connection through an inaccessible or closed room.

Unavailable choices show their reason. In particular, an entrance into another room cannot provide a hallway stop. On the current native-circulation package, 06-260 Pub Entrance → 07-240 Bookstore measures 96.3 m inside, 84.5 m at the doorway, and 84.3 m on its hallway side; all retain the same elevator transition to Campus Floor 1. For 06-204 Service Pantry, the selected entrance opens into 06-205 Seminar, so the hallway option is unavailable while inside and doorway remain supported.

Validation: 57 focused unit tests, scoped TypeScript, targeted new-module/test lint and production build passed. Two browser journeys passed on desktop (1440 × 980) and mobile (390 × 844), checking both shortened arrival modes through every Next step, the exact rendered endpoint, final physical floor, remembered preference and unavailable hallway choices. Evidence: `unbc-arrival-options-audit.json`, `unbc-arrival-options-browser.json` and `screenshots/unbc-arrival-menu-mobile.png`.

### Native Agora slabs and solid fixtures (October 2)

The two supplied Agora pins exposed three general failures: narrow native wall
seams joined circulation to large unlabelled slab regions, a polygon sweep
failure silently omitted slab 423406, and multiple exterior loops on slab
2484309 were interpreted as one exterior with holes. That last element is a
low solid fixture with three separate tops, including the triangular top.

Preparation now retains persisted wall end faces and classifies native floor
profile nesting into separate shells, holes and islands. An independent exact
JSTS material overlay recovers slabs when the primary clipping operation fails.
A two-foot clearance separation breaks sub-width seams before ownership
classification; it never extends outside native floor or through barriers.
Inferred circulation-outline holes are not treated as native slab voids;
explicit reviewed openings and actual slab holes remain excluded.

The compiler records every assessed circulation owner, accepted native cells,
and physically clipped unresolved review surfaces independently. A tiny
accepted fragment cannot suppress the rest of its source area or restore an
old outline across a fixture. Legacy walking edges are continuously checked
against those physical surfaces. Actual native fixture tops travel separately
and render as solid neutral blocks in both room views. Slabs supporting an upper
storey are excluded from fixture caps; multiple native planes may share one
campus display floor. Source records, fixed
nodes, doors, vertical connectors, original model/GIS assets and all six review
pins remain preserved.

The rebuilt package is `/Users/ahmadjalil/Downloads/UNBC.native-agora/UNBC.master.reviter.zip`.
Its 164 accepted cells yield 2,452 branches; all 9,894 branch segments pass
continuous containment. At the first pin, 25.84 square feet of omitted usable
floor is restored. The remaining 3.75 square feet is a sub-width hollow column
interior, not circulation. At the fixture pin, 98.69 square feet of erroneous
source circulation overlaps native obstacles; rebuilt overlap is below
0.00001 square feet of rounding residue. Unclassified regions and the existing
unavailable source connections remain review work. This does not certify all
campus routes or new elevator stops.

Reproduce using `scripts/indoor/rebuild-native-circulation.ts`, then
`audit-native-circulation.ts`, `audit-shared-landing.ts` and `audit-pin-floor.ts`.
Regression coverage includes disjoint slab shells, nested voids, persisted
wall caps, tiny seams, low fixture tops, failed polygon overlays and legacy
walk rejection. Browser checks load the exported package, inspect actual map
sources and render the pinned areas on desktop and mobile.
### Repeatable random multifloor audit

Run `node --import tsx scripts/indoor/audit-random-routes.ts project.zip report.json 120 20261002`
to sample 120 public and 120 step-free requests between different campus floors.
The seed is repeatable. The report binds its input ZIP by SHA-256, records timing,
failure reasons and full-route hashes, checks enabled/directed/profile-permitted
edges, endpoint continuity, floor-change instructions and native floor openings,
and confirms that routing leaves the dataset unchanged. It also emits
`report.geometry-input.json` for the independent `audit-resolved-geometry.ts`
native-wall/column check. That proof covers centered and clearance-validated
planar sections; it does not certify preserved source or vertical geometry.

The October 2 sample is saved in `docs/unbc-random-routing-audit.json`: 79 of
120 public requests produced routes; 27 lacked source connections, 13 were
blocked by native floor openings, and one had rejected circulation evidence.
All 120 step-free requests were blocked by unverified/source connectivity;
the sampled ZIP has no confirmed multifloor step-free links. No calculation
exception or transition mismatch occurred. Independent proof checked 2,096
walking segments without obstacle crossings. These are sampled results,
not campus-wide accessibility certification.

Profiling revealed repeated scans of detailed polygon edges. Conservative
vertical edge bins retain exact containment/boundary arithmetic and rebuild
after edits. For the 39 successful baseline pairs, median calculation dropped
from 2.94 seconds to 1.02 seconds, with unchanged supported walking geometry.
The slowest baseline pair, `10-2014` to `07-242`, dropped from 16.53 to 2.55
seconds. The full 120-pair public sample's maximum was 3.11 seconds. Timings
are local Node measurements with a prepared graph, not mobile timing guarantees.
Completed failed routes are cached under the same exact source-policy/geometry
binding as successful routes, so failure explanations avoid another route search.
Set `INDOOR_PROJECT_ZIP` to the master ZIP and run
`tests/e2e/indoor-random-routes.spec.ts` to check representative sampled requests
through the actual route worker on desktop and mobile.

### Continuous native floor approach joins

Generated `native-circulation:` connections can be stored as `opening` edges
when they join different source surfaces. They are not automatically physical
doorways. A current model-bound native cell must cover the entire saved approach
and all its circulation owners, with matching access and elevation, before the
resolved route can align that approach with its adjoining corridor guides.
Directed connections, finite apertures and stale or disconnected cells retain
their thresholds. Source graph edges and policy metadata remain unchanged.

The resolver first centers each supported walking section, then simplifies the
combined guide against native wall axes, exact floors, walls, columns, masks
and selected doorway crossings. It accepts a join only without increasing
turns or distance. Projected source anchors divide the cleaned line into its
original edge groups without introducing bends, preserving Library/Agora
building labels in the navigation preview. Curved and vertical sections retain
their existing handling.

`docs/unbc-corridor-join-audit.json` records eleven selected master-package
requests. Washroom `05-113` to Office `07-148A` changes from 131.6 m and 13 turns
to 128.8 m and 9 turns; the reverse direction drops from 16 to 10 turns.
Straight Library corridor routes retain their geometry. All selected directional
door crossings and vertical instructions remain unchanged; two source-blocked
requests stay blocked. Independent checks found continuous floor support and
no native obstacle crossings across 185 resolved walking segments.

Regression tests in `native-circulation.test.ts` cover both directions, building
labels, finite/directed thresholds, stale geometry, access changes, native cell
holes, walls and columns. Run alongside the existing centered-route and policy
tests:

```sh
node --import tsx --test tests/unit/native-circulation.test.ts tests/unit/centered-route.test.ts tests/unit/indoor-project.test.ts tests/unit/route-worker-client.test.ts
```
