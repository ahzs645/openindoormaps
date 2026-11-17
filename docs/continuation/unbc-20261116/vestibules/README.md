# Cut-off vestibules: door reviews, rebuild and links — November 16, 2026

Five vestibules had no walking connection in master `ae70cc07…`: 10-1300,
06-207 (with washrooms 06-208 and 06-209), 03-1052, 06-313 and 07-309. This
folder records the door reviews written for them, the full native rebuild
that applied those reviews, and the two reviewed links added afterwards.

**Result in one line:** 03-1052 is on the main walking network and routes
correctly. 07-309 and 06-313 route to their neighbouring rooms, but those
groups are still islands. 06-207 is unchanged and waits on an owner decision.
10-1300 cannot be opened by review data alone. A one-case compiler rule gives
it an entrance in a candidate rebuild, but the app's own walk replay still
refuses it until the same rule is added there (section "November 17").
Neither change is adopted.

Nothing was published. Nothing here is committed to `main` of either
repository by this run.

## What was wrong

Room outlines in this master come from the survey drawing, not from native
wall faces (1,760 of 1,861 records are `polygon: 'derived'`). The legacy door
matcher needs an outline within 2 ft of the door centre, so a door in a
3.28 ft approximate curtain band, or a door whose far room starts more than a
few inches beyond the leaf, stays unmatched. Measurements for each vestibule
are in `~/unbc-work/vestibules/evidence/EVIDENCE.md` (local, not in the
repository).

## Reviews

| File | sha256 | Content |
| --- | --- | --- |
| [reviews/DOOR-APERTURE-REVIEW.vestibules-b.json](reviews/DOOR-APERTURE-REVIEW.vestibules-b.json) | `01927785…` | The two existing Building 4–8 link doors, plus door 2471813 (10-1300 ↔ 10-1302 Atrium) and door 1425507 (03-1052 ↔ 03-1104) |
| [reviews/DOOR-APERTURE-REVIEW.vestibules-c.json](reviews/DOOR-APERTURE-REVIEW.vestibules-c.json) | `4031143b…` | Same four doors; the 2471813 aperture starts at the jamb mullions' near face. **Not yet used in a rebuild** |
| [reviews/NATIVE-DOOR-OWNER-REVIEW.vestibules.json](reviews/NATIVE-DOOR-OWNER-REVIEW.vestibules.json) | `4cd90213…` | Door 621887 (07-309 ↔ 07-305) and door 1779388 (06-313 ↔ 06-314), owners named by Reviter's native-cell matcher for these two doors only |

Door 1425511 (the second east door of 03-1052) was left out: it shares host
wall 1425500 with door 1425507, and the compiler accepts one reviewed
aperture per host wall.

## Producer code

The October 21 producer commits (OpenIndoorMaps `6993c08`, Reviter
`cb140e46`) plus the patches in [producer-patches/](producer-patches/):

- OpenIndoorMaps `0002` (arch-neutral esbuild binding, `REVIEW` override in
  `run.sh`) and `0003` (flag `--native-door-owner-review`, env
  `NATIVE_DOOR_OWNER_REVIEW`, receipt `source-native-door-owner-replay.json`).
  Tree `1f2048d52de54fda50583d0dc9d22abfba7fe222`.
- Reviter `r0001`–`r0003` (the native-cell door matcher, its 2 ft fail-closed
  owner gap, explicit reviews first) and `r0004` (door-scoped review in the
  compile). Tree `7ff09c0a58ef37c34566abc01c9cb737e771b101`.

The matcher runs only for the doors listed in the review file. Every other
door is matched exactly as before.

## Rebuild

Full native regeneration on Colab G4 (48 cores, 176 GB), one floor worker and
one landing worker, 17:47–21:51 UTC, exit 0. Inputs: source master
`d5a829e8…`, the 132 gap patches and supersessions of November 3, the two
review files above.

