# UNBC source geometry repair guide

The local preparation algorithms now recover clean room blocks from native wall cells, independently registered drawing partitions, source-backed short wall joints, precise curtain frame members, and exact contact-only ring repairs. Original room shapes and model assets remain intact; prepared effective boundaries and their provenance are separate data.

**Measurement status:** the final v5 compilation recovers **1,240 room interiors**, leaves **326 presentation diagnostics**, and loses **zero** previously prepared interiors. The final audit confirms all 326 queue keys and diagnostic groups match the compiled package. They cover 1,566 room-presentation candidates, not every one of the 1,860 source areas. Circulation, voids and genuine open zones do not automatically need a closed room box. Routing arrivals, connected components, usable journeys and room-block counts are separate measurements.

The [machine-readable repair queue](unbc-source-repair-queue.json) contains all 326 remaining source keys, room numbers, native levels, native/source diagnostic messages, detailed causes where available and repair domains. The [systematic routing guide](unbc-systematic-routing.md) covers connectivity and runtime behavior.

## Completed local recovery

- Unique native wall enclosures retain real material and holes, and use independent label/ownership checks rather than growing an inset room volume into nearby walls.
- Exact source wall faces support short native wall-joint repairs. Both sides of a gap need matching source evidence; real door apertures and floor voids remain protected.
- Registered source partitions recover uniquely labelled room cells for display. Source-only room presentation cannot approve a route or overwrite native barriers.
- Persisted curtain frame members replace an inaccurate gross host proxy when the complete member geometry is proved. Actual jambs, panels and the low sill remain material; a doorway is not automatically step-free.
- Exact contact-only normalization recovers **21 additional room interiors** with identical region and hole area. It does not smooth walls, fix actual crossings, merge disconnected cells or discard tiny real holes.
- A whole-model drawing-door scan identifies **one** additional source-only doorway, **08-102 ↔ 08-105**. Paired quarter-circle swing chains, separate four-stroke leaf rectangles and both jamb wall faces independently prove its approximately 5.996 ft by 0.375 ft aperture. The 2 ft crossing strip has unique corridor sides beyond their overlapping source outlines and passes both exact-height native floors, native/source walls, columns, existing native doors, holes and third-room masks. The real two-corridor compilation and OIM contract validation pass; its public-review route uses a hall walk, fixed source doorway and hall walk. Accessibility remains unknown, with no native Revit door identity inferred.

The original drawing and native-model hashes, exact source primitive indices, native floor identities and regenerated provenance remain available in the prepared data. Source annotations preserve the three existing stair display-only assignments, including the two recently authored ones; review pins and saved access/connection metadata must survive regeneration too.

## Remaining source repair groups

| Final count | Exact source failure | Representative evidence | Supported repair |
| ---: | --- | --- | --- |
| 226 | No unique, compatible closed source-wall cell: 84 unbounded, 130 with distinct labels sharing a face, 7 too large, 5 too small | 09-214 First Nation Gallery is unbounded. 09-292 Multipurpose Lab and 09-292-2 Demo Area share a face. 05-133 Bear Display has an incompatible cell area. | First distinguish separate enclosed rooms from genuine open zones. Recover a partition or wall join only from authoritative, independently registered geometry. Keep real open zones as named areas or POIs. |
| 44 | Source cell becomes disconnected after preserving native material or voids: 42 native material splits, 2 protected authored holes | 09-S202, 07-S205 and 07-170/172 have native-material conflicts. The protected-hole cases are 08-264 and 08-S301. | Inspect exact splitter elements and contour ownership. Correct the conflicting partition/room identity or erroneous void only with source evidence; preserve real walls and openings. |
| 31 | Fewer than two precise native elements anchor a registered source enclosure | 09-210/212, 09-265/266 and 07-145 | Recover exact native profiles or another independent geometric anchor. Source enclosure and label proximity alone cannot establish native registration. |
| 10 | Complete cell lacks physical floor support at its actual elevation | 07-411, 03-1039, 03-2076, 04-S302 and 10-S301 | Check exact slab loops, outer edges, holes and height. Correct missing/incorrect floor geometry or classify stairs/voids correctly. Another storey's associated slab is not support. |
| 10 | Remaining source label/intersection defects: 7 invalid or later-guard-failing clipped rings and 3 labels in actual native material | Actual crossings include 05-148 and 10-2078. 04-221 lies in wall 1213946; 04-223 in wall 1213957; 03-3020 in wall 1070445. | Resolve authoritative contour topology or label location. Exact self-contact repairs are already attempted; retain diagnostics for real crossings, disconnected cells and unproved void changes. |
| 5 | Bilateral source/native room identity mismatch | 10-1096 and stairs 05-S202, 05-S201, 09-S302, 05-S304 | Reconcile the authoritative footprint and label with the native cell. Do not expand to the nearest room or merge distinct identities. |

