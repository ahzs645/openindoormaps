# Room boundaries, clean room blocks and navigation: research and remaining work

Research date: 2026-10-01. This document combines a read-only review of the current Reviter/OpenIndoorMaps routing code with primary online documentation. Recommendations are engineering proposals, not claims that the referenced products use our exact algorithm. The prepared presentation-boundary work being implemented in this session does not by itself complete source-room reconstruction or regenerate the navigation graph.

## What the current source audit establishes

The package audit reported 1,776 of 1,860 room annotations as `source.polygon = "derived"`, with 76 marked `vector-walls`. Reviter's region extraction traces a raster and simplifies its outline; `indoor-pipeline.ts` copies those annotation polygons directly into prepared `records[].ringsFeet`. Re-exporting unchanged annotations preserves the clipped/inset corners. See [the audit](./unbc-room-source-processing-audit.json) and [the pipeline guide](/Users/ahmadjalil/github/reviter/docs/indoor-project-pipeline.md).

Viewer recovery of some wall enclosures and small wall-junction repairs improves presentation, but it cannot establish that every room has an authoritative native boundary. An ordinary raster approximation and a verified enclosure must remain distinguishable in provenance and diagnostics.

## Primary sources and implications

### Revit can supply semantic room boundaries when a native exporter is available

Autodesk's [`SpatialElement.GetBoundarySegments`](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/8e0919af-6172-9d16-26d2-268e42f7e936.htm) returns boundary segment collections rather than requiring reconstruction from a rendered volume. There may be multiple regions. The [Room example](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/75c9d2c7-a402-ea8b-9e7c-f8bc3510bbd5.htm) exposes curves and contributing boundary element IDs.