| | Gap-patch run (`65536052…`) | This run |
| --- | ---: | ---: |
| Routable arrivals | 1,763 | 1,767 |
| Components | 25 | 26 |
| Largest component arrivals | 1,703 | 1,704 |
| Unmatched doors | 281 | 277 |

Master `40587dd7a522632a815ad5e772a84ec648212eb4b8ba880dad9b333e953e30d3`
(247,318,163 bytes), viewer `b50b3e8f…`. Receipts:
[regeneration-result/](regeneration-result/).

| Vestibule | Door | In the rebuilt master |
| --- | --- | --- |
| 03-1052 | 1425507 | connected to 03-1104; on the main network |
| 10-1300 | 2471813 | door edge to 10-1302 exists, but the room's arrival has no walk to its own door (next section) |
| 07-309 | 621887 | connected to 07-305; the suite (8 arrivals) is an island |
| 06-313 | 1779388 | connected to 06-314 Projection; island of 2 arrivals |
| 06-207 | — | unchanged: island with 06-208 and 06-209 |

## Links added after the rebuild

Both with `scripts/indoor/add-reviewed-circulation-link.ts` on
OpenIndoorMaps `a983561` and Reviter `2e7875d` (the pair pinned in CI).

### 06-388 island (re-added)

Same arguments as
[the recorded run](../../unbc-20261031/campus/06-388-repair/EXPORT-EXECUTION.json).
A fresh rebuild never contains this link; without it 16 rooms around 06-388
are off the main network. Result: `87ba5517…`.

### 10-1300 own-door approach (added, but it does not make the room routable)

The link joins `arrival:rm-1487816-5550ce486504` to
`door:1487816:2471813:0` (4.99 ft). Its replay passed and it was exported:
master `229a36aa52a0cd3956c9e4e2783498791b62e5e75be8bab1b87c129e25fefc2c`
(247,320,372 bytes) with both links. Over enabled edges the main component
then holds 1,713 arrivals (`ae70cc07…`: 1,711).

The router still refuses every route to or from 10-1300 with
`missing-entrance`: the record has no `arrivalNodeId`. The compiler sets that
only when the arrival is approached at compile time, and by design a later
link cannot supply it. The link is therefore inert for visitors and should be
dropped when the room is rebuilt correctly.

## Why 10-1300 has no arrival

Measured on the rebuilt dataset by running the producer's own
`nativeCellDoorApproach` for cell 481 and door 2471813 (Colab, instrumented
copy, read-only):

- The reviewed aperture spans the whole 3.28 ft approximate band
  (y 760.999–764.280). The real curtain frame is 0.49 ft deep
  (y 762.393–762.886).
- The compiler removes the door footprint from the walking cells and from
  the indoor envelope, and keeps only the frame strip as doorway. That leaves
  the strip y 760.999–762.393 across the door width in neither cell 481 nor
  the envelope.
- The vestibule portal is the nearest point of the registered room outline to
  the door centre: y 762.514, inside the frame strip. Its threshold half,
  cut to the envelope, is y 762.393–762.640. That piece touches cell 481 at
  one corner only, so the union has two parts and the portal is not accepted
  (`union parts 2`). Control: door 621887 into cell 305 is accepted.
- The two Building 4–8 link doors use the same full-band depth and work
  because their room outlines end exactly on the band faces.

Corrected record: `vestibules-c` starts the 2471813 aperture at the frame's
near face (762.393) and keeps the far face (764.280). The legacy matcher
still finds both rooms (outline points 0.82 ft and 1.14 ft from the new
centre, limit 1.54 ft), wall 2472128 is still cut, and the freed strip
returns to cell 481. The November 17 rebuild confirmed the cell shape and
showed that this is still not enough (next section).

## Routes checked on master `229a36aa…`

OpenIndoorMaps `a983561`, Reviter `2e7875d`, on Colab. Guides: 2,732 in 110
cells, catalog `105f93e7…`.

- Standard cases
  ([ROUTE-CASES-CAMPUS-0388.json](../../unbc-20261031/ROUTE-CASES-CAMPUS-0388.json)):
  **PASS 33/33**, normal and worker.
