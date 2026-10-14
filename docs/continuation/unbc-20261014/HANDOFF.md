# UNBC native indoor map: handoff (2026-10-14)

This is for the next person or AI agent continuing the UNBC work. It follows `docs/continuation/unbc-20261012/HANDOFF.md`. Read it in this order:

1. this file;
2. the root `AGENTS.md`, `.agents/skills/indoor-enclosure-review/SKILL.md` and `docs/indoor-enclosure-review.md`;
3. the owner decisions in `decisions/`.

The compiler side has its own guide: `reviter/docs/UNBC-HANDOFF-2026-10-14.md`.

## 1. Where things stand

The native indoor map is **finished and promoted**.

| Item | State |
|---|---|
| Canonical master | `~/Downloads/UNBC.final/UNBC.master.reviter.zip`: sha `13571ab92f75…`, 289,031,229 bytes, promoted 2026-10-14. Routing is on and the floor displays are prepared (engine `15f75fb0…`). |
| Campus viewer | `~/Downloads/UNBC.final/UNBC.campus-viewer.zip`: sha `6b6b619f91da…`, 59.6 MB, derived from the master. |
| Previous master and viewer | `~/Downloads/UNBC.final/provenance/before-native-final-20261014/`, with `backup-sha256.txt`. |
| Evidence | `~/Downloads/UNBC.final/verification/native-final-20261014/`: `REPORT.md`, audits, browser screenshots, receipts, `promotion-receipt.json`. |
| Desktop copy | `~/Desktop/UNBC-native-final-2026-10-14/`, containing the master, viewer, report and screenshots. |
| Selection | The leak audit on candidate 16 finds 0 real problems and 0 regressions; all 264 flags are expected cases. |
| Routing | 1,535 of 1,842 named rooms are reachable. The previous published map reached 269. |
| Route test | Public: 22 of 25 available, 0 exceptions. Step-free: 0 of 25, because no connection is confirmed step-free. |
| Browser proof | Desktop and mobile Chromium on the exact promoted ZIP: all 5 floors render from prepared displays, with no page errors. |
| Folder import | `readProjectFolder` on `~/Downloads/UNBC.final` succeeds with 890 companions bound to the new master. |

Code: both repos have every change on `claude/unbc-candidate4-rules` (pushed), and local `main` was fast-forwarded to it. Before pushing `main` or opening a PR, ask the owner.

## 2. Owner rules (binding)

The standing rules from `decisions/2026-10-09-gap-review.json` onward:

- **The DWG is the authority.** The registered DWG ("UNBC floor plan Basic.DWG") wins wherever the Revit model is incomplete.
- **Every correction is a reversible, tagged patch**, citing a decision ID. Use the generic mechanisms only:
  - drawing-backed seal rows;
  - reviewed area partitions (lines);
  - indoor exclusions;
  - connectors;
  - reviewed circulation links.

  Never edit the model, and never bake UNBC coordinates into code.
- **Exact contacts of 1.5e-5 ft or less close** (q2, `exact-contact-closure`).
- **Hairline cracks up to 0.15 ft between two native walls close** (round 10 q10.19, `owner-authorized-seal`).
- **Doors close for selection only.** Walking is unchanged.
- **Ambiguous cases go to the owner** as a question page with clear pictures (see §7).
- **Stairs stay held** (28) until a stair-route review. Routes between floors use lifts and ramps.

Decision rounds in `decisions/`: gap-review, round2, round3, round6–round11, round9b and round12. Each patch's `decisionId` (for example `2026-10-14-round12#q12.5`) must resolve in one of these files. The assembly scripts pin each file's sha256, so **never edit a decision file**; add a new round instead.

Round 12 (the last) was applied as follows:

| Question | Applied as |
|---|---|
| q12.1 | 05-206 line, plus a ledge cut |
| q12.2 | 05-225 shaft exclusion |
| q12.3 | 03-2012 strip exclusion |
| q12.4 | 03-3021 hairline seal |
| q12.5 | 06-340/06-342 seal plus a DWG partition line |
| q12.6 | Lift `unbc-05-library-east-lift` on Floors 1–3 |

## 3. Local layout (not in git)

