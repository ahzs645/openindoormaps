# Final proof — November 2, 2026

Branch `claude/final-proof`. Nothing was published.

This run closes two gaps in [../final-candidate/](../final-candidate/README.md):

1. **Browser timings.** The saved 8-journey browser proofs ran before the
   checked 2D plans and lazy plan loading were merged. They recorded about
   55–57 s until the first route's floor was ready. The 18–23 s figures came
   from a separate 2-route benchmark. Here the same 8 journeys run on the
   final application, with every identity recorded in one report.
2. **Policy matrix.** Two calculators that agree can be wrong in the same way.
   The matrix now requires agreement on every recorded field. It also checks
   both calculators against a separate file of expected outcomes.

**Result: pass.** Desktop and mobile, 2 cold runs each, passed all 8 journeys
with no page errors and no console errors. The matrix passed 160 / 160 cases
under the strict agreement rule and the expectations. Everything is in
[FINAL-PROOF.json](FINAL-PROOF.json).

## Scope

- **Policy matrix: 160 cases.** That is 18 room pairs × both directions ×
  policies:

  - 08-264 ↔ 10-2006 and 08-267 ↔ 10-2066, 8 policies each;
  - 16 former 06-388 island rooms ↔ 06-364, 4 policies each.

  Cases: [../policy/POLICY-CASES.json](../policy/POLICY-CASES.json).

- **Browser: the 8 journeys** of
  [../final-candidate/browser/JOURNEYS.json](../final-candidate/browser/JOURNEYS.json).
  The visitor always requests inside arrival.
- **Environment.**
  - Chromium 153.0.8010.12 (headless, software GL).
  - Desktop: 1440×900.
  - "Mobile" is Chromium with Playwright's iPhone 13 emulation (viewport,
    DPR 3, touch, user agent). It is **not a physical phone**.
  - The map was served by a local `python3 -m http.server` on a shared 4-core,
    16 GB host. 1-minute load average was 0.2–2.4 during the runs.
- **Not covered:**
  - physical devices;
  - production hosting and CDN;
  - any route outside these 8 journeys and 160 cases.

## Identity (one report)

Each browser run checks the identity against what the page actually received.
The manifest response must have the expected revision and file hash, and its
provenance must name the expected candidate and visitor. The route worker must
fetch only the expected directions carrier, and every plan carrier fetched
must be an admitted receipt of this revision.

| Part                     | Value                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App commit               | `233bee9185c04bd24f2e53167662b9a850c41835`; app sources unchanged since `5766e62` (lazy plans). Later commits on this branch touch only scripts, tests and docs |
| Reviter                  | `2e7875d3209785ea287296a1520eb9851011b50a` (checkout = CI pin)                                                                                                  |
| Candidate                | `32c395e1af62235543e69effb91645a76111a6f37cfcf6c5bfd7e7bcd0db85dd`                                                                                              |
| Visitor JSON             | `6abc227a4529df7e33611567273349e8b227f179cb4940eed1b30aa2e06d4559`                                                                                              |
| Manifest revision / file | `fa6d29355ad6122174ee75294c013e0ce1a0200447836f3eafe1d57bb46723e9` / `cd2c48f9505074026dea9e6078e5c38820ed52af55f3a8bb5dd2d449f0c692bb`                         |
| Directions carrier       | `3d27eaa50e0376bd78dc4ffa5d49d9b42f0f616964b92aaa9d19346a90e31687` (8,205,761 bytes), receipt `fresh-candidate-native-routing-4d1b5452…`                        |
| Plan receipts            | 7 × `exact-native-2d-scope-…` (ids and carrier hashes in [browser/IDENTITY.json](browser/IDENTITY.json)); project receipt `unbc-progressive-floors-32c395e1…`   |
| Bindings                 | engine `4a0a354a…`, route runtime `49f1e88b…`, plan runtime `4705ec62…`                                                                                         |
| Build                    | `index.html` `37d9c81a…`; `build/assets` 77 files, list hash `47d7fd5b…`; whole `build/` 115 files, `442a52e4…`                                                 |

The public root `/home/user/unbc-work/finalproof/root` was built from
`233bee9` by `../plans/tools/build-public-root.sh` (build 60 s, peak RSS
2.4 GB). Two checks passed on it:

- [PLANS-CHECK.json](PLANS-CHECK.json): 7 / 7 scopes, no fallback.
- [DIRECTIONS-CACHE-CHECK.json](DIRECTIONS-CACHE-CHECK.json):
  `currentCompiledReceiptMatches` and
  `exactCarrierInventoryAndPolicyDecodePassed` are true.

## Browser journeys

