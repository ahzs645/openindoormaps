# UNBC rendering and routing follow-up — 2026-10-15

This follows [the October 14 handoff](../unbc-20261014/HANDOFF.md) and the sibling `reviter/docs/UNBC-HANDOFF-2026-10-14.md`. Shared application changes remain local and uncommitted; isolated converter/helper commits are documented separately below. The canonical master, source model, room metadata, GIS registration and navigation permissions have not been promoted or changed.

Latest continuations: [converter integration](CONVERTER-INTEGRATION.md), [source-bound stair review and navigation tests](STAIR-NAVIGATION-FOLLOWUP.md), [implemented progressive delivery](DELIVERY-OPTIMIZATION.md), [complete measured export](PROGRESSIVE-EXPORT-RESULTS.md), and [offline visitor app](OFFLINE-APP-SHELL.md). All seven corrected floor views are sealed: **1.96 MB Brotli / 2.32 MB gzip initial map data**, **68.81 / 88.55 MB complete map data**, and an **88.62 MB portable map-data ZIP**. The separate offline app inventory is 8.72 MB decoded. Metadata-only viewer repacking saves 14.28 MB; progressive loading, verified caches and explicit offline app/map installation are implemented. The final browser passes nine actual route/profile comparisons, all-seven overview captures and complete-map offline reopening with Floor 3 decoding. All 27 owner-confirmed drawing imports are source-bound; all 28 held stairs were rerun with zero errors. Original typed1696006 passes complete width and material, while independent body/terminal correspondence still blocks admission. No held staircase has been enabled. The original paired IFC is preserved; another copy is not the missing evidence.

## Preserved source and earlier prepared-display checkpoint

The requested Reviter branch test is tracked in [converter integration and fresh UNBC retest](CONVERTER-INTEGRATION.md). The three selected extraction fixes and independently found header-boundary correction are applied to the local shared Reviter working tree and preserved as a reviewable two-commit branch. All 18 resulting files match the tested candidate, all 1,212 unrelated tracked/untracked file hashes remain unchanged, and 56 focused shared-tree tests, full TypeScript, scoped lint and the Pages build pass. A fresh original-RVT conversion recovered 108 additional definitions. Fresh all-28 checks increase exact-width proposals from seven to ten; all ten retain conservative physical-material projection overlaps. Exact 3D section/body investigations are separate. Source contours, holes and identities remain exact. This candidate does not replace the canonical delivery source or enable a held stair.

The final converter recommendation includes the separate tested header-boundary correction `5639207`, on `695c41`, saved as local branch `codex/unbc-converter-validated-20261015`. Its 13 new tests reproduce five failures before the fix; all 56 focused cases pass afterward. Fresh original-source scans retain all 184 ordered supplemental frames exactly, so this model's admitted inputs are unchanged. Separate definition-body and mathematical section helpers remain unwired and grant no route approval.

The first current-engine Main progressive preview used **1.725 MB Brotli / 2.060 MB gzip** for initial map/search and a partial manifest with six unavailable scopes. It exposed pale speckles and short white fragments in some buildings. This historical checkpoint is retained separately from the corrected complete export below. On-demand Main detail remains **13.449 MB Brotli / 15.714 MB gzip**; production Chromium confirms no detail or routing download at overview. All transfer totals exclude app traffic.

That first preview is historical. The final corrected manifest revision is `ce04f9a8f556d5383968d68b25b52a3ba1bd72d8877d09f1275756aefa5057c3`, with zero unavailable views and all 228 stored representations checked. Repeated geographic clipping had dropped five complete physical-floor backings. Exact native-coordinate projection restores all 16 Main backings while preserving prepared stair/ramp cuts and current exclusions. The checked white crop improves 1,488 bright pixels to zero and the grey crop 3,346 mismatches to zero; 17 isolated darker mint pixels remain in a bounded crop. An overview-depth experiment did not improve those pixels and was not applied. A flat overview layer covering native 3D is now hidden in that mode, and explicit source/custom-mesh readiness prevents accepting blank pre-indexing screenshots. Preparation/source/route geometry is unchanged. Reports: `/workspace/scratch/unbc-overview-speck-investigation-20261015/REPORT.md` and the final delivery report linked above.

