# Schematic regularizer (display only, not route-accepted)

Corrected on November 1, 2026 after the branch review
(`OPENINDOORMAPS-BRANCH-REVIEW-20261101.md`, findings 1, 2 and 5).

The regularizer redraws the map's walking lines for legibility. Its output is an
**opt-in, display-only schematic layer**. It is not used by routing, directions,
distances or acceptance, and the map's default view does not use it. The default
view draws the accepted geometry unmodified: the accepted shared guides and, for
every other enabled walk, the original saved walk (`net` in the floor files).

## The rule

`hardgeom.py` (regularizer) and `verify.py` (independent re-implementation) apply
the same rule, computed with exact segment/polygon intervals in the floor files'
decimetre coordinates. No raster or sampling decides a wall or hole contact.

**Hard (veto, no allowance):** a schematic segment may not overlap, for any
positive length (> 1e-6 dm, i.e. floating-point noise only):

* the interior of a native wall footprint, except within 0.8 m of a door
  footprint whose **host wall** (`doorHosts`) is that same native wall
  (`wallIds`) - the door cuts its host wall;
* the interior of a native cell hole not covered by another native cell, except
  within 0.8 m of a door footprint.

There is no "within 0.3 m of the original" exception through walls or holes.
The earlier version accepted such samples (finding 1).

**Source defects:** a line whose ORIGINAL geometry already overlaps a wall or
hole under this rule is never simplified. It is kept unmodified and listed in
the floor's `sourceWallCrossings` (shown by the map's off-by-default layer
"Source walks that cross a native wall").

**Soft (unchanged, only outside walls and holes):** 1 dm samples that lie
outside every native cell (for example a door opening or the gap between two
cells) must be within 0.28 m (regularizer) / 0.3 m (verifier) of the original
line(s) the piece belongs to.

Any simplification that fails either rule keeps the original checked geometry.

## Files

| File | Purpose |
| --- | --- |
| `regularize.py SRC DST` | Writes `DST/floors/*.json` with `net` unchanged and `schematic` (0 = same as `net`). |
| `hardgeom.py` | Exact hard-constraint geometry used by the regularizer and post-check. |
| `no-new-wall-crossings.py DIR` | Exact post-check; restores any changed line that violates the hard rule (restored 0 lines in the current run). |
| `verify.py ROOT [--original DIR] [--graph-full F --guides F] [--output F]` | Independent, standard-library-only verifier. Exit 0 only if every floor passes. |
| `common.py` | Vendored helper (from `agents/audit-ends/common.py`) for the optional graph-full position check. |
| `regression-wall-shortcut.py` | Synthetic regression for finding 1: the wall shortcut must be refused and the original line kept; positive control still simplifies. |
| `prepare-floors.py`, `fit.py`, `extract-array.py` | Add `wallIds`, `doorHosts`, `crossings` and `netEdgeIds` to the accepted floors (exact native ring match is asserted for every wall). |
| `list-source-crossings.py DIR` | Adds `sourceWallCrossings` (edge id, wall native id or cell, overlap, location, neighbouring cells). |
| `build-index.py` | Writes `floors/index.json`: provenance, counts and route distances from the files actually shown. |
| `*.json` receipts | `verify.json`, `no-new-wall-crossings.json`, `regularize-metrics.json`, `source-wall-crossings.json`, `regression-wall-shortcut.json`. |

## Reproduce from a checkout

The floor files carry everything the hard rule needs (`walls`, `wallIds`,
`doors`, `doorHosts`, `cells`, `net`, `schematic`), so the verifier and the
regression run from a fresh checkout with Python 3 only (`regularize.py` also
needs NumPy):

```sh
cd docs/continuation/unbc-20261031/campus/map
python3 regularize/verify.py . --output /tmp/verify.json        # exit 0 = PASS
python3 regularize/regression-wall-shortcut.py                  # exit 0 = PASS
node tests/floor-selection-race.test.mjs                        # exit 0 = PASS
```

Full rebuild (scratch inputs; checksums below):

```sh
python3 regularize/extract-array.py indoor.json OFFSET walls walls-native.json levelId,nativeElementId,id,ringsFeet
python3 regularize/extract-array.py indoor.json OFFSET doors doors-native.json levelId,nativeElementId,hostWallNativeElementId,footprintFeet,state
python3 regularize/prepare-floors.py artifact4 artifact6 campus-preview walls-native.json doors-native.json graph-full.json prepared-routing.json prep
python3 regularize/regularize.py prep out
python3 regularize/no-new-wall-crossings.py out
python3 regularize/list-source-crossings.py out
python3 regularize/verify.py out --original prep --graph-full graph-full.json --guides prepared-routing.json --output out/verify.json
python3 regularize/build-index.py out artifact4/floors/index.json out/verify.json ../acceptance
```

Inputs used on November 1, 2026 (scratch, not committed):

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

## Results (November 1, 2026)

| Floor | Drawn walks | Schematic changed | Source-defect walks kept | Hard violations | Verify |
| --- | ---: | ---: | ---: | ---: | --- |
| Campus Floor 1 | 1,819 | 1,651 | 100 | 0 | PASS |
| Floor 2 | 1,517 | 1,374 | 73 | 0 | PASS |
| Campus Floor 3 | 1,122 | 967 | 102 | 0 | PASS |
| Floor 4 | 1,014 | 922 | 55 | 0 | PASS |
| **Total** | **5,472** | **4,914** | **330** | **0** | **PASS** |

For comparison, the same verifier applied to the previously committed drawing
(`net` of the old floor files treated as a schematic) fails: 367 changed lines
overlap a wall or hole, 82 of them lines whose original did not, and 317
source-defect lines had been redrawn.

The 330 source-defect walks include 71 accepted shared guides. They are measured
in this drawing's fitted, decimetre-rounded coordinates with the strict
host-wall door rule; they were not re-measured in native feet or against the
compiler's own support predicate. Treat them as review leads, not confirmed
compiler defects.
