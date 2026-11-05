# Sliver contacts: compiler fix and regeneration run — November 5, 2026

**Status: code fixed and tested; the regeneration has not been run.** It is
prepared for the owner's computer or Colab, or for this host under the heavy
lock. Why the joints leak, with counts, is in [ROOT-CAUSE.md](ROOT-CAUSE.md).

**In one paragraph:** the exact routing compiler never applied the documented
1e-7 ft wall contact rule, so partitions that miss a wall face by a
floating-point residue (1e-14 ft) left slivers that walks squeeze through. The
rule now runs in the compiler's exact walking region. Locally it closes
04-207A/04-207B, 03-1034/03-1035, 03-2092/03-2094/03-2096, 08-335/08-339,
10-4030/10-4032 and 03-3063/03-3069. It does **not** close 04-206/04-207 or
03-1012A/03-1018: those meet through float32 mesh-cut walls 1e-6 to 1e-5 ft
apart, which is above the 1e-7 ft bound. The 132 owner patches stay in the
run.

## The change

| Repository | Where | Commit |
| ---------- | ----- | ------ |
| Reviter (producer, for the run) | `/home/user/unbc-work/gap-patches/producer/reviter`, branch `claude/sliver-contacts` | `f65823a` on `cb140e46` |
| OpenIndoorMaps (producer) | `/home/user/unbc-work/gap-patches/producer/openindoormaps`, branch `claude/sliver-contacts` | `bdef4a6` on `6993c08` (= `7c27b67` + boundary-patch source review) |
| Reviter (development) | worktree `/home/user/reviter-sliver`, branch `claude/sliver-contacts-dev` | `accdc35` on `2e7875d` |
| OpenIndoorMaps (development) | worktree `/home/user/wt-sliver`, branch `claude/sliver-contacts-dev` | `8b308a0` on `e55f680`, then these docs |

The code is the same in the producer and development lines: the new module and
tests are byte-identical, and the edits are identical hunks.

- **Rule** (`native-routing-contact-noding.ts`, the same in both repositories,
  `NATIVE_ROUTING_CONTACT_NODING_VERSION =
  "native-routing-wall-contact-noding-v1:1e-7ft:outside-vertex-into-foreign-edge"`):
  a wall vertex within 1e-7 ft of another wall's edge (inside the edge span,
  or a corner of an end-to-end abutment at its end), strictly outside that wall
  by an exact `orient2d` test, is inserted into that edge. The vertex is the
  unchanged original coordinate. Nothing is rounded, moved or buffered, and
  material is only added, within 1e-7 ft of an edge. Exact contacts and
  overlaps return the same wall objects. The bound is enforced; a larger
  tolerance throws.
- **Compiler** (Reviter `native-circulation-links.ts → nativeWalkingRegion`,
  strict native branch): all wall barriers that are not exact-backed are noded
  before the exact free face is built. These are RVT material sections,
  mesh-cut supplement sections, derived frame returns, provisional seals, and
  plan or solid walls of uncertified elements. Reviewed patch walls keep their
  rational operands and are not noded. A portal query's own door aperture is
  cut **after** noding, so plane and portal queries see the same walls and no
  aperture is ever noded. Door leaves and thresholds, floors and holes,
  columns, curtain member sections, fixtures and masks are never inputs. The
  legacy, non-native branch is unchanged.
- **Bindings:**
  - The rule version is part of `nativeCirculationGeometryKey` (native branch)
    in Reviter `native-circulation-geometry.ts` and OpenIndoorMaps
    `native-circulation.ts`, and of the private physical memo key in
    `nativeWalkingRegion`. Prepared circulation compiled before the fix is
    therefore stale.
  - Plane and landing checkpoints bind the transitive compiler files, so the
    Nov 4 checkpoints cannot be reused either.
  - The OpenIndoorMaps runtime bindings were regenerated with their writer
    scripts. Before the change both lines were current, with no drift.

  | Binding | Producer (old → new) | Development (old → new) |
  | ------- | -------------------- | ----------------------- |
  | `PREPARED_DISPLAY_ENGINE_SHA256` | `469c764e…` → `35af5e9a…` | `4a0a354a…` → `68af249c…` |
  | `PUBLISHED_ROUTE_RUNTIME_SHA256` | `1dbb7ca7…` → `88f5ee42…` | `6d62e8ae…` → `44bc4665…` |
  | published visitor plan runtime | `55b0a61d…` → `c0565296…` | `4705ec62…` → `8819fd73…` |

