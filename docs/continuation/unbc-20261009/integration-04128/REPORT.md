# 04-128 original-simple-terminal-cap — integration report

RUN = `/home/user/openindoormaps/work/floor1-followup-20261009`; this directory = `RUN/integration-04128/`.
Nothing committed or pushed by this agent (coordinator WIP commits exist). Canonical master untouched. Outputs private / not canonical.

## Result in one paragraph
The 04-128 contact family is installed in both repos (runtime + compiler, identical normalized bodies) and tested.
04-128 was explicitly applied (only that descriptor, proposed→applied) on the checked authoring base 67532990.
A full recompile from `native-cache.json` succeeded mechanically but **failed verification** (07-410 and 04-S102
merged) because of recompile drift in 28 curved walls unrelated to 04-128 (see `RECOMPILE-DRIFT.md`); it was not shipped.
Per coordinator decision a **selection-only master** was built (previously published compiled geometry 73f7c95e,
byte-identical, + the 353-contact collection, mapping republished). It **passed** every verification check and the
independent byte-level source-entry check, and was copied by the coordinator to `/home/user/UNBC.final/previews/2026-10-10/`.

## Shipped artifacts (selection-only)
| File | Bytes | SHA256 |
|---|---|---|
| `selection-only/UNBC.master.reviter.zip` (= previews/2026-10-10/UNBC.04-128-selection-only.master.reviter.zip) | 225,262,148 | 70175e202905c7d6d150ff31de700aec373ed14bd0f7329e18643b1c5dd7f28b |
| `selection-only/UNBC.campus-viewer.zip` (= …selection-only.campus-viewer.zip) | 50,761,144 | 209a1efe3bc5241a6c68943d0f3defbbf5003e623ee3770003d79ab787dcd505 |
| `staging/UNBC.04-128-reviewed-source.reviter.zip` (private source candidate) | 211,270,071 | d94baef6c73787b96e4fd7d55e479ad42f4975243f69a73cb79e7e056a980f4f |
| `selection-only/published-dataset.json` (checked master import) | 188,661,268 | d7f8a4d530bac9ba80b468e3b0efc31ce41aa6569b0beb3be01e42da90ae08b9 |

Mapping SHA 7273c07ef74ad6ac226f8246fc82917d03bd8b82677887a00aee3576ce4a0042. Contact collection 353, SHA 7e16efe9…; source rooms SHA 2c3fa3c5…; 908 companions (890 + 18 evidence).
Rejected (kept, not shipped): `regenerated/UNBC.master.reviter.zip` 72af43b4…, viewer 3c2caf69…, `compiled-dataset.json`.

Pinned code used for regeneration / selection-only / verification / display: openindoormaps **1a1e358** (= 8bbe4cc + regenerated
prepared-display engine literal c653b913…), reviter **5847bd3** (`/home/user/pinned/*`, clean). The source candidate was built
earlier from the main checkouts (15:36–15:46 Oct 9); the only builder-path difference vs 8bbe4cc was 20c8c41's behaviour-neutral
package.ts change (drops the archive reference after unzip); all candidate content equalities are asserted by hash.

## Step 1 — production rebase and tests
Patchset baselines were reconstructed exactly by reverse-applying the patchset patches (SHA match 899e60b7/26dc8325/bad6263f/168d12a9),
then the patches were applied to the current files (bc2adc6 / a70a4c8). Intervening changes were lint-only; one hunk was merged by
hand, one new line lint-normalized. Existing families/tolerances unchanged; new branch only for `contactMode: original-simple-terminal-cap`.
Receipt: `production-rebase-receipt.json`; patches: `openindoormaps-contact-modules.patch`, `reviter-contact-modules.patch`.

Files changed — openindoormaps: `app/indoor-project/native-selection-contact-repairs.ts` (7a8eb4f1…), `…-guards.ts` (ed737132…),
new `tests/unit/native-selection-contact-simple-terminal.test.ts` (13 ported + 1 runtime/compiler direct-mask parity test).
reviter: `lib/reviter/native-selection-contact-repairs.ts` (4be5e6df…), `…-guards.ts` (e9abd570…), new `tests/native-selection-contact-simple-terminal.test.ts`.
Tests: openindoormaps contact suites 65 tests / 62 pass / 0 fail / 3 skipped (stair fixture env); reviter contact+package 51/51, room-directory 15/15.
Typecheck: oim `tsconfig.indoor-project.json`, oim contact tests (`tsconfig.oim-contact-tests.json`), reviter `tsconfig.indoor-pipeline.json`,
reviter contact tests — all exit 0. ESLint/Prettier clean on changed files. Logs in `logs/`.

## Step 2 — source candidate (`build-source-candidate-04128.ts`, plan `authoring-plan.json`)
Verified input SHA 67532990…, 352-collection SHA a708dd59…, 890 companions; refused anything but the CLI-named reviewed ID.
Fresh derivation with installed runtime AND compiler rules: masks exactly equal (4.065690898145235e-15 sq ft), equal to the earlier
independent proof; all physical guards passed in both; 0 overlaps with 155 published named singletons on level 311.
Only `nativeSelectionContactRepairs` changed (+1, prior 352 byte-identical); stale `nativeExploreMapping` removed; 18 checksummed evidence
companions added (`.patch`/`.ts` archived with `.txt` suffix because the bundle accepts only json/md/txt/log/png/jpg).
Production read-back replays all 353 guards. Command:
`node --max-old-space-size=8192 --import tsx work/floor1-followup-20261009/integration-04128/build-source-candidate-04128.ts work/floor1-followup-20261009/integration-04128/authoring-plan.json --apply floor1-proposed-simple-original-cap:961042-961014:04-128`
Time ≈ 10 min under lock (parse 84 s, guards 22 s, zip 112 s, read-back 362 s).

