# Gap-patch regeneration: verification, 06-388 link, guides and route acceptance — November 5, 2026

The full native regeneration with the 132 owner-approved boundary patches and
the 68 superseded selection contact repairs finished on November 5
([regeneration-result](../../unbc-20261103/gap-patches/regeneration-result/README.md)).
Its master is `65536052…` (247,314,130 bytes). This folder carries that
master through four stages: verification against the run-1 master
(`d4d36d18…`), the 06-388 reviewed link, guide compilation and route
acceptance.

**Result in one line:** the patches close every patched strip, separate 180 rooms fully and 50 in part, and break no door connection. The 06-388 link still applies (master `ae70cc07…`). The current compiler accepts 2,726 guides, with 2,701 unchanged and every difference in a patched cell. Route acceptance passes with results identical to a same-code control on the previous master. Two Floor 2 room pairs gained a new leak through joints the patches did not cover, and one Floor 4 facade patch still leaks along its edge; these need a second, small patch round.

| Stage           | Result                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Verification | 132/132 strips crossed by run-1 walks, 0 crossed now. 157/158 patched gaps have no squeeze. 234 rooms changed, none lost a door connection or the main network. Owner examples separated. **Residual:** 10-4032 still reaches 10-4030 along the edge of its strip, and 10 new squeezes (7 walks) go through other sub-0.2 ft joints, with 2 new room pairs (04-206/04-207, 04-207A/04-207B) | [VERIFICATION.json](VERIFICATION.json), [RESIDUAL-LEAKS.json](RESIDUAL-LEAKS.json), [OWNER-EXAMPLES.json](OWNER-EXAMPLES.json), [AFTER-SQUEEZE-GAPS.json](AFTER-SQUEEZE-GAPS.json) |
| B. 06-388 link  | Still needed; replay passed; master `ae70cc07…`                                                                                                                                                                                                                                                                                                                                             | [LINK-RESULT.json](LINK-RESULT.json)                                                                                                                                               |
| C. Guides       | Current compiler `9157d27e…`: 2,726 guides (2,701 identical to `1c3011ff`; 30 differences, all in patched cells), 4 crossings. Straight runs `e30c0040…`: 0 guides lost, but 1 new crossing (cell 917, formerly 852). Recommended: current                                                                                                                                                  | [CATALOGS.json](CATALOGS.json), [PREPARED-ROUTING.json](PREPARED-ROUTING.json)                                                                                                     |
| D. Acceptance   | PASS 33/33 (16 routes, 17 expected refusals, worker 33/33). Same availability, required edges and route edges as the final candidate. 13 routes are 0.11–1.30 m shorter, all from the November 3 route-output code: a control run of the same code on `master-0388` + `1c3011ff` gives identical numbers                                                                                    | [ACCEPTANCE-DIFF.json](ACCEPTANCE-DIFF.json), [acceptance/](acceptance/)                                                                                                           |

Nothing was published. No visitor package, cache, receipt or proof was
rebuilt. The masters and catalogs are local artifacts identified by hash.

## A. Verification against the run-1 master

Both masters come from the same October 21 source (`d5a829e8…`) and the
same producer code. The only intended difference is the patch source review.
Inputs were read straight from each master's `viewer/indoor.json` with
[extract-tables.py](tools/extract-tables.py). Its geometry table is
byte-identical to the one the November 3 inventory wrote from a full project
import of `master-0388` (checked), so the inventory tools run unchanged.

### What changed in the dataset

| Item                                                           |                          Run 1 `d4d36d18` |                                             Regenerated `65536052` |
| -------------------------------------------------------------- | ----------------------------------------: | -----------------------------------------------------------------: |
| Nodes (portal / arrival / stair / connector)                   |                                     5,493 |                                               5,493, all identical |
| Doors (`doors[]`), door and opening edges, vertical edges      |                                         — |                          identical, so door ownership is unchanged |
| Walls                                                          |                                    35,266 | 35,398: the 132 `owner-gap:` strips, nothing else added or removed |
| Enabled walks                                                  |                                     5,485 |         5,361 (134 removed, 10 new, 486 re-drawn, 4,867 identical) |
| Floor 1 / 1.25 / 2 / 3 / 3.5 / 4 walks                         | 1,126 / 507 / 1,517 / 1,001 / 121 / 1,014 |                              1,120 / 505 / 1,475 / 970 / 117 / 975 |
| Floor 0, 0.5 walks                                             |                                   13, 186 |                                                            13, 186 |
| Components (all enabled edges) / with arrivals                 |                                 156 / 120 |                                                          156 / 120 |
| Arrivals in the largest component                              |                                     1,695 |                                                              1,695 |
| Rooms whose arrival reaches a door, opening or vertical portal |                                     1,733 |                                                              1,733 |
| Rooms walk-joined to another room inside a routing cell        |                                       665 |                                                                486 |

