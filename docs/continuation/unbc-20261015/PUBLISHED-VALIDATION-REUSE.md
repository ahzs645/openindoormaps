# Reusing validation for the published UNBC map

The hosted full OpenIndoorMaps interface now reuses the successful validation of the exact published visitor ZIP, then consumes the existing verified progressive floor payloads. This removes the repeated opening-time geometry, graph, materials and mapping validation for this known package.

## Admission and integrity

The trusted receipt is compiled into the application in `published-project-receipts.ts`; a downloaded manifest cannot supply its own approval. It binds the package SHA-256, byte count, every ZIP entry SHA-256 and length, source identities, validator engine digest, progressive revision, and successful full-import report digest.

- Package: `6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22`, 45,290,239 bytes.
- Dataset: `f4761c369fd010e48b95e18a467b3adae76723220523b4cf54821f10bc2cafd8`.
- Validator/prepared engine: `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`.
- Progressive revision: `ce04f9a8f556d5383968d68b25b52a3ba1bd72d8877d09f1275756aefa5057c3`.

Each opening still verifies the ZIP and entry checksums, decodes the original dataset and hydrates its metadata. A changed ZIP or stale validator uses the original full importer. Ordinary manual/local imports continue through full validation. Add `validation=full` to the full workspace's hash-route query to deliberately rerun full validation. The underlying validator and prepared engine graph are unchanged.

The receipt was generated from the earlier successful actual UNBC normal-import run at `/workspace/scratch/unbc-full-interface-20261015/full-import-proof.json` (632,996 ms). That full run was not repeated for this change.

## Full interface and floor loading

The original full workspace, combined floor controls, original geometry, source inspection, 2D/3D modes, and binary-preview link remain. For an exact supported published scope/options combination, its overview appears first, followed by its prepared details. The same checked prepared-floor bridge supplies the native display, avoiding a second live whole-map preparation pass. Zooming does not restart the selected-floor request.

The preview can fit the floor before its details finish. Unsupported building-specific scopes, review/editing, source changes or display options without a published payload use the existing live preparation path and may still be slow. Runtime directions and access checks remain in place. No held stair links were enabled.

The 45.3 MB core ZIP still contains campus-wide geometry and navigation data. Only the additional prepared display assets are selected by floor; this does not yet split the core into separate 2D, 3D and navigation downloads. The separate 9.73 MB binary preview remains a prototype and is not the full viewer's core format.

## Validation and measured performance

Evidence: `/workspace/scratch/unbc-published-load-20261015/`.

| Check | Result |
| --- | --- |
| Integrity, source identity, fallback and scope selection unit tests, plus existing hosted/precision tests | 16/16 passed |
| Scoped application and changed-test TypeScript check | Passed |
| Production build with hospital reference retained | Passed |
| Actual UNBC fast import | Transfer-ready at 12,486 ms; 19,810 ms including additional post-import dataset parity auditing |
| Combined actual core + selected main-floor replay | Core 8,477 ms; overview 9,545 ms; prepared floor decoded at 49,116 ms |
| Prepared floor integration | 2,128 regions, exact three main-floor native levels, original verified display bridge |
| Progressive requests | Only selected-floor details, shell/context and overview; no other floor detail scopes or separate routing asset |

These are local Node/decoder measurements using actual source bytes and filesystem-backed fetches, not browser end-to-end load timings. Download latency, browser worker transfer, WebGL rendering and device performance are additional. Browser JS/CUA tools were unavailable for fresh desktop/mobile visual QA; the full UI has not received a fresh visual sign-off in this change.

All progressive map assets, core package parts, binary preview, source dataset identities and engine binding are preserved byte-for-byte. No room areas, native surfaces, access restrictions or navigation graph were changed.

## Directions crash follow-up

The user reported a crash while calculating directions. Production Site error logs returned no errors; browser renderer/worker failures are not proved or ruled out by those server logs.

Code inspection found a concrete worker-startup race: after an idle floor worker is terminated by the route/warmup reservation, its heap remains resident during tracked teardown, but the route hook immediately posted a fresh route dataset. The route hook now waits for that teardown after reserving its job. This second wait deliberately ignores a newly queued floor job, which already waits for the route reservation, to avoid deadlock. Cancellation while waiting prevents any later allocation. Warmup uses the same gate.

Five new regression tests cover route and warmup ordering, queued-floor deadlock prevention, cancellation, retained warm preparation and startup errors. The unchanged calculator, access rules and exact geometry continue to run. This fixes an observed code race; it is not a fresh browser reproduction or a claim that every possible memory-related crash is resolved.

The 32 existing route-calculation, route-client cancellation/reuse and heavy-worker scheduler tests also pass. A 2.5-second CPU profile of the actual UNBC cold route replay still shows rational exact-geometry operations dominating; opening validation reuse does not remove the calculator's cold checks.

A second change releases a completed route worker before loading another floor on large maps. Route geometry remains in UI state. This also handles a floor that queued while the route was calculating: the graph is released after the route result settles, and the floor waits for tracked teardown. A regression test checks that active calculations are retained and the idle worker is released exactly once.

The route completion/cancellation path disposes an idle large-map worker before releasing the route reservation when a floor is already queued. This ordering matters: a queued floor's readiness listener may precede the idle-worker listener. A regression test verifies that it cannot allocate until teardown has completed, regardless of that listener order.
