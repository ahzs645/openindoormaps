# UNBC native indoor map: handoff (2026-10-12)

This is for the next person or AI continuing the work. It picks up from
`docs/continuation/unbc-20261009/` (the 2026-10-09 handoff and its follow-up
reports). Read this file first, then the owner decisions, then the "Next steps".

## 1. Goal and owner rules

The goal is to finalize the UNBC campus map from the native Revit geometry:
- every room enclosed and selectable;
- no leaks (rooms merging, or opening to the outside);
- buildings connected;
- routing later;
- promote only after verification.

The owner's standing rules (in `user-decisions/`, binding for all work):
- **The drawing is the authority.** The registered DWG ("UNBC floor plan Basic.DWG") wins wherever the Revit model is incomplete.
- **Corrections are patches, never edits.** Every correction is a reversible, tagged patch: a drawing-backed row, record or partition, carrying a decision id. Never edit the model; use generic mechanisms only, with no UNBC coordinates in code.
- **Exact contacts close.** Hairline gaps of 1.5e-5 ft or less between two native elements are closed (q2, exact-contact-closure).
- **Doors close for selection outlining.** Walking through them is unchanged.
- **Ambiguous cases go to the owner.** Anything the DWG cannot settle goes to the owner as a question with an image.
- **Routing is on hold.** First make sure buildings are connected (walking floor) and all leaks are solved.

## 2. Where everything is

Code lives in two repos, both on branch `claude/drive-folder-review-6m9har`, pushed and clean.

| Repo | HEAD at handoff |
|---|---|
| openindoormaps (runtime and UI) | 110920b |
| reviter (compiler) | 2186333 |

Never push to other branches. Do not open a PR unless the owner asks. Engine-graph changes require regenerating the prepared-display binding with the repo script.

Working data was under `RUN = /home/user/openindoormaps/work/floor1-followup-20261009` in the cloud container. It is not in git. The owner received it as exports:
- the 2026-10-12 Mac kit, with the native cache and the source ZIP;
- the session export that accompanies this file.

Key locations inside RUN (and inside the export):

| Path | What |
|---|---|
| `user-decisions/*.json` | All owner answers. `2026-10-10-round3.json` holds rounds 3–5 plus `buildNotes`. A copy is in this folder. |
| `combined-build/manifest.json` + `scripts/build-combined.ts` | Manifest-driven build. Every input has a sha256 and a decision id; the build refuses anything unauthorized. |
| `candidate-floors/integration/rooms.candidate2.json` | **The current combined input** (sha e783d976…), with `receipt.json`, `validation.json` and `work/manifest.integration.json`. |
| `candidate-floors-2/` | **The current build** (candidate 2): compiled dataset (sha cbb98733…), per-level areas, leak audit v2, triage, junctions, renders, summary. |
| `candidate-floors/fix-*` | The leak-fix round: doors, walls, seams, g9, junctions, regressions, supplement. Each has rows/cases and notes. |
| `candidate-floors/triage/` | Classification of every flag (real, expected, needs owner) and the rules behind it. |
| `combined-build/ROUTING-DEFERRED.md` | The routing work list, on hold. |
| `native-cache.json` (sha d5197e5e…) | Decoded native model. **Only the container and the owner's export have it.** |
| `/home/user/UNBC.final/previews/2026-10-09/UNBC.floor1-followup-review-ready-20261009.reviter.zip` (sha 7fd503d4…) | Source review ZIP. |

Owner-facing pages (claude.ai artifacts, private to the owner):
- Answers page (all questions, rounds 1–5, numbered Q1.x–Q5.x, answers stored in its db collection `answers`): https://claude.ai/artifact/6j9Q7hsq1tMxPCreDqMAs2
- Candidate floors gallery (candidate 2: all floors, Now/Changes, leak check, junctions): https://claude.ai/artifact/Uz7BvzPwRCCFQCziuReRan
- Floor 1 joints review: https://claude.ai/artifact/LibJE26MuSewD6x93qQYDV

## 3. How to rebuild candidate 2

