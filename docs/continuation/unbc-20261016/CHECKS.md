# Consolidation checks — October 16, 2026 (Vancouver)

These checks cover preserved working changes and integration of the already
published viewer into the newer source tree. They do not certify a newly
regenerated campus map. No full campus regeneration was launched for this sync.

## Current source checks

| Repository/check                                                                 | Result                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Reviter full TypeScript (`node node_modules/typescript/bin/tsc --noEmit`)        | Pass, exit 0                                                  |
| Reviter 69 changed test files                                                    | 442 total: 422 passed, 20 skipped, zero failed; 67.84 seconds |
| Reviter Pages build (`node scripts/build-pages.mjs`)                             | Pass, exit 0                                                  |
| OpenIndoorMaps full TypeScript (`node node_modules/typescript/bin/tsc --noEmit`) | Pass, exit 0 after excluding archived `docs` probes           |
| OpenIndoorMaps 100 changed/integrated test files, initial run                    | 628 total: 622 passed, 5 failed, 1 skipped; 101.35 seconds    |
| OpenIndoorMaps final affected-family replay                                      | All 49 tests passed, zero failures/skips; 12.96 seconds       |
| OpenIndoorMaps Pages build                                                       | Pass, exit 0; 24.88 seconds                                   |

The five initial OpenIndoorMaps failures were in three stale synthetic fixture
families. After their corrections, those **three families only** were replayed;
the other 97 passing files were unchanged. Across the selected 628 unique tests,
the latest results are 627 passes and one skip. This is not one uninterrupted
all-green 628-test run. Reviter's 20 skips and the single OpenIndoorMaps skip
are not counted as passes; source-dependent tests need their declared inputs.

Corrections were confined to test/config maintenance:

- `centered-route.test.ts`: the positive source-door aperture now matches its
  half-foot wall instead of containing both route endpoints inside a two-foot
  aperture. Added the explicit refusal for the original over-broad aperture.
  Production finite-crossing checks were not relaxed.
- `overview-floor.test.ts`: retain the exact native-feet carrier required by
  strict physical overview projection. Existing hole/obstacle checks remain.
- `published-floor-decoder.test.ts`: bind its synthetic publication to the
  current engine so its checksum/refusal tests actually exercise that decoder.
  No real publication receipt or historical engine hash was rewritten.
- `tsconfig.json`: exclude `docs` containing archived probe and before/after
  source snapshots; current app/scripts/tests remain in the full typecheck.

The build command was:

```sh
SITE_DEMOS=hospital PAGES_BASE_PATH=/openindoormaps/ node node_modules/vite/bin/vite.js build --mode pages
```

The build retains the current 195-module preparation binding:
`33803571dd73acbd005931d25d0f936e42a9516c47ccf66ab948bed18f96308f`.
The live Site still uses its independently checked older 179-module binding.
The compiler engine identity is not changed to reuse that old cache. The build
reports large-chunk and GeoJSON plugin-time warnings; these are still useful
performance work, not failures or measured improvements.

## Current desktop/mobile proof

The newly consolidated production build was served locally. Real desktop
(1440×1000) and mobile Chromium (390×844, touch) verified the viewer header's
Download latest map ZIP link, new download route, all real package parts,
complete saved ZIP hash/length, explicit newer-package recheck, no horizontal
overflow and zero download-page worker initialization. A separately labelled
synthetic delay checked cancellation followed by real retry. Both saved ZIPs
match the published 45,290,239-byte SHA-256. There were no captured page errors.
See [results.json](checks/results.json),
[desktop](checks/desktop-verified-download.png) and
[mobile](checks/mobile-verified-download.png).

The viewer header was closed before expensive full import. These focused UI
checks do not establish new floor paint, navigation or geometry acceptance.
They are local build checks, not a fresh live Site publication check.

## Replaying the selected tests

The exact selected file lists and raw initial/final logs are in [checks/](checks/).
From either corresponding repository, use the relevant JSON list as Node test
arguments, for example:

```sh
node --input-type=module -e 'import fs from "node:fs"; import {spawnSync} from "node:child_process"; const files=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const r=spawnSync(process.execPath,["--import","tsx","--test","--test-concurrency=4",...files],{stdio:"inherit"}); process.exit(r.status??1)' /absolute/path/to/reviter-test-selection.json
```

