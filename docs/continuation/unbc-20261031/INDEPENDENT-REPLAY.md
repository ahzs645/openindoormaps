# Independent replay of the connected-campus rebuild — October 31, 2026

This note records a second, independent check of the October 30 rebuild
(`docs/continuation/unbc-20261030/`) in a fresh cloud container. It reapplies
the two recovery patch series, reruns the code checks, reproduces the guide
compile and the full normal/production-worker acceptance on the verified
source, and adds two exploratory diagnostics. Nothing was published.

## Inputs

All inputs came from the Drive recovery folder and the October 22 compile
archive, and every one matched its recorded SHA-256 before use.

| Input                                         | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `connected-campus-worktrees-20261030.zip`     | `2b512275972ec0a4c476a34a9b36114e5ca07a502d1abb07751f696fbae42179` |
| OpenIndoorMaps patch series                   | `043de2bcfde9dccc06aa18004d7f57c980df1365db60b2f66e19e6941e7d4a34` |
| Reviter patch series                          | `0d6879e63620a02469f8281ccbfd038699563c4c53355bdd9f29a5ec749edc99` |
| `compile-result-20261022T083159Z.tar.gz`      | `2dadeb7a41cfec54d573cdc29c8eecad284b9a74a20d1bac98eaae7a9bf3862a` |
| Run-1 master `UNBC.master.reviter.zip`        | `d4d36d188dd635cae7d4225abdb1a3707eed6427180e072f64fc59f4ea006dfc` |
| Two-cell candidate (three joined Drive parts) | `c757704fc5b40087a1ede7061a062292675258e7f03918c6b2d3d2546f7a1c11` |

Both patch series applied cleanly with `git am` to `b227739` and `80177ed`.
The resulting trees equal the manifest's expected trees exactly:
OpenIndoorMaps `8c76cd47cc54a22a9369c536e548dacba6b04202` and Reviter
`f1d4c6d36d4e93be6d7c3c4c22d47858e98e579d`.

## Code checks (Node 22.22.0)

| Check                                                               | Result                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Reviter gateway and package tests                                   | 17 / 17 pass                                                        |
| Reviter full unit suite                                             | 2,408 pass, 0 fail, 23 skipped                                      |
| Reviter `tsc --noEmit` and scoped ESLint                            | pass                                                                |
| OpenIndoorMaps eight new/changed unit files                         | 54 / 54 pass                                                        |
| OpenIndoorMaps full unit suite                                      | 2,105 pass, 1 fail, 34 skipped                                      |
| OpenIndoorMaps `tsc` and `tsc -p tsconfig.indoor-project.json`      | pass                                                                |
| OpenIndoorMaps ESLint on changed files                              | 11 errors in `pathway-preview/preview.js`, fixed in the next commit |
| `npm run build:pages`                                               | pass; regenerated bindings equal the committed ones (clean tree)    |
| `playwright.visitor-flow.config.ts` against the build               | 5 / 5 pass, desktop and mobile                                      |
| `tests/preview/check-pathway-preview.mjs` on the October 30 preview | PASS, 24 level/viewport checks, 8 screenshots                       |

The single unit failure, `the production worker message path and published
cache hydration preserve canonical shared geometry`, fails identically on the
unpatched base `b227739`. Its worker thread cannot resolve the extensionless
import `heavy-worker-schedule` under Node 22 with `tsx`. It is not caused by
this work. The recorded October 30 checks used Node 24.22.1, which is the
pinned version to use for release runs.

Node 22 has no `--test-isolation=none` flag; use
`--experimental-test-isolation=none` there. Playwright 1.59.1 expects browser
build 1217; with a different local Chromium, set
`PREVIEW_CHROMIUM_EXECUTABLE` for the preview check and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for the visitor flow.

## Reproduced acceptance

The commands in `../unbc-20261030/connections/ACCEPTANCE.md` were rerun
unchanged on a 4-core, 16 GB container.