Other differences: 82 room records changed only `nativeRoutingBoundary`
(58 of them gained vertices where a strip meets the outline; the largest area
change is 0.0009 sq ft), and stair `1696006`'s stepped-stair receipt names the
renumbered cells and the new circulation geometry key. Native cells were
renumbered (the strips split 74 cells), so walk ids differ and are compared by
their end nodes.

The `regeneration.json` before/after figures (components 49→25, largest
component 1,549→1,703, routable arrivals 1,740→1,763, unmatched doors
287→281) are **not** an effect of the patches. The run-1 `regeneration.json`
reports exactly the same eight numbers: they compare the October 21 source
with any regeneration of it. The patches change no component and no
arrival's reachability.

### Patched gaps

- **Strips.** Every one of the 132 strips was crossed through its interior by
  at least one enabled run-1 walk. On the regenerated master no enabled walk
  crosses any strip interior.
- **Gaps.** The walk-clearance inventory ([walk-squeezes.py](../../unbc-20261103/gap-patches/tools/walk-squeezes.py)
  and [group-gaps.py](../../unbc-20261103/gap-patches/tools/group-gaps.py), 2.0 ft,
  unchanged) was rerun on both graphs. On `master-0388` it reproduces the
  November 3 inventory exactly (446 squeezes, 283 gaps, byte-identical
  squeezes). On the regenerated master it finds 158 squeezes in 116 gaps.
  Of the 158 patched gaps, 157 have no squeeze left at the gap. For 153 of
  them, no walk joins the same two end nodes any more. For the other 5, the
  regenerated walk between the same end nodes avoids the strip. Four of those
  walks squeeze through another joint (the table below) and one runs along
  the strip edge (item 1 below).
- **Two patched joints still let a walk past**, both on the Floor 4 facades
  that the November 3 README had already singled out:
  1. `owner-gap:402367:2283111-2282580` (10-4030 / 10-4032, layered
     Building 10 facade). The walk from 10-4032's arrival to door 2282764
     (10-4028 / 10-4030) now runs 0.02 ft along the strip's short edge. It
     touches the strip boundary without entering it, and goes through the
     seam between the strip end and the next facade layer. **10-4032 still
     reaches 10-4030's door without a door of its own on the way.** The
     strip needs to reach the next layer, or that facade needs a member-level
     review.
  2. `owner-gap:402367:1067572-407403` (Building 03 west facade, gap
     `gap-402367-0236`). The joint itself is closed. The same partition still
     has the 0.73 ft clearance to the approximate facade envelope (body
     2408134), and a walk goes through it. That walk now runs from 03-3063's
     arrival to 03-3063's own door 1068161, so it is no longer a leak between
     rooms. 03-3063, 03-3069 and 03-3070 stay walk-joined (see below).