Routing stays off throughout. Use the parameterised scripts in `candidate-floors-2/scripts/`, or the Mac kit's `scripts/run/` with env vars `UNBC_RUN`, `REVITER_DIR`, `OIM_DIR`, `UNBC_SOURCE_ZIP`, `UNBC_NATIVE_CACHE` and `UNBC_OUT`.

1. Check out both repos at the HEADs above, then `npm ci` (Node 22.22; builds are byte-identical across machines thanks to deterministic math).
2. Use `rooms.candidate2.json` as the rooms input. Compile with routing off. Here this took 2 h 24 min on 4 cores and needs about 7.5 GB.
3. Re-run `combined-build/scripts/rebind-partitions.dedup.ts` with `manifest.integration.json`.
4. Derive areas per level, using the production `deriveNativeAreas` (OIM, seal memo on). The encode-tolerant copy is no longer needed.
5. Run the leak audit (`leaks.py`, with leaks located by `fix-doors/scripts/bridges.py`), then triage (`triage/scripts/triage.py` rules), junctions (`fix-junctions/scripts`) and renders (`floors.py`/`cfrender.py`).

If the run uses the same inputs and code, the outputs must match the checksums in `candidate-floors-2/data/compiled-candidate.receipt.json` and `summary.json`.

Heavy-job rule in the container: two lock slots (`.heavy.lock`, `.heavy2.lock`). Jobs at or under 6 GB take either slot; the full compile and Chromium runs take both.

## 4. What was done this session (2026-10-09 → 2026-10-12)

Cross-machine determinism:
- DMath (fdlibm trig, V8-identical hypot) in both repos. Builds are now byte-identical on Node 22/26 and Linux/macOS.

Partition binding:
- Reviewed area partitions now bind to their local evidence: a window of the bbox plus 6 ft, with a tolerant snapshot that ignores vertex moves of 1e-6 ft or less.
- Partitions are re-bound after approved changes.
- A dropped partition is reported; it is never dropped silently.

Evidence-based drawing-backed kind `dwg-drawn-material`:
- A row is accepted where the DWG draws material: between a pair of wall lines, or inside a closed outline or casing.
- New constructions: wall-end extension and the DWG face-pair wall.
- Cross-level citations need an explicit decision.
- Derived raw-DWG outlines (circles and casings) are registered with receipts.

Floor-edge rules:
- Step, drop-edge and void-edge rules (Q3.11b), so split levels enclose; they yield to stairs and ramps.

Drawn doors:
- `dwg-drawn-door` (Q5.2): the door into 07-220 from the 07-225 entry.

Routing records, implemented but routing deferred:
- staff access zone (Q3.4);
- B9 lobby stair #1644499 and the ramp link;
- B4 physical-level doors;
- 07-163 slab-join;
- the q4 door.

Leak round fixes:
- Supplement window-strip fix: census-omission facade walls close their window openings across the full wall thickness. This fixed 9 regressions.
- Point-contact simple-loops encoder fix: the "self-intersecting exact rings" crash is gone.
- Same-joint band rule.
- Oblique door jambs.
- 264 new rows: walls, seams, the G9 Floor 2 corridor network (111 rows), N1 slit closures and the 04-242B/C casing.
- The Q5.3b strip exclusion.
- Q3.7 boundaries.

Performance:
- Per-run seal-check memo: the seal index went from 262 s to 3.5 s.
- Large-cell attach fixes (routing).

## 5. Results now (candidate 2 compared with candidate 1 and published 73f7)

Real leak problems (after triage of expected cases):

| | Candidate 2 | Candidate 1 | 73f7 (raw) |
|---|---|---|---|
| Unapproved merges | 42 | 73 | 173 |
| Room↔corridor via door | 82 | 107 | 331 |
| Doorless | 9 | 8 | 16 |
| Open to outside | 7 | 12 | 63 |
| Area ratio | 20 | 21 | 68 |
| Omitted | 8 | 50 | 116 |
| **Total real** | **168** | **271** | 769 raw |

Junctions:
- Candidate 2: 8 continuous, 4 connector, 5 disconnected.
- 73f7: 5 continuous, 1 connector, 11 disconnected.
- B4–B8 and B8–B10 on Floor 2 are now continuous.
- The 5 disconnected pairs have 47–80 ft of open air between them, with no corridor in the DWG.