A shared face does **not** prove a missing wall. For example, a demo area inside a lab, food-service zones, a display, an alcove and a circulation label may legitimately occupy one open enclosure. Distinct source numbers also do not prove that they are duplicates. Preserve their identities until source evidence establishes whether to model enclosed rooms, separate open areas, POIs or actual aliases. An algorithm must not invent partitions from label positions.

Some remaining groups cannot be resolved from the currently available data: no independent partition exists, native material contradicts the drawing, or exact floor support is absent. Those need additional authoritative geometry or a supported classification correction. Revit room/phase data is not assumed to exist; the pipeline can consume local corrected geometry and validated boundary evidence without requiring a new Revit session.

## Systematic repair order

1. **Classify the source area and confirm identity.** Establish closed room, open zone/POI, circulation, stair or void. Check the drawing section/hash, independent registration, native physical elevation and whether labels truly refer to separate enclosures.
2. **Correct physical support and conflicts.** Inspect exact slab profiles and holes, native wall/member geometry and labels in material. A supported contour must not depend on a foreign slab or silently removed wall/void.
3. **Recover evidenced boundaries.** Resolve actual wall joints or missing partitions against registered source faces, then derive a unique labelled, anchored enclosure. Retain display-only provenance when native routing material has not independently proved it.
4. **Repair entrance and circulation topology.** Match actual native or independently proved source doorway thresholds, doorless fronts and same-height circulation seams. Require complete crossing width, unique ownership, floor support and obstacle/third-room clearance. Preserve saved staff restrictions and disabled entrances; accessibility requires its own evidence.
5. **Regenerate and audit both exports.** Preserve original source bytes, review pins, lift/ramp recipes and stair display-only assignments. Compare arrival preservation, source/native geometry diagnostics, fixed doorway identity and graph connectivity, then test representative realized same-floor and multi-floor routes against physical floor/barrier data. A graph path alone is not every journey's geometry proof.
6. **Apply viewer behavior to the corrected dataset.** Check 2D/3D room styling, lower-floor visibility through actual openings, floor selection, place search, click/type endpoint selection and desktop/mobile next-step camera follow. Diagnostics should name the actual geometry or saved-access cause.

## Reviter source/preparation versus OIM viewer

| Concern | Correct owner and persistence |
| --- | --- |
| Source room identity, valid contour topology, labels, actual wall joints/partitions and physical slab profiles | Reviter source evidence and preparation. Preserve original records; store supported correction/effective geometry with source provenance and revalidate after regeneration. |
| Native host/member parsing, unique room cells, entrance ownership, source-symbol interpretation, fixed doorways, floor/void support, ramps/lift/stair relationships | Reviter preparation and portable indoor-map contract. These are geometry/topology algorithms; keep rigorous fixture tests and per-element evidence. |
| Reviewed access, aliases, entrance state, room/POI classification, authored stair display flights and review pins | Authoring metadata persisted in the master project and regenerated dataset. OIM may provide editing controls; export the durable correction and keep it through regeneration. |
| Room colours, block heights, label sizing, visibility of pillars/doors/vestibule places, 2D/3D mode, floor selector and mobile layout | OIM viewer. Visual hiding should not erase physical barriers, room identities or routing connections. A passthrough vestibule can be visually unobtrusive while its entrance topology remains present. |
| Destination selection, route profile, runtime path refinement, truthful failure messages and next-step follow | OIM runtime using the prepared graph, floor support and access metadata. Geometry refinement preserves fixed doorway crossings, actual voids and native barriers. |

A viewer patch cannot supply a missing partition, invent native floor support or authorize an entrance. Conversely, a source repair does not need to force every named place into a filled room block. The hospital-style view should show proved rooms as clean blocks, leave circulation open, and retain genuine openings between floors.

## Evidence and checks

- [Probe and per-room gains](../work/full-repair-boundaries/presentation-touch-regeneration.json): 1,219 → 1,240 interiors, 347 → 326 diagnostics, zero removed interiors. Diagnostic probe output is not an export archive.
- [Whole-model source doorway scan](../work/full-repair-boundaries/source-door-model-audit.json): all eight annotation native levels scanned; exactly one doorway passes the independent symbol, jamb and physical crossing proof.
- [Real doorway pipeline probe](../../reviter/work/full-repair-connectivity/source-door-pipeline-probe.json): complete native-cache compilation, portable contract validation and public-review corridor route.
- [Owned geometry test log](../../reviter/work/native-boundary-final-tests.log): **58 tests pass**, including actual-source adversarial tests for missing jambs/leaves/caps, broken arcs, material/closed doors, floors/holes, distinct identities, stale hashes and registration. [Scoped typecheck log](../../reviter/work/native-source-door-types.log) is clean.

Final v5 source preservation, output hashes and counts are confirmed in the systematic routing audit and regeneration report. The earlier contact-normalization probe remains separately labeled as diagnostic evidence; the delivered master and viewer are the complete compiled package.