- `RUN = ~/github/openindoormaps/work/floor1-followup-20261009` (git-ignored):
  - `candidate-floors-N/`, one folder per candidate (3–16), each with `integration/`, `scripts/`, `data/`, `logs/`, `routing/` and `REPORT.md`;
  - `user-decisions/`;
  - `shared-extracts/`;
  - `native-cache.json` (sha `d5197e5e…`).
- Source review ZIP for every candidate: `~/Downloads/UNBC.final/previews/2026-10-09/UNBC.floor1-followup-review-ready-20261009.reviter.zip` (sha `7fd503d4…`).
- Python environment: `~/.venvs/unbc` (shapely and matplotlib). macOS has no `flock`, `timeout` or `free`, so call node and python directly.
- `tools/` in this folder holds copies of the run scripts:
  - `tools/candidate16/`: the latest per-candidate pipeline;
  - `tools/shared/`: seal, partition, probe and promotion tools.

  They use absolute paths into RUN. Copy them into a new candidate folder and rewrite the paths with `sed` (candidate number and rooms sha prefix). Three copies are stored here as `.mts` so the repo typecheck and lint skip them; rename them back to `.ts` in RUN: `gen-rows.c3`, `db-generate.fix-seams` and `rebind-partitions.c14`. `.prettierignore` keeps the decision and tool copies byte-identical.

## 4. The candidate pipeline (timings on this Mac, 48 GB)

Each candidate is `candidate-floors-N/`, built from the previous candidate's rooms.

1. **Fix tools** (minutes each) produce patch specs. Validate rows alone (`DB_ALONE=1`), then combined (`DB_PRIOR`), with `db-generate.fix-seams.ts`. Bind and check lines with `bind-partitions.mts` on the previous `data/candidate/dataset-prepared.json`.
2. **Assemble** with `integration/assembleN.mts`, run as `node --max-old-space-size=12000 --import tsx`. This writes `rooms.candidateN.json` and `receipt.json`. It refuses unresolved decisions, unvalidated rows and changed authority hashes. Also write `manifest.cN.json` (the provenance record).
3. **Selection compile** with `scripts/compile-candidate.mts` (routing off): about 35 min, 14 GB heap. It refuses dirty `app/`, `scripts/` or `lib/` trees, so commit code first.
4. **Derive** with `scripts/derive-parallel.sh <candidate dir>`: about 15 min.
5. **Audit**:
   1. `extract.mjs`;
   2. `leaks.py audit junctions`;
   3. `leaks2.py`, with `CF_DATA`, `CF_OUT` and `CF_PREV` set and `data/before` as a symlink to `../../candidate-floors/data/before`.

   It writes `triage/flags.json`, and "real-problem" is the number to drive to 0.
6. **Routing compile** with `scripts/compile-routing.mts`: 2.3–2.7 h, of which circulation is about 1.9 h. It can run alongside steps 3–5. Measure it with `graph_check.py routing/compiled-routing.json`.
7. **Package** with `scripts/package-final.mts <dir> <out.zip>`: **about 2.5 h**. The export publishes the exact floor mapping, which is BigInt-heavy. The script now writes `<out>.unverified` before the read-back.
8. **Prepare displays** with `scripts/indoor/prepare-display-assets.ts in.zip out.zip`: about 25 min.
9. **Route audit** with `scripts/indoor/audit-random-routes.ts zip report.json 25`: each route takes 40–500 s, so 25 pairs per mode, not 120.
10. **Viewer** with `scripts/indoor/export-campus-viewer.ts master.zip viewer.zip`: about 1.2 h.
11. **Browser proof** with `tools/candidate16/pw-floors.mjs <zip> <outdir> [mobile]`, against the `indoor-editor` Vite server on port 42431 (`.claude/launch.json`).
12. **Promote** (see §6).

## 5. Lessons, tips and traps

**Geometry and patches**

- `build_seals2.py` picks the closest wall pair near a crack point. At a corner of three walls it can pick the wrong pair, and the row is then refused with "covers sectioned foreign native material #X". Plot the dump pieces (`s3-dump.c15data.mts`, then a `precise` plot), find the real wedge, place the bridge just inside it and list every overlapped piece in `owners`.
- A float gap of 0 doesn't mean closed. Exact sub-float cracks still join regions.
  - To find a neck, erode the derived region (`buffer(-r)`) and compare the pieces at successive radii.
  - Don't trust "nearest points": they can lie across a wall. Instead, take the larger eroded piece minus the grown smaller pieces.
