# Running the native recompile on your own machine or Colab

October 21, 2026. This recompiles attempt 006's exact inputs plus the reviewed Building 4–8 link-door apertures ([`../link-doors/`](../link-doors/README.md)). The goal is to connect Buildings 4 and 8 directly on Floor 2.

The Claude Code cloud container can't finish this run. Attempt 006 took about 13 hours, and the container is suspended between turns. Both attempts there (October 21, 15:40 and 16:06 UTC) stopped within minutes of the session going idle, with about 10 GB of memory still free.

## Files

| File                                           | What it does                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`inputs.json`](inputs.json)                   | Every input: its Google Drive file id, byte size and SHA-256.                                                                                                 |
| [`fetch-inputs.py`](fetch-inputs.py)           | Downloads the inputs from Drive, checks every part and joined file, and places the prelanding snapshot. Files already present with the right digest are kept. |
| [`run.sh`](run.sh)                             | Sizes the workers to the machine, runs the compile with attempt 006's flags plus `--door-aperture-review`, timestamps the log, and packages the result.       |
| [`UNBC-recompile.ipynb`](UNBC-recompile.ipynb) | The same steps as a Colab notebook, with checkpoints copied to your Drive.                                                                                    |

The inputs are attempt 006's master (`d5a829e8…`, 275 MB), native cache (`bfc1f261…`, 421 MB) and its six reviews, all from your Drive folders. They also include the Stage 4 prelanding snapshot (`cb5d6d3e…`). `checked-door-boundary-review.json` records that snapshot at `/workspace/scratch/unbc-regeneration-20261017/reviews/prelanding-source-snapshot.bin`. The review must not be rebound to another path, so `fetch-inputs.py` puts the snapshot exactly there.

## Option A: Google Colab (Pro)

1. Open `UNBC-recompile.ipynb` in Colab: **File → Open notebook → GitHub**, `ahzs645/openindoormaps`, branch `claude/laughing-davinci-34tcj1`. Or upload the file.
2. **Runtime → Change runtime type → CPU, High-RAM.** Cell 1 prints the cores and memory you got. 8 or more cores and 32 GB or more is what makes this faster than one worker.
3. Run the cells in order. Cell 8 prints progress every 5 minutes and keeps the session active.
4. If the runtime disconnects or resets, run all the cells again. They restore the checkpoints from `MyDrive/UNBC-recompile` and pin both repositories to the commits of the first run (`commits.json` there), so finished floors and landing checks are reused.

If either repository is private, add a GitHub token as the Colab secret `GITHUB_TOKEN` (key icon in the left bar).

## Option B: a Linux machine

Use Node 22.15 or newer (22.22.0 was used here), Python 3, and `rsync` or `zstd` if available.

```bash
mkdir -p ~/unbc && cd ~/unbc
git clone -b claude/laughing-davinci-34tcj1 https://github.com/ahzs645/openindoormaps.git
git clone -b claude/laughing-davinci-34tcj1 https://github.com/ahzs645/reviter.git
git -C reviter checkout cb140e46d06d8fa728b059ab6068d58fb55e9ea9
(cd reviter && npm ci) && (cd openindoormaps && HUSKY=0 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci)
sudo mkdir -p /workspace/scratch && sudo chown "$USER" /workspace/scratch
R=openindoormaps/docs/continuation/unbc-20261021/recompile
python3 -I $R/fetch-inputs.py ~/unbc/inputs
nohup bash $R/run.sh ~/unbc > ~/unbc/run.out 2>&1 &
tail -f ~/unbc/run.out
```

To resume after an interruption, run the same `run.sh` line again with the same `~/unbc` path and the same commits.

On a Mac, run it inside a Linux container instead, because macOS doesn't allow `/workspace` at the root. Raise Docker Desktop's memory limit first, then:

```bash
docker run -it -m 28g -v ~/unbc:/root/unbc node:22.22.0-bookworm bash
```

Then follow the Linux steps inside the container, without `sudo`. This route has not been tried.

## Worker sizing

`run.sh` reads the cores and memory:

- **Main process:** about 7 GB.
- **Floor workers:** 2 when 10 GB or more is spare beyond the main process, otherwise 1.
- **Landing workers:** one per 5 GB spare, up to cores − 1, maximum 8.

`NATIVE_WORKERS`, `LANDING_WORKERS` and `PARENT_HEAP_MIB` override these. `NATIVE_WORKER_HEAP_MIB` and `LANDING_WORKER_HEAP_MIB` set the per-worker heap caps (default 4096). Worker counts don't change the result: the floor and landing results are merged in their fixed order. `DRY_RUN=1` prints the command without running it.

Don't raise the worker counts beyond these limits. On October 21–22 a 12-core, 167 GB Colab runtime with the caps lifted ran out of worker memory each time: 11 landing workers failed even with 8 GB heaps, and 9 floor workers failed on the 34.12 ft plane even with 8 GB heaps. Two floor workers and seven landing workers at 4 GB passed.

## What to expect

Measured on Colab CPU High-RAM (8 cores, 50 GB), October 21–22, with 2 floor workers and 7 landing workers. The run passed in 11 h 14 min:

| Stage                                                                  | Time       |
| ---------------------------------------------------------------------- | ---------- |
| Validate the source package and rebuild the private import data        | 20 min     |
| Review replays and stair proofs                                        | 19 min     |
| Native envelopes, routing interiors, walls and doors per level         | 36 min     |
| Ramps and landing-approach preparation                                 | 25 min     |
| 1148 stair-landing pairs (7 workers)                                   | 2 h 07 min |
| Room presentation                                                      | 16 min     |
| 9 native physical planes (2 workers)                                   | 33 min     |
| Route and arrival decisions after the plane merge (no progress output) | 2 h 32 min |
| Final walking-branch replay, diagnostic and stair finalization         | 1 h 33 min |
| Rebuilt master and visitor imports and export                          | 2 h 31 min |

Only the landing and plane stages use workers; everything else is one thread. Floor and landing checkpoints are keyed on the exact bytes of their snapshotted inputs. A rerun that rebuilds the import data, or a fresh run, produced a slightly different landing snapshot and recomputed all landings, so plan for a full rerun after any interruption before the landing stage finishes.

`run.sh` loads Reviter's `register-local-typescript.mjs` resolver as well as `tsx`. Without it the plane workers fail with `Cannot find module …/native-door-clear-opening`, after about four hours of work. Adding the flag changes the private import checkpoint binding once (it records Node flags), so existing import data is rebuilt.

## What to send back

`run.sh` ends with `Compile exit status: N` and writes `run/compile-result-<time>.tar.gz` together with `run/compile-<time>.log`. In Colab, both are also copied to `MyDrive/UNBC-recompile`.

Share the tarball and the log (anyone with the link can view), whether the run passed or not. A refused final check still keeps its computed data in the tarball's `diagnostic/` folder.

Next steps with the result:

- run `audit-hallway-network.ts` and `export-hallway-routes.ts` on the new compiled dataset;
- confirm door 2311764 connects 08-260 Link and 08-216 Vestibule;
- confirm that Floor 2 routes between Buildings 4 and 8 stay on Floor 2. Today 04-255 → 08-272 is 240 m via Floor 1.
- refresh the map.

Floor 3's link door (2315416) will stay unmatched until the room review adds an outline on its Building 8 side.
