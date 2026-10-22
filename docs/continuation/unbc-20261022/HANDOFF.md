# UNBC link-door recompile and release handoff — October 22, 2026

Status at 20:00 UTC on October 22, 2026. This supersedes the [October 20 handoff](../unbc-20261020/HANDOFF.md) as the place to start. Those older documents are still the record of their own source checkpoints.

**In one paragraph:** the native recompile with the reviewed Building 4–8 link-door apertures passed on Colab. Its master and viewer are promoted in the local canonical folder. Testing the new visitor found a route-worker bug that stopped all directions on this dataset, and the fix is in this commit. The private Site still serves **v14**. Nothing new has been published, and most release acceptance gates are still open (see [Release gates](#release-gates-still-open)).

## Where everything is

**Git.** This work was developed on branch `recompile-runbook-fix`, based on `b78a314` from `origin/claude/laughing-davinci-34tcj1`. On October 22 it was merged with `main` and pushed to `main`, which also brought the eleven earlier `claude/laughing-davinci-34tcj1` commits onto `main`.

| Commit      | What it holds                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `b78a314`   | Producer commit for the compile: openindoormaps code, link-door review and runbook.                           |
| `7c27b67`   | `run.sh` loads Reviter's resolver; README has the measured stage timings and the memory limits.               |
| this commit | Route-worker stepped-stair fix, its regression test, regenerated engine bindings, this handoff and the tools. |

The producer for Reviter is `cb140e46` on its `claude/laughing-davinci-34tcj1` branch. Reviter is unchanged.

**On this Mac.** `work/` is gitignored, so these files exist only locally:

| Path                                                   | Contents                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work/recompile-20261022/output/`                      | Compile outputs: master `d4d36d18…`, viewer `8ad33533…`, `compiled-dataset.json`, `regeneration.json` and the replay receipts.                                                                                                                                                                                                         |
| `work/recompile-20261022/compile-20261021T211746Z.log` | Full timestamped compile log. `compile-result.sha256` pins the tarball `2dadeb7a…`, which is kept on Drive.                                                                                                                                                                                                                            |
| `work/recompile-20261022/audit/`                       | Hallway audit, route export, `link-4-8-probe.json` and the probe script.                                                                                                                                                                                                                                                               |
| `work/recompile-20261022/progressive/`                 | Progressive export, 7 scopes, revision `a1c1c561…`. Built under the old engine `469c764e…`, so it is **stale** now that this commit changes the engine.                                                                                                                                                                                |
| `work/recompile-20261022/site/`                        | Local pages build of `b78a314` (also the old engine) with `data/unbc` linked to `progressive/`. Serve it statically, for example `python3 -m http.server 42554 --directory work/recompile-20261022/site`, and open `http://127.0.0.1:42554/openindoormaps/#/projects/visitor?manifest=http://127.0.0.1:42554/data/unbc/manifest.json`. |
| `work/recompile-20261022/dircache/`                    | Directions-cache candidate built with the fix: carrier `82f995e0…json.gz`, receipt, `report.json`, `actual-routes.json`, the cases, and the CPU profile.                                                                                                                                                                               |
| `work/recompile-20261022/checks/`                      | Failed publication-check attempts (see Release gates).                                                                                                                                                                                                                                                                                 |
| `~/Downloads/UNBC.final/`                              | Canonical folder, now promoted to `d4d36d18…` / `8ad33533…` (see Promotion).                                                                                                                                                                                                                                                           |

**Google Drive.** `MyDrive/UNBC-recompile/` holds the result tarball `compile-result-20261022T083159Z.tar.gz` (`2dadeb7a…`), both compile logs, `commits.json`, the private import data, and `checkpoints/`. The checkpoints include the landing and native-model snapshots from two runs, which the optimisation findings below rely on.

**Colab.** The CLI is at `~/.local/bin/colab` (v0.7.5) and authenticates with ADC.

- Session `unbc-opt` (CPU High-RAM, 8 cores, 50 GB) may still be running. Check with `colab sessions` and stop it with `colab stop -s unbc-opt`.
- The repos sit at the exact `/content/unbc/{openindoormaps,reviter,inputs,run}` layout that `regeneration.json` records. `run/` holds the restored compile result.
- The openindoormaps copy carries an earlier, functionally identical form of the route-worker fix, with engine `af10315b…`. Re-sync it to the committed tree before reusing anything from it.
- `/content/unbc/dircache/` holds the cache candidate, and `/content/landing-diff/` holds the snapshot pairs.
- Sessions `unbc` and `unbc-fast` were stopped.

## What happened, in order

1. **Recompile on Colab.** It used CPU High-RAM (8 cores, 50 GB) with `docs/continuation/unbc-20261021/recompile/run.sh`, 2 floor workers and 7 landing workers.
   - The first attempt failed after the landings with `Cannot find module …/native-door-clear-opening`. Plane workers inherit Node flags, and `tsx` alone does not resolve Reviter's extensionless imports inside workers. `run.sh` now also imports `reviter/scripts/register-local-typescript.mjs` (commit `7c27b67`).
   - The resumed run exited **0 at 08:31 UTC on October 22**, after 11 h 14 min. The per-stage table is in the recompile README.
2. **More workers do not work as the code stands.** A 12-core, 167 GB A100 runtime with the worker caps lifted ran out of worker memory every time:

   - 11 landing workers failed, even with 8 GB heaps;
   - 9 floor workers failed on the 34.12 ft plane, even with 8 GB heaps.

   About 70% of the compile is single-threaded in any case. The patches were dropped and are not in git.

3. **Audits on the compiled dataset.**
   - `audit-hallway-network.ts`: 0 parity failures in either profile. 996 of 48,348 spine samples fall off a walkable cell; 981 of those are within 0.5 ft and the maximum is 2.18 ft.
   - `export-hallway-routes.ts`: the engine matches the network on 1198 pairs, with 0 cost differences.
   - Door **2311764** (Floor 2) is `connected`, joining 08-216 Vestibule and 08-260 Link.
   - Door 2315416 (Floor 3) is still unmatched; it needs a Building 8 room outline.
   - Compile before/after figures: 49 → 25 route groups, and 1549 → 1703 rooms in the largest group.
4. **Promotion** into `~/Downloads/UNBC.final`, following the `docs/indoor-enclosure-review.md` §151 convention.
   - The master was re-hashed first (`13571ab9…`).
   - The previous master, viewer, `current-version.json`, README and companion manifest were backed up to `provenance/before-link-door-recompile-20261022/` with `backup-sha256.txt`.
   - The new files were swapped in and the companion manifest rebound (890 files, 0 added).
   - `current-version.json` got a new `linkDoorRecompile20261022` entry and new top-level hashes.
   - Folder import was verified (`verification/link-door-recompile-20261022/verify-folder.json`: ok, 890 companions).
   - Lineage: attempt 006's input `d5a829e8…` equals `13571ab9…` except for `nativeExploreMapping`. The proof is in `docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/SOURCE-WORKING-WRAPPER-PROVENANCE.md`.
   - The new master carries no prepared display chunks (`viewer/display/`), so the editor draws floors live.
5. **Progressive export on the Mac.** It failed at the last step with `date not in range 1980-2099`. `writeProgressiveOfflineArchive` stamps `1980-01-01T00:00:00Z`, and fflate converts that to local time, which is 1979 in Vancouver. Running with `TZ=UTC` worked, and this is the only known workaround. Code fix still to do: use a local-time date, or pass `TZ=UTC` in scripts.
6. **Browser proof was blocked by a real bug.**
   - The map loads and draws in about 20 s.
   - After **Get directions** the panel stayed on "Loading and checking directions…" for more than 30 minutes.
   - Building the directions cache on Colab showed why: complete route validation threw `Stepped stair changed or borrowed an existing claimed terminal approach`.
   - `routeWorkerDataset` stripped `containedDisplay` from every circulation cell, and also `displayResidualTopology`. The single stepped stair (03-S201 → 03-S301, edge `stair:1696006:…`) records a digest of its two terminal cells **whole**, so the worker projection could never validate.
   - **This affects any dataset with a v2 stepped-stair proof, including attempt 006.**
   - Fix (this commit): the projection keeps `containedDisplay` on the cells a stepped-stair proof claims, and keeps `displayResidualTopology` (13 MB) only when such a proof exists. Other datasets are unchanged, and no recompile is needed.
   - Test: `tests/unit/native-stepped-stair-v2-transport.test.ts`. The stair and route-worker tests pass, 16/16.
   - The engine bindings are regenerated: engine `62e85891…`, route runtime `76252eef…`, plan runtime `c23ae787…` (final values after the lint-clean refactor; the Colab cache candidate and its profile used the functionally identical `af10315b…` build).
7. **Directions cache with the fix** (Colab, `prepare-directions-candidate.ts`).
   - Times: validation 96 s, public policy graph 306 s, total 466 s.
   - The carrier is `82f995e0…json.gz` (2.6 MB).
   - Real-router results for the link:

| Case                                                 | Result                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| 08-216 → 08-260 through door 2311764                 | routes, 11.7 m                                                            |
| 04-255 → 08-272, walking, other-room transit allowed | **routes, 175.2 m, all 41 edges on Floor 2 (level 694), through 2311764** |
| 04-255 → 08-272, walking, hallway-only (the default) | no route; 08-216 and 08-260 are rooms, not hallways                       |
| 04-255 → 08-272, step-free                           | no route; the link's step-free access is unconfirmed                      |

The earlier figure of "189.9 m, walking and step-free" came from the simplified hallway network (`createHallwayRouter`), which applies looser rules. The visitor app gives the results in the table above. Whether the default hallway-only behaviour should use the link is a policy and source question, not a code bug. Whether the link doors are normally open and public is still unconfirmed on site.

## Optimisation findings (measured)

1. **Checkpoints never reuse across runs**, which costs about 2 h of landings, plus the floor planes, on every rerun.
   - The landing and native-model snapshots from two runs are **logically identical**: `tools/landing-diff.mjs` finds 0 value and 0 key-order differences.
   - Only their V8 serialisation bytes differ, and the checkpoint binding hashes those raw bytes (Reviter `scripts/indoor/bounded-worker-checkpoints.ts`, and `snapshot()` in `parallel-native-circulation.ts`).
   - Re-serialising after `deserialize → serialize` round-trips reaches a fixed point. Both landing snapshots converge to `0c90bab4…` after two passes, at about 8 s per pass (`tools/roundtrip.mjs`).
   - The native models had not converged after two passes. Test more passes, or use a canonical structural hash.
   - Proposed Reviter change: snapshot the round-tripped fixed point, or key on a canonical encoding.
2. **Rational arithmetic dominates routing preparation.**
   - The cache-build CPU profile shows `gcd` 24%, `compare` 20% and GC 16% (`tools/cpuprofile-top.mjs` on `dircache/directions-cache.cpuprofile`).
   - `tools/arith-fast.mjs` adds a dyadic fast path to `gcd` (power-of-two denominators) and early exits in `compare`.
   - It matched the original on 800,000 fuzzed operations (`tools/fuzz.mjs`).
   - On Colab the cache build went from 465.6 s to 430.5 s, with the public graph from 306 s to 272 s: **7.5% faster**. Routes are identical, and the carrier differs only in `engineSha256`.
   - Smaller than the profile suggested; the remaining `gcd` time is probably non-dyadic intersection values. This module is also in Reviter's `lib/reviter/vendor/`, where the compiler would benefit too.
   - Not committed. It changes the engine binding.
3. **Progressive export runs its 7 scopes sequentially.**
   - Import takes 180 s; scopes take 882 s, with the longest at 271 s.
   - Parallel scopes could save about 10 minutes, but the exporter has no per-scope mode yet. This is untested.
4. **The compile's longest stages are single-threaded and print no progress.** These are the post-merge route and arrival decisions (2 h 32 min) and the final imports and export (2 h 31 min). Neither has been profiled; run `--cpu-prof` on a Colab compile to find the next targets.

## Release gates still open

Full release was requested, so these are listed in order. Check every claim against the scripts before acting on it.

1. **Source epoch.** Done: on `main` since October 22. This is a new source epoch, engine `62e85891…`; reuse no receipt from `469c764e…` or older. Checks run before the push: full unit suite in UTC 2027 pass / 1 fail / 34 skipped. The one failure, `private import data preserves bytes…`, also fails on the pre-fix code on this Mac's Node 26 and is unconfirmed on Node 22. The CI typecheck `tsc -p tsconfig.indoor-project.json` and `npm run build:pages` both pass.
2. **Redo the progressive export and pages build** under the new engine, in UTC.
   - Export: `TZ=UTC node --max-old-space-size=8192 --expose-gc --import tsx scripts/indoor/export-progressive-viewer.ts VIEWER.zip NEW_DIR --prepare --checkpoints --priority-scope=1450417,311,1487816`, about 18 min on the Mac.
   - Build: `SITE_DEMOS=indoor node --max-old-space-size=3072 --import tsx node_modules/vite/bin/vite.js build --configLoader native --mode pages --outDir NEW_ABS_DIR`.
3. **Directions cache.**
   - Rebuild the candidate on the committed tree; the Colab one used an earlier form of the fix (engine `af10315b…`).
   - Add its receipt to `app/indoor-project/published-route-cell-receipts.ts`.
   - Place the carrier at `public/data/unbc-routing/` and at the Site root `/data/unbc-routing/`.
   - Then run `check-published-directions-cache.ts`.
4. **Compiled-map admission receipt** (`app/indoor-project/published-project-receipts.ts`) and the `data/unbc-full/project.json` package.
   - No generator script exists in the repo.
   - `check-published-project.ts` currently fails with ENOENT on `data/unbc-full/project.json`.
5. **Floor-plan carriers.**
   - Run `export-published-visitor-plans.ts`, then `admit-published-visitor-plans.ts`; they need gate 4.
   - `check-published-visitor-plans.ts` currently fails: "No current compiled drawing receipt for Floor 1 · Main floor".
   - Until gate 5 passes, `data-floor-plan` stays false in the visitor.
6. **Candidate scope and audit:** `build-pathway-candidate-scope.ts`, then `audit-pathway-candidate.ts`, then the 28 held-link reconciliation (`docs/continuation/unbc-20261017/pathway-repairs/source-blockers.json` → `heldStairs`).
   - Blocked on inputs not found anywhere local: the 09d baseline visitor and its oracle directory, `stationary-alias-evidence.json` (no producer exists), and four `--*-algorithm-binding` files.
   - The source-rebuild receipt is in Drive archive `dee868c5…`.
   - The 09d receipt is pinned to engine `9ff27953…`, so a baseline needs an older-epoch checkout or a new procedure.
   - The scope builder and the audit do not know about the aperture, door-standing or stair-base-standing reviews, so expect unscoped changes.
   - Colab is the right place for this: its `/content/unbc` paths match `regeneration.json`.
7. **Further checks:** transport audit, seven floor scopes, ordinary and native-height geometry, the desktop/mobile browser suite, offline save/reopen, old-version migration (no procedure found), and six cold samples. The cold-sample targets are 5/10/15/2/10 s; the historical 308 s first route is not proven fixed.
8. **Pair, restore and verify:** `scripts/indoor/package-development-snapshot.py`, fresh restore, then `--verify-only`. Its `missingInputs` text and `nativeRebuildReady` rule are stale and need updating.
9. **Publish.** The Site is ChatGPT/OpenAI Sites: project `appgprj_6ad14a193db48191acd6eafb5cb3e9d1`, at `https://openindoormaps-unbc-map.ahzs6455.chatgpt.site`.
   - It is published from a cloud checkout (`/workspace/sites/openindoormaps-unbc`) using the Sites tools. Neither the checkout nor the tools exist on this Mac or in Claude Code here.
   - Verify the served bytes while signed in.
   - See `docs/continuation/unbc-20261015/SITES-PUBLICATION.md` and `docs/continuation/unbc-20261017/pathway-repairs/PORTABLE-DEVELOPMENT.md`.

**Browser proof** of 04-255 → 08-272 is still pending. It needs the new-engine build together with the directions cache. Use `tools/proof-link-route.mjs` and tick other-room transit in the panel. In Playwright Chromium, launch with `--js-flags=--max-old-space-size=8192`; the in-app pane crashes on this map. Click **Get directions** after choosing From and To. Readiness is the render status, because `data-floor-plan` stays false until gate 5.

## Gotchas learned here

- **`colab exec`** defaults to a 30 s timeout. Run anything long detached (`setsid nohup … &`) with a log file and poll the log. `tools/sh.py` runs `$CMD` through `--env CMD=…`.
- **`pkill -f` / `pgrep -f`** patterns match their own `bash -c` command line; kill by PID.
- **Drive mount** (`colab drivemount -s NAME`) needs the user to approve the Google consent and then press Enter in that terminal. If it times out, rerun it; the mount reused the earlier consent.
- **zsh** parses `$C:path` as a history modifier; write `${C}:path`.
- **Checkpoint keys change with Node flags.** The private import checkpoint records Node flags, so adding `--import` forces an import rebuild of about 20 min. Landing and plane checkpoints are keyed on snapshot bytes; see optimisation finding 1.
- **Colab watcher hangs.** A `colab exec` inside a watcher loop can hang indefinitely (one stopped at 03:14 and missed a failure). Add a timeout.
- **Engine binding cascade.** Any edit in the display-preparation module graph, including `route-worker-dataset.ts`, changes the engine binding. Regenerate it with `writePreparedDisplayEngineBinding` and the route/plan runtime writers (see `vite.config.ts`), or `prepare-directions-candidate.ts` refuses.

## Tools in this folder

Everything in `tools/` was used as-is here. Paths inside are the scratch or Colab paths of this session, so adjust them before reuse.

| File                                | Purpose                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `proof-link-route.mjs`              | Playwright desktop/mobile route proof. Set the From/To keys and allow transit as needed.               |
| `probe-link-4-8.ts`                 | Hallway-network probe of Building 4 ↔ 8 Floor 2 pairs. Uses the simplified rules, not the app router. |
| `dircache.sh`                       | Colab directions-cache build with CPU profiling and the link cases.                                    |
| `stair-diag.ts`, `cell-digest.ts`   | Locate which stepped-stair approach condition fails, raw versus projected.                             |
| `landing-diff.mjs`, `roundtrip.mjs` | Deep diff and V8 round-trip tests for checkpoint snapshots.                                            |
| `arith-fast.mjs`, `fuzz.mjs`        | Fast rational arithmetic candidate and its equivalence fuzzer.                                         |
| `cpuprofile-top.mjs`                | Self and inclusive time from a `.cpuprofile`.                                                          |
| `sh.py`, `watch.sh`, `sync.sh`      | Colab exec helper, compile watcher, and Drive checkpoint sync.                                         |

## Suggested next steps

1. Decide whether hallway-only directions should treat the 4–8 link and vestibule as passable (a policy and source decision).
2. Make checkpoints reusable (finding 1) before any further compile. It is the largest saving.
3. Rebuild export, pages and directions cache under engine `62e85891…`, and finish the browser proof.
4. Work release gates 4–9 in order. Locate the 09d baseline inputs first, or define a replacement baseline procedure with the owner.