Tool: [tools/proof-final-journeys.mjs](tools/proof-final-journeys.mjs), a copy
of `../visitor/proof-chosen-candidate-asserted.mjs` with the same actions and
assertions, plus the identity checks and timings. A run fails hard on any of
these:

- a page error;
- a wrong identity;
- an unexpected route or refusal;
- a distance outside tolerance;
- wrong refusal text;
- a route without instructions;
- a route line that is never drawn;
- a line drawn for a refusal.

All times are seconds from the "Get directions" click:

- **status**: the final route-status text.
- **paint**: the first half-scale capture of the map canvas that shows the
  route line. Captures are polled; the median capture took 0.02–0.4 s.
- **floor ready**: render status `ready` with no floor-loading notice, held
  for 3 s.

Each cell shows run 1 / run 2. "—" means not applicable for a refusal.

| Journey (expected)                           | Shown         | Desktop status | Desktop paint | Desktop floor ready | Mobile status | Mobile paint | Mobile floor ready |
| -------------------------------------------- | ------------- | -------------- | ------------- | ------------------- | ------------- | ------------ | ------------------ |
| 08-264 → 10-2006, default (83.948 m) — first | 84 m          | 16.5 / 12.0    | 20.7 / 16.6   | **20.7 / 16.5**     | 14.5 / 12.3   | 18.8 / 15.7  | **19.0 / 15.8**    |
| 06-366 → 06-364, default (21.01 m)           | 21 m          | 1.7 / 1.4      | 8.6 / 5.0     | 8.3 / 5.2           | 1.6 / 1.3     | 4.9 / 3.6    | 5.4 / 3.7          |
| 06-376 → 06-364, default (refusal)           | No hallway…   | 0.04 / 0.03    | —             | 0.04 / 0.03         | 0.03 / 0.06   | —            | 0.03 / 0.06        |
| 06-376 → 06-364, transit (47.39 m)           | 47 m          | 1.4 / 1.0      | 2.5 / 1.7     | 1.4 / 1.0           | 1.1 / 1.0     | 1.2 / 1.1    | 1.1 / 1.0          |
| 06-388 → 06-364, step-free (refusal)         | No confirmed… | 0.05 / 0.07    | —             | 0.05 / 0.07         | 0.07 / 0.05   | —            | 0.07 / 0.05        |
| 04-204 → 08-267, default (120.961 m)         | 121 m         | 3.0 / 2.8      | 6.3 / 6.4     | 8.5 / 8.3           | 3.0 / 2.7     | 5.2 / 5.8    | 8.1 / 7.3          |
| 04-255 → 08-272, transit (186.35 m)          | 186 m         | 4.6 / 4.6      | 5.5 / 5.1     | 4.6 / 4.6           | 4.6 / 4.1     | 4.9 / 4.6    | 4.6 / 4.1          |
| 06-388 → 06-364, default (34.356 m)          | 34 m          | 1.3 / 1.3      | 4.6 / 4.0     | 5.5 / 6.3           | 1.5 / 1.3     | 3.3 / 3.3    | 5.4 / 4.2          |

- **First route.** The first journey is the cold first route. It includes the
  route worker's preparation and the directions-cache download. Its floor was
  ready in **16.5–20.7 s**; the saved proof on the pre-plan application
  recorded 57.1 s (desktop) and 55.2 s (mobile). The opening floor was drawn
  5.0–6.3 s after navigation.
- **Paint and floor ready.** The route line is drawn on the start's floor, so
  on a floor change the paint comes with the floor and not with the status
  text. When the start's floor is already shown, "floor ready" equals the
  status time, and the paint follows 0.1–1 s later, after the camera move.
- **Plan downloads.** Each run downloaded only two plan carriers, Floor 2's
  delta and its base (`0c25c5de…`, `14e8225a…`). There was one directions
  carrier download.
- **Failed requests.** Each run had one aborted request: the Brotli `HEAD`
  probe (`…/60615142….br`, `ERR_ABORTED`). It was also present in the earlier
  proof.
- **Screenshots.** They are byte-identical between run 1 and run 2:
  - [desktop 08-264 → 10-2006](browser/desktop-run1-0810-default-08-264-to-10-2006.png)
  - [desktop 06-376 refusal](browser/desktop-run1-island-default-06-376-to-06-364.png)
  - [mobile 08-264 → 10-2006](browser/mobile-run1-0810-default-08-264-to-10-2006.png)
  - [mobile 06-388 → 06-364](browser/mobile-run1-island-default-06-388-to-06-364.png)
- **Raw runs.** Per-run reports, with every status transition and the load
  average at each request, are in [browser/](browser/).

## Policy matrix (strict)

