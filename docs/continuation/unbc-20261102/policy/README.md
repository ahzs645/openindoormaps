# Explicit-policy route matrices for the chosen candidate — November 2, 2026

Inputs (unchanged): visitor JSON `39e9fed5…` (routing projection `c4c3ea4f…`),
progressive manifest revision `bdea9eb5…`, admitted directions carrier
`dec83a46…` (first compiled receipt in
`app/indoor-project/published-route-cell-receipts.ts`), runtime `807394c1…`,
display engine `9ee1cb8c…`.

## The three settings

Every case below names all three settings. The terms mean exactly this:

| Setting            | Values                                                                      | Where it acts                                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrival mode       | **inside** (arrive in the room) / **hallway** (stop at its hallway doorway) | `endpointMode`                                                                                                                                                                                                         |
| Other-room transit | **allowed** / **not allowed**                                               | `allowOtherRoomTransit`. When not allowed, `viewer-routing.ts` (~L300) skips a link that requires an ordinary room — any such room for hallway arrival, but only rooms other than the two endpoints for inside arrival |
| Access profile     | **Walking** (`public`) / **Step-free** (`accessible`)                       | route mode                                                                                                                                                                                                             |

The progressive visitor always requests **inside arrival**; the checkbox
"Allow paths through other rooms" (default off) sets other-room transit
(`progressive-visitor-page.tsx` ~L938). So the **visitor default is inside
arrival, no transit through other rooms, Walking**. The October 18/November 1
refusal diagnostic for 08-264 → 10-2006 used **hallway arrival, no transit
through other rooms** — a different request. Earlier notes called both
"hallway-only"; that was wrong. The app's own refusal text for the transit rule
still reads "No hallway-only route is available…"; it is quoted verbatim below,
but it means "a route exists only through other rooms".

## Method

[`scripts/indoor/run-explicit-policy-matrix.ts`](../../../../scripts/indoor/run-explicit-policy-matrix.ts)
takes the visitor JSON, its sha256, [POLICY-CASES.json](POLICY-CASES.json) (160
cases; identity = `name:arrival:transit:profile`) and an output path, in three
resumable stages:

- **worker** — the actual `progressive-route.worker.ts` bundle in a Node worker
  thread (768 MiB old-generation cap, as in the existing benchmarks), fed the
  real manifest routing parts and the admitted carrier, using the **compiled**
  receipt list (no receipt substitution). Requests go through
  `ProgressiveRouteClient` exactly as the visitor sends them.
- **normal** — the unhydrated `createWorkerRouteCalculator` on the routing
  projection of the visitor JSON, asserting projection = published routing
  asset = receipt dataset. Same options:
  `{ endpointMode, allowOtherRoomTransit, preferHallways: true }`.
- **report** — per case: available/refused, distance, edge-id count and list,
  whether the case's required edge was used (or is in the refusal witness),
  the diagnostic, hashes of the complete value/steps/summary, and normal-vs-worker
  agreement (same availability, same edge ids, same distance).

Runs: worker stage 132 s, peak child RSS 1.76 GB
([execution/](execution/)). The first request of the first run was terminated
by the worker's 768 MiB heap cap during the cold routing load
("Worker terminated due to reaching memory limit"); the client restarted the
worker, every other case completed, and a resumed run retried that one case
successfully (25.6 s, peak 1.73 GB). This cap is the Node benchmark's, not a
browser limit, but the intermittent cold-load OOM at that cap is real.

**Not yet done: the normal stage.** It needs the 5 GB visitor heap and was
queued behind the shared heavy lock when this was committed, so
**normal-vs-worker agreement is not established here**.
[POLICY-MATRIX-WORKER-ONLY.json](POLICY-MATRIX-WORKER-ONLY.json) is the report
with `complete: false`, `normalDone: 0`. For orientation only, the earlier
normal publisher replay (legacy calculator defaults, not these options) gave
83.948 m for 08-264 → 10-2006 and 34.356 m for 06-388 → 06-364
([../visitor/NORMAL-ROUTE-SUMMARY.json](../visitor/NORMAL-ROUTE-SUMMARY.json)),
the same distances the worker returns below under the visitor default.

## Matrix A — Building 08–10 Floor 2 (production worker)

