# Directions entry guards — 2026-10-16

The current full visitor interface returns immediately for all **115 baseline destinations without an arrival**, and for identical From/To identities. A real component/effect test exercised **460 missing-entrance combinations** and **3,728 same-identity combinations** with **zero routing requests, worker constructions, worker messages, heavy-scheduler starts or physical-geometry reads**. The separate compact viewer did have a same-identity preparation bug; its eight-line early-return fix is implemented and tested.

These are **simulated-DOM component/effect and actual-handler tests**, not desktop/mobile browser, hosted deployment, complete map-loading or completed navigation-calculator evidence. The current valid-route crash and cold geometry-check time remain separate work.

## Full visitor: actual hook and panel

The full `/projects/indoor` page passes its dataset and selected keys directly to `useProjectRoute`, then forwards that hook's calculating/preparing/diagnostic state to `ProjectNavigation`. The unchanged hook calls `sameRoutePlace` and `missingRouteEntrance` before its warmup/request effects. Either condition sets `noRouteWork`, disposes any route client worker, returns no route and makes both calculating and preparing false. Identical display labels do not establish identical identities.

The test mounts the **actual** `useProjectRoute`, `ProjectNavigation`, `MapProvider`, scheduler and `RouteWorkerClient` with React DOM under **happy-dom 21.0.3**. It uses the preserved original **1,864 records, 5,476 nodes and 7,063 edges**. The 115 missing keys are checked against both their original source records and the checksum-bound completeness inventory; all 115 genuinely lack `arrivalNodeId` in these inputs.

| Case set | Actual combinations | Result |
| --- | ---: | --- |
| Every missing destination as From and as To, Walking and Step-free | **460** | Preparing/calculating false; actual panel shows “An entrance is unavailable for one of these places.” |
| Every original record identity selected as both From and To, both profiles | **3,728** | Preparing/calculating false; no route work |
| Same-identity panel samples, both profiles, including both original Agora records | **8** | Actual panel shows “Departure and destination are the same place. Choose another destination.” |

Before any positive control, the complete observation checkpoint is **0 requests, 0 workers, 0 messages, 0 heavy-job starts, 0 physical-property reads**. Throwing read sentinels protect `circulationGeometry`, walking support and material-section properties. This is an execution test of the real hook effects and panel states; the destination inventory alone is not treated as UI proof.

The positive control selects the distinct actual **05-136 → 05-173** identities. It must reach the original client request, schedule one route job, construct one controlled transport and post one payload; both preparing and calculating become true. That control passes, establishing that the harness is capable of observing preparation. The controlled transport intentionally does not execute the native calculator.

Changing that pending valid request to a missing destination terminates it immediately, clears preparation/calculation and shows the entrance message. A separate valid request queued behind floor work is changed to a missing destination before the slot is released; releasing the slot does not start the obsolete route. Original records, graph fields and inputs remain unchanged.

The [complete result](directions-entry-evidence/actual-hook-and-ui-results.json.gz) retains every key/profile/orientation outcome and the control/cancellation checkpoints. The [source preservation receipt](directions-entry-evidence/source-preservation-and-fix-receipt.json) verifies the 2,176 bundled source inputs and both 946-file compiler snapshots unchanged.

## Compact viewer: reproduced and fixed

The separate `/projects/visitor` interface uses `ProgressiveRouteClient` rather than `useProjectRoute`. Its existing dropdowns exclude records without arrivals, but its `calculate` handler previously accepted identical From/To keys, set “Loading and checking directions…” and sent an initial routing-delivery request. The downstream worker would load routing data and validate it before considering those endpoints.

`app/pages/progressive-visitor-page.tsx` is **outside both** `regeneration-source-v3-final-before.json` and `regeneration-source-v3-r1-before.json` (946 files each). The fix imports the existing identity helper and returns before controller creation, worker-slot waiting, scheduler reservation or routing request. It calls the existing reset routine and shows the same useful same-place message as the full viewer. The exact [eight-line additive diff](directions-entry-evidence/compact-same-origin-fix.patch) preserves all other page behavior and all preexisting work.

The new test, `tests/unit/progressive-route-entry.test.ts`, executes the **actual page's calculate, reset and slot-wait handler source**, extracted by TypeScript AST and transpiled unchanged. It uses the real shared identity helper, actual `ProgressiveRouteClient` and scheduler; only transport is controlled. This avoids importing or running the page's WebGL/map loader in Node.

- **Before the fix:** the same-identity regression failed because the actual handler constructed one worker when zero were expected. The two other controls passed.
- **After the fix:** same identity sends no request or delivery intent for both profiles and shows the useful status. Distinct identity keys still send the initial checked routing-delivery request for both profiles; the handler does not compare display names. Unselected endpoints send no request.
- **Final checks:** all **eight** targeted tests pass (three handler tests plus five existing visitor-efficiency tests), scoped strict TypeScript passes, and the production Vite build passes in **27.66 seconds**. Build output is isolated in scratch and has not been deployed.

The [before regression](directions-entry-evidence/compact-handler-before-fix.log), [passing tests](directions-entry-evidence/compact-handler-after-fix.log) and [build log](directions-entry-evidence/app-build.log.gz) are retained. The scoped typecheck completed with exit zero and no diagnostics.

## Limits and preservation

The simulated DOM includes the real map context provider **without a map canvas**, so it starts no MapLibre/WebGL map. Full physical geometry and floor display metadata are omitted from the test projection; the latter use the UI's generic “Floor” fallback. The guards only need the exact original records and actual graph-size counts. This test does not load a ZIP, run import validation, prepare a floor, render a map, measure device memory or confirm any valid route's geometry. It also does not establish which code revision the hosted site currently serves.

No frozen routing/compiler source, original room, doorway, floor opening, graph edge, access decision, step-free flag, canonical archive or hosted publication changed. The two snapshot inventories still contain 946 unchanged files each. The only product edit is the compact page's same-identity early return; the focused handler test is new. The page and several neighboring source files were already untracked in the shared workspace, so a full before copy and exact additive diff are retained rather than treating an empty Git diff as preservation evidence.

A valid request still intentionally reaches the checked route worker. Its calculation speed and crash resistance need the separate fresh-candidate calculator/memory tests. This entry-guard audit must not be used to claim that missing entrances are repaired, every pathway works or step-free coverage improved.

## Reproduction

The full component harness and pinned scratch-only dependency installation are under `/workspace/scratch/unbc-pathway-repair-20261015/route-entry-component-qa/`. `build-probe.mjs` bundles the unchanged source; `bootstrap.mjs` initializes happy-dom and runs `probe.tsx` with actual React effects. The harness explicitly exits after assertions and cleanup because a DOM scheduler can retain Node MessagePorts. No browser-control, Playwright or CDP session was used.

The compact handler tests run with:

```sh
node --import tsx --test tests/unit/progressive-route-entry.test.ts tests/unit/visitor-route-efficiency.test.ts
```

The [evidence manifest](directions-entry-evidence/evidence-manifest.json) records every receipt/script hash, dependency versions, baseline inputs, and scoped-check/build commands. Actual original records SHA256 is `fea2bbd337b6d2767d5a02c5d7cbb9e9ac9d7fff5078c3160c49748b93f3f110`; baseline visitor SHA256 is `6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22`.
