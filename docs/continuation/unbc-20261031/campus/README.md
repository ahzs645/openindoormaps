# Full campus pathway and native-geometry map — October 31 to November 1, 2026

## Full campus simplified pathway

`scripts/indoor/compile-corridor-candidates.ts` was run on the run-1 master
(`d4d36d18…`) with no `--cell` filter, on this branch's code. It processed all
109 target cells and accepted **2,701 of 2,884** eligible walking edges in
1,708 s (child peak RSS 3.59 GB). Its
[PREPARED-ROUTING.json](PREPARED-ROUTING.json) is byte-identical to the
October 22 accepted campus catalog
(`54f10449efcc1620724ccc2ccf8179823f1d8c28a39b8be56e54c2fcbf64cd40`, see
`../../unbc-20261022/pathway-implementation/NORMAL-ACCEPTANCE.json`), so the
October 30 changes did not alter any guide.

| Visitor floor  | Simplified / eligible walking edges |
| -------------- | ----------------------------------- |
| Floor 0        | 8 / 8                               |
| Campus Floor 1 | 971 / 1,030                         |
| Floor 2        | 709 / 782                           |
| Campus Floor 3 | 531 / 572                           |
| Floor 4        | 482 / 492                           |

`scripts/indoor/export-pathway-preview.ts MASTER OUT --guides PREPARED-ROUTING.json`
then exported all 12 native levels with this catalog (899 s,
[PREVIEW-INDEX.json](PREVIEW-INDEX.json)).

The combined normal-import and production-worker replay of
[../ROUTE-CASES-CAMPUS.json](../ROUTE-CASES-CAMPUS.json) (28 cases: the ten
October 30 link cases, eight corridor cases and ten inside-arrival cases) on
this catalog **passed** with zero failures after two host-restart
interruptions ([acceptance/](acceptance/); 1,893 s, child peak RSS 5.61 GB).
Twelve requests are available and sixteen are expected refusals. With the full
catalog, 08-216 ↔ 08-260 is 13.617 m (two shared guides), 04-204 ↔ 08-267 is
123.924 m, 04-237 → 08-205 is 118.788 m and 04-255 → 08-272 with other-room
transit is 178.219 m (187.241 m with inside arrival). Every available route
crosses original door 2311764.

## Native-geometry map

[map/index.html](map/index.html) with [map/floors/](map/floors/) is the
published campus map. [map/build-native-floors.py](map/build-native-floors.py)
builds it from the two-cell candidate's `viewer/indoor.json` (for native walls,
doors and the graph) and the full-campus preview export (cells, names, paths):

- Spaces are the native wall-bounded circulation cells; linework is the
  35,266 native wall footprints; doors are their saved footprints, with
  unmatched doors outlined.
- The earlier room shapes are used once, to place each room's name at a point
  inside it, and are then discarded. No room outline is written.
- Paths, crossings, lift stops and held stairs come from the export unchanged.
- Coordinates are native feet converted to north-up metres with a similarity
  fitted from 13,721 feet/longitude-latitude pairs in the export (0.3029 m per
  foot, 16.26° rotation, worst residual 0.61 m).

On Floor 2, 491 of 503 room names fall inside a native cell; the others are
mostly stairs. 54 Floor 2 cells carry more than one room name.

## Native door evidence

[native-evidence/native_doors.py](native-evidence/native_doors.py) steps 0.25 to
1.5 ft past each face of every saved door footprint, along its saved normal, and
records which native cell lies there.

| Door state / native result                 | Doors |
| ------------------------------------------ | ----: |
| connected, two distinct native cells       | 1,303 |
| connected, same native cell                |   293 |
| connected, one side only                   |    23 |
| unmatched, two distinct native cells       |    41 |
| unmatched, same native cell                |    41 |
| unmatched, one side only (mostly exterior) |   150 |
| unmatched, no native cell                  |    39 |
| ambiguous                                  |     6 |

