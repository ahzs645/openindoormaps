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