## Step 3 — full regeneration (not shipped)
`run-regeneration.sh` (1 native worker; `--import reviter/scripts/register-local-typescript.mjs`). Six attempts:
1 killed by tool 2 h limit (625/955 landing pairs); 2 stopped by coordinator (unpinned WIP code); 3 failed at first plane worker
(tsx does not resolve reviter's extensionless imports inside worker threads → fixed by the extra `--import`); 4, 5 killed by VM restarts;
6 exited 0 in 18,789 s (5 h 13 m: landings ≈ 2 h 15 m, planes, merge, master export 42 m, read 12.5 m, viewer 7.7 m). Peak process RSS ≈ 9.6 GB
(min available ≈ 4.5 GB). Checkpoints: new binding directories under `RUN/native-plane-checkpoints/`; no identities edited.
Memory cap note: a lower `--max-old-space-size` than ~10 GB is not shown safe (RSS ≈ 9.6 GB was observed; V8 heap itself was not measured).

## Step 4 — verification
Full recompile (`verification-report.json`): FAILED — 07-410 and 04-S102 merged (0.0050 sq ft hairline strip). Causal experiments E1–E4
prove the cause is the recompiled `walls` field (28 curved walls), not 04-128 / mapping code / circulation (`RECOMPILE-DRIFT.md`).
Selection-only (`verification-report-selection-only.json`, `VERIFY-SUMMARY.json`): PASSED, 0 failures — 353 descriptors, prior 352
byte-identical; RVT/GLB/GIS hashes unchanged; 04-128 exactly one named face native-region:311:45, 173.40350936946277 sq ft, exact shape =
expected-native-04-128.json; 04-125/07-165/ramp still one face (1058.183 sq ft); 718 other named singletons preserved by identity and exact
shape, none lost; 272 prior audited keys and the 7 earlier gains preserved; 3 intentional shared groups still shared; arrivals 1560/1560;
nodes/edges/records/doors/walls/circulationGeometry/connectors/rampDisplay identical to 73f7c95e; B4 ramps #1586431 (9 edges) / #1587605 (32)
identical; master non-mapping = selection-only dataset; mapping validated. Independent byte-level source→master entry parity
(`source-entry-parity-selection-only.json`) passed. Verify ≈ 13 min; selection-only build 79 min.
Limits: selection/mapping/routing-data preservation only — not raised-volume, browser 3D, or end-to-end route certification.

## Step 5 — portable ZIP and prepared display
The shipped selection-only master is the portable reviewed authoring ZIP (908 companions incl. the 04-128 evidence and rebase receipt).
Verification receipts live in this directory, not inside the ZIP (`append-verification-companions.ts` is prepared but not run).
Prepared display (done): `display/run-display.sh` → `display/prepare-parallel-display.ts` (copy of RUN/prepare-parallel-display.ts with
pinned imports) + reconstructed child `display/prepare-display-scopes.ts` (the original work/import-performance-20261008 child is absent here;
it runs the same per-scope body as production `prepareDatasetDisplayAssets`, including replay verification). Pinned tree, engine
**c653b913e64b67962aee1728e1f3450c6f72ceb6ea6a514148db5fbded4d8e94** (fresh binding, not a relabel of 14e1d7a7…), 2 workers, 12/12 scopes,
0 unavailable, source entries unchanged, 4,283 s (71 min), peak tree RSS ≈ 8.3 GB.
Output `display/UNBC.04-128-selection-only.review-ready.reviter.zip` — 292,516,758 bytes, SHA256
**1086cb6ab6559985194a491a21592e978a0770659df2fc2a28809e2382c792b8**; display dataset 65ab45265c3e990c…; report `…display-report.json`.
Not yet import-tested in a browser (the stable test server must be restarted on the engine-c653b913 code).

## Additional work requested by the coordinator (main checkouts, committed by coordinator as WIP f9a8855 / a51a907)
Resumable/parallel landing-approach stage: reviter `lib/reviter/native-circulation-links.ts` (plan/evaluate/replay split; sync API unchanged),
`lib/reviter/indoor-pipeline.ts` (optional hook), new `scripts/indoor/native-landing-approaches.ts`, `scripts/indoor/native-landing-approach-worker.ts`,
`tests/native-landing-approaches.test.ts`; openindoormaps `scripts/indoor/regenerate-from-native-cache.ts` (`--landing-workers N`, plus a type-only fix).
56/56 focused reviter tests; scoped typechecks exit 0. Estimated N=2 ≈ 70–80 min, N=3 ≈ 50–60 min for the landing stage, but ≈2–2.5 GB per
worker on top of ≈8.5 GB main — not memory-safe on this 15.7 GB VM; N=1 + `--checkpoint-dir` gives resumability at ~no memory cost.

## Open items
- Recompile drift (07-410/04-S102 merge from 28 curved walls; Node v26.7.0 Mac vs v22.22.0 here) must be resolved before any full recompile.
- The selection-only build carries the 04-128 selection repair only; routing/raised-room certification and browser 3D proof remain separate.
- READ-ME in previews says source-entry check "pending" — it has since passed.