For all 1,303 connected doors with two distinct native cells, the existing
owners are contained in the native cells' owners. [door_proposals.py](native-evidence/door_proposals.py)
names each side of the 41 unmatched native pairs by the nearest room inside the
native cell ([NATIVE-DOOR-PROPOSALS.json](native-evidence/NATIVE-DOOR-PROPOSALS.json)).
Door 2315416 pairs 08-360 Link with the Building 08 corridor cell; the nearest
named room is 08-316 Corridor at 2.962 ft (0.90 m), consistent with the
October 23 Floor 3 investigation (0.979 m). These are proposals for review in
the Reviter owner matcher, not applied routes.

## Disconnected vestibules

[vest.py](native-evidence/vest.py) builds the enabled walking graph
(walk, door, opening, ramp, elevator, escalator). 1,693 room arrivals form the
main component; 6 of 61 vestibules are outside it
([VESTIBULES.json](native-evidence/VESTIBULES.json)):

| Vestibule         | Visitor floor  | Cause                                                                                                          |
| ----------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| 07-309            | Campus Floor 1 | No arrival; doors 296596 and 621887 have no owner (native pair for 621887: 07-305 Office / 07-309)             |
| 10-1300           | Campus Floor 1 | No arrival; doors 2471813 and 1500735 owned only by the vestibule (native pair for 2471813: 10-1302 Atrium)    |
| 03-1052           | Floor 2        | 42 walks but no arrival; doors 1425507, 1425511, 1425135 and 481695 unmatched inside one shared native cell    |
| 06-207            | Floor 2        | Door 1328018 owned only by 06-210 Corridor; island of three rooms                                              |
| 06-313 Soundproof | Campus Floor 3 | No arrival; doors 1779388 and 1779387 owned only by the vestibule (native pair for 1779388: 06-314 Projection) |
| 06-388            | Campus Floor 3 | Door 1779399 owned only by the vestibule, no native cell on the other side; island of 16 rooms                 |

Every drawn door or opening crossing has both ends within 0.5 m of a drawn
path, so these are source-graph gaps, not drawing gaps.

Unioning the 41 proposed pairs into the existing graph adds only five rooms to
the main component, because three of the vestibules have no arrival node at
all. Applying native door ownership therefore requires the Reviter owner
matcher to use native cells (with room shapes only for names) and a
regenerated native build, followed by guide recompilation and acceptance.

## Corrections and follow-up — November 1, 2026

Three investigators and a skeptic re-checked the vestibule causes against the
code and data. The corrected causes:

| Vestibule | Corrected cause                                                                                                                       | Path to a fix                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 06-388    | Not a door owner: connected door 1780077 has no walking approach on its 06-364 Corridor portal, isolating 06-388 and 15 other rooms.  | One reviewed circulation link (below).                                                              |
| 10-1300   | Door 2471813 should pair with 10-1302 Atrium; the atrium outline stops 1.85 ft short of the thin native wall (matcher reach 0.70 ft). | Outline review and `navigation.doorLinks`, or a native-cell owner matcher, then the native rebuild. |
| 03-1052   | A pocket of native cell 601 joined only at zero-width corners; doors 1425507, 1425511, 1425135 and 481695 are unmatched.              | Outline reviews and door links for 1425507 and 1425511, then the rebuild.                           |
| 06-207    | No doorway to 06-210 Corridor exists in the native model; door 1328018 is elsewhere.                                                  | Drawing check, then a `dwg-drawn-door` review and the rebuild.                                      |
| 07-309    | Pairing 621887 only joins a 7-room suite cut off by an unmodelled area between doors 1732467 and 1715768.                             | Site decision first.                                                                                |
| 06-313    | Pairing 1779388 only joins 06-314 Projection, which has no other way in; 1779387 opens onto nothing.                                  | Decision on how the booth is reached.                                                               |

All six vestibules already have (unattached) arrival nodes. The union over all
enabled edges plus the two existing reviewed links gives 1,695 main-component
arrivals; the 1,693 above came from a narrower edge filter.

