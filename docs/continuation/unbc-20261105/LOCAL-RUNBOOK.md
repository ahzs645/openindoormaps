# Running the UNBC rebuild and requalification on your own computer or Colab

There are two jobs. You can start with B, which uses the gap-patched master
that already exists.

- **A. Regenerate the master** from the Revit model with the gap patches (and,
  once it is ready, the sliver-contact compiler fix). About 11 h on Colab
  Pro, 14 h on a 4-core machine.
- **B. Requalify** a master: candidate, visitor package, directions cache,
  floor and plan receipts, policy matrix, browser proof and map. About 3½–4 h.

Both are resumable. Keep the machine awake (on Colab, the notebook's progress
cell does this).

## What you need

- Linux (or a Linux container on a Mac), Python 3, `git`, `zstd`.
- Node 24.19.0 for job B and the tests (`npx node@24.19.0` works). Job A's
  October 21 producer code runs on Node 22.15 or newer.
- Memory: at least 16 GB (one worker); 32–50 GB lets the landing and floor
  stages use several workers. Disk: about 40 GB free.
- Both repositories cloned side by side in one folder (for example `~/unbc`):
  `openindoormaps/` and `reviter/`.

## Files

| File                                                                               | SHA-256                                                            | Where                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| October 21 source master, native cache, six reviews, prelanding snapshot           | listed in `docs/continuation/unbc-20261021/recompile/inputs.json`  | your Drive; `fetch-inputs.py` downloads and checks them         |
| Gap patches `OWNER-GAP-PATCHES.native-boundary-patches.json`                       | `c92b9e217adeecfa…`                                                | this repository, `docs/continuation/unbc-20261103/gap-patches/` |
| Superseded contact repairs `CONTACT-REPAIR-SUPERSESSIONS.json`                     | `bdbcce86b68c4c23…`                                                | same folder                                                     |
| Patched source master `applied-gap-patches-73a765e9.zip`                           | `73a765e96091e2c01eef5331dfb8983998664bcb281444c23856d4842d5e494d` | sent to you in three parts                                      |
| Regenerated gap-patched master with the 06-388 link `master-gap-0388-ae70cc07.zip` | `ae70cc07e5d03aa3cf281573c0be55f1e8ecc57442c121e380f3f90a433959a9` | sent to you in three parts (input for job B)                    |
| Revit model                                                                        | `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178` | your Drive (inside every master)                                |

Join a split file with `cat NAME.part-* > NAME` and check it with
`sha256sum -c FILES.SHA256SUMS`.

## A. Regenerate the master with the gap patches

The regeneration must run the October 21 producer code plus the patch-review
commit. That code is on the branch `unbc-producer-20261021-gap-patches`
(`6993c08`) of openindoormaps; Reviter is `cb140e46` (on its
`claude/laughing-davinci-34tcj1` branch). The sliver-contact compiler fix
will be added on top of these when it is finished; see
[sliver-contacts/](sliver-contacts/README.md).

```bash
mkdir -p ~/unbc && cd ~/unbc
git clone -b unbc-producer-20261021-gap-patches https://github.com/ahzs645/openindoormaps.git
git clone -b claude/laughing-davinci-34tcj1 https://github.com/ahzs645/reviter.git
git -C reviter checkout cb140e46d06d8fa728b059ab6068d58fb55e9ea9
(cd reviter && npm ci) && (cd openindoormaps && HUSKY=0 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci)
sudo mkdir -p /workspace/scratch && sudo chown "$USER" /workspace/scratch
R=openindoormaps/docs/continuation/unbc-20261021/recompile
python3 -I $R/fetch-inputs.py ~/unbc/inputs
# gap-patch inputs (from main of this repository, and the file sent to you)
curl -sSLo ~/unbc/OWNER-GAP-PATCHES.native-boundary-patches.json https://raw.githubusercontent.com/ahzs645/openindoormaps/main/docs/continuation/unbc-20261103/gap-patches/OWNER-GAP-PATCHES.native-boundary-patches.json
curl -sSLo ~/unbc/CONTACT-REPAIR-SUPERSESSIONS.json https://raw.githubusercontent.com/ahzs645/openindoormaps/main/docs/continuation/unbc-20261103/gap-patches/CONTACT-REPAIR-SUPERSESSIONS.json
cp /path/to/applied-gap-patches-73a765e9.zip ~/unbc/inputs/
nohup env \
  BOUNDARY_PATCH_REVIEW=$HOME/unbc/OWNER-GAP-PATCHES.native-boundary-patches.json \
  BOUNDARY_PATCH_SUPERSESSIONS=$HOME/unbc/CONTACT-REPAIR-SUPERSESSIONS.json \
  APPLIED_BOUNDARY_PATCH_MASTER=$HOME/unbc/inputs/applied-gap-patches-73a765e9.zip \
  bash $R/run.sh ~/unbc > ~/unbc/run.out 2>&1 &
tail -f ~/unbc/run.out
```

`run.sh` chooses worker counts from your cores and memory; override with
`NATIVE_WORKERS`, `LANDING_WORKERS`, `PARENT_HEAP_MIB` (7168 was enough
here; give it 8192 if you have the memory). On Colab use the existing
`UNBC-recompile.ipynb` and add the three `BOUNDARY_PATCH_*` variables to its
run cell. To resume, run the same command again with the same folder and
commits.

It ends with `Compile exit status: 0` and writes
`run/output/UNBC.master.reviter.zip` and `run/output/regeneration.json`. On
this host the result was master `655360527c96faaf…`. Then re-add the 06-388
link (job B step 0).