- Vestibule cases (first version, superseded by
  [ROUTE-CASES-VESTIBULES-A.json](ROUTE-CASES-VESTIBULES-A.json)):

| Route | Result |
| --- | --- |
| 03-1052 ↔ 03-1104 | available both ways, door 1425507 used, 32.7 m |
| 03-1052 → 10-1302 Atrium | available, 458.2 m, 10 shared guides |
| 07-309 ↔ 07-305 | available both ways (hallway and inside arrival) |
| 06-313 ↔ 06-314 | available with inside arrival; no hallway arrival (neither room is on a hallway) |
| 06-207 → 06-208 | available, 1.9 m |
| 07-309, 06-313, 06-207 → main network | refused, as expected for islands |
| 10-1300 ↔ 10-1302, 10-1300 ↔ 03-1104 | refused: `missing-entrance` |

Three of the twelve vestibule cases were written with the wrong endpoint
mode (07-309 → 07-305 with a required door, 06-313 → 06-314 with hallway
arrival); the table gives the results of the follow-up diagnostic run.

**Lost with the Colab session** (it ended on its own at about 00:08 UTC on
November 17, before download): the guide catalog, both acceptance reports,
the pathway preview and the unfinished visitor package. The masters,
rebuild receipts and logs were downloaded before that.

## Still open

- **06-207**: host wall 1327847 has no door. The drawing shows a 5.000 ft bay
  toward corridor 06-210, but there is no input path for a drawn opening in
  the rebuild and the owner has not confirmed how the room is entered.
- **10-1300**: adopt or reject the own-host fallback rule (section "November 17").
- **07-309 and 06-313**: the doors work, but the groups they join are not
  reached from the public network (unmodelled area between doors 1732467 and
  1715768; projection booth).
- Doors 1425511, 1500735, 481695, 1425135, 296596 and 1779387 stay unmatched
  (shared host wall, or no room or slab on the far side).
- Building 4–8 floor 3 link door 2315416 is still unmatched, as diagnosed
  earlier.

## November 17: second rebuild, the remaining blocker and a candidate rule

### Rebuild with `vestibules-c`

Same producer trees, inputs and gap patches; door record `vestibules-c`
(`4031143b…`). Colab G4, 01:23–05:33 UTC, exit 0. Master
`e5d6ca92215b8486c342221c852ff4e60e0e256a5ed970aacf012fd349724139`. Receipts:
[regeneration-result-2/](regeneration-result-2/).

- Cell 481 now runs straight to the frame face (y 762.393) across the door,
  as intended.
- 10-1300 still has no `arrivalNodeId`.

With the 06-388 link re-added (master `f554adc0…`), on OpenIndoorMaps
`a983561` and Reviter `2e7875d`: guides `e3049e7d…` (2,732), standard
acceptance **PASS 33/33**, vestibule cases
([ROUTE-CASES-VESTIBULES-A.json](ROUTE-CASES-VESTIBULES-A.json)) **PASS
11/11**, including 10-1300 refused with `missing-entrance`. Reports are in
`regeneration-result-2/`. Visitor checkpoint `18fa1868…`.

### Why the door record cannot fix 10-1300

Printed from the producer's `nativeCellDoorApproach` as exact fractions:

- Cell 481's top edge and every native material face of the curtain wall are
  at y = 6706083885039869/2^43 (762.393470386072).
- The indoor envelope's wall-zone part starts at 6706083885040116/2^43
  (762.3934703861), 247 units in the last place higher: 2.8e-11 ft.
- The portal's threshold half is cut to the envelope, so it starts on the
  envelope's value and misses the cell by that residue. The exact union has
  two parts and the portal is refused.

No aperture depth closes this: a deeper aperture leaves an orphan strip
(first rebuild), and an aperture on the frame face leaves the residue.

### Candidate rule (not adopted)

