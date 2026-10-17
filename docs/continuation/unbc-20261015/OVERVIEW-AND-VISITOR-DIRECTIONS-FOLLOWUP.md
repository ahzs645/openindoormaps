# Overview colours and visitor directions follow-up

Reviewed 2026-10-15 America/Vancouver; verification files were recorded 2026-10-16 UTC.

The published viewer's small overview had not received the four reviewed corridor/landing paint decisions applied to the detailed floor. A second issue affected Agora and other mixed native faces: the overview contained coincident green drawing copies with conflicting circulation flags, so the low-zoom palette could paint one grey. The source already classified the corresponding circulation copy green.

`applyPublishedOverviewCirculationPaint` now applies the same exact publication-bound decisions to the verified small overview, including Main floor and combined Floor 1. The existing worker applies them to the full prepared floor. `consistentOverviewCirculation` also gives coincident copies the same tint only when an existing green circulation copy has the same native face identity, level and byte-equivalent geometry. It retains restrictions and does not infer new boundaries, change coordinates, grant access or enable routes.

All seven published overview assets were decoded with stored/logical checksum checks. The comparison retained all 93,145 geometry objects, original floor/ground objects and original binding objects. Paint changes affect 22 unique native faces across the overlapping views: the four previously reviewed faces and 18 faces with existing conflicting coincident circulation copies. Floor 1.5 required no changes. The full Main floor comparison also retained 314,082 feature geometry objects, original native regions and room associations. The original assets remain unchanged; decorations are applied after verification. Before/after PNGs are data renders of the actual overview palette, not browser screenshots.

Directions now handles identical nonempty place keys immediately in the UI, displays a same-place message, stops unnecessary worker work and does not request a campus graph for that selection. The comparison uses identities, not labels: two distinct places called Agora still require an actual route. Empty selections do not count as the same place.

`RouteWorkerClient` retains at most eight completed results for one immutable UI dataset snapshot, separately keyed by endpoints and profile. Results include the original route, diagnostics, arrivals and reachability. Defensive clones prevent a returned result from mutating the history. Releasing a heavy worker for floor preparation retains that small history; changed/imported/cleared source snapshots invalidate it. Cache hits in the hook avoid both worker allocation and the heavy-worker/floor teardown gate. This cache is in memory for the current page, not persisted across reloads. Other requests continue through the unchanged calculator and publication checks.

The visitor directions panel no longer contains the Review connection button or its authoring callback. The profile names are Walking and Step-free, search notes describe route availability, and visitor failure messages describe unavailable entrances, indoor paths or restricted/step-free access without source-review prompts. Authoring diagnostics remain available in authoring modes. Existing access uncertainty notes and route admission rules are retained.

## Verification

- 45 focused route history, invalidation, profiles, result mutation, cancellation, worker lifetime, paint, exact-geometry guards and decoder tests passed.
- Scoped TypeScript checking and the hospital deployment-profile production build passed. The preparation engine remains `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`.
- A fresh run of the actual production route worker and RouteWorkerClient matched all 14 baseline route outputs, including coordinates, diagnostics, arrivals and reachability. Main floor stayed resident. After the first five cases the worker was released; reopening the completed public local-step route returned an equal full result in 4 ms with no new worker. The remaining requests used a second worker and retained the expected results.
- The worker test used a 768 MiB old-generation limit and reported a 960 MiB total V8 heap limit. This is not a browser-wide memory bound. The cold first request took 152 seconds locally, while a production build and geometry checks were also running. First-time path centering/straightening remains expensive; no instant first-request claim is made.
- The original ramp-area pair remains unavailable in both directions, and the accessible-profile baseline cases remain unavailable. All 28 held stair links remain disabled. Colour and interface changes do not resolve their evidence blockers.
- Supported browser automation was unavailable. Desktop/mobile WebGL rendering, screenshot comparison and the user's crash reproduction remain unverified. Data renders and Node-worker tests are labelled accordingly.

Evidence: `navigation-evidence/zoom-overview-proof.json`, `navigation-evidence/route-history-worker-proof.json`, and the local logs and renders in `/workspace/scratch/unbc-navigation-fast-20261015`.