### Recommended settings

From [regen-efficiency/](regen-efficiency/README.md):

| Machine                            | `NATIVE_WORKERS` | `LANDING_WORKERS` | Worker heap (MiB) | `PARENT_HEAP_MIB` | Expected          |
| ---------------------------------- | ---------------: | ----------------: | ----------------: | ----------------: | ----------------- |
| 4 cores, 16 GB                     |                1 |                 1 |              4096 |              7168 | 14 h (measured)   |
| 8 cores, 32 GB                     |                2 |                 3 |              4096 |              8192 | about 11.5 h      |
| Colab Pro High-RAM, 8 cores, 50 GB |                2 |                 7 |              4096 |              8192 | about 11 h 15 min |

On Colab Pro also set `SYNC_DIR` to a Drive folder so checkpoints survive a
disconnect. Never use more than 2 floor workers or 7 landing workers: larger
counts ran out of memory before.

The faster checkpoint reuse (landings and planes reused on a rerun with
unchanged inputs) and the new progress logging are on the Reviter branch
`claude/regen-efficiency` and the OpenIndoorMaps branch
`claude/regen-efficiency-oim`. They are built on the newer development code,
not on the October 21 producer code used above, so use them only once they
are ported and re-verified; until then run the producer code as written.

## B. Requalify a master

Use a checkout of `main` (both repositories side by side, Node 24.19.0,
`npm ci` in each). Every step below has been run in this project; the exact
commands and arguments are recorded in the linked folders. Steps marked
"heavy" need 5–9 GB.

0. _(only after a new regeneration)_ Re-add the 06-388 link:
   `scripts/indoor/add-reviewed-circulation-link.ts` with the arguments in
   `docs/continuation/unbc-20261031/campus/06-388-repair/EXPORT-EXECUTION.json`
   (about 1.5 h). The result for this project's regeneration is
   `ae70cc07…` (the file sent to you).
1. Guide catalog (heavy, about 40 min):
   `scripts/indoor/compile-corridor-candidates.ts MASTER.zip OUT` (see
   `docs/continuation/unbc-20261105/gap-regeneration/`). For `ae70cc07…` the
   result is committed: `docs/continuation/unbc-20261105/gap-regeneration/PREPARED-ROUTING.json`
   (`9157d27e…`, 2,726 guides).
2. Candidate and acceptance (heavy, about 35 min):
   `scripts/indoor/verify-shared-corridor-candidate.ts MASTER.zip PREPARED-ROUTING.json docs/continuation/unbc-20261031/ROUTE-CASES-CAMPUS-0388.json OUT`.
   Expect PASS 33/33 (16 routes, 17 refusals).
3. Visitor package (heavy, about 1.5 h):
   `scripts/indoor/export-progressive-viewer.ts CANDIDATE.zip OUT --visitor --prepare --checkpoints --priority-scope=1450417,311,1487816`,
   then extract `viewer/indoor.json` from `OUT.independent-*.campus-viewer.zip`.
4. Directions cache (heavy, about 20 min):
   `scripts/indoor/export-published-route-hydration.ts VISITOR.json SHA OUT --cases CASES.json`
   (cases: `docs/continuation/unbc-20261102/final-candidate/visitor/EXTRA-CASES.json`).
   Put `OUT/receipt.json` into `app/indoor-project/published-route-cell-receipts.ts`
   (transport URL `/data/unbc-routing/<sha>.json.gz`) and the carrier into
   `public/data/unbc-routing/`.
5. Floor and plan receipts (heavy, about 45 min):
   `docs/continuation/unbc-20261102/plans/tools/admit-chain.sh REPO CANDIDATE.zip PROGRESSIVE MANIFEST-FILE-SHA WORK`,
   then copy `WORK/candidate-plans/*.json.gz` into `public/data/unbc-plans/`.
   The receipts are written into the `app/indoor-project/published-*-receipts.ts` files.
6. Build and publication checks (about 10 min):
   `docs/continuation/unbc-20261102/plans/tools/build-public-root.sh REPO PROGRESSIVE CARRIER NEW-ROOT VISITOR.json SHA`
   (runs the plan and directions-cache checks).
7. Policy matrix (about 15 min) and browser proof (about 20 min): the
   scripts and runners in
   `docs/continuation/unbc-20261103/route-output-requal/tools/` and
   `docs/continuation/unbc-20261102/final-proof/tools/`. The browser proof
   needs Chromium (Playwright).
8. Map (about 40 min): `scripts/indoor/export-pathway-preview.ts MASTER.zip OUT --guides PREPARED-ROUTING.json`,
   then the map build scripts in `docs/continuation/unbc-20261031/campus/map/`
   with `MAP_FRAME=docs/continuation/unbc-20261031/campus/map/regularize/MAP-FRAME.json`,
   and `python3 regularize/verify.py .` (must print `ALL_PASS True`).

Run `npx tsc -p tsconfig.indoor-project.json` and the CI test groups in
`.github/workflows/indoor-checks.yml` before committing receipts. If you send
the outputs back (the `OUT` folders' JSON and the receipts), they can be
checked and committed here.

## Why it takes this long

See [regen-efficiency/](regen-efficiency/README.md) for the stage-by-stage
breakdown and the speedups in progress. Every geometric fact is proved with
exact fractions, and every derived file is bound by hash to the exact master
and code that produced it, so a changed master means rebuilding and
re-checking everything downstream.