- Canonical master: `/workspace/scratch/unbc-review-20261014/UNBC.master.reviter.zip`, SHA-256 `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520`.
- Model SHA-256: `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`.
- Rooms SHA-256: `f329b643c18c86fa611b0843da0b8c5924b9e211336005eeaf5020c76bffac50`.
- Earlier two-scope preparation engine: `188f49d3e0a5881bfedb9ea46553609fbb0cd38147f364444345742239fe81f8`. The current progressive/performance code is frozen at `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`, 179 modules. New visitor scopes must be freshly prepared under the current binding; the earlier two-scope payload cannot be relabelled.
- Fresh display candidate: `/workspace/scratch/unbc-routing-fix/UNBC.verified-route-display.reviter.zip`, SHA-256 `266367b3ff271e37c6d6ca69c0f891ed7159d0142f6dd1c9cf99b56c3f845590`.

The candidate contains verified Main Floor 1 and Floor 3 caches: two scopes and 42 chunks. Every original source entry is byte-identical to the canonical master. Complete decoded payloads match fresh live preparation. The cache inventory is partial; combined Floor 1 and the other campus-floor variants have not all been regenerated. Individual-building filters still use live preparation. Do not relabel older-engine cache payloads or replace the canonical master with this scratch candidate.

Independent package/checkpoint verification is in `/workspace/scratch/unbc-routing-fix/surviving-evidence-verification.json`. The complete provenance and cache limitations are in `/workspace/scratch/unbc-routing-fix/FINAL-EVIDENCE-HANDOFF.md`.

## Rendering and zoom behavior

Automatic zoom reveal is restored by default. The Map preferences checkbox **Reveal rooms as you zoom** saves an explicit choice in `openindoormaps.reveal-rooms-on-zoom.v2`. The previous v1 overview lock does not suppress the new default. Turning reveal off keeps grey building areas, walls/windows and mint circulation at close zoom; turning it back on restores detail. Real columns and slab/atrium openings remain visible.

The earlier isolated detailed-floor investigation found two speck causes: separately triangulated contained paint pieces exposed subpixel gaps, and physical backing could win individual depth samples over a named floor. Local-coordinate caps, rendering-only exact unions in a dedicated worker and ordered backing-color/area/depth passes resolve those checked samples without editing source rings, elevations or holes. The original display remains available until the derived mesh is ready; cancellation and worker failure retain the original geometry. The separate progressive-overview correction and 17 residual mint pixels are recorded above; neither result certifies every campus pixel.

Room roofs had a separate artifact: extruding the internal boundaries of contained paint pieces created diagonal side faces. Room sides now use the existing per-surface `nativeSurfacePerimeters` transport after visibility cuts. Matching uses the original surface identity; exterior, hole and disconnected-component walls retain their original base and top. Normal side depth testing/writing remains enabled. Derived mesh unions never become selection or route authority; existing vector sources retain picking.

The isolated original-source Floor 3 hallway samples have no pale rendering dots in the checked ordinary/native-height and pitched views. A lower test plane remained hidden beneath physical floor support and visible through the genuine atrium aperture. Close-up roof samples match their source colors. These are scoped visual checks, not a new manual enclosure audit of every campus area.

There is a small remaining raster limit: at the 390×844 mobile camera (zoom 19.2, pitch 35), four pale single pixels remain at the far right edge among 35,506 analyzed hallway pixels. Layer isolation confirms cap/backing antialias coverage, rather than architectural openings. The desktop hallway checks find zero pale pixels in 405,206 samples in each height mode. One shaded side pixel remains in each isolated pitched roof check. Do not call all views pixel-perfect; retain the source holes when investigating these residuals. Details and coordinates are in `browser-proof-renderer-final/RECEIPT.md`.