`scripts/indoor/run-explicit-policy-matrix.ts` now writes
`explicit-policy-route-matrix-v2`. The report stage needs `--expectations` and
exits 1 unless all three of these hold:

- **complete**: every case has a normal and a worker outcome, and neither has
  an error.
- **allAgree**: the two outcomes are identical on every recorded field. The
  fields are availability, edge id count, edge ids, door edge ids,
  required-edge use, distance, the whole diagnostic, arrival choices,
  reachable count, step count, the complete-value hash, the step hash and the
  summary hash (`scripts/indoor/explicit-policy-matrix-checks.ts`). Before
  this change, it compared only availability, edge ids and distance.
- **allExpectationsMet**: the normal outcome and the worker outcome each meet
  the case's entry in [POLICY-EXPECTATIONS.json](POLICY-EXPECTATIONS.json). A
  route needs:

  - a distance within ±0.01 m;
  - edges and steps;
  - the required edge used, or not used, where stated.

  A refusal needs no route and the stated constraint (`hallways`), or blockers
  all of kind `step-free`.

The expectations file holds 78 routes and 82 refusals. It was written by
[tools/write-policy-expectations.py](tools/write-policy-expectations.py) from
the documented outcomes:

- 08-264 ↔ 10-2006 by default: 83.948 m through door 1499373.
- With hallway arrival: refused without transit, 73.050 m with transit (the
  door is not used).
- 08-267 ↔ 10-2066: 34.019 m in all four walking settings.
- Every step-free case: refused.
- Island rooms 06-366, 368, 370, 388, 390, 392, 397 and 398 route by default
  over the reviewed link.
- Island rooms 06-372 to 06-386: refused (`hallways`) unless transit is
  allowed.

The README does not list every island distance. The 3 island distances in
JOURNEYS.json are used as documented, in both directions (6 cases). The other
58 island route distances are pinned, to the millimetre, from the committed
`final-candidate/policy/POLICY-MATRIX.json.gz`. The script stops if a README
rule and the pinned matrix disagree on route or refusal.

**Fresh run on the final inputs.** The progress file was new, so nothing was
reused.

| Stage  | Time  | Peak RSS | Result                                                   |
| ------ | ----- | -------- | -------------------------------------------------------- |
| worker | 100 s | 1.9 GB   | 1 worker start, heap limit 856 MB                        |
| normal | 463 s | 3.7 GB   | projection equals the published routing asset            |
| report | < 1 s | —        | **passed**: 160 / 160 agree, 160 / 160 meet expectations |

The result is in [policy/POLICY-MATRIX.json.gz](policy/POLICY-MATRIX.json.gz)
(identity: the hashes above plus expectations `8691e583…`).

The check fails when it should. A copy of the expectations was changed to
expect 84.948 m for 08-264 → 10-2006. The report then exited 1, with both the
normal and the worker outcome flagged, even though the two calculators still
agree.

## Checks

On Node 24.19.0:

- `npx tsc -p tsconfig.indoor-project.json` and the full `npx tsc` pass.
- 218 / 218 unit tests pass: `*visitor*`, `*plan*`, `progressive-*` and
  `published-*`, plus the new
  `tests/unit/explicit-policy-matrix-checks.test.ts`, which is now in CI. It
  covers:
  - strict agreement on every field and the whole diagnostic;
  - missing hashes and uncompared fields;
  - complete coverage of the bound cases file;
  - two calculators that agree on a wrong distance, a missing required edge,
    a wrong outcome or a wrong refusal reason all fail the expectations.
- The three binding scripts (`prepared-display-engine-binding.ts`,
  `published-route-runtime-binding.ts` and
  `published-visitor-plan-runtime-binding.ts`) reproduce `4a0a354a…`,
  `49f1e88b…` and `4705ec62…`, and change no files.

## Reproduce

```sh
T=docs/continuation/unbc-20261102/final-proof/tools
F=/home/user/unbc-work/final
CAR=$F/public/data/unbc-routing/3d27eaa50e0376bd78dc4ffa5d49d9b42f0f616964b92aaa9d19346a90e31687.json.gz
V=$F/visitor/viewer/indoor.json; SHA=6abc227a4529df7e33611567273349e8b227f179cb4940eed1b30aa2e06d4559
docs/continuation/unbc-20261102/plans/tools/build-public-root.sh "$PWD" $F/progressive $CAR NEW-ROOT $V $SHA
$T/run-final-proof.sh "$PWD" NEW-ROOT $V $SHA $CAR /home/user/reviter 42951 OUT 2
$T/run-matrix.sh "$PWD" $V $SHA $F/public/data/unbc $CAR MATRIX.json
node $T/summarize-proof.mjs FINAL-PROOF.json OUT MATRIX.json
```