[candidate-own-host-rule/rule2-own-host-fallback.diff](candidate-own-host-rule/rule2-own-host-fallback.diff),
in Reviter `lib/reviter/native-circulation-geometry.ts`: when a door's
envelope-cut threshold half does not join its cell, retry once with the
door's own host material (the parts its aperture owns) counted as indoors.

- Replay of the cell-route stage over the whole campus on the rebuilt
  dataset: 5,371 walks against 5,370; the only new walk is
  `native-cell:3.280840:481:walk:arrival:rm-1487816-5550ce486504|door:1487816:2471813:0`;
  no walk removed; no other walk changes length. The new walk survives
  `replayNativePhysicalCellRoutes`.
- A broader form (always count the host material) was rejected: it also
  changed 169 walk lengths by 1 mm to 1.65 m in three large cells.
- Candidate rebuild with the rule and the faster exact arithmetic
  (`b1-exact-arith.patch`, Reviter's copy only): 05:13–07:39 UTC, exit 0,
  master `bde63f0a9177baba39aa68df5471381b49f29fe9777d71135db5dc937a373945`.
  Against the ordinary master its dataset differs by that one edge, the
  10-1300 `arrivalNodeId`, one `isolated-arrival` issue, the report counts
  (1,768 routable, largest component 1,705) and the derived explore mapping.
  `rooms.json` is identical.
- With the 06-388 link: `05867b77…`. Guides and route checks for it
  ([ROUTE-CASES-VESTIBULES-C.json](ROUTE-CASES-VESTIBULES-C.json), which
  expects 10-1300 to route): see RESULT below.

**RESULT (candidate, linked master `05867b77…`, OpenIndoorMaps `a983561`,
Reviter `2e7875d`, guides `8b484362…`, 2,732):**

- Standard cases: **PASS 33/33**; all 33 rows are identical to the ordinary
  master's (availability, distances, edges).
- Vestibule cases: 10 of 14 pass (the same ten as on the ordinary master).
  The four 10-1300 cases **fail**: the router still returns no route,
  although the record has its `arrivalNodeId` and the walk is enabled.
- The router's own diagnostic for all six 10-1300 requests
  ([accept-diag-10-1300.log](candidate-own-host-rule/accept-diag-10-1300.log)):
  `blocked`, blocker `native-circulation-proof` on exactly
  `native-cell:3.280840:481:walk:arrival:rm-1487816-5550ce486504|door:1487816:2471813:0`.
  It finds the path and refuses that one walk.
- Cause: the app replays every walk itself.
  `app/indoor-project/native-circulation.ts` requires the path to be supported
  by the cell face joined with the door's own threshold halves
  (`pathUnionSupported`), and those halves come from
  `app/indoor-project/native-door-approach.ts`, which cuts them to the
  envelope exactly as the compiler did before the rule. The 2.8e-11 ft
  residue is still there on the app side, so the app blocks the new walk.
- So the rule has to exist twice: in Reviter's compiler and, in the same
  fallback form, in those two OpenIndoorMaps runtime modules. The second
  changes the runtime binding fingerprints and needs re-admission. Not done.

Reports: [candidate-own-host-rule/](candidate-own-host-rule/).
Pathway preview and visitor checkpoint `f1f18e90…` for the candidate were
also built; they are local only.

### Speed

Measured on the same machine with identical inputs: the faster exact
arithmetic in Reviter's copy takes a full rebuild from 250 to 143 minutes
with a byte-identical `viewer/indoor.json` and `rooms.json`. The same file in
the OpenIndoorMaps copy takes the link step from 32.8 to 21.2 minutes, again
byte-identical, but changes the runtime binding fingerprints. Seven landing
workers abort on the Linux limit of 65,530 memory mappings per process, not
on memory. Details: `~/unbc-work/perf/REPORT.md` (local).

### Files (local, `~/unbc-work/vest-master2/`)

`A-*` ordinary rebuild and its follow-on outputs, `b1-*` the faster-arithmetic
twin, `C-*` the candidate with the rule, `exp-*` the export timing test and
its CPU profile.