The bounded offline check finds all four standard MSAA sample positions inside original parts, derived union parts and transported Float32 triangles at each affected pixel. The fitted same-plane mapping has residual at most 5.81e-8 pixels; it does not reconstruct GPU shader arithmetic or depth sampling. No simple source-preserving geometry fix was established. The next rendering investigation belongs in the GPU raster/depth pipeline, not an expansion of the floor footprint. See `mobile-cap-sample-audit.json` and `mobile-cap-all-source-hits.json` in the renderer proof directory.

## Actual calculator results

The latest final-engine audit (`681e71a5…`, 179 reachable modules) passed **nine actual route/profile cases and 112 held-stair direction/profile checks**. Complete route objects, instructions, diagnostics and policies match the historical baseline exactly; source and implementation hashes were checked before/after. Ordinary complete dataset validation ran in the same private immutable session as the calculator. The optional empty ramp display-body fields are now omitted so full schema validation passes; physical ramp triangles and permissions remain unchanged.

Measured validation plus the first route is **1,108.70 seconds** (192.87 s validation + 915.83 s route). The subsequent upward lift route takes 20.67 s. The full audit uses 1,178.05 s process CPU and peaks at 1.69 GiB RSS. Concurrent work and bounded profiling limit comparison: there is no overall cold-speedup claim. The 19.3% CPU reduction applies only to the separately measured exact support-intersection workload. The sealed evidence is `/workspace/scratch/unbc-delivery-optimization-20261015/geometry-performance/final-zone-cold/SEALED-681e-NAVIGATION.json`; [performance report](/workspace/scratch/unbc-delivery-optimization-20261015/geometry-performance/PERFORMANCE-EVIDENCE.md). The older durations below remain historical captures.

The production worker calculator completed exact validation and all four cases on the unchanged canonical input. The full dataset fingerprints before and after are identical.

| Profile and route | Result | Geometry retained |
| --- | --- | --- |
| Public review, 05-136 → 05-173 | 64.8101 m, same floor | Two centered walking runs; original native-door threshold retained. Raw graph: 66 segments; display: six legs. |
| Public review, 05-136 → 05-342 | 43.8852 m, Floor 1 → Floor 3 | Five centered walking runs, original opening/doors and reviewed Library east lift retained. Real curved corridor remains curved. |
| Step-free, 05-136 → 05-173 | Blocked | Unconfirmed connections remain excluded. |
| Step-free, 05-136 → 05-342 | Blocked | Elevator presence does not confirm a step-free route. |

The lift transition remains `connector:unbc-05-library-east-lift:0:2`, XY `(144.9, 188.6)` feet, Z `0 → 24.278215223097114` feet, native levels `311 → 400176`. All retained source door/opening/lift polylines match their oriented source geometry exactly. The sub-foot same-floor leg is the original 0.9323 ft door threshold, not a grid zigzag.

The first cold production calculation took 708.85 seconds; the warm cross-floor calculation took 24.98 seconds. Validation now finishes, but cold performance remains substantial. Exact bounds rejection, indexed lookups, source-bound support tiles and operation-local exact route/centering queries remove repeated work without weakening boundary, hole, obstacle or access checks. Whole-project boundary evidence also moved out of ordinary visitor rendering into a coordinated authoring worker.

Public access remains unknown for 61/79 provenance areas in these two examples; step-free access is unconfirmed for 20/15 connections. The route-review UI no longer claims that every room in a shared circulation cell was physically traversed. That text correction does not remove conservative access evidence from the route policy.

## Screenshots and their provenance

The final production browser artifacts are under `/workspace/scratch/unbc-progressive-delivery-20261015/browser/`:

