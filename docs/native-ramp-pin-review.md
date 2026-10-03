# Native ramps and raised landings

A corridor annotation is not proof of a flat floor. The Building 04 Rotunda references (pins 11 and 12) fall on native ramps #1586431 and #1587605. The slab profiles correctly exclude those ramp footprints. Flat circulation must not expand across them.

Reviter now preserves owner-tagged native ramp faces and all 82 source stair assemblies during indoor preparation. OpenIndoorMaps displays that inventory in both room views, with blue native ramp surfaces where source circulation is identified. Display inventory creates no navigation edges or accessibility claims. The two Rotunda ramps still need entrance proofs; their native faces are visible without fabricating connections.

Reviewed `up-flight-only` stair areas can contribute their flat native landing to circulation while retaining the upward flight policy. Rising treads, walls, voids and private rooms remain excluded. Standalone `Link` and `Connecting Link` names now classify as circulation, with explicit room and staff reviews taking precedence.

`recoverReviewedNativeCirculation` in Reviter discovers the bounded free native cell beneath a review seed. Exact slabs, walls, doors, stair projections and source restrictions establish its boundary. A maximum area limits accidental whole-wing promotion. Discovery owners are temporary and never exported. The recovered pin 9 cell is saved as a source annotation and regenerated through the normal pipeline.

The source-bound Tea Lab elevator review has four independently supported lobby stops: native levels #1487816, #694, #400176 and #402367. Its shaft terminates below the roof, so the roof is excluded. Accessibility remains unknown.

The updated consolidated master and viewer are in `Downloads/UNBC.final`. They preserve original model, scene and GIS bytes, previous arrivals, existing lifts, the wheelchair ramp and map edits. Import the updated ZIP after refreshing the hosted app; a website update cannot replace a ZIP already loaded in a browser.

Validation: 30 complete elevator journeys, the existing ramp in both directions, native floor containment at pins 7 and 9, exact native ramp faces at pins 11 and 12, complete source stair inventory, and desktop/mobile room and navigation previews. Evidence is retained with the consolidated files under `verification`.