`scripts/indoor/add-reviewed-circulation-link.ts` adds one owner-reviewed link
between two existing nodes to a master, replays it with the compiler's own
`reviewedCirculationLinkSupport` predicate (walking slab, native material,
door leaves, exclusions, access zones) and refuses it unless it passes.
`--check-only` replays without exporting. The 06-388 link
`door:1487353:1780077:0 → door:1487353:1779222:0` (6.462 ft) **passed** on the
run-1 master, with the two existing links still applied
([reviews/06-388-LINK-REPLAY.json](reviews/06-388-LINK-REPLAY.json)). Exporting
the new master, recompiling guides and replaying acceptance were not completed
here because host restarts repeatedly killed the 40-minute export.

A full campus compile at `--max-deviation-feet 1.0` (default 0.75) accepted the
same 2,701 guides; matched-guide bends over 5° fell from 3,846 to 3,567 (7.3%)
and core vertices from 10,223 to 9,934
([GUIDE-DEVIATION-0.75-VS-1.0.json](GUIDE-DEVIATION-0.75-VS-1.0.json)). It has
not been through route acceptance.

The published map now draws ramps, local steps and stairs as lines, restores
lift, ramp-end and missing-approach markers, draws in-space seams as path and
native approach fans as walking lines, and draws every enabled walk the router
can use, not only the hallway view.

## Complete, regularized drawing — November 1, 2026

The published map now draws every enabled walking edge on each floor (1,819 /
1,517 / 1,122 / 1,014 lines), not only the hallway view, plus every enabled
door and opening crossing (596 / 466 / 364 / 343). Accepted simplified guides
replace their walks; all other walks keep their original geometry. Builders:
[map/build-native-floors.py](map/build-native-floors.py),
[map/build-complete-network.py](map/build-complete-network.py) and
[map/add-crossings.py](map/add-crossings.py).

**Correction (November 1, 2026, after the branch review).** The paragraph that
stood here said the regularized lines stay "inside the native cells or within
0.3 m of its original line" and that walks "keep their original geometry". Both
were inaccurate for the map as published: the 0.3 m allowance also accepted
segments inside native wall footprints, and the regularizer had redrawn 96.6% of
the drawn walks, accepted or not. Applying the corrected exact rule to that
drawing finds 82 redrawn lines that overlap a wall or hole their original did
not, and 317 redrawn lines whose original already did.

The map now draws the **accepted geometry unmodified by default** (accepted
shared guides plus original saved walks). The regularized drawing is an opt-in
**schematic layer, display only and not route-accepted**, produced under a hard
rule: no overlap with a native wall footprint away from that wall's own doors
(0.8 m) or with a cell hole, with no distance-to-original allowance; walks whose
original already overlaps one are kept unmodified. An independent verifier
passes on all four floors (4,914 of 5,472 walks redrawn, 0 overlaps, 330
source-defect walks kept). Those 330 original walks are listed in the map's
"Source walks that cross a native wall" layer. See
[map/README.md](map/README.md) and [map/regularize/README.md](map/regularize/README.md).

The drawing audit ([drawing-audit/](drawing-audit/)) found no drawn break
between lines that share a routing node. 04-259 Rotunda, 08-260 Link and
08-249 Office are routable; they only looked unconnected because walks through
non-circulation spaces were drawn faint (Rotunda), a refused guide was drawn
grey (08-260 west half) and door 2463553 at the end of 08-202 had no drawn
crossing (08-249). Walks with no arrival end (through traffic) are now drawn in
the network style, and corridor walks that only end at their own corridor's
label point are hidden for display (routing unchanged).

Still needing source or owner work, from the room-coverage audit: 162 names
are not routable — 38 staff-only circulation records and the offices behind
them, 31 rooms in cut-off suites (06-366 suite fixed by the replayed 06-388
link once exported), 27 stairs, 18 rooms with only unmatched or ambiguous
doors, 33 with no door, no native cell or no walk, and 15 vestibules, helper
records and non-walkable records ([NON-ROUTABLE.json](drawing-audit/NON-ROUTABLE.json)).
04-259 Rotunda (and the 04-124, 04-329 and 04-445 Rotunda records) could be
marked as circulation so their walks are simplified, which is an owner decision.