- `final-seven-floor-gallery/index.html`: seven actual overview screenshots, all normal floor-selector choices, reveal disabled, zero detail/context/routing GETs and zero page/console errors. The raw transport log retains one cancelled startup HEAD probe; no failed GET was hidden.
- `unbc-corrected-final-ui/`: actual Theatre–Agora step route in 2D/native 3D and a responsive mobile viewport, step-free refusal, Library lift arrival, detail/overview and mode inventories. These come from ordinary requests to the real worker; no saved route output is injected. All nine unique reference cases pass again. Only existing place/floor display messages differ; routes, diagnostics and other instruction fields match. The first lower-lift image is explicitly superseded in `capture-provenance.json` because it preceded viewport tile paint; do not present it as a verified screenshot.
- `unbc-complete-final-lift/`: a separate fresh ordinary-UI Library lift calculation directly against complete manifest `ce04…`, matching the sealed 43.885246 m route, diagnostics and non-display instruction fields. Its cold request takes 322.416 s including transfer/full validation/calculation, with overview only resident during validation. Both `actual-lift-lower-viewport-ready.png` and `actual-lift-upper-viewport-ready.png` were independently viewed and accepted after waiting for the current viewport's source tiles and a later rendered frame. They show the actual departure/arrival blue legs and selected room on Main/Floor 3.
- `actual-complete-offline/`: explicit complete-map/app save, fresh offline navigation and actual Floor 3 decoding on complete manifest `ce04…`, with zero page errors. This session does not repeat the expensive campus calculator offline; the final-bundle synthetic offline calculator check is separate.

The nine-case actual route browser uses corrected Main/Floor 3 preview manifest `d59e…`; its source, engine, prepared scope and route assets are identical to complete manifest `ce04…`, independently checked. The fresh lift calculation, complete-map gallery and offline test use `ce04…` directly. Final app inventory: `bc41b4b9…`, 33 files / 8,721,908 decoded bytes. The final real Theatre–Agora cold request takes 380.532 s. Earlier same-floor cold routing takes 715.666 s; different first cases and concurrent load do not establish a controlled improvement. Active browser memory remains substantial. See [client verification](PROGRESSIVE-VISITOR-CLIENT.md).

The following screenshot inventory is an **earlier replay checkpoint**, preserved with its explicit provenance:

Actual calculator output: `/workspace/scratch/unbc-routing-fix/final-centered/real-routes.json`, SHA-256 `10e587d9d3c4d57b57ae0528fb8b81a4abf838d9757ac0d4064bf22677a05cfd`.

The earlier live browser independently returned exactly the same same-floor paths and distance. After its process ended, the final route captures replayed the saved, fully validated calculator outputs through the UI. Both complete public route objects match the actual output. The final capture is not another cold route calculation. `browser-proof-final/replay-provenance.json` and `ui-route-equality.json` record this explicitly.

Final route/zoom screenshots are under `/workspace/scratch/unbc-routing-fix/browser-proof-final/`:

- `same-floor-05-136-to-05-173.png`;
- `cross-floor-departure-05-136-to-05-342.png`;
- `cross-floor-departure-directions.png`;
- `cross-floor-arrival-elevator.png` — actual elevator instruction click selected Floor 3;
- `mobile-cross-floor.png`;
- `step-free-blocked.png`;
- `auto-overview-17.png`, `auto-reveal-19.png`, `permanent-overview-20.png`, `auto-reveal-restored.png`.

The saved setting check passed `true → false → true`; automatic reveal was restored at the end. Page errors were empty. Source/prepared-asset checks remained active. Visual imports reused previously completed canonical import audits with recorded immutable input bindings; normal product import validation is unchanged.

Fresh current-code 3D UI receipts are under `/workspace/scratch/unbc-routing-fix/browser-proof-renderer-final/`; detailed floor, roof and depth checks are under `/workspace/scratch/unbc-review-20261014/dot-audit/`. The renderer-only UI run requests no routes and skips only unused route warmup. It uses the real product renderer and floor preparation.

## Checks

Latest separate checks pass: shared Reviter converter/framing 56/56 with zero skips, full TypeScript, scoped lint and Pages build; final progressive delivery 12/12, scoped TypeScript/lint; final visitor six lifecycle regressions, four browser assertions, full TypeScript/lint/build; nine actual campus route/profile comparisons and complete-map offline/gallery acceptance. The converter-candidate all-28 source audit and canonical navigation checks have different dataset bindings and are not combined into a successful-held-stair count. Logs/receipts are linked in the continuation reports above.

