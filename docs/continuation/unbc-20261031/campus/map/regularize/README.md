# Schematic regularizer (display only, not route-accepted)

Corrected on November 1, 2026 after the branch review
(`OPENINDOORMAPS-BRANCH-REVIEW-20261101.md`, findings 1, 2 and 5), and on
November 2, 2026 after the geometry follow-up review (finding 2: the verifier's
zero-margin door search; see [Door footprints](#door-footprints-november-2-correction)).

The regularizer redraws the map's walking lines for legibility. Its output is an
**opt-in, display-only schematic layer**. It is not used by routing, directions,
distances or acceptance, and the map's default view does not use it. The default
view draws the accepted geometry unmodified: the accepted shared guides and, for
every other enabled walk, the original saved walk (`net` in the floor files).

## The rule

`hardgeom.py` (regularizer) and `verify.py` (independent re-implementation) apply
the same rule, computed with exact segment/polygon intervals in the floor files'
decimetre coordinates. No raster, sampling or numerical search decides a wall,
hole or door interval.

**Hard (veto, no allowance):** a schematic segment may not overlap, for any
positive length (> 1e-6 dm, i.e. floating-point noise only):

* the interior of a native wall footprint, except inside the closed door
  footprint of a door whose **host wall** (`doorHosts`) is that same native wall
  (`wallIds`) - the door cuts its host wall;
* the interior of a native cell hole not covered by another native cell, except
  inside a closed door footprint (any host).

The door zone is the door footprint itself (zero margin, no expansion). It is
closed: its boundary belongs to it, so a line along a door jamb only touches the
boundary of the wall material left beside the door, which is allowed.

There is no "within 0.3 m of the original" exception through walls or holes.
The earlier version accepted such samples (finding 1).

**Flagged originals (`sourceWallCrossings`):** a line whose ORIGINAL geometry
already overlaps a wall or hole under this rule is never simplified. It is kept
unmodified and listed in the floor's `sourceWallCrossings` (shown by the map's
off-by-default layer "Source walks that cross a native wall"). These are
display-coordinate contacts, measured in this drawing's fitted,
decimetre-rounded coordinates; they are review leads, not proven native defects.

**What the check guarantees:** every *changed* schematic line introduces no
forbidden contact under this declared predicate. It does **not** certify that
every original line is wall-free: original lines that meet the predicate are
kept as they are and listed.

**Soft (unchanged, only outside walls and holes):** 1 dm samples that lie
outside every native cell (for example a door opening or the gap between two
cells) must be within 0.28 m (regularizer) / 0.3 m (verifier) of the original
line(s) the piece belongs to.

Any simplification that fails either rule keeps the original checked geometry.

## Files

| File | Purpose |
| --- | --- |
| `regularize.py SRC DST` | Writes `DST/floors/*.json` with `net` unchanged and `schematic` (0 = same as `net`). |
| `hardgeom.py` | Exact hard-constraint geometry used by the regularizer and post-check (door zones: `closed_footprint_intervals`, exact rational clipping). |
| `no-new-wall-crossings.py DIR` | Exact post-check; restores any changed line that violates the hard rule (restored 0 lines in the current run). |
| `verify.py ROOT [--original DIR] [--graph-full F --guides F] [--output F]` | Independent, standard-library-only verifier (door zones: `door_intervals`, exact rational convex clipping). Exit 0 only if every floor passes. |
| `enforce-verifier.py DIR` | Applies `verify.py`'s geometry after the regularizer: restores any schematic line it flags and adds originals it flags to `sourceWallCrossings`. |
| `common.py` | Vendored helper (from `agents/audit-ends/common.py`) for the optional graph-full position check. |
| `regression-wall-shortcut.py` | Synthetic regression for finding 1: the wall shortcut must be refused and the original line kept; positive control still simplifies. |
| `regression-door-clipping.py` | Zero-margin door regression (November 2 review, finding 2), run through both implementations: own-host door crossings pass (axis-aligned, rotated, through a door vertex, along a jamb); wrong-host and unknown-host doors, near misses beside the door and an uncovered hole are refused; the actual Campus Floor 3 line passes; 2,000 seeded random cases agree with an exact rational reference. Needs NumPy. |
| `prepare-floors.py`, `fit.py`, `extract-array.py` | Add `wallIds`, `doorHosts`, `crossings` and `netEdgeIds` to the accepted floors (exact native ring match is asserted for every wall). |
| `list-source-crossings.py DIR` | Adds `sourceWallCrossings` (edge id, wall native id or cell, overlap, location, neighbouring cells). |
| `build-index.py` | Writes `floors/index.json`: provenance, counts and route distances from the files actually shown. |
| `*.json` receipts | `verify.json`, `verify-fresh-checkout.json`, `no-new-wall-crossings.json`, `enforce-verifier.json`, `regularize-metrics.json`, `source-wall-crossings.json`, `regression-wall-shortcut.json`, `regression-door-clipping.json`, `verifier-clipping-correction.json` (November 2 before/after). |

## Reproduce from a checkout

The floor files carry everything the hard rule needs (`walls`, `wallIds`,
`doors`, `doorHosts`, `cells`, `net`, `schematic`), so the verifier and the
regressions run from a fresh checkout (`verify.py` needs Python 3 only;
`hardgeom.py`, `regularize.py` and both regressions also need NumPy):

```sh
cd docs/continuation/unbc-20261031/campus/map
python3 regularize/verify.py . --output /tmp/verify.json        # exit 0 = PASS
python3 regularize/regression-wall-shortcut.py                  # exit 0 = PASS
python3 regularize/regression-door-clipping.py                  # exit 0 = PASS
node tests/floor-selection-race.test.mjs                        # exit 0 = PASS
```

CI (`.github/workflows/indoor-checks.yml`, job `campus-map`) runs all four.

Full rebuild (scratch inputs; checksums below):

```sh
python3 regularize/extract-array.py indoor.json OFFSET walls walls-native.json levelId,nativeElementId,id,ringsFeet
python3 regularize/extract-array.py indoor.json OFFSET doors doors-native.json levelId,nativeElementId,hostWallNativeElementId,footprintFeet,state
python3 regularize/prepare-floors.py artifact4 artifact6 campus-preview walls-native.json doors-native.json graph-full.json prepared-routing.json prep
python3 regularize/regularize.py prep out
python3 regularize/no-new-wall-crossings.py out
python3 regularize/list-source-crossings.py out     # rewrites sourceWallCrossings (hardgeom.py)
python3 regularize/enforce-verifier.py out          # then verify.py geometry is authoritative
python3 regularize/verify.py out --original prep --graph-full graph-full.json --guides prepared-routing.json --output out/verify.json
python3 regularize/build-index.py out artifact4/floors/index.json out/verify.json ../acceptance
```

Inputs used for the first November 1, 2026 build (scratch, not committed; the chosen-candidate rebuild is described below):

| Input | SHA-256 |
| --- | --- |
| `artifact4/floors/campus-floor-1.json` | `13c8a63547ec002397beee60d27c3c24860fe118b92762ddda08955d4d2e416d` |
| `artifact4/floors/floor-2.json` | `9c53a596cbdb2df3374fcd9cf92e65d1a0072e984b5dfc2b49de71fc49023c7a` |
| `artifact4/floors/campus-floor-3.json` | `d32426d523d22d73b97fa909b6dfb70988da83f3205e36d15a69f5e1e1353f79` |
| `artifact4/floors/floor-4.json` | `403213ae8a00acf96075d3292e2b5b58314def52ac3c0333c2a53b7401d7a569` |
| `graph-full.json` | `4294cf150ade1859c0d228d0a4723cda795a748bbe64115a3842de137b2c618f` |
| `campus-guides/prepared-routing.json` (2,701 guides) | `54f10449efcc1620724ccc2ccf8179823f1d8c28a39b8be56e54c2fcbf64cd40` |
| `campus-preview/data/index.json` | `ace9e1178cd66d5225628881446f04e28a954558a5662c4845e0009eba7a842f` |
| extracted `viewer/indoor.json` used for wall/door ids | `61c805ba77eeb781b9888d2ff329917d1438b88a541ecf98fac070b3b172ef73` |

The extracted `indoor.json` is not byte-identical to the candidate ZIP entry the
floors were built from. `prepare-floors.py` therefore asserts that every one of
the 34,604 wall polygons equals the transformed native ring exactly, in order,
and that every door footprint matches exactly, before it records any id.

## Results (current floors, November 2, 2026)

Chosen candidate (see below), after the door-clipping correction
([verify.json](verify.json), [verifier-clipping-correction.json](verifier-clipping-correction.json)):

| Floor | Drawn walks | Schematic changed | Flagged originals kept | of which accepted guides | of which original saved walks | Hard violations | Verify |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Campus Floor 1 | 1,819 | 1,619 | 152 | 43 | 109 | 0 | PASS |
| Floor 2 | 1,517 | 1,353 | 106 | 24 | 82 | 0 | PASS |
| Campus Floor 3 | 1,123 | 934 | 130 | 29 | 101 | 0 | PASS |
| Floor 4 | 1,014 | 876 | 102 | 20 | 82 | 0 | PASS |
| **Total** | **5,473** | **4,782** | **490** | **116** | **374** | **0** | **PASS** |

Before the correction (commit `6acc5ca`) the same floors had 1,618 / 1,353 /
933 / 876 = 4,780 changed lines and 152 / 106 / 131 / 102 = 491 flagged
originals (116 accepted guides, 375 saved walks).

The flagged originals are measured in this drawing's fitted, decimetre-rounded
coordinates with the strict host-wall door rule; they were not re-measured in
native feet or against the compiler's own support predicate. Treat them as
display-coordinate review leads, not confirmed source or compiler defects.

For comparison (first November 1 build, older candidate): the verifier applied
to the drawing committed before the hard rule (`net` of the old floor files
treated as a schematic) failed: 367 changed lines overlapped a wall or hole, 82
of them lines whose original did not, and 317 flagged lines had been redrawn.

## November 1 rebuild for the chosen candidate

The floors now show the chosen candidate (corrected master `6e7971f8…` with
the 06-388 reviewed link, straightened compiler catalog `3430c871…`, 2,728
guides; see `docs/continuation/unbc-20261101/candidate/`). The rebuild script
is `/home/user/unbc-work/cand/rebuild.sh` in the working environment; its
inputs are the candidate ZIP `1a127847…`, its pathway-preview export and the
catalog. `enforce-verifier.py` applies `verify.py`'s own geometry after the
regularizer. On November 1 it restored 2 schematic lines and added one source
crossing; all three actions came from the door-search false positive described
below and were undone on November 2.

## Door footprints (November 2 correction)

The geometry follow-up review (November 2, finding 2) showed that `verify.py`
found the part of a segment inside a door footprint with a golden-section and
bisection search on the distance to the footprint. At zero margin that distance
is zero only on a short flat interval, which the search could miss; the
verifier then reported wall and hole contact where the segment's own host-wall
door permits the crossing. Actual case: Campus Floor 3 `net[352]` (edge
`native-cell:24.278215:826:walk:door:400176:2043306:1|door:400176:2043358:0`),
segment (-278,336) -> (-273,318) lies in door 2043358 (host wall 1505948) for
t = [4/5, 54/65], yet 0.572 dm of wall and 0.575 dm of hole contact were reported.

Both implementations now clip directly against the **closed** door footprint
in exact rational arithmetic (`fractions.Fraction`; every committed coordinate
is an integer), with no search and no tolerance, and still independently:

* `verify.py` `door_intervals`: Cyrus-Beck half-plane clipping of the convex
  footprint (convexity is asserted on load). A segment parallel to an edge is
  kept by that edge if it lies on the edge line or inside; a single-point touch
  has zero length.
* `hardgeom.py` `closed_footprint_intervals`: cuts the segment at every exact
  boundary meeting (crossings, vertices, ends of collinear edges) and
  classifies each piece by its exact midpoint (on an edge or inside both
  count). Works for non-convex footprints too.

`hardgeom.py` did not have the search defect: on integer coordinates its old
door intervals agreed with an exact reference in every stress case tried, and
it never flagged `net[352]`. Its boundary decisions did, however, depend on
floating-point cancellation (normalized edge vectors, a 1e-7 dm midpoint test),
so its zero-margin path was replaced in the same way; a positive margin, which
the rule does not use, still takes the old capsule form.

Effect on the committed floors ([verifier-clipping-correction.json](verifier-clipping-correction.json)):

* 1 flagged original was a false positive: Campus Floor 3 `net[352]` (a saved
  walk). Flags: 491 -> 490.
* 2 schematic lines had been restored only because of the false positive:
  Campus Floor 1 `net[308]` (old verifier: 4.04 dm in wall 967804, all of it
  inside the footprints of doors 1025222 and 1025282, which that wall hosts) and
  Campus Floor 3 `net[352]`. Each was given
  back the regularizer's own output (rerun on the same prepared inputs; it
  matches the committed schematic on every other line) after both corrected
  implementations found no contact on its original and its schematic.
  Changed lines: 4,780 -> 4,782.
* The corrected pipeline run on the regularizer output gives byte-identical
  floor files; `enforce-verifier.py` now restores 0 lines and adds 0 flags.
  `net` is unchanged.