- **Ten new squeezes (7 walks), all through other sub-0.2 ft joints that the
  patches did not cover.** When a strip closed the leak, the regenerated walk
  found the next one ([RESIDUAL-LEAKS.json](RESIDUAL-LEAKS.json)):

  | Floor | Walk joins                                                | Joint (bodies, exact distance)                                  | Before                                                                                                                                                           |
  | ----- | --------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 2     | 04-206's door (from 04-204) → a door of 04-207 (cell 602) | 496562 / 2312872, 0 ft; 496562 / 1109154, 1.43 ft               | **new pair**: 04-206 was walk-joined to 04-207B, 04-207 to 04-210/04-211                                                                                         |
  | 2     | door 04-207A/04-207 → 04-207B arrival (cell 604)          | 1109158 / 1109162, 2.4e-14 ft                                   | **new pair**                                                                                                                                                     |
  | 2     | 03-1012A → door 03-1013A/03-1018                          | 401864 / 651904, 0 ft                                           | same walk ends as patched `gap-694-0092`; 03-1012, 03-1019 and 03-1023A did separate                                                                             |
  | 2     | 03-1035 ↔ 03-1034                                        | 648685 / 664468, 0 ft (the other end of the patched partition)  | same walk ends as patched `gap-694-0096/0097`; 03-1036, 03-1037 and 03-1042 did separate                                                                         |
  | 3     | 08-335 ↔ 08-339                                          | 1505175 / 1505957, 6e-15 ft                                     | already joined (with 08-341)                                                                                                                                     |
  | 3     | door 03-2092/03-2002 → 03-2094                            | 2481352 / 2481462 and 2481536, 0 ft; 1077022 / 2481462, 1.67 ft | same walk ends as patched `gap-400176-0167`: the walk now goes round the strip through the neighbouring joints, so 03-2092, 03-2094 and 03-2096 did not separate |
  | 1.25  | 08-156 ↔ 08-155                                          | 1514583 / 2444585, 0 ft                                         | same walk, identical geometry: a class (b) facade leak, re-measured against a nearby body                                                                        |

  These are the same kind of accidental joint the owner asked to fix
  (0 to 2.4e-14 ft). The two new pairs on Floor 2 replace leaks that the
  patches closed in the same cells.

### Rooms whose connectivity changed

234 rooms changed ([VERIFICATION.json](VERIFICATION.json) →
`rooms.rows`, with lost/gained walk neighbours, portals, before cells and
the patches in them). **Every one of them is in a routing cell that a patch
cut. No room lost its door-connected arrival, and no room joined or left the
main network.**

| Class                                                                                                                         | Rooms | Floors                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------ |
| Fully separated: lost every leaked neighbour and keeps only its own portals                                                   |   180 | 1: 9, 1.25: 3, 2: 62, 3: 46, 3.5: 7, 4: 53 |
| Partly separated: lost some leaked neighbours, still walk-joined to others through unpatched (b)/(d) gaps or the joints above |    50 | 1: 7, 1.25: 2, 2: 25, 3: 9, 4: 7           |
| Re-grouped: lost one neighbour and gained another (new leak above)                                                            |     4 | 2: 04-206, 04-207, 04-207A, 04-207B        |

Fully separated rooms:

- Floor 1: 03-002, 03-006, 03-022, 03-023, 05-136A, 05-136B, 07-257, 07-505, 07-506A.
- Floor 1.25: 08-114, 08-116, 10-1542.
- Floor 2: 03-1004, 03-1012, 03-1019, 03-1023A, 03-1032, 03-1036, 03-1067, 03-1069, 03-1091, 03-1092, 04-202, 04-210, 04-211, 04-219, 04-224, 04-225, 04-228, 04-234, 04-235, 04-254, 04-S201, 06-278, 06-282, 08-234, 08-235, 08-236, 08-275B, 08-276, 09-367, 09-368, 09-369, 09-370, 09-376, 09-378, 09-380, 10-2004, 10-2012, 10-2022, 10-2024, 10-2030, 10-2036, 10-2046, 10-2050, 10-2052, 10-2058, 10-2064, 10-2094, 10-2096, 10-2506, 10-2508, 10-2532, 10-2534, 10-2536, 10-2542, 10-2544, 10-2556, 10-2558, 10-2562, 10-2564, 10-2568, 10-2608, 10-S201.
- Floor 3: 03-2008, 03-2009, 03-2032, 03-2033, 03-2065, 03-2066, 03-2072, 03-2073, 03-2079, 03-2080, 03-2081, 03-2084, 03-2085, 04-303, 04-309, 04-312, 04-S301, 05-314, 05-322, 05-324, 05-328, 05-341, 05-342, 05-344, 05-345, 08-327, 08-334, 08-336, 08-341, 10-3005, 10-3006, 10-3014, 10-3024, 10-3044, 10-3046, 10-3058, 10-3060, 10-3076, 10-3078, 10-3548, 10-3550, 10-3556, 10-3566, 10-3570, 10-3572, 10-3612.
- Floor 3.5: 06-305, 06-306, 06-307, 06-350, 06-354, 06-397, 06-398.
- Floor 4: 03-3037, 03-3043C, 03-3046D, 03-3046E, 03-3057, 03-3058, 03-3061, 03-3062, 03-3064, 03-3066, 03-3071, 03-3072, 03-3075, 03-3076, 03-3077, 04-417, 04-419, 04-424, 04-425, 05-403A, 05-405, 05-426, 08-426, 08-427, 08-431, 08-433, 08-435, 10-4024, 10-4026, 10-4042, 10-4046, 10-4048, 10-4050, 10-4060, 10-4062, 10-4076, 10-4078, 10-4508, 10-4530, 10-4532, 10-4534, 10-4536, 10-4538, 10-4540, 10-4542, 10-4544, 10-4556, 10-4558, 10-4562, 10-4564, 10-4566, 10-4568, 10-4598.