Earlier renderer/routing checkpoint:

- 232 focused regression tests passed, including exact boundary/hole behavior, immutable input handling, route refinement, source transition anchors, worker coordination and renderer geometry.
- Scoped TypeScript check passed.
- ESLint: zero errors; 18 existing warnings.
- `npm run build:pages` passed in 50.63 seconds.
- `git diff --check` passed.

Logs are `/workspace/scratch/unbc-routing-fix/final-v2-{tests,typecheck,lint}.log` and `final-v5-build.log`.

## Remaining work

1. Reduce cold validation/preparation cost. The latest sealed final-engine route profile spends most of its samples in exact obstacle `DIFFERENCE` operations under `nativeCirculationExactCellParts`, particularly rational GCD and sweep comparison. Earlier source-wall normalization and ramp preparation findings remain separate display workloads. Consider operation-local exact reuse and indexed queries while preserving original holes, physical predicates and worker limits; do not infer a whole-route speedup from the support-intersection microbenchmark.
   Investigate the four remaining mobile edge samples separately through GPU raster/depth tracing; do not widen floor geometry or fill real openings to hide them.
2. Reduce active-floor memory and indexing cost. All seven prepared scopes and their codec/source bindings are now complete; the 128 MiB decoded-floor retention limit does not cap the active graph, source indexing, custom meshes, GPU buffers or calculator. The first actual browser sampled 4.42 GB combined RSS. Separate paint from picking or use a bounded/tiled drawing representation while retaining original geometry and verify on real target hardware. Individual-building filters still use live preparation. Publication/deployment remains separate from this local completed export.
3. The four unreached corridor-side doors now have a fresh bounded read-only diagnosis: **1501543 (10-1302)** crosses an exact derived shell seam; **1501551 (10-1312)** occupies isolated cell 480 outside its own half; **1501582 (10-1060)** has an exact-supported local proposal missed by the coarse grid; **1780077 (06-364)** has an exactly disconnected own-half/cell join. The two extremely small derived seams are not evidence of physical voids and were not filled. The 1501582 candidate still requires every normal material/door/access guard and regenerated circulation. A six-minute full-context attempt was capped before a result; no complete visitor route was approved. Report: `/workspace/scratch/unbc-four-door-review-20261015/REPORT.md`; receipt SHA-256 `c19c11f7793d59bcdd4402d07b4b5b03958201189342ff0db75b56aa77e09c67`. The full campus reachability audit was not rerun; 1,535/1,842 remains the historical baseline.
4. The user authorized the stair review on October 15. All **28 held stairs** have been inventoried and probed against the freshly decoded original RVT; the controlled fresh converter comparison increases standard-constructor full-width proposals **7 → 10**. All ten retain conservative plan/height-band material overlaps; those projections do not prove exact 3D collisions. The separate original-typed1696006 control passes width/material but not body/terminal/headroom/circulation. All 38 original stair-run frames replay completely. Additional physical IFC/Autodesk bodies are recovered; complete placed-body correspondence, terminals, clearance and fresh circulation still gate qualification. Source fixes and concrete blockers are in [STAIR-NAVIGATION-FOLLOWUP.md](STAIR-NAVIGATION-FOLLOWUP.md); [STAIR-REVIEW.md](STAIR-REVIEW.md) preserves the preceding checkpoint. All 28 remain disabled. Nine fresh canonical calculator cases and 112 held-link direction/profile checks passed, including the existing **#1644499 local steps** between **Theatre 09-200 and Agora 07-180** in both directions. These split-level local steps are not one of the 28 held inter-floor links.
5. Obtain owner/field accessibility evidence for walking branches, doors, approaches and lifts. Separately qualify local steps **04-124 and native element 1620957**. Do not infer accessibility from a lift symbol or a successful public-review route.
6. Before any later source correction or promotion, follow the original handoffs: DWG authority, reversible tagged patches, immutable decision files, compiler/runtime parity, preserved model/GIS bytes, fresh audits and canonical hash checks. Publishing/promoting these local changes remains separate work.