08-264 Signout Equip Storage `rm-694-01803a06bb62` ↔ 10-2006 Office
`rm-694-d302635a3d75`; 08-267 Corridor `rm-694-43988ffdc334` ↔ 10-2066
Corridor `rm-694-d30ff45a3d81`. Required edge for the first pair: door
`door:694:1499373` (10-2006's only door).

**The visitor default (inside arrival, no transit through other rooms, Walking)
succeeds for 08-264 → 10-2006: 83.948 m, 27 edges, through door 1499373, both
directions.** The only Walking refusal is hallway arrival with no transit
through other rooms: the hallway side of door 1499373 is reachable only over
walks that require 10-2006 Office itself, and hallway arrival rejects every
required room, including the endpoints.

| Journey           | Arrival           | Transit through other rooms   | Profile   | Production worker result                                           | Door 1499373 used     |
| ----------------- | ----------------- | ----------------------------- | --------- | ------------------------------------------------------------------ | --------------------- |
| 08-264 → 10-2006  | inside            | not allowed (visitor default) | Walking   | route 83.948 m, 27 edges                                           | yes                   |
| 10-2006 → 08-264  | inside            | not allowed                   | Walking   | route 83.948 m, 27 edges                                           | yes                   |
| 08-264 → 10-2006  | inside            | allowed                       | Walking   | route 83.948 m, 27 edges                                           | yes                   |
| 10-2006 → 08-264  | inside            | allowed                       | Walking   | route 83.948 m, 27 edges                                           | yes                   |
| 08-264 → 10-2006  | hallway           | not allowed                   | Walking   | refused: other rooms required                                      | —                     |
| 10-2006 → 08-264  | hallway           | not allowed                   | Walking   | refused: other rooms required                                      | —                     |
| 08-264 → 10-2006  | hallway           | allowed                       | Walking   | route 73.050 m, 23 edges, ends at the hallway side of door 1499373 | no (door not crossed) |
| 10-2006 → 08-264  | hallway           | allowed                       | Walking   | route 73.050 m, 23 edges                                           | no                    |
| either direction  | any               | any                           | Step-free | refused: step-free (all 8 combinations, both directions)           | —                     |
| 08-267 ↔ 10-2066 | inside or hallway | allowed or not                | Walking   | route 34.019 m, 7 edges (all 4 combinations, both directions)      | —                     |
| 08-267 ↔ 10-2066 | any               | any                           | Step-free | refused: step-free                                                 | —                     |

Refusal text, Walking hallway arrival: "No hallway-only route is available. You
can allow paths through other rooms in Directions." (diagnostic `blocked`,
constraint `hallways`). Step-free refusals: diagnostic `blocked` with every
link of the witness path a `step-free` blocker (27 of 27 for 08-264 → 10-2006,
7 of 7 for the corridor pair) — the links are not confirmed step-free; this is
not evidence of a physical step.

## Matrix B — 06-388 island to/from 06-364 Corridor (production worker)

06-364 Corridor `rm-1487353-c8cc98ebb50c`; room keys are in
[POLICY-CASES.json](POLICY-CASES.json). Reviewed link
`reviewed-link:door:1487353:1780077:0|door:1487353:1779222:0`. Distances are
identical in both directions unless shown.

| Room                    | Inside arrival, no transit, Walking (visitor default) | Inside arrival, transit allowed, Walking | Hallway arrival, no transit, Walking | Inside arrival, no transit, Step-free |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------- |
| 06-366 Lounge           | 21.01 m                                               | 21.01 m                                  | 21.01 m                              | refused: step-free                    |
| 06-368 Corridor         | 19.86 m                                               | 19.86 m                                  | 19.86 m                              | refused: step-free                    |
| 06-370 Reception        | 35.25 m                                               | 35.25 m                                  | 32.67 m                              | refused: step-free                    |
| 06-372 Reception        | refused: other rooms                                  | 40.56 m                                  | refused: other rooms                 | refused: step-free                    |
| 06-374 Support          | refused: other rooms                                  | 47.16 m                                  | refused: other rooms                 | refused: step-free                    |
| 06-376 Open Work Area   | refused: other rooms                                  | 47.39 m                                  | refused: other rooms                 | refused: step-free                    |
| 06-378 General Manager  | refused: other rooms                                  | 57.51 m                                  | refused: other rooms                 | refused: step-free                    |
| 06-380 Storage          | refused: other rooms                                  | 53.98 m                                  | refused: other rooms                 | refused: step-free                    |
| 06-382 Office           | refused: other rooms                                  | 54.96 m                                  | refused: other rooms                 | refused: step-free                    |
| 06-384 Storage          | refused: other rooms                                  | 50.31 m; back 50.27 m                    | refused: other rooms                 | refused: step-free                    |
| 06-386 Meeting Room     | refused: other rooms                                  | 43.90 m                                  | refused: other rooms                 | refused: step-free                    |
| 06-388 Vestibule        | 34.36 m                                               | 34.36 m                                  | 34.36 m                              | refused: step-free                    |
| 06-390 Large Meeting Rm | 36.35 m                                               | 36.35 m                                  | 26.14 m                              | refused: step-free                    |
| 06-392 Club Room        | 27.28 m                                               | 27.28 m                                  | 20.78 m                              | refused: step-free                    |
| 06-397 Meeting Room     | 24.44 m                                               | 24.44 m                                  | 21.12 m                              | refused: step-free                    |
| 06-398 Washroom         | 22.90 m                                               | 22.90 m                                  | 20.97 m                              | refused: step-free                    |

Counts (rooms routing in both directions, of 16):

| Policy                                                | Rooms routing  | Reviewed link used        |
| ----------------------------------------------------- | -------------- | ------------------------- |
| Inside arrival, no transit, Walking (visitor default) | 8              | in all 16 routed journeys |
| Inside arrival, transit allowed, Walking              | 16             | in all 32                 |
| Hallway arrival, no transit, Walking                  | 8 (the same 8) | in all 16                 |
| Inside arrival, no transit, Step-free                 | 0              | —                         |