- The two-cell guide compile again accepted 46 of 47 eligible walks. Its
  `prepared-routing.json` is byte-identical to the October 30 catalog,
  `0b0ab0b1b003eff07cb4b04fab4b63a7b69b1630458a9380c9bdb03e40a05936`.
  Supervisor: exit 0, 115 s, child peak RSS 3.29 GB.
- The normal import, export, guide-on/off comparison and serialized
  production-worker replay finished with `candidate-acceptance-complete`,
  status PASS, zero failures. Supervisor: exit 0, 2,098 s, child peak RSS
  5.61 GB. The normal source import took about 17 minutes here.
- All ten requests give the same availability and the same distances to the
  last recorded digit: 12.216145586002494 m and 12.216145586002492 m for the
  short crossing, 178.21889221661343 m and 177.60849326324396 m for the long
  walk with other-room transit, and six refusals.
- The exported candidate ZIP hash differs (`db4fd5a2…`) only because member
  timestamps differ. All seven members have identical sizes and CRCs.

## Exploratory diagnostics (not acceptance evidence)

These calls used the normal calculator on the verified candidate without
assertions. They are diagnostics for the next decision, not bound receipts.

### Inside-room arrival

The visitor app requests `endpointMode: "inside"`, while all ten acceptance
cases use hallway arrival. With inside arrival on the same candidate:

| Request                     | Hallway-only                      | Other-room transit                 |
| --------------------------- | --------------------------------- | ---------------------------------- |
| 08-216 ↔ 08-260            | available, 12.216 m, door 2311764 | same                               |
| 04-255 → 08-272             | refused (`constraint: hallways`)  | available, 187.241 m, door 2311764 |
| 08-272 → 04-255             | refused (`constraint: hallways`)  | available, 186.630 m, door 2311764 |
| Any of the above, step-free | refused                           | refused                            |

Inside arrival therefore behaves like hallway arrival for these journeys; the
long walk is about 9 m longer because it ends inside the rooms. A bound
acceptance case for inside arrival is still needed before release.

### What blocks the long walk under hallway-only routing

The refusal has zero physical blockers; only the ordinary-room rule stops it.
`08-216 Vestibule` and `08-260 Link` are `circulation: true`, so they are not
the cause. Comparing room owners along the allowed short route with the
transit-enabled long route leaves three Building 04 rooms that only the long
route touches: `04-256 Research Office`, `04-257 Tech Office` and
`04-259 Rotunda`. Owner lists of shared native cells over-approximate actual
transit, so this narrows the cause rather than proving it.

`04-259 Rotunda` (`rm-694-07de695d7751`) is `circulation: false` with unknown
access. A what-if run that set only its in-memory `circulation` flag to `true`
did not answer the question: every request, including the previously
available 08-216 ↔ 08-260 crossing, was refused with "a source path uses a
walking connection outside its verified native floor boundaries or with stale
boundary evidence". The boundary evidence is bound to the room records, so an
unreviewed record edit is rejected, as it should be.

The sanctioned way to test this is the existing per-room reviewed
through-navigation (`app/indoor-project/through-navigation.ts`:
`properties.throughNavigationReview` with notes and a geometry key bound to the
source model), applied through review and a normal regeneration, then replayed
as a bound acceptance case. Whether the Rotunda (or the two offices) should be
crossed by default is a site and policy decision for UNBC.

## Still open

- OpenIndoorMaps commits here could not be pushed from this session
  (GitHub App access refused). Reviter's commit is on
  `claude/dazzling-curie-id7wh1`.
- Door 2315416 on Floor 3 remains unmatched; 08-316 Corridor is the leading
  owner candidate and needs on-site or drawing confirmation.
- Twenty of the thirty inventory requests still need source and route
  evidence. Release gates 2–9 from `../unbc-20261022/HANDOFF.md` remain open,
  and the changed engine bindings require regenerated progressive, route and
  plan assets before any publication.
