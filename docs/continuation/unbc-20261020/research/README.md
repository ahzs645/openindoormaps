# How others handle our three hard problems

Web research of October 21, 2026, covering standards, open-source routers, commercial indoor SDKs and BIM-to-indoor papers. Every claim links its source. **[unverified]** marks an inference or a claim taken from a search snippet. GitHub code search was not available, so the repository lists are not exhaustive.

## How this applies here

| Problem                                | What others do                                                                                                                                                                                               | Where this codebase stands                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff rooms inside a shared floor face | No surveyed system rejects a whole walkable area for one restricted member. OpenTripPlanner gives each edge the most restrictive access of the areas it crosses. SDKs keep one graph and filter per request. | The reviewed access-zone carve (`native-access-zones.ts`) already cuts `access-zone:311:b7-staff-halls` out of face 293. Any remaining staff or void member still rejects the rest of the face (`reviter/lib/reviter/native-circulation-geometry.ts:419`). The Hall A–Q decision is applied with [`--access-decision-review`](../hall-a-q-legend/ACCESS-DECISION.json). |
| Cold first route                       | Compact binary graphs (typed arrays), tiles loaded on demand, ArrayBuffers instead of object graphs, verify once, no production deep freeze, warm up early.                                                  | About 15.5 s of the 21 s first request is loading and checking ([profile](../cold-route/README.md)). This branch warms the route worker on visitor intent. The format changes remain open.                                                                                                                                                                              |
| BIM/DWG gaps and stairs                | Small snap tolerances, door-width-aware closing, door topology from BIM semantics, stair pairing, and expected human review with stable IDs.                                                                 | Gap seals, held stairs and reviewed links already follow the "held link plus replayed review" pattern. A per-profile connectivity gate in CI is not yet in place.                                                                                                                                                                                                       |

## 1. Access-restricted zones inside shared floor areas

### Standards