The [room-boundary authoring documentation](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-ArchDesign/files/GUID-C7338362-6D35-471B-90B0-6A893534FFE2.htm) explains room-bounding elements, separation lines and linked-model configuration. Thus "walls define the room" is an incomplete rule: a legitimate boundary may include a separation line, and a visible linked wall may not be enabled as room-bounding. The [Rooms API guide](https://help.autodesk.com/cloudhelp/2021/ENU/Revit-API/files/Revit_API_Developers_Guide/Discipline_Specific_Functionality/Architecture/Revit_API_Revit_API_Developers_Guide_Discipline_Specific_Functionality_Architecture_Rooms_html.html) also documents unbound rooms and door `FromRoom`/`ToRoom` associations.

Autodesk's [room/space geometry calculator guide](https://help.autodesk.com/cloudhelp/2025/CHS/Revit-API/files/Revit_API_Developers_Guide/Revit_Geometric_Elements/Geometry/Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Geometry_Room_and_Space_Geometry_html.html) describes finish-face versus centerline options and boundary-element relationships. Its caveats matter: wall-cutting openings are excluded from returned faces, and bottom room faces generally do not prove actual floor-slab support. Export doors and floor openings separately.

### Indoor topology must remain separate from drawing geometry

[OGC IndoorGML 2.0](https://docs.ogc.org/is/22-045r5/22-045r5.html) separates cellular geometry from logical/geometric networks. A connectivity graph is a subset of the adjacency graph: rooms may share a wall without having a traversable connection. For our implementation this means clean shared block edges cannot automatically create door links, and smoothing a room display polygon cannot establish public access.

### Route simplification differs from rounded line rendering

[Mappedin wayfinding](https://developer.mappedin.com/web-sdk/wayfinding) documents line-of-sight-validated simplification separately from visually rounded path corners. Doors and floor-transition nodes are retained. This supports keeping native portal identities and continuous barrier checks during simplification. Merely making a jagged line look smooth does not correct its underlying walking path.

### Navmeshes and skeletons have useful but different roles

[Detour's query API](https://github.com/recastnavigation/recastnavigation/blob/main/Detour/Include/DetourNavMeshQuery.h) distinguishes searching a polygon corridor from finding the straight path inside it. [Recast's configuration](https://github.com/recastnavigation/recastnavigation/blob/main/Recast/Include/Recast.h) includes obstacle erosion through `walkableRadius`. These are reference implementations for continuous free-space routing and clearance; adoption is not a requirement for the present repair.

The [CGAL straight-skeleton manual](https://doc.cgal.org/latest/Straight_skeleton_2/index.html) warns that skeleton edges need not be centered in concave polygons. A skeleton should therefore not be accepted as a hospital-style corridor centerline without clearance and centering validation. Local wall frames and cross-section center lanes remain a practical approach for orthogonal corridors.

### Floor connections require entrances, direction and served-floor identities

[Mappedin connections](https://developer.mappedin.com/web-sdk/connections) associates coordinates with specific floors. Its [MVF connection specification](https://developer.mappedin.com/docs/mvf/v3/mvf-v3-specification/mvf-connections) models distinct entrances and exits, permitting directed escalator travel and per-entrance navigation flags. [OSM Simple Indoor Tagging](https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging) distinguishes vertical feature span from access openings on individual floors. A shaft passing a level is not evidence that an elevator stops there.

## Two acquisition paths

### Optional native Revit companion export

An exporter executing through the Revit API could supply placed/enclosed Room/Space boundary curves with finish-face settings, boundary element identities, native room/door IDs, phases, design options, link transforms, units and level/elevation identities. Preserve curves or tessellate with a recorded tolerance rather than reducing each curve to its endpoints. Export door associations and apertures, floor/slab holes, and supported vertical connectors independently.

This is an additional native-runtime integration. The offline parser does not gain Revit's semantic boundary calculation merely by receiving an RVT. The companion is useful when a source model contains valid semantic rooms and its native environment is available; it will not cure absent/unplaced rooms or incorrect room-bounding settings.

### Offline reconstruction in the current pipeline

Continue deriving planar cells from supported native wall faces/footprints and registered structural plan linework. Distinguish structural edges from door leaves, swing arcs, furniture and annotation graphics. Use native door thresholds to close enclosure analysis gaps, then restore their traversable apertures for navigation/display. Heal only supported small junction gaps with explicit units and tolerances. Reject missing-wall gaps, corridor leakage, incompatible surfaces and ambiguous label-to-cell matches instead of inflating every raster outline.

Existing labels identify candidate cells; their approximate polygons should be matching evidence rather than mandatory walls. Preserve room/source IDs and expose unresolved diagnostics for review. Native reconstruction and registered-drawing reconstruction should retain different provenance.

## Required geometry separation

| Representation | Purpose | Invariants |
| --- | --- | --- |
| Navigable interior | Door association, arrival anchors, graph construction and clearance | Inner wall faces; supported floor surface; genuine holes/open drops; no absorbed wall material |
| Display block | Low hospital-style room solids and 2D room fill | Shared wall thickness may be allocated deterministically; flat/open circulation; genuine voids and apertures remain clear |
| Native source geometry | Model inspection and provenance | Preserve original model/GIS identities and bytes; columns and structural walls remain routing obstacles even when hidden visually |

Prepared presentation boundaries are suitable for the second representation. **If only display geometry changes, route data may remain unchanged. If the actual navigable interior changes, regenerate doors, anchors, graph edges and related reviews.** Do not silently reuse geometry-bound accessibility approval after such a change.

## Implemented and measured in this session

Reviter now prepares optional, source-bound `presentation` data alongside its reviewed routing records. An independent presentation CLI can update an existing prepared ZIP without reconverting its RVT. OpenIndoorMaps validates model/record bindings, renders those block footprints consistently in visitor 2D and 3D, hides entrance geometry in visitor mode while keeping actual door gaps, and exposes unresolved boundary diagnostics in review mode. Blocking a room during review removes that room's cached display block.

The native stage uses JSTS to node wall-face and supported doorway linework. Duplicate undirected noded edges are dissolved before polygonization: actual overlapping native wall faces otherwise produced false cut edges. Supported wall end-cap repairs are limited to 0.04 feet (12.2 mm), separately from the 0.0001-foot computational precision. The [JTS polygonizer documentation](https://locationtech.github.io/jts/javadoc/org/locationtech/jts/operation/polygonize/Polygonizer.html) explains the fully noded linework requirement and unresolved topology classes; these are not permission to bridge unsupported source gaps.

Actual source-label benchmark: **889/1,566** eligible interiors recovered. Display preparation retained **881 blocks**, with eight recovered cells omitted after protected floor/aperture cuts left no display block. **685 source-room fallbacks remain**. See [native enclosure audit](./unbc-native-room-enclosure-audit.json), [prepared package audit](./unbc-prepared-room-presentation-audit.json) and the ZIP's companion presentation report.

The package audit checks all prepared blocks against same-floor circulation, explicit void masks, native doorway apertures, source holes and other prepared blocks. No overlaps above 0.01 square feet were found using the compiler's local 0.0001-foot precision. RVT, scene, GIS and room annotation bytes match the input; routing records, nodes, edges, walls and doors also match. This is a presentation audit, not certification of every source interior or accessible passage.

The recovered examples include 05-139C Office, 05-113 Washroom and 05-109 Kitchen. 05-107 Meeting and 05-108 WC share the same native enclosure despite all nearby native doorway thresholds passing support checks; their dividing wall remains missing or ineffective in recovered structural geometry. The viewer retains its older partial wall-enclosure fallback for those rooms. This does not establish independent authoritative interiors.

Shared straight rectangular walls split at their centerline independently of room names/input ordering; adjacent rooms on one long perimeter wall meet across their supported partition. Ambiguous irregular shared material stays neutral at the same roof height. This follows our explicit display policy, not a claim about Mappedin's implementation. [Mappedin's spaces documentation](https://developer.mappedin.com/web-sdk/spaces) supports separating spaces and door apertures, with doors hidden by default.

## Prioritized remaining implementation work

1. **Boundary provenance and unresolved reporting.** Record method, tolerance, native wall/door IDs, source model digest, floor/surface identity and failure reason. Report unclosed cells, multiple matches, misplaced labels, circulation leakage, overlaps and missing floor support. Establish before/after coverage by floor/building; a few correct example rooms are insufficient.
2. **Authoritative source interiors.** Integrate verified reconstructed cells into reviewed Reviter annotations without overwriting ambiguous cases. Support room separation lines, curves, linked-model transforms and genuine floor holes. Add optional native semantic-boundary import when available.
3. **Prepare consistent display blocks.** Generate them independently from interiors, allocate shared walls without annotation-order dependence, and preserve door cuts and corridors. Test narrow walls, wall intersections, adjacent rooms, pillars, holes and source-outline fallbacks. The current session's prepared presentation work addresses this stage, not every preceding/following stage.
4. **Regenerate topology when interiors change.** Re-run door matching, portal-side checks, arrival snapping, masks and graph construction. Compare matched/unmatched doors, isolated rooms and connected components. Retain source connector IDs; changes in room shape do not authorize new doors or connectors.
5. **Improve prepared corridor routes.** The current four-neighbor 0.6-foot wavefront has no center-clearance or turn-state preference. Add validated corridor-center lanes or a clearance/turn-aware regional search. Derive local frames from structural walls rather than approximate annotation edges, accommodate rotated wings, and keep open plazas as open space. Retain full-segment native-barrier validation.
6. **Introduce clearance as a separate requirement.** Existing zero-width segment/barrier checks prevent crossings but do not prove sufficient passage width. Define an explicit route profile/radius and erode free space or measure continuous clearance. Preserve narrow doorway constraints and distinguish ordinary public route review from confirmed step-free routing.
7. **Extend connectors only from supported evidence.** Current prepared contracts contain `walk`, `door`, `opening`, `stairs` and `local-steps`; they have no elevator/escalator/direction model. Add typed served-floor entrances/exits, direction, native IDs and review evidence when real elements or reviewed source evidence exists. Never infer an elevator, an escalator direction or accessibility solely from a label or overlapping XY coordinates.
8. **Revalidate the visitor experience.** Test route instructions and camera/floor following on desktop/mobile, including entering a connector, switching the actual native floor, exiting it and reversing the journey. Keep source-review failure explanations actionable.

## Acceptance checks

- Polygon validity, closure, holes and deterministic results under annotation-order changes; source/GIS preservation.
- Labels and arrival nodes lie inside their verified navigable interiors; source/fallback status is visible in review metadata.
- No unwanted room-room or room-corridor overlaps; wall-absorbing display blocks do not become traversable geometry.
- Matched doors join supported regions on opposite sides of the correct native wall/floor; missing footprints, unmatched doors and unresolved arrivals remain explicit issues.
- Every continuous route segment is contained in supported walkable space and crosses walls only through its own approved aperture; columns/voids remain obstacles when hidden visually.
- Clearance and route-shape fixtures: straight corridor, one right-angle turn, serpentine corridor, rotated wing, open atrium, dead end, thin divider, blocked door, narrow passage and reverse route.
- Before/after connectivity audit for existing routes; inspect newly disconnected and newly connected components rather than accepting a lower unmatched-door count alone.
- Real multilevel stairs keep element IDs, entrances and elevations; shaft span does not create unserved-floor access; directed connectors do not become bidirectional.
- Geometry-bound access reviews become stale after relevant regeneration; unconfirmed step-free routes remain unavailable.
- Already at destination, disconnected geometry, disabled entrances and restricted access produce distinguishable outcomes.
- Desktop/mobile 2D/3D preview and next/previous/floor-follow checks use the regenerated package, not just a synthetic fixture.

## Scope of this research

The online references establish available APIs, data-model patterns and reference algorithms. They do not prove that the UNBC source has valid native Revit Rooms, that all apparent wall gaps can be healed automatically, or that the BC Hospital demo uses a particular skeleton/grid technique. Those claims require inspection of source data and measured reconstruction/route results. Package-wide source reconstruction, matched portal coverage, clearance and connector completeness remain separate deliverables beyond cleaner prepared presentation boundaries.


Final validation for this change: 33 targeted Reviter unit tests and 31 OpenIndoorMaps unit tests passed. Four real-package desktop/mobile browser workflows passed, covering room geometry, common 2D/3D footprints, visitor door visibility, native pillar toggles, complex right-angle routing, stair floor-following/reversal, consecutive floor milestones and unconfirmed step-free rejection. Both production builds passed. OpenIndoorMaps scoped TypeScript and new geometry-module lint checks passed; Reviter's focused preparation-module TypeScript passed. Full Reviter TypeScript still reports pre-existing errors under `work/**` copies and audit scripts. The first development browser run was invalidated by hot reload; final browser validation ran on a fresh server with watching/HMR disabled.


Independent final route preservation audit: six of eight requested public cases are routable, with complete realized routes identical before/after. Library–Agora is 15.7549 m with one right turn; the complex corridor case is 68.5892 m with two turns. Ordinary rooms 10-1018↔10-4018 route across three native floor transitions at 130.4727 m in both directions. 81 walking segments were checked against native wall/column barriers with zero crossings; this is a zero-width intersection check, not clearance certification. 05-107↔05-401 remains unavailable in both packages, as do four unconfirmed step-free cases. See [the independent route audit](./unbc-wall-rooms-route-audit.json).

### Turn and clearance preferences; explicit lift/escalator preparation

`lib/reviter/indoor-grid.ts` now uses a weighted multi-source wavefront rather than an unweighted cell flood. Costs include travel length, predecessor-heading changes and distance from blocked raster cells. The latter is a soft preference so known narrow approaches and real staircase entrances are not silently removed. Straight/right-angle shortcut candidates retain continuous native wall/column checks and cannot worsen the weighted cost. Thin floor holes and solid nonwalkable masks are also continuously checked, including openings narrower than one cell. The predecessor-heading preference is a heuristic, not a proof of a globally minimum-turn route. `edges[].routingQuality` records turns and estimated raster clearance; `clearanceCertified` is always `false`. Minimum passage widths still require measured polygon clearance, threshold widths and reviewed access.

`rooms.indoorConnectors` is optional, model-byte-bound review metadata; native XY overlap or room names never discover elevators. Review metadata names each native connector, native entrance element, actual native floor, room anchor, explicit kind, ordered served entrances, travel direction and accessibility. Preparation rejects absent native IDs, incompatible decoded main categories, incorrect entrance native-level associations, out-of-room anchors, staff/void areas, different buildings and stale model bytes. Unsupported anchors are removed during ordinary graph preparation. Escalators have exactly two explicitly directed entrances and cannot be step-free. Elevators may explicitly serve several floors. Older ZIPs remain bidirectional when `edge.direction` is omitted. The viewer validates compiled connector provenance, follows direction in reachability/routing and emits connector-specific floor instructions. Accessible walking edges still require individual confirmations; adding an elevator alone does not certify its approach route.

Unmatched-door diagnostics now list exact candidate room keys and the evidence needed for review. No additional door links are authorized from proximity. `scripts/indoor/audit-navigation-upgrade.ts before.zip after.zip output.json` compares the real UNBC regression routes in both directions and both profiles, ordinary-room three-flight cases, graph/door reports, raster-quality annotations and zero-width native barrier intersections. It distinguishes estimated clearance from clearance certification.

Independent final-package comparison (`docs/unbc-hospital-navigation-upgrade-audit.json`) found 1,610 → 1,639 routable arrivals, 134 → 128 graph components, a largest arrival component of 421 → 432, and unmatched native doors reduced from 411 to 378. All 44 selected direction/profile availability outcomes were unchanged. The realized final routes had 72 same-floor walking segments and zero native wall/column intersections. Minimum estimated raster clearance among 3,887 annotated walking edges was 0.6 feet, which is **not** a guaranteed clearance or passable-width measurement.

A real stair-approach regression was detected during this audit: the initial new source route resolved to 14 turns and 59.30 metres. A continuously validated native-frame orthogonal shortcut pass reduced it to 8 turns and 54.87 metres while preserving exact staircase geometry. The older source had 7 turns and 52.15 metres; the remaining difference is documented rather than presented as complete visual/navigation parity. A compact real-package fixture protects this behavior. Library–Agora remains 15.75 metres/one right turn; the west-vestibule route remains 68.59 metres/two turns. Confirmed step-free versions remain unavailable where approach edges have not been reviewed.