- **Compatibility:** with the new code, a master compiled before the fix has
  stale `circulationGeometry`. Its cells are ignored, native walks are blocked,
  and alias walks fail import validation; see
  [REGENERATION.md](../../unbc-20261103/gap-patches/REGENERATION.md) for the
  same effect. Keep serving existing masters with the code they were built
  with until the regenerated master is accepted.

## Tests

| Suite | Result |
| ----- | ------ |
| Reviter `tests/native-routing-contact-noding.test.ts` (new): partition 1e-14 / 1e-9 / 5e-8 ft short closed, 1e-6 / 0.02 ft open; exact contact and overlap unchanged; door aperture beside a contact stays open; L-corner and collinear end-to-end pieces closed; idempotent; bound enforced; strict `nativeWalkingRegion` separates rooms only at the numerical contact; compiler/runtime key and rule parity | 7/7, producer and development |
| Reviter test files that use the walking region, circulation geometry or key (24 files) | 135/135 producer; 135/135 development (paired with `wt-sliver`) |
| OpenIndoorMaps `tests/unit/native-routing-contact-noding.test.ts` (new) plus every unit file that touches the circulation key, routing material or runtime bindings (35 files) | 426/426 producer; 433/433 development (paired with `reviter-sliver`) |
| OpenIndoorMaps `tsc --noEmit` | passes in both |

Commands (from the repository root):