Definitions ([verify-regeneration.py](tools/verify-regeneration.py)): a room's
_walk cluster_ is everything its arrival reaches over enabled walks only, so
without crossing a door, opening or vertical edge. _Walk neighbours_ are
other rooms whose arrival is in that cluster. _Portals_ are the door, opening
and vertical edges that touch it.

### The owner's examples (Floor 2)

| Room    | Run 1: walk neighbours → portals                  | Regenerated                    |
| ------- | ------------------------------------------------- | ------------------------------ |
| 08-234  | 08-235, 08-236 → the three doors to 08-240        | none → its own door to 08-240  |
| 08-235  | 08-234, 08-236 → the same three doors             | none → its own door            |
| 08-236  | 08-234, 08-235 → the same three doors             | none → its own door            |
| 10-2046 | 10-2050 → doors of 10-2046 and 10-2050 to 10-2026 | none → its own door to 10-2026 |
| 10-2050 | 10-2046 → both doors                              | none → its own door            |
| 10-2052 | 10-2058 → doors of 10-2052 and 10-2058 to 10-2026 | none → its own door to 10-2026 |
| 10-2058 | 10-2052 → both doors                              | none → its own door            |

All seven stay in the main network ([OWNER-EXAMPLES.json](OWNER-EXAMPLES.json)).

## B. 06-388 reviewed link

The link is still needed. On `65536052` door 1780077's 06-364 portal
(`door:1487353:1780077:0`) still has no walk. 06-388 Vestibule and the same 15
rooms form a 16-arrival component outside the main network, as on run 1.
The regeneration renumbered the 06-364 cell from 994 to 1077, but the two
nodes are unchanged.

`add-reviewed-circulation-link.ts` ran with the arguments of
[EXPORT-EXECUTION.json](../../unbc-20261031/campus/06-388-repair/EXPORT-EXECUTION.json).
The decision source, id and summary are unchanged. A `--notes` line records
the re-addition and the new cell number.

