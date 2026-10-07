# Indoor map release checks

Use the current canonical master and its declared source/version hashes. A usable native floor map does not certify a raised enclosure, physical access or a working route. Keep those checks separate, and retain unresolved evidence in the authoring master.

## Verification pathway

1. Run the full unit suite and the compatible real-source fixture checks. Run the scoped indoor TypeScript check and the production pages build.
2. Run `indoor:audit-volumes` across every campus floor and native level. Count room keys once across overlapping views. Compare ordinary and native-height blocks; classify intentionally flat circulation separately.
3. Run `indoor:audit-rooms` against both public-review and confirmed step-free policies. It records directed endpoint reachability and realizes representative same-floor and cross-floor routes from every eligible starting place. This is comprehensive endpoint coverage, not exhaustive realization of every possible pair.
4. Compare all saved planar graph edges with exact native wall/column faces, physical apertures, floor openings and reviewed exclusions. Inspect flagged routes after centering: a raw graph segment and its realized visitor path can differ. Runtime floor vetoes must remain active.
5. Inspect every native evidence warning by level and original element identity. Missing measured jambs, approximate host bounds, unsupported levels and intentional open-front analytical boundaries are different cases. Do not create portals from bounds or classify exposed edges as outdoors automatically.
6. Verify desktop and mobile map clicks, room search, directions, reverse travel, floor changes, arrival, step-free failures, review controls, source rendering and export/import. Keep browser proof with the exact tested build and master hash.
7. Save receipts, unresolved records and source-backed proposals in a candidate authoring ZIP. Preserve old companions and original model/GIS bytes. Regenerate after physical corrections, validate the candidate, and compare the canonical hash before promotion.

Explore excludes hallway infrastructure from visitor selection and destination search. Named open destinations such as reception desks remain discoverable. Native areas and source review retain hallway selection for authoring. These presentation rules do not alter routing connectivity or access.

Ordinary-room transit is permitted by the existing routing policy with a corridor preference penalty. Directions disclose intermediate rooms and unknown access; an ordinary room is not implicitly an approved public passage. Unknown step-free connections are disclosed in public review and excluded from confirmed step-free routes.

## Comparable approaches

| Primary reference | Relevant approach | Application here |
| --- | --- | --- |
| [OGC IndoorGML](https://www.ogc.org/standards/indoorgml/) | Navigation spaces and their connections are distinct from architectural visualization. | Keep native physical geometry, analytical selection boundaries and navigation portals separate. This project does not claim IndoorGML conformance. |
| [ArcGIS Indoors network construction](https://pro.arcgis.com/en/pro-app/3.4/help/data/indoors/create-the-indoors-network.htm) | Floor-aware pathways, vertical transitions and pathway ranking support indoor directions. | Check connector ownership and floor changes; prefer circulation over ordinary-room transit. Outdoor links require their own verified scope. |
| [Esri indoor network QA](https://www.esri.com/arcgis-blog/products/arcgis-indoors/data-management/indoor-routing-network-qa-with-arcgis-data-reviewer) | Connectivity, elevation and reachability checks complement visual inspection; some apparent anomalies are intentional. | Combine directed graph coverage, exact physical path checks and source-model inspection. Retain explanatory evidence for intentional transitions. |
| [OpenStreetMap Simple Indoor Tagging](https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging) | Enclosed rooms, open areas, doors, doorless openings and levels have separate semantics. | A shutter/pickup boundary can define an area without fabricating a wall or removing physical doorway metadata. Windows are not routing portals. |
| [c3nav](https://github.com/c3nav/c3nav) | A public indoor navigation project used at Chaos Communication Congress events. | Useful as an implementation comparison for indoor map workflows; no code or permissions were imported from it. |

## 2026-10-07 audit baseline

The tested baseline is `UNBC.master.reviter.zip`, SHA-256 `ca16aef1f0ec0dd75ee4581403830e301f0946c414da8ba68322c23cba2db784`.

Across five campus floors and twelve native levels, the shared volume detector counted 1,859 unique places: 1,285 with blocks, 391 intentionally flat and 183 without a supported raised enclosure. All 423 applied physical boundary patches have regenerated tags; five applied analytical boundaries match the source and prepared metadata. These are automated evidence checks, not individual manual approval of every room.

The twelve-level native warning ledger contains 39 rows: 25 scope/information notices, eight missing-precise-evidence notices, two level notices covering three incomplete measured doors, and four levels with no mapped places or native slab support. Exact IDs, geometry and recovery questions are saved under `work/map-finalization-20261007/warnings/`. The 183 unresolved enclosure records are in `work/map-finalization-20261007/root/quality-ledger.json`.

The final application suite has 520 passes, zero failures and 27 skips; the indoor scoped typecheck and pages build pass. The selected real-source suite has eleven passes and five retained failures, with eleven incompatible historical cases excluded. Preserve those fixture and native-ramp limitations in the receipt instead of weakening the checks.

Both-profile connectivity covers all 1,851 eligible endpoints. Representative realization returns 3,019 public journeys and three confirmed accessible journeys; 90 public journeys remain rejected with positive native-hole evidence. Independent checks of all 3,022 returned journeys, 11,438 unique planar paths and 29,113 segments found zero wall/column/slab-gap/hole/exclusion crossings. One unsafe fallback on 10-2044 → 10-4040 was repaired; 216 other affected journeys stayed unchanged. This is not exhaustive realization of every ordered pair or confirmation of width, access or accessibility.

The separate evidence candidate and raw receipts are saved at `/Users/ahmadjalil/Downloads/UNBC.final/verification/map-finalization-20261007/`. It retains all historical companions and original model/scene/GIS bytes; the canonical master and current-version metadata remain unchanged. Packed audit JSON includes file hashes and losslessly compressed text; full uncompressed reports and derived traces remain in the verification folder. Future consolidation must revalidate the declared source/version hashes and companion byte limits.

Do not call this baseline a fully certified public or accessible map. Room isolation, portal support, public access and step-free evidence must each pass their own check. A patch count or successful native selection does not resolve the other categories.