- Partition lines are checked as 0.0002 ft strips extended 0.0001 ft past each end.
  - Each strip must stay on supported floor (tolerance 1e-7 sq ft) and must not touch slab holes or doors.
  - With the `reviewed-assumption` evidence kind, only `snapEnds` ends must touch a wall face. Another end may sit exactly on a slab edge, which is how the 06-340/06-342 line ends under facade glass that stands beyond the slab.
  - Supports must appear in `data.walls` (the binder snaps there), but the checker also treats low material, such as curb #509960, as a wall. A line ending on such a curb leaves the selection path open over it at the 4 ft cut. That is why 05-206 needed the ledge-cut exclusion.
- **Exclusions** get only structural validation. A small rectangle may overlap walls and holes, which makes it the cleanest way to cut a sub-0.05 ft ledge or strip.
- **Reviewed lifts** (`indoorConnectors`) need:
  - three or more native shaft wall IDs around the pin;
  - one entrance per floor, given as a walkable room, a native floor slab ID and a point inside both.

  The compiler reports refusals as `connector-review` issues.
- **Audit triage.** A facade-gap flag whose edge is the slab edge about 0.33 ft inside curtain glass is a false positive. Record it in `REVIEWED_GLASS_EDGES` in `leaks2.py` with the evidence; don't change the geometry.

**Routing**

- Disconnected route groups came from walking branches refused inside one circulation cell. Reviter `4c13fd0` stitches cell pieces and pulls refused paths tight with exact checks.
- Diagnose quickly, without a 2.5 h compile:
  1. `tools/shared/probe.mts` rebuilds the listed cells on an existing routing dataset;
  2. `frag.py` lists split cells;
  3. `gaps.py` shows the closest pairs between route groups.
- A reviewed circulation link needs a `decision` naming an owner source. The 08-S101 link cites the owner-reported ramp #1622190.

**Performance and tooling**

- `routingCalculationValue` caches only inside `withRoutingCalculation`. Any per-item loop over exact bindings must run inside one, or it rebuilds the bindings per item. That caused a 15-minute editor freeze, fixed in OIM `338912f`. Profile with `node --cpu-prof` and total the self time by function (`tools/candidate16/time-cells.mts`).
- **Every CLI and thread that touches native materials must start the engine** with `await initializeNativeExactGeosOverlay()`. The error otherwise is "The checked native overlay engine is not initialized". `tools/candidate16/with-geos.mts` wraps any script.
- **Display-engine binding.** Any edit in the display module graph (`package.ts`, `native-circulation.ts`, …) changes the engine hash. After such an edit, in this order:
  1. run `npx tsx scripts/indoor/prepared-display-engine-binding.ts`;
  2. apply prettier;
  3. commit;
  4. re-prepare the displays.

  Otherwise the editor warns "built by display engine …; floors are prepared live". Vite rewrites that file's formatting while it runs; restore it with `git checkout` before committing.
- **Vite serves stale modules after edits.** Verify by curling the module, stripping the `sourceMappingURL` comment and grepping for a new identifier; the base64 source map can match short strings. Restart with `preview_stop` / `preview_start`.
- **Don't write files inside the repo during a browser run.** Vite does a full reload and the import is lost.
- The in-app browser pane crashes on 290 MB masters. Use Playwright Chromium with `--js-flags=--max-old-space-size=8192`, as `pw-floors.mjs` does.
- **Shell traps:**
  - `pgrep -f <name>` matches the waiting shell's own command line, so wait on a PID instead.
  - zsh aborts a whole command line on an unmatched glob, so check what actually ran.
  - Foreground `sleep` is blocked; use background waits.
- **Disk**: keep at least 10 GB free. Several 14–16 GB heaps push swap past 16 GB, and disk with it. Delete large probe outputs (each routing JSON is about 175 MB).

**Size limits raised this round** (each with tests):

| Limit | Old | New |
|---|---|---|
| `viewer/indoor.json` per entry | 192 MiB | 320 MiB |
| Viewer metadata, packed | 16 MiB | 32 MiB |
| Viewer metadata, expanded | 64 MiB | 128 MiB |

The archive cap stays 900 MiB. The routing-on master's `indoor.json` is 233 MB.

## 6. Promotion convention (`docs/indoor-enclosure-review.md` §151)