Refusals explained from the diagnostics:

- **Walking, no transit (8 rooms: 06-372 … 06-386):** diagnostic `blocked`,
  constraint `hallways`: a physical route exists (the transit-allowed column
  finds it) but it needs a link that requires an ordinary room other than the
  two endpoints, so these rooms are reachable from 06-364 only through
  another room. Which room is recorded by the normal stage (below), not yet
  run. Refusal text as in Matrix A.
- **Step-free (all 16):** diagnostic `blocked` with `step-free` blockers on the
  witness path, including door 1780077, the reviewed link itself and the
  06-364 approach walk (each listed in all 32 refusals). The reviewed link
  carries no step-free confirmation, so it cannot be used for Step-free.
  Message: "No confirmed step-free route connects these locations. Stairs and
  unverified connections are excluded…" (the visitor shows "No confirmed
  step-free route is available between these places.").

The exact rooms required by each refusal witness are added by the normal stage
(`explanation.roomsRejectedByRequestedRule`), which has not run yet.

## Browser proof (asserted)

[../visitor/proof-chosen-candidate-asserted.mjs](../visitor/proof-chosen-candidate-asserted.mjs)
with [browser/JOURNEYS.json](browser/JOURNEYS.json) exits non-zero on a page
error, a manifest revision other than `bdea9eb5…` (checked on the response the
app actually received and on an independent fetch), an unexpected route or
refusal, a distance outside ±1 m of the matrix value, a wrong refusal text, a
route without instructions, or no drawn route line (pixels of the route colour
`#38b5eb` in the map canvas). Timings are on the page clock from the
**Get directions** click.

**Desktop (1440×900, Chromium, cold page): passed**, no page errors, manifest
revision verified ([browser/desktop-proof.json](browser/desktop-proof.json)):

| Journey          | Settings                            | Result                                                                                                 | Steps | Request → status | Request → floor ready |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ----- | ---------------- | --------------------- |
| 08-264 → 10-2006 | visitor default                     | 84 m                                                                                                   | 15    | 13.0 s           | 56.6 s                |
| 06-366 → 06-364  | visitor default                     | 21 m                                                                                                   | 7     | 11.5 s           | 46.9 s                |
| 06-376 → 06-364  | visitor default                     | refused ("No hallway-only route is available. You can allow paths through other rooms in Directions.") | 0     | 7.7 s            | 7.7 s                 |
| 06-376 → 06-364  | transit through other rooms allowed | 47 m                                                                                                   | 9     | 1.8 s            | 1.8 s                 |
| 06-388 → 06-364  | Step-free, no transit               | refused ("No confirmed step-free route is available between these places.")                            | 0     | 0.1 s            | 0.1 s                 |
| 04-204 → 08-267  | visitor default                     | 121 m                                                                                                  | 12    | 3.7 s            | 47.4 s                |

The route status now appears 2–13 s after the request; the rest of the
first-route time is the detailed-floor load that follows. One `.br` routing
part request was aborted by the client (`net::ERR_ABORTED`), with no effect on
the result.

**Mobile was not run** before this commit (queued behind the heavy lock).

## Hydration route cases

`export-published-route-hydration.ts` extra cases may now carry
`options: { endpointMode, allowOtherRoomTransit }` (both required when
present; the access profile stays `mode`). They are passed to the calculator
and recorded in `route-cases.json`; the audit check then allows a refusal
caused by the restriction but never a route to a graph-unreachable place, and
skips the room-arrival-node check for hallway arrival. Cases without options
parse, calculate and record exactly as before
([tests/unit/published-route-extra-cases.test.ts](../../../../tests/unit/published-route-extra-cases.test.ts)
checks the committed EXTRA-CASES.json round trip). Both production-worker
benchmarks pass a case's explicit options. The 16-minute hydration was not
rerun.

## Reproduce

```sh
TZ=UTC node --import tsx scripts/indoor/run-explicit-policy-matrix.ts \
  VISITOR/indoor.json 39e9fed5dde728cb42fd3511614e1d3236bc28c6cb11bdfd14532c989f2be008 \
  docs/continuation/unbc-20261102/policy/POLICY-CASES.json OUT/matrix.json \
  --publication PUBLIC/data/unbc --carrier PUBLIC/data/unbc-routing/dec83a46….json.gz \
  --stage worker            # then: node --max-old-space-size=9216 --expose-gc … --stage normal; … --stage report
node docs/continuation/unbc-20261102/visitor/proof-chosen-candidate-asserted.mjs \
  APP_URL MANIFEST_URL OUT desktop|mobile docs/continuation/unbc-20261102/policy/browser/JOURNEYS.json
```

[execution/run.sh](execution/run.sh) and
[execution/browser.sh](execution/browser.sh) are the supervised, heavy-locked
runners used here (the browser runner now uses `flock -o` and `exec` so the
HTTP server never inherits or outlives the lock).