```sh
# Reviter. OPENINDOORMAPS_ROOT points the parity test at a non-sibling checkout.
node --experimental-strip-types --import ./scripts/register-test-typescript.mjs --test tests/native-routing-contact-noding.test.ts
# OpenIndoorMaps, Node 24
node --import tsx --test tests/unit/native-routing-contact-noding.test.ts tests/unit/native-circulation.test.ts tests/unit/native-connector-anchors.test.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

Several OpenIndoorMaps tests import the sibling `../../../reviter`, and
Reviter's parity tests import the sibling `../openindoormaps`. The development
pair was therefore tested from two scratch worktrees placed side by side at
the two `claude/sliver-contacts-dev` heads. Run from `/home/user/wt-sliver`,
those tests reach the unchanged main Reviter checkout and fail with "stale
exact native topology", which is expected.

## Local check (no regeneration)

[tools/cell-check.ts](tools/cell-check.ts) subtracts the noded walls from the
saved exact faces of the regenerated master `65536052…`. Because noding only
adds material, the result is the face the compiler now builds. It then replays
each walk and places every node. Peak memory was 724 MB and it took under a
minute. Results are in [CELL-CHECK.json](CELL-CHECK.json); the table is in
[ROOT-CAUSE.md](ROOT-CAUSE.md#november-5-residual-leaks-regenerated-master-65536052).

- **Cell 604: 04-207A and 04-207B separated** (98 and 105 sq ft pieces, each
  with its own door and arrival).
- **Cell 602:** the 04-206 → 04-207 walk is blocked at its 2.5e-8 ft contact,
  but the cell stays one piece. 04-206, 04-207 and 04-208 still meet through
  wall 496562, a float32 joint. With a diagnostic 1e-5 ft bound they would
  separate ([CELL-CHECK-1e-5-DIAGNOSTIC.json](CELL-CHECK-1e-5-DIAGNOSTIC.json));
  that is not implemented.
- Also separated: 03-1034/03-1035, 03-2092/03-2094/03-2096, 08-335/08-339,
  10-4030/10-4032 and 03-3063 from 03-3069/03-3070. Not separated:
  03-1012A/03-1018 (float32) and 08-155/08-156 (facade).

## What to expect from the run

- The 86 floating-point joints of the November 3 inventory close. 63 of them
  already had patches. The 132 patches still apply: 62 of them sit on float32
  joints the rule does not close.
- **Rooms whose only connection was a sliver lose it:** 06-308, 07-754 (with
  07-756), 07-758 (with 07-760), 05-S301 stair, 04-422, 06-268, 06-266 and
  09-384. These are the rooms behind the patches dropped on November 3. Reviter
  reports each as an `isolated-arrival` issue; the run does not fail. Each
  needs a door, an opening review or an access decision.
- Still leaking afterwards: 04-206/04-207 and 03-1012A/03-1018 (float32 walls),
  the 23 facade/curtain gaps, and the real openings.

## Run it

Same compile as November 4, with new code: October 21 `run.sh`, unchanged
source `d5a829e8`, owner patches as a source review. Use a **new** work folder.
Expect about 11 h on Colab High-RAM (8 cores, 2 floor and 7 landing workers),
and 14–25 h on a 4-core, 15 GB machine. Main process about 7 GB plus 4 GB per
worker.

### Inputs

| File | SHA-256 | Where |
| ---- | ------- | ----- |
| `master.zip` (source, 274,706,116 B) | `d5a829e8100c81dd6587549bafd9ac1460fd68a56e69284cc5b806d449a49811` | owner's Drive, fetched by `fetch-inputs.py` |
| `native-cache.json` | `bfc1f2611d233c593b0749e0d48ff357ab2d105cf1a7878ea847a96cece446fb` | same |
| six reviews (`reviewed-drawing-references` `ee97659f…`, `checked-boundary-review-bundle` `f9f65fe2…`, `checked-door-boundary-review` `38c8623b…`, `positive-source-review` `d58d8bda…`, `03-source-door-standing-review` `f1b86cd4…`, `05-source-stair-base-standing-review` `27b07a05…`) | in `inputs.json` | same |
| prelanding snapshot | `cb5d6d3e290ff548b4acaf8428a0011baf898e322c189ca2b5ef8df51220a25c` | same; placed at `/workspace/scratch/unbc-regeneration-20261017/reviews/prelanding-source-snapshot.bin` |
| `OWNER-GAP-PATCHES.native-boundary-patches.json` | `c92b9e217adeecfa33e5b069f69383fbde06e3853a8aac88218472afb177ca6f` | [unbc-20261103/gap-patches](../../unbc-20261103/gap-patches/) in git |
| `CONTACT-REPAIR-SUPERSESSIONS.json` | `bdbcce86b68c4c23da2e371dfbbe81e9b7f7fe9ee755d1bff96366ed2a29267b` | same folder |
| `applied-gap-patches-73a765e9.zip` (227,037,600 B) | `73a765e96091e2c01eef5331dfb8983998664bcb281444c23856d4842d5e494d` | **only on this host**, `/home/user/unbc-work/gap-patches/regen/inputs/`. It has to be copied to the owner's Drive. Alternatively, recreate it with [apply-gap-patches.ts](../../unbc-20261103/gap-patches/tools/apply-gap-patches.ts) (about 2–3 h). A recreated file may have a different SHA, which is acceptable: the run checks its content row by row. |
| [patches/openindoormaps/0001-…](patches/openindoormaps/) (boundary-patch source review) | `adc1322c5f20f241404a3e61f9be802132919e1b3c2f55eb455e224694d22c9b` | this folder |
| [patches/openindoormaps/0002-…](patches/openindoormaps/) (this fix) | `9a55441bc591b8d506b47c5d09943a07594eff47e2726a51d28fa2241b10a684` | this folder |
| [patches/reviter/r0001-…](patches/reviter/) (this fix) | `e14b21e006870bf3c1b71eb92c91ed656287da8ab47aadb9fdbe4e2a7471a9c3` | this folder |

Applied with `git am` on GitHub's `7c27b67` and `cb140e46`, the patches
reproduce the producer trees exactly: openindoormaps tree `87fc22ed…`, Reviter
tree `97221fa2…`. The producer branches are local only, so the patches are how
the code reaches another machine.

### On this host (under the heavy lock)

Everything is prepared in `/home/user/unbc-work/gap-patches/regen-sliver/`:
links to the producer clones and the verified inputs, the two patch JSON
files, and [run-regen-sliver.sh](run-regen-sliver.sh). The script checks both
commits, then holds `flock /home/user/unbc-work/heavy2.lock` and runs
`run-supervised.py` around the same `run.sh` as on November 4:

```sh
setsid nohup /home/user/unbc-work/gap-patches/regen-sliver/run-regen-sliver.sh \
  > /home/user/unbc-work/gap-patches/regen-sliver/regen.out 2>&1 < /dev/null &
