# Gap-patch regeneration — November 4, 2026

**Status: running on this host** (started 16:03 UTC, November 4). See
[Running now](#running-now). This supersedes step 3 of the chain described in
[README.md → Regeneration](README.md#regeneration).

## What failed

The first regeneration (`regen/logs/regen-20261104T152930.log`) ran the
unchanged October 21 [`run.sh`](../../unbc-20261021/recompile/run.sh) on the
patched master `73a765e9…` that
[apply-gap-patches.ts](tools/apply-gap-patches.ts) wrote from the October 21
source `d5a829e8…`. It stopped about 5 minutes in, while reading the authoring
project (geometry stage):

```
app/indoor-project/routing.ts:1398
Error: Invalid floor or accessibility relationship for edge
native-cell:-3.280840:13:walk:arrival:rm-1450417-f65fe5d929e4|ramp:1643796:lower.
```

## Cause

The patched master is not a valid regeneration input. The code and the edge are
not the cause.

- **The edge is unchanged.** Its JSON object is byte-identical in `d5a829e8`
  and `73a765e9` (sha256 prefix `1929404528f563bc`, 1,172 bytes). It is a walk
  inside native cell `native-cell:-3.280840:13` from the lower landing of ramp
  1643796 to the arrival of `rm-1450417-f65fe5d929e4`. The two nodes have
  different metadata surfaces, so `validateIndoorDatasetSnapshot` accepts the
  walk only as a native-cell floor alias (`nativeCellSharedFloorAlias`).
- **The patched dataset cannot prove that alias.**
  `saveNativeBoundaryPatches(…, apply=true)` adds the tagged wall faces, sets
  `boundaryPatchState.regenerated=false` and deletes
  `dataset.circulationGeometry` (`native-area-review.ts`). The prepared geometry
  key also covers `data.walls`, so it would be stale even if kept. Without the
  prepared cells, `nativeCirculationCells` finds no cell and the alias proof
  fails. `d5a829e8` has `circulationGeometry`; `73a765e9` has none. The import
  path validates the stored graph whatever `regenerated` says. So an
  applied-but-unregenerated native-envelope master with cross-surface walks
  cannot be read back by `readIndoorProject`. The first such edge in graph
  order is this ramp walk.
- **The October 21 reviews would refuse it as well.** The regeneration's source
  reviews bind the original bytes: `positive-source-review.json` binds rooms
  `f329b643…` and dataset `4f814aca…`, and the door and stair-base standing
  reviews bind dataset `4f814aca…`. The patched master has rooms `f945f557…`
  and dataset `bd65fc70…`. The patched master was never a usable input,
  whatever the validator does.

**Control.** The same import on the unpatched October 21 source `d5a829e8`
passes with the same code. A probe today (`readIndoorProject` with
validation, 500 s, `regen/timing/time.log`) imported it. `apply-gap-patches.ts`
also imported it in both runs before applying anything (`"stage":"imported"`).
The restarted regeneration below reads it as its input as well.

**Code revision.** The October 21 recompile used openindoormaps `b78a314`
(producer) and, for the resumed run, `7c27b67`, which adds only Reviter's
resolver to `run.sh` and the measured timings to the README. Reviter was
`cb140e46` on `claude/laughing-davinci-34tcj1`. Sources: the
[recompile README](../../unbc-20261021/recompile/README.md),
[October 22 handoff](../../unbc-20261022/HANDOFF.md) and
[source baseline](../../unbc-20261022/pathway-implementation/SOURCE-BASELINE.md).
The validation is not stricter today. `routing.ts`, `native-circulation.ts`,
`native-area-review.ts`, `package.ts`, `native-boundary-patch-file.ts`,
`native-boundary-patches.ts`, `enclosure-proposals.ts` and
`regenerate-from-native-cache.ts` have the same blobs at `b78a314` and at
`claude/gap-patches` `2f9c566`. Other files in the regeneration's import
closure did change after `b78a314`: the corridor, route-cleanup and
prepared-routing modules, and in Reviter `directory-navigation.ts`, whose new
matcher is opt-in. So the run below uses the producer revision.

## What changed

1. **Commit `75a4091`** on `claude/gap-patches` adds the owner-reviewed patches
   to the regeneration as a source review, like the October 21 door aperture
   review. The source master stays the input, so its graph and every other
   review binding are unchanged.

   - `regenerate-from-native-cache.ts` gets three options:
     `--boundary-patch-review patches.json`,
     `--applied-boundary-patch-master applied.zip` and
     `--boundary-patch-supersessions supersessions.json`.
   - `run.sh` passes them through the optional variables
     `BOUNDARY_PATCH_REVIEW`, `APPLIED_BOUNDARY_PATCH_MASTER` and
     `BOUNDARY_PATCH_SUPERSESSIONS`. When they are unset, the command is the
     October 21 one.
   - [`scripts/indoor/source-boundary-patch-review.ts`](../../../../scripts/indoor/source-boundary-patch-review.ts)
     runs right after the validated source import:

     1. It re-imports the patch file into the unchanged source with
        `importNativeBoundaryPatchFile`. This checks the exact model, levels,
        supporting wall footprints and doors, and returns 132 proposals.
     2. It checks that the applied master `73a765e9` has the same model, and
        that its `floors/rooms.json` (sha checked against its manifest)
        differs from the source rooms only in `nativeBoundaryPatches` and
        `nativeSelectionContactRepairs`.
     3. It checks that every source boundary row is unchanged, and that the
        only added rows are the file's 132 rows, each equal to its imported
        proposal with `status: "applied"`.
     4. It checks that the only changed contact repairs are the 68 listed in
        the supersessions, each changed from `applied` to `restored`, keeping
        its notes as a prefix and naming its patch.

     After the door aperture review, the rows are appended to the reviewed
     source rooms. The tool first checks that no earlier review touched those
     ids or the contact repairs. Reviter's `prepareIndoorDataset` consumes the
     applied rows (`reviewedBoundaryWalls` per level). It refuses any applied
     patch it cannot compile, and it writes `boundaryPatchState.regenerated=true`
     only when all of them compile. The run writes
     `source-boundary-patch-replay.json` and the two review files to
     `output/`. `regeneration.json` records them under
     `sourceBoundaryPatchReview`.

     The hours-long application (guards, then `saveNativeBoundaryPatches` per
     row, about 60 s per row) is not repeated on every resumed run. The
     project's own application already wrote `73a765e9` from this source
     (`regen/logs/apply-20261104T103512.log`: input `d5a829e8`, patch file
     `c92b9e21`, all six level guard passes, 68 supersessions), and the check
     above proves its delta exactly.

2. **Producer clones** (outside git worktrees, local clones only):
   - `/home/user/unbc-work/gap-patches/producer/openindoormaps` is detached at
     `6993c08`, which is `7c27b67` with `75a4091` cherry-picked. Its app and
     scripts differ from `b78a314` only in those two script files.
   - `/home/user/unbc-work/gap-patches/producer/reviter` is detached at
     `cb140e46`.
   - `node_modules` are symlinked from the existing checkouts. Package files
     are identical across these revisions.
   - `regen/openindoormaps` and `regen/reviter` now point at these clones.
3. **Inputs.** `regen/inputs/master.zip` is a link to the source
   `regen-inputs/master.zip` (`d5a829e8`). The patched master moved to
   `regen/inputs/applied-gap-patches-73a765e9.zip`; its `.sha256` file was
   checked after the move. Do not rerun `run-chain.sh`: it would apply again
   and feed the patched master to `run.sh`.

No validation was relaxed, and no edge was edited.

## Running now

```sh
setsid nohup /home/user/unbc-work/gap-patches/regen/run-regen.sh \
  > /home/user/unbc-work/gap-patches/regen/regen.out 2>&1 < /dev/null &
```

`run-regen.sh` holds `flock /home/user/unbc-work/heavy2.lock`. It runs
`run-supervised.py` (`TZ=UTC`, 60 h timeout) around:

```sh
env NATIVE_WORKERS=1 LANDING_WORKERS=1 PARENT_HEAP_MIB=7168 NATIVE_WORKER_HEAP_MIB=4096 \
  BOUNDARY_PATCH_REVIEW=regen/OWNER-GAP-PATCHES.native-boundary-patches.json \
  BOUNDARY_PATCH_SUPERSESSIONS=regen/CONTACT-REPAIR-SUPERSESSIONS.json \
  APPLIED_BOUNDARY_PATCH_MASTER=regen/inputs/applied-gap-patches-73a765e9.zip \
  bash regen/openindoormaps/docs/continuation/unbc-20261021/recompile/run.sh regen
```

Logs are `regen/logs/regen-<time>.log` and `regen/run/compile-<time>Z.log`.

**Progress at 16:51 UTC** (`run/compile-20261104T160322Z.log`, producer
`6993c08` and Reviter `cb140e46` recorded at its head):

| UTC         | Stage                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16:03–16:16 | Source package and authoring import of `d5a829e8` passed, including the geometry stage that failed before. Private import data saved (binding `18429c3d…`). |
| 16:17       | `source-boundary-patches-checked`: 132 rows, 68 restored contact repairs, applied master `73a765e9…`                                                        |
| 16:19–16:23 | Drawing-floor, boundary-bundle and door-boundary replays passed                                                                                             |
| 16:23       | `source-boundary-patches-added` (receipt `700c96e9…`), then the door-aperture review (2 appended)                                                           |
| 16:23–16:34 | Flat-landing driver, stepped-stair proof (positive review bound to rooms `f329b643…` accepted), stair-base standings                                        |
| 16:34       | Compile: native envelopes supplemented from reviewed corrections (the applied patches enter here), then routing interiors                                   |
| 16:45–      | Native walls and doors per level                                                                                                                            |

The next stages are ramps and landing-approach preparation, then the
1148 stair-landing pairs, which is the long stage with one worker.

**To resume after a container restart,** run the same `setsid` line again. The
private import data (`run/imports`), and the floor and landing checkpoints
(`run/checkpoints`), are reused because the paths and commits are the same.

**Expected time.** The README estimate for this host is about 25 h holding the
lock: about 8.5 h single-threaded, about 15 h of landings with one worker, and
about 1 h of planes. A restart before the landing stage finishes may recompute
the landings.