| Step                                     | Result                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--check-only` (1,148 s)                 | `LINK_REPLAY_PASSED_NOT_EXPORTED`. Support ok, room `rm-1487353-c8cc98ebb50c` (06-364), 6.462 ft; the two earlier reviewed links still apply                                                                                                                                                                                 |
| Export (5,961 s, child peak RSS 5.8 GiB) | `LINK_ADDED_GUIDES_AND_ACCEPTANCE_REQUIRED`. Master **`ae70cc07e5d03aa3cf281573c0be55f1e8ecc57442c121e380f3f90a433959a9`**, 247,314,898 bytes                                                                                                                                                                                |
| After                                    | 06-388, 06-364 and 06-366 are in the main component, which now has 1,711 arrivals (as on `master-0388`). The dataset differs from `65536052` only in the link edge, `reviewedCirculationLinks`, the rooms sha and the explore-mapping geometry sha. These are the same four keys that differ between `master-0388` and run 1 |

Local path: `/home/user/unbc-work/gap-requal/master-gap-0388.zip`.

## C. Guide catalogs

Both catalogs were compiled on `ae70cc07…` with
`compile-corridor-candidates.ts`, the command of
[approach-topology/COMPILE-EXECUTION.json](../../unbc-20261102/approach-topology/COMPILE-EXECUTION.json),
under the heavy lock and `run-supervised.py`, with Node 24.19.0 as for
`1c3011ff`. The current compiler is this branch (`306eadc`). Its
`corridor-centerline.ts` is identical to the approach-topology fix
(`9669621`) that produced `1c3011ff`. The straight-runs compile ran in a
scratch worktree, `/home/user/unbc-work/gap-requal/wt-straight-runs`: detached
`306eadc` plus `git am` of
[corridor-runs-code.patch](../../unbc-20261103/corridor-runs/corridor-runs-code.patch),
which applied cleanly (`a3bbd4d`).

| Catalog                            | SHA-256                                                                |    Guides | Guides-only crossings | Compile          |
| ---------------------------------- | ---------------------------------------------------------------------- | --------: | --------------------: | ---------------- |
| Final candidate (`master-0388`)    | `1c3011ff…`                                                            |     2,728 |                     4 | —                |
| **Current compiler (recommended)** | **`9157d27ec639c3f8026cc3e1134a6b039c9bd74ebcdaa8c4a3bdbd21ee6c7691`** | **2,726** |    **4** (the same 4) | 2,964 s, 3.5 GiB |
| Straight corridor runs             | `e30c004023410e39770e19ce8f1567a84df55a633c347b913ca4546c71f9923d`     |     2,726 |                 **5** | 3,115 s, 3.5 GiB |

**Current compiler against `1c3011ff`** (keyed by walk end nodes, because cell
numbers changed): 2,701 guides are byte-identical, 22 changed, 5 lost and 3
gained. All 30 differences are in cells that a patch cut:

| Cell (run-1 number), floor | Rooms                                                          | Guides                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 522 + 530, Floor 2         | 06-278, 06-282 (cell split by `owner-gap:694:1327870-1327248`) | 14 changed, 4 lost, 3 gained. The lost and gained ones are walks the regeneration replaced, between the same rooms and the re-split corridor seams |
| 801, Floor 3               | 04-312, 04-S301                                                | 2 changed, 1 lost (walk door 2112568 → door 2112621 removed)                                                                                       |
| 180, Floor 1               | 03-013, 03-014                                                 | 3 changed                                                                                                                                          |
| 573, Floor 2               | 04-202                                                         | 1 changed                                                                                                                                          |
| 631, Floor 2               | 03-10xx suite                                                  | 1 changed                                                                                                                                          |
| 1130, Floor 4              | 05-430, 05-451                                                 | 1 changed                                                                                                                                          |

The eligible walking edges drop by one on Floor 2 (782 → 781) and one on
Campus Floor 3 (572 → 571). 156 edges are refused, as before. No guide outside
a patched cell changed.

**Straight runs against current, on the same master:** 0 guides lost, 0
gained, 1,967 changed. Core bends over 5° go from 2,303 to 1,905, zigzags
from 225 to 166 and approach elbows from 342 to 259. Against its own earlier
catalog `b7f8198e…`, it shows the same 2,701 / 22 / 5 / 3 split in the same
patched cells. **It still adds one crossing**: guides-only crossings without a
junction go from 4 to 5. The new one is the November 3 crossing in cell 852,
now numbered 917 (Campus Floor 3): the legacy-fallback guide door 2262772 →
2262854 against a run-fitted lane. The patches do not touch that cell.

**Recommendation: the current-compiler catalog `9157d27e…`**, copied here as
[PREPARED-ROUTING.json](PREPARED-ROUTING.json). The straight-runs catalog
loses no guides but adds a crossing, so it does not qualify. The crossing
count uses [guide-crossings.py](tools/guide-crossings.py). It applies the
`tools/reference-comparison` planarize and proper-crossing definitions to the
guides alone, and does not need map floor files (their walk ids predate the
renumbering). As a control, on `master-0388` it reproduces the November 3
values: 4 for `1c3011ff` and 5 for `b7f8198e`. Details are in
[CATALOGS.json](CATALOGS.json).

## D. Route acceptance

`verify-shared-corridor-candidate.ts` ran with master `ae70cc07…`, catalog
`9157d27e…` and
[ROUTE-CASES-CAMPUS-0388.json](../../unbc-20261031/ROUTE-CASES-CAMPUS-0388.json),
the command of
[final-candidate/acceptance/EXECUTION.json](../../unbc-20261102/final-candidate/acceptance/EXECUTION.json),
with Node v22.22.0 as there. It took 2,688 s, with a child peak RSS of 5.4 GiB
([acceptance/](acceptance/)).

**PASS**: 33/33 cases, 16 available, 17 expected refusals, 0 failures. The
production worker passed 33/33, and the 27 held transitions are identical.
Candidate archive `c1b441e0…`.

Compared with the final-candidate acceptance
([REPORT.json](../../unbc-20261102/final-candidate/acceptance/REPORT.json)),
case by case ([ACCEPTANCE-DIFF.json](ACCEPTANCE-DIFF.json)):

- **Same in every case:** availability, expected outcome, required source
  edges and required native door verification, shared-path count, worker
  status and the route edge sequence. Walks are compared by their end nodes,
  because cell numbers changed.
- **No case is longer or refused.** No route, before or after, used a walk
  that crossed a patched gap. All 327 edge uses on these routes are identical
  apart from the cell number in walk ids. Every guide on them is
  byte-identical between `1c3011ff` and `9157d27e`. No case starts or ends in
  a room whose connectivity changed.
- **13 available cases are shorter**, by 0.106 to 1.299 m:

  | Case                                         | Final candidate (m) | Now (m) |  Δ (m) |
  | -------------------------------------------- | ------------------: | ------: | -----: |
  | 08-216 → 08-260, hallway (and reverse)       |              12.519 |  11.539 | −0.980 |
  | 08-216 → 08-260, inside (and reverse)        |              12.519 |  11.437 | −1.082 |
  | 04-255 → 08-272, other-room transit, hallway |             177.329 | 176.029 | −1.299 |
  | 08-272 → 04-255, other-room transit, hallway |             176.718 | 175.419 | −1.299 |
  | 04-255 → 08-272, other-room transit, inside  |             186.350 | 185.051 | −1.299 |
  | 08-272 → 04-255, other-room transit, inside  |             185.740 | 184.441 | −1.299 |
  | 04-204 ↔ 08-267, hallway (both directions)  |             120.961 | 119.954 | −1.007 |
  | 04-237 → 08-205, hallway                     |             117.965 | 117.860 | −0.106 |
  | 08-205 → 04-237, hallway                     |             117.808 | 117.703 | −0.106 |
  | 06-366 → 06-364, inside                      |              21.010 |  20.850 | −0.160 |

  **Reason: the code changed, not the map.** The final-candidate acceptance
  ran on November 2 from `wt-approach-topology`, before the November 3
  route-output change (`route-line-cleanup.ts`; the reported distance is the
  length of the cleaned line). A **control run** used the same current code
  (`306eadc`, Node v22.22.0) on the final-candidate inputs (`master-0388`
  `6e7971f8…` with `1c3011ff`, [acceptance-control/](acceptance-control/)).
  It returned exactly the same 33 results as the gap master, with every
  distance equal to the last bit. So the gap patches change none of the 33
  acceptance results. Note: the route-output requalification recorded at most
  0.513 m of shortening over the 160-case policy matrix. These acceptance
  cases shorten by up to 1.299 m under the same code. That does not come from
  this regeneration, but expectations that pin these distances would need the
  same rebase.

## Reproduce

Paths are on this host. Heavy steps ran under `flock /home/user/unbc-work/heavy2.lock`
and `run-supervised.py` with `TZ=UTC`. Evidence logs, memory samples and
execution reports are in `/home/user/unbc-work/gap-requal/evidence/`.

```sh
G=/home/user/unbc-work/gap-requal T=docs/continuation/unbc-20261105/gap-regeneration/tools
P=docs/continuation/unbc-20261103/gap-patches
# A. tables from each master's viewer/indoor.json (run 1, master-0388, regenerated)
python3 $T/extract-tables.py $G/ex/new/viewer/indoor.json 65536052… $G/inv/new   # likewise run1, m0388, final
python3 -I $P/tools/walk-squeezes.py $G/inv/new/geometry.json $G/inv/new/graph-full.json $G/inv/new/squeezes.json 2.0
python3 -I $P/tools/group-gaps.py $G/inv/new/geometry.json $G/inv/new/graph-full.json $G/inv/new/squeezes.json $G/inv/new/gaps.json
python3 -I $T/verify-regeneration.py $G/inv/run1 $G/inv/new $P/GAP-PATCHES.json $G/inv/new/gaps.json VERIFICATION.json
python3 -I $T/residual-leaks.py $G/inv/run1 $G/inv/new $G/inv/m0388/gaps.json $G/inv/new/gaps.json $P/GAP-PATCHES.json VERIFICATION.json RESIDUAL-LEAKS.json
python3 -I $T/owner-examples.py $G/inv/run1 $G/inv/new OWNER-EXAMPLES.json 08-234 08-235 08-236 10-2046 10-2050 10-2052 10-2058
# B + C. link check, export, both compiles (resumable)
setsid nohup $T/run-chain.sh > $G/chain.out 2>&1 &
python3 -I $T/compare-catalogs.py docs/continuation/unbc-20261102/final-candidate/PREPARED-ROUTING.json $G/inv/m0388/graph-full.json \
  $G/guides/compile/prepared-routing.json $G/inv/final/graph-full.json $P/GAP-PATCHES.json VERIFICATION.json catalog-current.json
