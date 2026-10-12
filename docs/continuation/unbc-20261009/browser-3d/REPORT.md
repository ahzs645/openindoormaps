# Browser import / Floor 1 2D→3D: instrumentation, lifetime fixes, headless measurements (browser/3D agent, 2026-10-09; transcribed by coordinator)

ZIP 7fd503d4… (292 MB). Fix commits: 20c8c41, 2e6d322 (first set) and the "keep floor worker dataset resident" commit (second set).

## Status
Mac crash not reproduced. Chromium 141 headless, 390×844, SwiftShader, first fix set: import → Floor 1 2D → 3D rooms on the four-level scope succeeded (878 s after click), no OOM/fatal lines, page responsive. Current engine (2ee8d4ff, then bccce1d0) ≠ ZIP engine 14e1d7a7, so every scope was prepared live (2D ~21 min, 3D ~14.5 min); the prepared-asset decode path that crashed on the Mac was never exercised. No desktop before/after yet. Improved and instrumented; cause unproved; 3D verified once on mobile on the live path only.

## Measurements (runs/after-mobile)
- Import 731 s (Mac ~192 s): geometry checks 187 s, mapping validation 321 s, reviews 42 s, patches 27 s, worker→main ~15 s.
- Dataset clone to floor worker 3.4–5.9 s main-thread each; 2 at mount (dev StrictMode), 1 more on 2D→3D because the oversized 2D result disposed the worker; worker receive ~8 s.
- 2D (3 levels, live): native faces 978 s, prepareFloor 299 s; result 545 MB; main deserialization 2.06 s, +760 MB heap; layer effect 202 ms / 14 uploads.
- 3D (4 levels, live): native faces 558 s, prepareFloor 303 s; result 556 MB; deserialization 2.01 s; wall mesh 1,472,016 vertices / 35.3 MB in 644 ms; layer effect 761 ms.
- Peaks: main heap 1.06 GB, backing store 1.17 GB, renderer 5.43 GB, GPU 0.20 GB. GC isolates in one renderer: 1.72, 1.59, 1.06, 1.0 GB — most plausible pressure mechanism for the Mac crash, not proved.
- Partial baseline at bc2adc6 (killed at 449 s): same pattern; total memory 5.1 GB during mapping validation.

## Changes
First set: opt-in diagnostics (`floor-diagnostics.ts`, `localStorage["oim:diagnostics"]="1"`); prepared-asset decode buffers/wire pool released before restore/checksum (checks unchanged, same order); package worker drops the transferred ZIP after unzip; full custom-layer teardown incl. window glass/frames, perimeter/window sources emptied while loading, separate exposed-walls memo, memoized glazing inputs; typed cached precision wall meshes (bit-identical).
Second set: resident dataset (oversized result no longer disposes the worker); StrictMode adoption of identical re-requests; display-only transport for 3D/relative/review views with a separate cache key; stale-engine notice in the preparing panel and console.
Not changed: no validation weakened; dataset buffer transfer impossible (plain object graph); typed/per-level result wire format still open (see prepared-payload/REPORT.md in the run).

## Checks
127/127 related tests incl. 12 new; scoped typecheck clean; build:pages passes (engine binding regenerated).

## Next
1. Desktop 1280×800 before/after on a display-prepared ZIP whose engine matches the code under test, to measure the decode path.
2. Re-measure the second fix set (expect one dataset clone at mount, none on 3D switch, smaller 3D reply).
3. Localize any decode-path crash with the markers and per-isolate GC peaks; fallback is lazy per-level 3D transport.
Kit: RUN/browser-3d/driver (run-import-3d.mjs, run-under-lock.sh, make-after-copy.sh, analyze-run.mjs).
