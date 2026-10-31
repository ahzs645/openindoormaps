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

## Additional bound acceptance runs

Both runs use the same verifier, supervisor, run-1 master and 46-guide catalog
as the reproduction above, with new case files kept byte-exact. Their
`casesSha256` values in each `REPORT.json` equal the committed files. The
implementation graph is `65fd6159…`, identical to the October 30 run.

### Inside-room arrival — [inside-arrival/](inside-arrival/)

The visitor app requests `endpointMode: "inside"`; all ten October 30 cases use
hallway arrival. [ROUTE-CASES-INSIDE.json](ROUTE-CASES-INSIDE.json) repeats
those ten cases with only the arrival mode changed. Result: PASS, zero
failures, normal and production-worker results identical (1,653 s, child peak
RSS 5.57 GB).

| Request                                 | Hallway-only                                        | Other-room transit                                      |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| 08-216 ↔ 08-260                        | available, 12.216 m, door 2311764, one shared guide | —                                                       |
| 04-255 → 08-272                         | expected refusal                                    | available, 187.241 m, door 2311764, three shared guides |
| 08-272 → 04-255                         | expected refusal                                    | available, 186.630 m, door 2311764, three shared guides |
| Step-free, both settings and directions | expected refusal                                    | expected refusal                                        |

### Corridor-to-corridor with default settings — [corridor-link/](corridor-link/)

[ROUTE-CASES-CORRIDOR.json](ROUTE-CASES-CORRIDOR.json) checks the link between
Building 04 and Building 08 corridors with the visitor default, hallway-only
routing. Result: PASS, zero failures (1,667 s, child peak RSS 5.55 GB).

| Request (hallway-only)            | Walking                                      | Strict step-free |
| --------------------------------- | -------------------------------------------- | ---------------- |
| 04-204 Corridor → 08-267 Corridor | 122.051 m, door 2311764, three shared guides | expected refusal |
| 08-267 Corridor → 04-204 Corridor | 122.040 m, door 2311764, three shared guides | expected refusal |
| 04-237 Corridor → 08-205 Corridor | 118.788 m, door 2311764, three shared guides | expected refusal |
| 08-205 Corridor → 04-237 Corridor | 118.631 m, door 2311764, three shared guides | expected refusal |

**The Floor 2 Building 04–08 link works with the default visitor setting.** The
hallway-only refusal of 04-255 ↔ 08-272 is specific to that endpoint, as
explained below. Access to all these areas is still `unknown` in the source,
and the step-free refusals remain correct.

## Why 04-255 ↔ 08-272 needs other-room transit

04-255 Research Office opens directly onto 04-244 Corridor (door 1108666).
04-244 Corridor is `circulation: true`, but every one of the 23 saved walking
edges in its native cell `native-cell:14.435696:561` has the owner set
{04-244 Corridor, 04-245 Vestibule, 04-256 Research Office, 04-257 Tech Office}.
The two offices each also have their own door onto the corridor (1183029 and
1182981). Under hallway-only routing, walks that touch those office owners are
treated as ordinary-room transit, so no destination on 04-244 Corridor can
leave it. 04-244 Corridor ↔ 08-202 Corridor is refused for the same reason
([diagnostics/corridor-link-exploration.jsonl](diagnostics/corridor-link-exploration.jsonl)).

Two exploratory what-if runs used the editor's own `reviewArea(...,
{ throughNavigation: true, notes })` in memory on the candidate, with nothing
saved ([diagnostics/through-navigation-whatif.jsonl](diagnostics/through-navigation-whatif.jsonl)):

| Reviewed areas                            | 04-255 ↔ 08-272, hallway-only                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 04-259 Rotunda only                       | still refused                                                                                    |
| 04-259 Rotunda, 04-256 and 04-257 offices | available: 175.201 / 171.735 m hallway arrival, 180.823 / 179.563 m inside arrival, door 2311764 |

Reviewing the Rotunda alone shortens the corridor journeys by about 4 m
(04-204 ↔ 08-267 118.2 m) but does not free 04-244 Corridor. A room review also
changes the source geometry key, so the guide catalog no longer applies and
routes fall back to original walks (08-216 → 08-260 becomes 11.690 m). Any
accepted review needs a fresh guide compile and replay.

The likely correct fix is not to mark two offices as through-passages. If
04-256 and 04-257 are enclosed offices, their inclusion in the corridor's
native circulation cell is a source-boundary leak to inspect in Reviter (both
sides of each office door, walls and room separation lines), followed by a
regenerated master. If they are open alcoves, a reviewed through-navigation
is appropriate. This needs a drawing or site check.

A first exploratory attempt instead set only `circulation: true` on the
Rotunda record. Every route, including the 08-216 ↔ 08-260 crossing, was then
refused for stale boundary evidence: unreviewed record edits are rejected.

## Still open

- OpenIndoorMaps commits here could not be pushed from this session (GitHub App
  access refused). Reviter's commit is on `claude/dazzling-curie-id7wh1`.
- Door 2315416 on Floor 3 remains unmatched; 08-316 Corridor is the leading
  owner candidate and needs on-site or drawing confirmation.
- Native cell 561 (04-244 Corridor with offices 04-256 and 04-257) needs the
  boundary check above.
- Twenty of the thirty inventory requests still need source and route
  evidence. The October 22 release gates remain open; see
  [RELEASE-GATES.md](RELEASE-GATES.md) for what was attempted here.