Floor 2 walkable area: +18,800 sq ft (G9 recovered).

## 6. Next steps (in this order)

1. **Floor 2 regressions from G9.** These are rooms with joints that now leak into the newly recovered corridor network. Exact locations are in `candidate-floors-2/triage/flags.json` and the summary.
   - Area 694:808: 08-206 (missing DWG piece 0.174 ft at 48.183, 471.245), 08-213/215 (slit at 59.252, 507.666), 08-226 (slit at 65.05–65.247, 633.462), 08-264/265 (2.26 ft doorless opening at 84.711, 678.913), 08-272 (jamb contact at 65.369, 697.274).
   - Area 694:1375: 09-312/362/384 (seams at 196.145, 549.232; 307.947, 525.723; 219.537, 536.198), 09-310 (missing DWG wall 3.59 ft at 198.43, 519.02), 09-390 (door #1969603 not closing at 226.545, 503.048).
   - 06-284 (seam at -223.464, -75.975) and 04-233 (seam at -74.347, 381.401).
   - Also 10-3014/10-3530 on Floor 3: jamb contact at door #2263044, and door #2215404 with a 0.143 ft gap.
2. **06-212 (Q3.9).** The partition `r3-q3.9:694:06-212-dwg-arc-wall` went stale: the Floor 2 envelope changed in its window, and envelope changes are not in the approved set. Re-bind and re-apply it on the candidate-2 compile.
   - Consider adding "derived envelope supplements that come from approved rows" to the approved change set.
3. **The remaining 168 real problems, by leak class:**
   - zero-area slits (74): each needs a q2 row. An exact slit locator is needed; the neck search is too coarse at the 1e-4 ft scale.
   - doors without selection closure (54)
   - missing DWG wall pieces (53)
   - seams (49)
   - Reuse the fix-* tooling and work in parallel by class. Validate rows alone first, then do one combined pass. Never re-check prior rows per split.
4. **The 16 leftover N1 rooms** (`candidate-floors/integration/notes.txt`):
   - Wall-to-closed-door cracks need a door-selection-closure change, not rows: 03-1042A, 04-207B, 10-2092, 10-2094, 05-327, 10-3014.
   - Cracks against contact-repair masks: 05-250, 10-2020, 10-2022.
   - Single piece at the neck: 09-384, 10-2050, 10-2052.
   - Pads that miss the slit: 06-266, 06-268, 05-411, 10-4024.
5. **05-180 (round 2 f1-4).** Door #894458 ends on columns. This needs a "column as jamb" rule plus a DWG piece for the 0.43 ft gap. 07-316 is also not yet in effect.
6. **Owner question pending.** 08-220/221/222: a DWG cross line runs inside the wall band at the glazing joint, so the drawn-material rule refuses the row. Ask whether joint lines may be treated as solid.
7. **Optional cleanups.**
   - `region.nativeDoorIds`: use the extended door footprint (an exact edge-contact test). This must be done together with re-saving the enclosure proposals.
   - Withdraw/remove the invalid `review-f1:1487816:08-127-08-128-corner-seal` proposal.
8. **Then routing** (`combined-build/ROUTING-DEFERRED.md`):
   - index the grid edges in `indoor-region.ts` for the 113k sq ft Floor 1 cell;
   - measure the real graph;
   - the B4 Floor 1.25 rooms not joining on the real graph;
   - the 04-124 curved steps evidence.
9. **Then promotion.**
   - Run the full compile with routing.
   - Prepare the display with the final engine binding.
   - Run browser checks on desktop and mobile (3D included).
   - Run route tests.
   - Package a master `.reviter.zip`.
   - Promote only after all of this passes.
   - The newest packaged master is still the 2026-10-10 04-128 selection-only build.

## 7. Practical notes

- Agents: give each agent its own output folder and file ownership. Require commits and pushes after green tests, with hooks on (no `--no-verify`).
- Big jobs: compile about 2.4 h; full-row combined validation about 5 min with the memo; per-level area derivation 1–11 min.
- The leak audit's original leak points (closest point between eroded sides) are unreliable. Use `bridges.py` / `s4_analyze.py`.
- Commit attribution lines and "no model names in repo files" apply to all commits.