1. Re-check the canonical master hash against the one recorded at the start.
2. Back up the master, viewer, `current-version.json`, README, START-HERE and `review-recommendations/manifest.json` into `provenance/before-…/`, with a sha file.
3. Build the viewer from the master.
4. Bind the companion manifest to the new master and add any companions the master carries (`tools/candidate16/export-companions.mts`; dry run first, then `--write`). It refuses to overwrite a differing file.
5. Run `tools/shared/promote.py <new master sha>`. It re-checks every hash, replaces atomically, updates `current-version.json` (top-level shas and a new entry) and the README.
6. Prove a folder import with `tools/candidate16/verify-folder.mts ~/Downloads/UNBC.final`.

## 7. Owner questions (how to ask)

Publish a question page (an artifact) with one card per case and a recommended option.
- **Pictures**: render the whole room group from whole-level derived data, with `tools/shared/render_cards.py` or `site.py`, and add zoom boxes for detail.
- **Marking**: a dashed red line marks a boundary with no wall; a solid red line marks a gap through the wall line.
- **Checking**: look at every picture before publishing and write the text from what it shows.
- **Avoid**: "red circles" on triage points (the owner found them confusing).
- **Not questions**: cases already covered by a standing rule.
- **Recording**: store the answers as a new `user-decisions/<date>-roundN.json` with `rawAnswers` and `decisions`.

## 8. Next steps (suggested order)

1. **Unreached door nodes.** Four corridor-side door nodes get no walking branch: #1501543 (10-1302), #1501551 (10-1312), #1501582 (10-1060) and #1780077 (06-364). Their door records look normal; each node is in the right cell's `roomKeys`, yet it is not selected or every plan is refused.
   - Start with `probe.mts` plus temporary refusal-reason logging in `attachNativeCirculationCellRoutes`.
   - Fixing them should reach most of the remaining Building 10 Floor 1.25 and Building 06 Floor 3.5 rooms.
2. **Stair-route review.** The 28 held stairs need an owner review before routing can use them.
3. **Step-free accessibility.** Every connection is `accessible: unknown`, so the step-free route profile finds nothing. This needs owner or field data.
4. **Speed** (optional; see the discussion of 2026-10-14):
   1. profile a compile first;
   2. cache per-cell results by an input fingerprint;
   3. split cells across 4–5 worker processes;
   4. use keyed lookups instead of `data.edges.some` in branch acceptance.

   Later: float filters before exact rational checks and a spatial index over cell edges.
5. **Unqualified local steps**: 04-124 and #1620957.

## 9. Code changes this round

**OpenIndoorMaps** (on `claude/unbc-candidate4-rules`, fast-forwarded into local `main`):

| Commit | Change |
|---|---|
| `36434ea` | Routing-on `indoor.json` up to 320 MiB |
| `7f7c60a` | Display and route-audit CLIs start the overlay engine |
| `ce04298` | The editor starts the engine before it accepts a project |
| `338912f` | One routing calculation per cell pass; boundary evidence skips anchor proofs |
| `6f08bb5` | Viewer metadata 128/32 MiB |
| `1c09991` | Viewer metadata carries authored envelopes (with a regression test) |
| `5062df1` | Viewer round-trip check mirrors the visitor projection |
| `0c71786`, `4238d6f` | Engine binding refreshes |

Earlier on the same branch (now also in `main`), the rule mechanisms that candidates 4–14 relied on:
- `d831326`, `2bdcbb6`: drawn wall corners and joint lines as drawn material;
- `acc6a01`, `a2184a7`, `7e73d05`: native column jambs, every jamb at a corner, and the 0.3 ft door-closure exception;
- `62a1dcd`, `7f07167`: the 128 MiB rooms entry and curved treads up to 1,000 vertices;
- `30a4333`, `e372a8f`, `104b0b8`: engine start in the workers, and a map-effects guard.

**reviter**:

| Commit | Change |
|---|---|
| `50b5ffa` | Keep ramp connector nodes when landing door links rebuild the node list |
| `4c13fd0` | Cell stitching and exact string pulling (with a test) |

Earlier on the same branch: `e8776b8`, `5b25173`, `0a904a3`, `ef3e956`, `a48424e`, `ee2ebd3` (the compiler side of the rule mechanisms above) and `a8e39fd` (an indexed region blocker).