python3 scripts/indoor/compare-corridor-candidates.py $G/guides/compile $G/guides-straight/compile current-vs-straight.json
REFCMP=tools/reference-comparison python3 -I $T/guide-crossings.py --graph $G/inv/final/graph-full.json \
  --frame /home/user/unbc-work/cand-final/frame-1a127847.json \
  --catalog current=$G/guides/compile/prepared-routing.json --catalog straight=$G/guides-straight/compile/prepared-routing.json --out crossings.json
# D. acceptance, then the same-code control on master-0388
$T/run-accept.sh $G/guides/compile/prepared-routing.json accept
MASTER=/home/user/unbc-work/master-0388.zip $T/run-accept.sh docs/continuation/unbc-20261102/final-candidate/PREPARED-ROUTING.json accept-control
python3 -I $T/compare-acceptance.py docs/continuation/unbc-20261102/final-candidate/acceptance/REPORT.json $G/accept/report.json \
  $G/inv/m0388/graph-full.json $G/inv/final/graph-full.json $P/GAP-PATCHES.json acceptance-diff.json
```

The Python steps use shapely 2.2.0 and numpy 2.5.4 in `$G/venv`. The
straight-runs worktree `/home/user/unbc-work/gap-requal/wt-straight-runs` is a
detached scratch worktree; it can be removed with `git worktree remove`.

## Next steps

1. **A second, small patch round** for the joints the regeneration exposed,
   using the same owner authorization and the November 3 tooling:

   - Floor 2: 496562 / 2312872 (04-206 ↔ 04-207) and 1109158 / 1109162
     (04-207A ↔ 04-207B), both new leaks;
   - the joints that still let 03-1012A/03-1018, 03-1034/03-1035, 08-335/08-339
     and 03-2092/03-2094 through;
   - the 10-4030/10-4032 strip, which must reach the next facade layer.

   Then run another regeneration (about 14 h here) and repeat A–D with these
   tools.

2. Or accept this master as it is: it separates 230 rooms (180 of them
   fully) at the cost of the two new Floor 2 pairs, and changes no acceptance
   result. In that case rebuild the shared-pathway candidate, visitor package
   and map floors from `ae70cc07` with `9157d27e`. The candidate archive
   `c1b441e0…` from stage D is a starting point. Then rerun the policy matrix,
   directions cache, plans and browser proof. All of them are bound to the old
   candidate `32c395e1…`.
3. The class (b) facade gaps (23) and the 10 dropped patches still need
   curtain-joint evidence or door/opening decisions, as listed in the
   November 3 README.
4. Straight corridor runs stay held: on this master they again lose nothing
   but add the cell 917 (formerly 852) crossing.
