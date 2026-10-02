# UNBC systematic indoor repair — 2026-10-02

Routes are inferred from the model, registered drawing and saved access metadata. A person does not approve each journey. This pass repairs the preparation algorithm and viewer together, preserves the original authoring material, and separates missing physical connections from saved access restrictions.

## Current verified package

| Measurement             | Preserved baseline | Recompiled |
| ----------------------- | -----------------: | ---------: |
| Original source areas   |              1,860 |      1,860 |
| Prepared arrival points |              1,692 |      1,705 |
| Unmatched native doors  |                336 |        321 |
| Graph components        |                132 |        123 |
| Clean room blocks       |              1,042 |      1,240 |
| Existing arrivals lost  |                  — |          0 |

Of the 1,705 prepared arrivals, 1,676 reach another public-review destination in the directed graph. The other 29 are isolated under that policy; an arrival point alone is not a usable entrance. There are also 151 eligible destination records without a prepared arrival. Unknown access stays unknown and is allowed by the existing public-review profile. Explicit staff restrictions, closed entrances, direction and step-free evidence are preserved.

The exhaustive topology inventory finds 573,674 connected directed destination pairs and 2,331,646 disconnected pairs. These are graph counts before realized geometry resolution, not independent proofs of every journey. The runtime excludes links crossing known native floor holes unless it finds a supported detour. All 2,897 new or changed flat segments checked independently against exact-height floor profiles, native walls, columns and proved junction repairs passed. Twenty-six legacy links intersect known slab holes and are recorded separately in the [machine inventory](unbc-systematic-routing-audit.json).

## What changed

- Exact native floor support is selected by physical height, with real holes retained. Another storey, a gross bounding box or a level relation alone cannot supply a route.
- Native wall enclosures and bounded joints now define room routing interiors where a unique label and floor support prove ownership. The original room outlines remain in the source archive.
- Door ownership handles asymmetric recessed approaches. A curtain-wall entrance is reconstructed from its persisted jamb, head, sill and panel members; the gross curtain proxy no longer blocks unrelated walking space. Exact paired drawing swing lines are distinguished from actual walls. The real sill remains a barrier to inappropriate step-free inference.
- Supported doorless fronts and hallway seams connect circulation automatically. The final compiled graph has 125 recovered circulation seams and 120 finite certified opening spans. Full two-foot local aperture proof checks floor, source/native barriers, columns, third rooms and voids. Fixed native doors and the drawing-only door remain protected thresholds.
- The generic preparation pipeline consumes the saved ramp recipe, generates actual stair/ramp landings, revalidates geometry-bound approach reviews, and preserves both lift recipes. A coincident node transfer has no movement and no invented accessibility clearance.
- Routes prefer corridors and local axes. Ordinary-room transit costs four times its length; there is no per-edge penalty that would change when a link is subdivided. Explicit door crossings and direction remain obligations. Exact native floor profiles constrain route refinement and prevent shortcuts through slab holes.
- Shared route, graph and coverage caches invalidate after imports, geometry edits, access changes and entrance reviews. The preview action remains clickable while search suggestions close; the desktop instruction list centers the active step to retain upcoming context. Search, map endpoint picking and directions use the same destination rules. Typed or clicked replacement of From/To ends when both endpoints are filled.
- Exact contact-only ring normalization recovers 21 additional registered interiors without changing filled region or hole area. Clean room rendering now has 1,081 native enclosures, one source-backed native joint enclosure and 158 independently registered drawing enclosures. Drawing-only presentation proof cannot authorize routing. Native stair openings and the authored display-only flights remain preserved in 2D and 3D.

The Bookstore **07-240 → 07-244** and Gallery **09-230 → 09-232** have realized routes. The Agora **07-180 → 08-102** now crosses the recovered curtain entrance and local stairs. **10-1016 ↔ 07-244** now works through the independently drawing-backed **08-102 ↔ 08-105** doorway and the real local floor transition. Both directions retain the fixed source threshold; disabling that doorway blocks both journeys. Identical displayed campus floor names still cannot join different native elevations.

The Kitchen **05-109** and Meeting **05-107** entrances lead into **05-117 Circulation**, which the saved human review explicitly marks staff-only. Public directions now name that corridor instead of saying the physical entrance is missing. That saved restriction is retained.

The final package has **326 remaining room-presentation diagnostics**. The [source repair guide](unbc-source-repair-queue.md) and [per-room queue](unbc-source-repair-queue.json) distinguish unbounded drawing cells, shared open zones, material conflicts, unsupported floors and bad labels. Display diagnostics are separate from entrance and route failures.

## Remaining repair queue

These are systemic geometry or metadata cases, not requests to verify individual routes.