For subsequent repairs, replay only the changed production predicate and
physical/policy dependencies first. The final fixture-family command is:

```sh
node --import tsx --test --test-concurrency=4 tests/unit/centered-route.test.ts tests/unit/overview-floor.test.ts tests/unit/published-floor-decoder.test.ts
```

## Integration and data limits

All original dirty files were first committed byte-for-byte: 516 OpenIndoorMaps
paths and 231 Reviter paths. Separately published Site source changes were
reviewed against their pre-Site base and merged into current OpenIndoorMaps.
The newer physical compiler was retained. Explicit conflict resolutions and
input comparisons are saved in `checks/`; the original Offline map label was
retained in the integrated header. Other local experiment branches are kept in
the offline Git bundles; their unwired prototypes were not blindly merged.

The original long-running compiler exited 1 on its admitted-arrival preservation
assertion. All 28 held stair links remain disabled. The prior accepted calculator
and desktop/mobile live-release evidence in [HANDOFF.md](HANDOFF.md) belongs to
that publication, not to this merged main source. There is no fresh map import,
new stair approval, full pathway matrix, or physical-phone performance result.

The separately verified portable data archive is 1,271,906,669 bytes, SHA-256
`24119b663b78afc8250ceeefd13f5a0854a3c94a29f0d566d97961bd5f375253`.
Its independent full readback verifies 2,771 payload paths (including 647 content
deduplicated hard links) and explicit omitted-cache inventory. That check grants
transfer integrity, not geometry or route approval.

Final source/staged whitespace checks pass with raw evidence logs excluded.
Those logs retain their original diagnostic whitespace and bytes. Strong
private-key, GitHub-token and AWS access-key pattern scans found no matches
in the newly added/modified handoff and integration paths.

## Post-push GitHub checks: unresolved compiler debt

GitHub exposed additional coverage beyond the selected changed-file tests.
This is **not an all-green CI baseline**:

- Reviter [CI attempt 2](https://github.com/ahzs645/reviter/actions/runs/38993348033/attempts/2)
  passed TypeScript with the current sibling main. Its full suite had **2,210
  tests: 2,186 passes, two failures and 22 skips**. The failures are the compiler
  deterministic-Math audit (11 source matches across seven files) and
  `native-local-transition-qualification.test.ts`'s run-owned Treads/Risers
  material case (element 12 is currently refused as foreign). Investigate these
  against actual source ownership; do not weaken the audit or material veto to
  pass a test. Autodesk's later separate step was skipped.
- Reviter [Pages](https://github.com/ahzs645/reviter/actions/runs/38993348013)
  stops at **140 lint errors and 82 warnings**. Previous main also failed lint;
  current findings span unchanged and preserved changed files. The exact log
  and changed-path inventory are retained. No lint rules were suppressed.
- The first Reviter CI attempt checked out the *old* sibling OpenIndoorMaps
  commit between the two main pushes, causing a parity-signature type error.
  The second attempt above corrects that checkout and is the relevant result.
- OpenIndoorMaps' first remote routing check exposed an additional stale
  `indoor-project.test.ts` tampering fixture: metadata references now reject a
  removed native stair field before the older semantic guard. The fixture now
  checks that early rejection explicitly, then repacks the original logical
  metadata to exercise the independent source/material refusal. Both refusal
  guards remain intact. Its entire 67-test family passes, and a fresh scoped
  project TypeScript check passes. This is separate from the earlier 628-test
  selection. No production source or preparation binding changed in this fix.

See [post-push-ci.json](checks/post-push-ci.json),
[compiler failure excerpts](checks/reviter-ci-failure-excerpts.log),
[lint inventory](checks/reviter-lint-inventory.json) and
[final package-family replay](checks/metadata-fixture-family-final.log).
The final source/push receipt outside Git records the definitive heads and any
later remote checks. These compiler CI blockers belong in the next targeted
repair queue alongside the map rebuild's two arrival losses. Code preservation
and transfer verification do not certify a new publishable campus map.