```

It is resumable with the same command. Do not run the old `regen/run-regen.sh`
now: `regen/openindoormaps` and `regen/reviter` link to the same producer
clones, which now carry this fix.

### On the owner's computer (Linux, or the Docker route in the October 21 README)

Use Node 22.15 or newer.

```bash
mkdir -p ~/unbc-sliver && cd ~/unbc-sliver
git clone https://github.com/ahzs645/openindoormaps.git && git -C openindoormaps checkout --detach 7c27b67568fe04a060af44fde727efb3ced39df4
git clone https://github.com/ahzs645/reviter.git && git -C reviter checkout --detach cb140e46d06d8fa728b059ab6068d58fb55e9ea9
P=/path/to/sliver-contacts   # this folder: patches/, plus the gap-patch files below
git -C openindoormaps am "$P"/patches/openindoormaps/*.patch
git -C reviter am "$P"/patches/reviter/*.patch
test "$(git -C openindoormaps rev-parse HEAD^{tree})" = 87fc22edf9c8b61908f58cb88e5297264c9c93dc
test "$(git -C reviter rev-parse HEAD^{tree})" = 97221fa2b861212e197d97ddce2edfac1c410d40
(cd reviter && npm ci) && (cd openindoormaps && HUSKY=0 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci)
sudo mkdir -p /workspace/scratch && sudo chown "$USER" /workspace/scratch
R=openindoormaps/docs/continuation/unbc-20261021/recompile
python3 -I $R/fetch-inputs.py ~/unbc-sliver/inputs
# Copy OWNER-GAP-PATCHES.native-boundary-patches.json, CONTACT-REPAIR-SUPERSESSIONS.json
# and applied-gap-patches-73a765e9.zip into ~/unbc-sliver/gap/ and check them:
sha256sum ~/unbc-sliver/gap/*
BOUNDARY_PATCH_REVIEW=~/unbc-sliver/gap/OWNER-GAP-PATCHES.native-boundary-patches.json \
BOUNDARY_PATCH_SUPERSESSIONS=~/unbc-sliver/gap/CONTACT-REPAIR-SUPERSESSIONS.json \
APPLIED_BOUNDARY_PATCH_MASTER=~/unbc-sliver/gap/applied-gap-patches-73a765e9.zip \
  nohup bash $R/run.sh ~/unbc-sliver > ~/unbc-sliver/run.out 2>&1 &
tail -f ~/unbc-sliver/run.out
```

On a machine with 15–16 GB, prefix the run with `NATIVE_WORKERS=1
LANDING_WORKERS=1 PARENT_HEAP_MIB=7168`. To resume, run the same lines again
with the same folder.

### Colab

Use [UNBC-sliver-contacts.ipynb](UNBC-sliver-contacts.ipynb). It is the
October 21 notebook with three changes: a new Drive folder, the patches
applied, and the gap-patch review passed to `run.sh`.

1. Upload to **MyDrive/UNBC-sliver-contacts/upload/**:
   - the three patch files from [patches/](patches/), keeping the `r0001-`
     name for the Reviter one;
   - `OWNER-GAP-PATCHES.native-boundary-patches.json`;
   - `CONTACT-REPAIR-SUPERSESSIONS.json`;
   - `applied-gap-patches-73a765e9.zip`.

   SHA-256s are in the table above. The rest comes from your Drive through
   `fetch-inputs.py`, as on October 21.
2. Open the notebook: File → Upload notebook. Then **Runtime → Change runtime
   type → CPU, High-RAM**, and run the cells in order. Cell 4 checks both trees
   against the reviewed hashes. Cell 6 checks the uploads. If the runtime
   resets, run everything again; checkpoints are restored from Drive.
3. **Download** from MyDrive/UNBC-sliver-contacts:
   `compile-result-<time>.tar.gz`, `compile-<time>.log` and `commits.json`.
   Share the folder link whether the run passed or failed.

## After the run

1. Check `regeneration.json → sourceBoundaryPatchReview` (132 rows, 68
   restored repairs) and `boundaryPatchState.regenerated=true`.
2. Repeat the November 5 stages A–D with
   [gap-regeneration/tools](../gap-regeneration/tools/). That is: walk
   squeezes and verification against `65536052…`, the 06-388 link, guides and
   route acceptance.
3. Expect the `isolated-arrival` rooms listed above. Confirm that no other
   room lost its door-connected arrival.
4. The float32 joints (04-206/04-207, 03-1012A/03-1018 and the 62 patched
   ones) need either a double-precision section of the 15 walls listed in
   [ROOT-CAUSE.md](ROOT-CAUSE.md) or a separately reviewed precision rule.