- **IMDF** (OGC CS 20-094).
  - `Unit.restriction` is `null`, `employeesonly` or `restricted`, and covers the whole unit. There is no explicit "unknown". [Unit](https://docs.ogc.org/cs/20-094/Unit/index.html), [Categories](https://docs.ogc.org/cs/20-094/Categories/index.html)
  - Openings carry `access_control` (badge reader, key, guard). [Opening](https://docs.ogc.org/cs/20-094/Opening/index.html)
  - Restrictions on a relationship's _intermediary_ apply to the whole traversal, which suits a badge door. [Relationship](https://docs.ogc.org/cs/20-094/Relationship/index.html)
- **OSM** `access`: `yes`, `permissive`, `private`, `customers`, `destination`, `no`, `unknown`. There is no staff value; staff-only maps to `private`. [Key:access](https://wiki.openstreetmap.org/wiki/Key:access)
  - Simple Indoor Tagging defines no access semantics, and the default for `indoor=area` is still under debate. [SIT](https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging), [tagging list, Oct 2024](https://lists.openstreetmap.org/pipermail/tagging/2024-October/068011.html)
- **IndoorGML** has navigable and non-navigable cells but no access rights. Research adds them with LADM rights and restrictions, with user type and time selecting nodes and edges. [IndoorGML](https://docs.ogc.org/is/19-011r4/19-011r4.html), [TU Delft](https://research.tudelft.nl/en/publications/647cf562-9e16-492f-aeb2-75e08fc33273)

### Routers

- **OpenTripPlanner** is the closest analogue.
  - It merges same-level areas into one group and builds one visibility graph over their union. Each edge's permission is the intersection of every area it crosses, so a private room restricts only edges through it.
  - It uses convex corners only, caps area nodes at 200, and caches results per group. [Build config](https://docs.opentripplanner.org/en/latest/BuildConfiguration/), [PR #3765](https://github.com/opentripplanner/OpenTripPlanner/pull/3765)
  - Indoor areas became routable for walking only after debate. [PR #6119](https://github.com/opentripplanner/OpenTripPlanner/pull/6119), [PR #6923](https://github.com/opentripplanner/OpenTripPlanner/pull/6923)
- **Valhalla** has pedestrian `type=wheelchair`, `step_penalty`, `elevator_penalty` and `exclude_polygons` with levels. Level-aware snapping is missing. [API](https://valhalla.github.io/valhalla/api/route/api-reference/), [discussion #4111](https://github.com/valhalla/valhalla/discussions/4111)
- **GraphHopper** allows private ways only when unavoidable, through custom-model priority. [forum](https://discuss.graphhopper.com/t/allow-private-access-for-travel-only-if-it-is-the-origin-or-destination/8183)

### Commercial SDKs

- **Mappedin**: `includeNonPublic` per request on one graph, plus zones whose cost can be infinite. [docs](https://docs.mappedin.com/web/v6/latest/types/TGetDirectionsOptions.html)
- **MapsIndoors**: doors and barriers are open for all, open for specific user roles, or closed. `avoidStairs` covers step-free routes. [barriers](https://docs.mapsindoors.com/products/cms/route-network/barrier-route-element)
- **IndoorAtlas**: edge tags such as `staff_only`, so visitors and staff share one graph. [release notes](https://docs.indooratlas.com/technical/release-notes/sdk-37-release-information/)
- **ArcGIS Indoors**: a "Restricted Unit Expression" generates no pathways in matching units, and Network Analyst restrictions can prohibit, avoid or prefer. [Generate Indoor Pathways](https://pro.arcgis.com/en/pro-app/3.4/tool-reference/indoors/generate-indoor-pathways.htm)
- **MazeMap**: map views per user group. [map views](https://mazemap.com/solutions/map-views)

### Recommendations for this codebase

1. **Give each edge the access of the cells it crosses** rather than rejecting a face for one restricted member: the AND of the access masks of every cell the edge crosses (OTP's rule). The existing zone carve already does this for reviewed zones. Extending it would remove the l.419 whole-face rejection for the remainder.
2. **Keep public, staff and unknown distinct, and route to unknown rooms without routing through them.** `route-policy.ts` already behaves this way: unknown is never a blocker, and crossed unknown destination rooms become `requiredRooms`.
3. **Hold for review when a carve disconnects the public part.** Don't disconnect it silently.
4. **Put restrictions on doors where the building has card readers**, using IMDF intermediary semantics.

## 2. Slow cold first route

### What others do

- **Tiles loaded on demand.** Valhalla's tile hierarchy. [tiles](https://valhalla.github.io/valhalla/concepts/tiles/)
  - Browser builds of Valhalla fetch tiles from an indexed TAR by HTTP Range or OPFS. A route touches about 20–50 MB rather than the whole graph. [tobilg/valhalla-wasm](https://github.com/tobilg/valhalla-wasm), [ecc521/valhalla-wasm](https://github.com/ecc521/valhalla-wasm)
- **Compact binary graphs.** roadgraph-router uses varint/delta encoding and fixed-point coordinates.
  - Size: 114.9 MB → 51.2 MB. A short route needed 4.9 MB, a 118 ms graph load and 86 ms of A\*.
  - It kept gzip because `DecompressionStream` has no Brotli. [roadgraph-router](https://github.com/danieljvsa/roadgraph-router)
- **Typed arrays instead of object graphs**, as in BRouter, GraphHopper and OSRM. [trailbuddy#378](https://github.com/MacBuchi/trailbuddy/issues/378), [carreau/brx](https://github.com/carreau/brx)
- **Search is rarely the cost.** A\* on 264k nodes and 733k edges averages 55 ms in JS. [ngraph.path](https://github.com/anvaka/ngraph.path)
  - Contraction hierarchies give 0.36 ms per query, but preprocessing is slow. [contraction-hierarchy-js](https://unpkg.com/contraction-hierarchy-js@1.2.1/README.md)
- **Transfer, don't clone.** `postMessage` clone cost scales with object complexity, while a transferred ArrayBuffer costs about the same at any size. [Surma](https://surma.dev/things/is-postmessage-slow/)
- **Verify once.** `fetch` `integrity` makes the browser verify the body. Whether that covers the decoded or the encoded body is [unverified]. [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)
  - `subtle.digest` cannot stream. [digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)
- **WASM caching.** V8 caches compiled wasm only for `compileStreaming`/`instantiateStreaming`. [V8](https://v8.dev/blog/wasm-code-caching)
- **IndexedDB.** Transactions dominate the cost; one record or blob is much cheaper than many. [Nolan Lawson](https://nolanlawson.com/2021/08/22/speeding-up-indexeddb-reads-and-writes/)
- **Precompute or warm early.** A campus wayfinder made routes "near instantaneous" by caching, at a cost of about 4.5 s at page load. [ucdavis/wayfinding PR #14](https://github.com/ucdavis/wayfinding/pull/14)

### Recommendations for this codebase (see the [profile](../cold-route/README.md))

1. **Warm up on intent.** Done in this branch.
2. **Hash once:** remove the parse-time rehash, and use WebCrypto where the caller can await.
3. **Freeze only in development.**
4. **Split routing topology** into typed arrays of a few MB, with geometry and refinement data loaded per floor or per building.
5. **Precompute door portals and refinement at compile time**, so exact geometry leaves the first-route path. Instantiate GEOS by streaming so the browser caches the compiled module.

## 3. Gaps in BIM/DWG-derived maps

- **Snapping and closing.**
  - ArcGIS snaps dangling endpoints with a 1 mm default gap tolerance. Its obstacle buffer must not exceed half the narrowest doorway. [Import to Indoor Dataset](https://pro.arcgis.com/en/pro-app/3.4/tool-reference/indoors/import-features-to-indoor-dataset.htm), [Generate Indoor Network](https://pro.arcgis.com/en/pro-app/3.4/tool-reference/indoors/generate-indoor-network-features.htm)
  - A 2025 CAD-to-OSM pipeline closes about 0.2 m drawing gaps morphologically. [arXiv 2507.00552](https://arxiv.org/html/2507.00552v3)
- **Door topology from BIM.** Revit `FromRoom`/`ToRoom` (phase-dependent) and IFC second-level space boundaries pair the spaces on either side of a door. [FromRoom](https://rvtdocs.com/2025/Autodesk.Revit.DB.FamilyInstance.FromRoom-d6658841), [IfcRelSpaceBoundary](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcproductextension/lexical/ifcrelspaceboundary.htm)
- **Stairs.**
  - Revit `Stairs` exposes runs and landings for component stairs. [Revit API](https://help.autodesk.com/cloudhelp/2014/ENU/Revit/files/GUID-D5F9820D-B548-4600-8739-8029AD3B3B8B.htm)
  - The CAD pipeline paired 40 of 40 stair connections by alignment plus bounding-box overlap. [arXiv 2507.00552](https://arxiv.org/html/2507.00552v3)
- **Validation rule names worth copying**, from IMDF: UnitsMustNotOverlap, OpeningMustBeCoveredByUnitBoundary, OpeningIsSuspiciouslySmall (< 0.8382 m). [IMDF validations](https://docs.ogc.org/cs/20-094/Validations/index.html)
- **Human review is normal.** Esri (Data Reviewer), MapsIndoors, Pointr and Mappedin all expect manual cleanup of automatic networks. [Pointr](https://docs-dev.pointr.tech/docs/shared/Features/Wayfinding/Sitewide%20Wayfinding), [Mappedin AI mapping](https://www.mappedin.com/ai-mapping/)

**Recommendation for this codebase:** add a per-profile connectivity gate to CI. For Walking and Step-free, count components, check every advertised destination is reachable from each entrance, and list one-ended stairs and lifts. This automates part of what the release gates currently check by hand.

## Related projects

- [openindoormaps/openindoormaps](https://github.com/openindoormaps/openindoormaps): upstream has no access-control or offline issues.
- [TUM-Dev/NavigaTUM](https://nav.tum.de/navigate): a university campus map. Its indoor and step-free routing is "not yet implemented".
- [indoorequal/maplibre-gl-indoorequal](https://github.com/indoorequal/maplibre-gl-indoorequal): MapLibre level control.
- [ucdavis/wayfinding](https://github.com/ucdavis/wayfinding): multi-floor SVG wayfinding with an accessible route option.
- [AccessibleMaps](https://wiki.openstreetmap.org/wiki/Accessible_Maps): indoor accessibility research (TU Dresden/KIT).
- [motis-project/osr](https://github.com/motis-project/osr): a level-aware router.
- [ifc2indoorgml](https://ual.sg/publication/2022-isprs-ifc-2-indoorgml/): an IFC-to-IndoorGML converter.
- [TU Delft thesis (Wang, 2026)](https://repository.tudelft.nl/record/uuid:ba9ea5f6-abdf-44e4-8a6f-cb50bdf804f2): IFC walkable layers with access control.

Not found: published restricted-zone docs for Pointr and Situm, how BIM-to-IMDF tools default unknown access, and benchmarks of JSON vs FlatBuffers or Arrow at 100 MB scale.
