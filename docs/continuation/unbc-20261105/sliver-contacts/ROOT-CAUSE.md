# Why near-touching wall joints leak walking routes — root cause (November 5, 2026)

**Short answer: mostly precision and export, not Revit modelling.** Of the 283
squeeze gaps from November 3, 86 are floating-point residue between walls that
meet in the source. Another 101 come from a lower-precision (float32) copy of
15 ordinary interior walls that the converter took from its render mesh.
Neither is a modelling mistake. The other 96 are real openings, facade or
curtain-wall envelopes, columns, small measured gaps, or cases the local check
could not reproduce. Some of those do need modelling attention (see
[Guidance for the owner](#guidance-for-the-owner)).

The compiler fix in this change set closes the first group, the
floating-point residue, and only that group. The documented contact rule is
bounded to 1e-7 ft, and the float32 group lies between 1.2e-7 and about
1e-5 ft. What closes what is shown under [Effect of the fix](#effect-of-the-fix).

Evidence: [JOINT-CLOSURE.json](JOINT-CLOSURE.json) (every joint),
[CELL-CHECK.json](CELL-CHECK.json) (the residual-leak cells) and
[tools/](tools/).

## Where the compiler lost the contact rule

`docs/native-area-review.md` states that native selection and the sibling
compiler insert a vertex within 1e-7 ft of another wall edge into that edge
before rounding. That rule is `nativeBarrierTopology`
(`native-barrier-topology.ts` in both repositories,
`NATIVE_BARRIER_TOPOLOGY_VERSION = native-wall-contact-noding-v2`). It runs
only on paths that **round** coordinates:

- Reviter `native-circulation-geometry.ts`: only the legacy, non-native branch
  passes `region.wallBarriers` through `nativeBarrierTopology`. The strict
  branch, used by every UNBC master because they all have
  `nativeIndoorEnvelopes`, keeps the original coordinates ("Strict native faces
  retain their original coordinates").
- Reviter `native-circulation-links.ts → nativeWalkingRegion` (strict) builds
  the routing face as `exactFloors − exact(walls ∪ barriers ∪ masks)` in
  rational arithmetic. The walls come from `createNativeRoutingMaterialQuery`
  (`native-routing-material.ts`): the RVT material sections, the mesh-cut
  supplement, derived frame returns and provisional seals, plus reviewed patch
  walls. No contact noding is applied.
- OpenIndoorMaps selection (`native-area-review.ts`) uses
  `nativeSelectionTopology` (1e-10 ft contacts, 1e-9 ft junctions) only in its
  non-strict branch. The strict branch subtracts exact wall masks and relies on
  the explicit `nativeSelectionContactRepairs`.

Exact arithmetic is exact. A partition corner 5e-14 ft from the wall face
leaves a 5e-14 ft channel, and the circulation compiler treats it as a
passage. The saved walk runs along the wall face, over the partition end and
into the next room. This is the "sliver".

## Method

1. **Routing material, not the map walls.** The November 3 inventory measured
   gaps between the map's `walls` footprints. Routing does not use those. For
   each gap, [walk-closure.ts](tools/walk-closure.ts) rebuilds the exact free
   region within 3 ft of the squeeze point from the actual routing material of
   that master (`createNativeRoutingMaterialQuery`: walls, columns, derived
   parts and patch walls). It then replays the saved walk with
   `nativeRationalPathSupported`. Next it applies wall contact noding at
   1e-12, 1e-9, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 0.02 and 0.1 ft, and records the
   first tolerance at which the walk leaves the free region. That is the width
   of the leak in the routing material. Above 1e-7 ft it uses a diagnostic
   copy of the rule ([noding-unbounded.diagnostic.ts](tools/noding-unbounded.diagnostic.ts)),
   never the compiler.
2. **Which material.** [contacts.py](tools/contacts.py) lists the vertex/edge
   pairs within that tolerance in exact rational arithmetic, and records
   whether each side is an RVT-derived section or a mesh-cut supplement
   section.
3. **The source model.** [dump-walls.ts](tools/dump-walls.ts) converts the
   original RVT (`8c294549…`) with Reviter's `convertRvtBytes` (57 s, about
   2 GB). [rvt-joins.py](tools/rvt-joins.py) compares each partition's
   location line with the face of the wall it meets.
4. **Cells.** [cell-check.ts](tools/cell-check.ts) takes the saved exact
   routing faces of the regenerated master `65536052…` and subtracts the
   noded walls. Noding only adds material, so this is the face the compiler
   would now build. It then replays every walk in the cell and places each
   arrival and door node in its piece.

Inputs: master-0388 (`6e7971f8…`) for the 283-gap inventory, the regenerated
master `65536052…` for the residual leaks. Both have identical material
sections. Extracted with [extract-sections.py](tools/extract-sections.py).

## The causes, with counts

### November 3 inventory (283 gaps)

| Cause | Leak width in the routing material | Gaps | By Nov 3 class | Closed by the 1e-7 ft rule |
| ----- | ---------------------------------- | ---: | -------------- | -------------------------: |
| **A. Floating-point residue** between two RVT-derived sections | ≤ 1e-12 ft | 85 | a 71, d 13, b 1 | 85 |
| A′. Sub-1e-7 contact beside a float32 mesh-cut section | ≤ 1e-7 ft | 1 | a 1 | 1 |
| **B. Float32 mesh-cut supplement** section against an RVT section | 1.2e-7 – 1e-4 ft (78 ≤ 1e-6, 22 ≤ 1e-5, 1 ≤ 1e-4) | 101 | a 88, b 8, d 5 | 0 |
| **C. Measured gap** between RVT sections | 1e-5 – 0.1 ft (1 ≤ 1e-5, 1 ≤ 1e-4, 6 ≤ 0.1) | 8 | d 6, b 2 | 0 |
| **D. Open above 0.1 ft**: real openings, curtain/facade envelopes, columns, passages | > 0.1 ft | 75 | d 61, b 11, c 2, a 1 | 0 |
| E. The walk is not reproduced by the local routing material (the walk depends on a body the local check omits, such as a door leaf or plan wall) | — | 13 | a 8, d 4, b 1 | not measured |
| **Total** | | **283** | | **86** |

By floor (closing tolerance; "open" means above 0.1 ft, "x" means E):

| Floor | ≤ 1e-12 | 1e-7 – 1e-4 | 0.02 – 0.1 | open | x |
| ----- | ------: | ----------: | ---------: | ---: | -: |
| 0.5 | 0 | 0 | 0 | 2 | 0 |
| 1 | 11 | 0 | 1 | 12 | 0 |
| 1.25 | 1 | 3 | 0 | 11 | 1 |
| 2 | 29 | 41 | 2 | 23 | 5 |
| 3 | 25 | 19 | 0 | 12 | 3 |
| 3.5 | 5 | 0 | 1 | 2 | 0 |
| 4 | 15 | 40 | 2 | 13 | 4 |

No leak lies between 1e-12 and 1e-7 ft in RVT-derived material. The two
populations are clearly separate.

### The 132 owner patches

63 patches sit on joints the rule closes (A). 62 sit on float32 joints (B),
which the rule does not close. 7 sit on other joints. So the patches are
still needed. Where a patch and the rule meet the same joint, the patch strip
overlaps both walls by 0.02 ft and the rule adds nothing there.

### November 5 residual leaks (regenerated master `65536052…`)

| Rooms | Joint | Width | Cause | Local cell check with the rule |
| ----- | ----- | ----- | ----- | ------------------------------ |
| 04-207A / 04-207B | 1109158 / 1109162 | ≤ 1e-12 | A | **separated** (cell 604 → 2 pieces) |
| 03-1034 / 03-1035 | 648685 / 664468 | ≤ 1e-12 | A | **separated** (cell 697) |
| 03-2092 / 03-2094 / 03-2096 | 2481352 / 2481462, 2481475, 2481476 (end-to-end pieces of one wall row) | ≤ 1e-12 | A | **separated** (cell 884 → 3 rooms apart) |
| 08-335 / 08-339 | 1505175 / 1505957 | ≤ 1e-12 | A | **separated** (cell 972) |
| 10-4030 / 10-4032 (along the patch strip) | facade layers 2283094–2283114 | ≤ 1e-12 | A | **separated** (cell 1219) |
| 03-3063 / 03-3069, 03-3070 | Building 03 west facade (patched joint `…1067572-407403`) | the 0.73 ft clearance stays open | D, plus a ≤ 1e-7 contact elsewhere in the cell | **separated** (cell 1131 → 2 pieces) |
| 04-206 / 04-207 | 496562 / 2312872 | 2.5e-8 ft | A′ | that walk is blocked, but **cell 602 stays one piece**. The rooms still meet through joint 496562 / 1109154, a float32 joint (B, ≤ 1e-5 ft) |
| 03-1012A / 03-1018 | 401864 / 651904 | 2.4e-6 ft | B | **not separated** (cell 690) |
| 08-155 / 08-156 | 1514583 / 2444585 | open | D (facade) | not separated |

The two Floor 2 pairs the November 5 README asked about: **04-207A / 04-207B
is closed by the fix. 04-206 / 04-207 is not.** Its remaining joint is a
float32 joint on wall 496562.

## What the source model shows

### Group A: walls that meet, plus floating-point noise

- **The residue is below one floating-point step of the coordinate.** For
  example, 1109158 / 1109162 (04-207A / 04-207B) is 2.4e-14 ft at
  |y| ≈ 438 ft, where one double step is 5.7e-14 ft. Across 329 vertex/edge
  pairs in these joints the median distance is 8e-15 ft and the largest is
  4.3e-13 ft.
- **The partitions were drawn to the face of the wall they meet.** In the RVT
  conversion, 125 of the RVT-to-RVT contact pairs have the partition's
  location line ending on the host wall's face, to within 1.1e-14 ft (median;
  largest 4.7e-13 ft). In another 33, the location line ends inside the host
  wall and the exported body ends at its face, which is Revit's join cleanup.
  Only 11 pairs end measurably short or long (6 under 0.02 ft, 5 more). In 62
  of the 93 joints that close at or below 1e-7 ft, every RVT wall contact is
  of the "ends on the face" kind.
- **The coordinates carry transform noise.** The building grids run at 0°,
  58°, 90° and 148°. Of 5,616 wall location lines that are axis-aligned to
  within 1e-6 ft, 2,199 have a nonzero cross component (median 2.8e-14 ft,
  largest 4.9e-11 ft). A line drawn horizontal in Revit would have exactly
  zero. This is what rotation and base-point offsets leave behind when
  coordinates are stored or exported. It is not a drawing offset.
- **Not decoded:** the converter does not read Revit's per-end join state
  (joined, or *Disallow Join*). So "joined in Revit" is **inferred** from the
  location lines and bodies, not read from the file. What the evidence does
  show is that these walls end where they should, to within one floating-point
  step.

### Group B: a float32 copy of 15 ordinary walls

- The routing material has two sources. The RVT material sections are exact
  doubles derived from the model. The **mesh-cut supplement**
  (`production-native-mesh-barrier-cuts-v1`, reason `census-omission`) covers
  68 elements, in 271 sections, that the RVT section census missed.
- The supplement is cut from the converter's render mesh, whose positions are
  `Float32Array` offsets from the model origin (−1.513, 287.295, −7.218) ft.
  **6,428 of its 6,721 vertices are exactly float32 offsets from that
  origin.** The rest are cut points on float32 edges. None of 95,903
  RVT-section vertices sampled is. At 100–500 ft from the origin, one float32
  step is 7.6e-6 to 3.1e-5 ft. That matches the 1.2e-7 to 8.8e-6 ft leaks.
- The walls are ordinary basic walls ("Interior Wall – 120…400mm"). Fifteen of
  them carry every group-B joint: 1499258, 2227525, 404769, 407403 and 401864
  account for most of them, then 1522479, 1500873, 496562, 1498818, 1498812,
  2282580, 1499286, 2255349, 2255346 and 2282577. The November 3 README calls
  the 2.1–4.4e-6 ft cases "the oblique Building 10 facade joins"; those are
  wall 1498818 and its neighbours in this group.
- This is an **export and precision artifact** of the conversion, not the
  owner's model. The RVT location lines of these walls meet their neighbours
  like any others.

### Groups C–E

- **C (8):** RVT-to-RVT gaps of 1e-5 to 0.1 ft. Examples: 07-513/07-514,
  08-264/08-265/08-267, 06-356/06-358, 04-437/04-438 (facade),
  10-1302…10-1312, 04-252/04-253/04-254. These are small gaps in the model,
  most likely ends that were not snapped. They are real geometry, and the rule
  rightly leaves them alone.
- **D (75):** wider gaps. These are partitions ending at a curtain wall or an
  approximate facade envelope (class b), real 1–4 ft passages (c, d), and
  wall-to-column joints.
- **E (13):** the local check could not reproduce the saved walk, so these
  were not measured.

## Effect of the fix

- **Closed:** the 86 group A and A′ joints, plus the six residual joints in the
  table above. That includes the 63 joints that already carry a patch and 23
  that never had one.
- **Expected side effect: rooms whose only connection was a sliver.** Nine of
  the ten patches dropped on November 3 sit on group-A joints. The rule closes
  them, so after regeneration these rooms have no lateral approach and are
  reported as `isolated-arrival` issues: **06-308, 07-754 (with 07-756),
  07-758 (with 07-760), 05-S301 stair, 04-422, 06-268, 06-266 and 09-384.**
  06-258 / 06-276A was not reproduced locally. These rooms have no door in the
  model; they need a door, an opening review or an access decision. Cell 414
  on Floor 1.25 also splits off a 69 sq ft piece with no portal.
- **Not closed:** groups B–E. For group B, a precision-bound rule applied only
  to mesh-cut supplement sections, with a bound taken from the float32 step,
  would close them. Run as a diagnostic at 1e-5 ft
  ([CELL-CHECK-1e-5-DIAGNOSTIC.json](CELL-CHECK-1e-5-DIAGNOSTIC.json)), it
  separates 04-206, 04-207 and 04-208 in cell 602 and 03-1012A from 03-1018 in
  cell 690. It also splits off unportalled pieces (407 sq ft in cell 602), so
  it needs its own review. It is **not** implemented. The real fix for group B
  is to section those 15 walls from the RVT, or to cut the supplement in double
  precision. Until then, the 62 patches on group-B joints stay necessary.

## Guidance for the owner

Most of these leaks are not your modelling: groups A and B come from
arithmetic and conversion. The habits below avoid the real gaps (C, D) and
make walls meet cleanly enough that no tool has to guess.

1. **Finish every partition on the face of the wall it meets.** Draw the
   partition, then drag its end until it snaps to the other wall (look for the
   snap marker). Better still, use **Modify → Trim/Extend to Corner** or
   **Trim/Extend Single Element** with the other wall as the target. Don't stop
   "by eye": a few millimetres short is a doorway to the routing compiler.
2. **Keep wall joins on.** When ends touch, Revit joins walls automatically.
   Don't right-click a wall end and choose **Disallow Join** unless you
   deliberately want a gap. If a join looks wrong, use **Modify → Geometry →
   Wall Joins** to change its type (butt, miter, square) rather than
   disallowing it. To check an end, select the wall: an unjoined end shows a
   small blue dot (drag control) with nothing attached.
3. **Pick a location line and stick with it.** The location line is the
   reference the wall is drawn along (Properties → Location Line: Wall
   Centerline, Finish Face: Exterior/Interior, Core Face…). For partitions
   meeting another wall, **Finish Face** or **Core Face** with snapping to the
   other wall's face is the most predictable. Mixing references is how ends
   land half a wall thickness short.
4. **Curtain walls bound rooms differently.** A curtain wall is panels and
   mullions, not a solid wall. Make sure it is room-bounding (Properties →
   **Room Bounding** ticked). End a partition **on a mullion**, or add a
   mullion where the partition meets the glass, so there is a real solid
   contact. The class (b) leaks on the Building 03 west facade and the
   Building 10 facades are partitions that stop at glass with nothing solid to
   meet.
5. **Use Room Separation Lines only where there is no wall,** such as an open
   plan zone. They tell Revit where a room ends, but they are not walls, and a
   walking route will pass through them.
6. **Check before you export:**
   - **Place rooms.** Use **Architecture → Room** in every space. If two
     spaces that should be separate become one room, or Revit warns "Room is
     not in a properly enclosed region", there is a gap. Check with
     **Architecture → Room & Area → Area and Volume Computations** and turn on
     the room **Interior Fill** in a plan view to see where rooms leak.
   - Look at the **Warnings** list (Manage → Warnings), for example "Highlighted
     walls overlap" and "Room is not in a properly enclosed region".
   - **Zoom right in on each partition end** in a plan view with Thin Lines
     (View → Thin Lines). A sliver of white between a partition and a wall is
     a gap.
7. **Leave the project position alone after modelling.** Rotating the project
   (Manage → Position → Rotate Project North / True North) or moving the
   survey/base point after walls are drawn is fine for Revit. But it is the
   kind of transform that leaves the 1e-14 ft residue seen in group A. The
   compiler now absorbs that residue up to 1e-7 ft.

## Limits

- The local measurement replays the saved walk within 3 ft of the squeeze
  point with the routing material that `createNativeRoutingMaterialQuery`
  returns. Plan walls and solids of uncertified elements, door leaves and
  curtain member sections are not in it (group E). The authoritative effect is
  the regeneration.
- The cell check subtracts the noded walls from the saved faces. It does not
  rebuild door approaches, rerun landings or regenerate walks; new walks exist
  only after the regeneration.
- Revit join state is not decoded; "joined" is inferred from location lines
  and exported bodies.