| Priority | Cause                                            | Remaining evidence                                                                                                      | Required repair                                                                                                                                                                                              |
| -------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Missing doorway ownership or approach            | 90 missing arrivals have a nearby native door; 321 native doors are unmatched overall                                   | Resolve complete host/member identities and uniquely supported sides. A 12-foot nearby-door radius is a triage signal, not permission to connect.                                                            |
| 1        | Open front or incomplete source boundary         | 48 missing arrivals have floor support but no nearby door                                                               | Recover a real clear opening and complete arrival branch with source/native barrier and full-width proof.                                                                                                    |
| 1        | Disconnected native circulation or stair landing | 123 graph components; Building 10 and Agora are now joined by the proved source doorway                                                       | Identify component frontiers and actual elevations, then prove native slab/landing continuity or add an accurate source connection. Never bridge walls or storeys by proximity.                              |
| 1        | Unclosed room enclosure                          | 180 room presentation diagnostics                                                                                       | Repair missing/broken wall joints or drawing partitions with independent evidence. Unbounded cells do not become room blocks by extrapolating a label.                                                       |
| 1        | Multiple distinct rooms in one wall cell         | 133 room presentation diagnostics                                                                                       | Supply the missing partition or correct distinct room labels/outlines. Some labels describe genuinely open zones or POIs; classify those explicitly. Distinct labels alone cannot justify inventing a partition or merging rooms.                                                        |
| 2        | Missing precise floor support                    | 12 missing arrivals                                                                                                     | Exhaustive exact-height native face lookup found no support anywhere in 11 outlines; 05-S403 has a small supported patch but no portal seed. Another anchor or a nearby stair mesh cannot fabricate a floor. |
| 2        | Obstructed anchor                                | 1 missing arrival                                                                                                       | Find a supported alternate same-room anchor and a complete entrance branch, or correct the source geometry.                                                                                                  |
| 2        | Conflicting enclosure evidence                   | 5 circulation/void overlaps, 2 cells containing wall material, 5 source-overlap conflicts, 1 level without native walls | Correct the specific contour, void, wall or registration conflict. Preserve the diagnostic when no unique local repair can be proved.                                                                        |
| 2        | Isolated prepared arrivals                       | 29 under public-review policy                                                                                           | Separate staff-only/disabled access from physical half-connections. Retain explicit reviews and report the actual cause.                                                                                     |
| 3        | Extra route bends                                | Some complex routes retain protected threshold or narrow-floor detours                                                  | Optimize inside proved circulation and finite open seams; never erase real doorway obligations to improve appearance.                                                                                        |

Room display diagnostics and routing failures are separate inventories: a room can have a usable entrance while its clean block still lacks a provable boundary. The remaining source/native cases do not assume Revit room or phase data ever existed. Bounds-only solids, ambiguous contours and unavailable floors are retained as evidence rather than rendered as invented rooms.

## Repeatable export

Final deliverables are saved together in `/Users/ahmadjalil/Downloads/UNBC.full-repair`:

- `UNBC.master.reviter.zip`: original RVT, GLB, GIS, source rooms/reviews/pins plus regenerated indoor map.
- `UNBC.campus-viewer.zip`: optimized rooms-only 2D/3D geometry, POIs, graph, floor support and metadata; no RVT/GLB source model assets.
- `regeneration.json`: source asset hashes, output hashes and preservation checks. The viewer is 4,791,845 bytes (4.57 MiB), versus the 90,060,162-byte lossless master.
- `routing-audit.json` and `complex-routes.json`: per-room repair inventory and concrete realized journey checks.

Recompile from the preserved authoring source and exact model cache:

```sh
npm run indoor:regenerate-cache -- \
  work/full-repair/UNBC.preserved-source-with-cached-pins.reviter.zip \
  node_modules/.cache/unbc-connectivity-native.json \
  work/full-repair/new-bundle
```

The driver rejects a mismatched model, writes to a new output directory, preserves all source bytes and existing arrivals/lift/ramp identities, and verifies that master and viewer contain identical portable map data. It releases the large native cache before archive export and compares portable JSON hashes, avoiding a large runtime-versus-JSON assertion diff.

The preserved baseline combines the canonical prepared graph with the latest available authoring export, including the two authored stair display-only flight assignments. The active browser cache contained two additional review pins; only those pins were merged into a new preserved input after verifying every other authoring field was unchanged. All three pins, original reviews, connector recipes and authored flight assignments survive regeneration. RVT, scene and GIS bytes match their originals; generated output preserves the merged source JSON byte for byte.

## Verification scope

Concrete route checks cover 19 pairs in both directions (38 journeys), every realized flat segment against native barriers, both reviewed ramp directions, all 18 directed lift stop journeys, and desktop/mobile endpoint picking, review pins, lifts, stair openings and next-step camera follow. A disconnected case is reported as disconnected, not counted as a successful route. Full-body local aperture proof and continuous centerline floor support elsewhere are distinct from physical accessibility certification.

The final complex-route audit checks 38 concrete journeys: availability improves from 28 to 32, with zero native wall/column violations in realized flat segments. Six examples remain disconnected and are retained as evidence. All 2,897 new/changed flat segments have exact physical floor support and zero native barrier violations. Both reviewed ramp directions and all 18 directed lift journeys pass their independent geometry checks.

The OT Office → Agora washroom route is 368.81 m with 25 turn instructions; its previous numerical fallback was 426.30 m with 54 turns. The reverse is 370.88 m. Both retain the same 76 source graph edges and the fixed recovered doorway. Bookstore → washroom is 76.86 m / 12 turns, compared with the preserved baseline's 86.25 m / 15 turns; Gallery is 15.46 m / 2 turns. A failed local swept-footprint operation rejects the candidate without retaining partial geometry. When an opening cannot move with complete body proof, its exact threshold remains a separate path and the neighboring walks center independently. Offered span metadata alone does not certify movement.

All 146 viewer unit tests, 99 route-focused tests (overlapping that viewer suite), 58 source boundary tests and 46 compiler-focused tests pass; counts are per suite, not a summed unique total. Both builds and scoped TypeScript checks pass. Four desktop/mobile browser journeys check every actual instruction, progress, native floor, camera projection, arrival and Previous behavior. The full campus journey is also loaded in the local browser. Eight further desktop/mobile endpoint-selection, pin/lift, ramp and stair-opening browser cases pass, including all seven lift stops and both 2D/3D stair-well ground checks. The actual local-browser preview also opens on the first click while destination suggestions are visible.

The route report includes measured computation time: the long campus route currently takes about 5.6 seconds on a first uncached local probe. Repeated cached resolution and shorter routes are faster; this is not a mobile performance guarantee. Source door, native doorway, floor-hole and access constraints remain mandatory.
