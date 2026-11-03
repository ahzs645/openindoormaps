# Route output: instructions and the composed route line — November 2, 2026

Branch `claude/route-instructions` (from `909d8c2`). Nothing was published, and
no receipt was changed.

This closes gaps 2 and 3 of
[../reference-comparison/README.md](../reference-comparison/README.md) in the
route **output** only. The routing graph, the route search, the chosen edges,
the accessibility and access policies, the refusals and every diagnostic are
unchanged. All numbers come from the normal calculator on the final visitor and
are in [ROUTE-OUTPUT.json](ROUTE-OUTPUT.json).

## Result

The 8 browser journeys (2 are refusals, unchanged):

| Journey                              | Steps before → after | Per 100 m before → after | Bear steps | Reported distance (m) | Line segments | Bends > 5° | Jogs  |
| ------------------------------------ | -------------------- | ------------------------ | ---------- | --------------------- | ------------- | ---------- | ----- |
| 08-264 → 10-2006, default            | 15 → **8**           | 17.9 → **9.6**           | 6 → 1      | 83.948 → 83.435       | 26 → 21       | 19 → 15    | 2 → 1 |
| 06-366 → 06-364, default             | 7 → **3**            | 33.3 → **14.4**          | 3 → 1      | 21.010 → 20.850       | 13 → 12       | 10 → 9     | 0 → 0 |
| 06-376 → 06-364, transit             | 9 → **4**            | 19.0 → **8.4**           | 3 → 0      | 47.389 → 47.389       | 11 → 11       | 9 → 9      | 1 → 1 |
| 04-204 → 08-267, default             | 12 → **7**           | 9.9 → **5.8**            | 5 → 0      | 120.961 → 119.954     | 54 → 49       | 27 → 23    | 5 → 2 |
| 04-255 → 08-272, transit             | 19 → **10**          | 10.2 → **5.4**           | 5 → 0      | 186.350 → 185.051     | 50 → 44       | 34 → 29    | 6 → 4 |
| 06-388 → 06-364, default             | 6 → **3**            | 17.5 → **8.7**           | 1 → 1      | 34.356 → 34.356       | 11 → 11       | 8 → 8      | 0 → 0 |
| 06-376 → 06-364, default (refusal)   | —                    | —                        | —          | same refusal          | —             | —          | —     |
| 06-388 → 06-364, step-free (refusal) | —                    | —                        | —          | same refusal          | —             | —          | —     |

The "before" step counts equal the browser proofs (15, 7, 9, 12, 19, 6). The
two long corridor journeys are now at 5.4–5.8 instructions per 100 m. Pointr
gives 4.3–5.8. The short island routes cannot go much lower: depart and arrive
alone are 2 steps on a 21–47 m route.

New instructions for 04-204 → 08-267: _Leave 04-204 · Corridor and head
straight; Turn right; Turn left; Turn right; Continue into building 08; Turn
left; Arrive at 08-267 · Corridor._ Every journey's messages are in
`ROUTE-OUTPUT.json` (`journeys.*.after.messages`).

All 160 cases of [../policy/POLICY-CASES.json](../policy/POLICY-CASES.json)
(78 routes, 82 refusals):

| Metric                                    | Before             | After                  |
| ----------------------------------------- | ------------------ | ---------------------- |
| Steps (all routes)                        | 665                | **292**                |
| Steps per 100 m, overall / median / max   | 23.5 / 26.5 / 35.3 | **10.4 / 11.1 / 17.6** |
| "Bear" steps / "Turn" steps               | 246 / 249          | **21 / 87**            |
| Line segments / segments under 2 m        | 1,234 / 931        | **1,093 / 790**        |
| Bends over 5° on the line                 | 980                | **867**                |
| Jogs (reference definition)               | 48                 | **41**                 |
| Zigzags (> 120°, a leg ≤ 2 m)             | 70                 | 70                     |
| Exact retrace pairs / reversals over 150° | 4 / 4              | 4 / 4                  |
| Drawn length                              | 2,825.1 m          | 2,809.8 m              |
| Sum of routed edge lengths                | 3,134.2 m          | 3,134.2 m              |

Checked invariants, for every one of the 168 cases (`invariants` in the JSON):

- the same route or refusal;
- the same refusal message;
- the same routed edge sequence (a hash of the edge ids);
- the same routing preference cost.

The reported distance changes by 0 to −1.299 m. It never increases.

### What the hook numbers mean

The reference comparison counted 36 of 97 **stored** segments of 04-204 →
08-267 as out-and-back pairs. That reconstruction joined the stored per-edge
polylines. The runtime line was already different. The shared-guide
composition (`composeSharedCorridorGuide`) removes every exact retrace, so
the measured runtime line of that route had no exact retrace, no reversal over
150° and no zigzag before this change. What remained were short sideways jogs
and bumps: 37 of its 54 segments were shorter than 2 m. They were the main
source of the "Bear" steps.

All 70 zigzags that remain in the policy cases are in **uncentred source
walks**. These are walks that the refinement could not certify, and they are
kept exactly as stored (see "Not changed" below):

- 64 are a single 0.11 m tail at the 06-364 arrival point of the reviewed link
  `door:1487353:1780077:0|door:1487353:1779222:0`. It repeats across the island
  cases.
- 6 are stubs of 0.02–0.07 m on one doorway-policy walk in cell 984.

## A. Cleaning the composed route line

Code: `app/indoor-project/route-line-cleanup.ts` (rules) and `refine` in
`app/indoor-project/viewer-centered-route.ts` (where they are applied).

**Where it applies.** Cleaning happens after the graph search and the per-run
refinement, on the drawn polyline of one planar walking run:

- a shared-corridor guide run, after it has passed its existing checks;
- a centred, non-curved refined run.

The routing graph, the stored guides, `route.edges`, `route.nodeIds`, required
edges and policies are not touched.

**Sites.**

- A **hook** is a vertex that turns back by more than 120°, with an adjacent leg
  of at most 2 m. If two adjacent vertices qualify, the sharper one (the tip) is
  removed.
- A **tiny zigzag** is a run of 2–4 vertices with alternating turns, the largest
  at least 5°. It is joined by legs of at most 3 m, and its net heading change is
  under 10°. This is the reference comparison's jog.

**Shortcut.** A site is replaced by one straight chord over at most 6 vertices.
The smallest window around the site is tried first. Every removed vertex must lie
within 2 m of the chord for a hook, or within 0.6 m for a zigzag.

**Physical support.** A chord is used only if it passes the same exact checks
that admitted the run:

- `validSegment(a, b, free)`. On the native dataset this is the exact rational
  native-face segment query (`createNativeRationalPathUnionQuery`).
- For a shared guide, also `supportsShared([a, b])`. This is the exact two-foot
  strip of `createTwoFootCorridorSupport`, on the same exact parts and support
  tiles that admitted the stored guide.

After cleaning, the **whole** new line must pass every segment check, the run's
support predicate and `policyAllowed` again. `policyAllowed` covers transit
owners, mandatory doors, saved passages with their direction, door direction and
opening spans. If any check fails, the composed line is kept unchanged.

**Protected anchors.** These are never removed or bypassed, as with Mappedin's
`preventSmoothing`:

- both run endpoints;
- both anchors of every door and opening edge in the run (and of its portal
  edges);
- the outer hallway stops that hallway arrival trims later.

The removed excursion and the chord may also cross no door or opening passage
(`passageQuery` must return nothing). Floor and level changes are never cleaned:
vertical and nonplanar paths do not reach `refine`'s centring. Curved runs are
not cleaned either, because their curve ranges index vertices.

**Determinism.** A run is cleaned in one canonical orientation, the same rule
`composeSharedCorridorGuide` uses. A→B and B→A therefore give the same line,
reversed.

**Reported distance: decision.** `distanceMetres` is the length of the
**cleaned drawn line**. This is the meaning it already had: a centred path has
always reported its drawn length, and an uncentred one its edge length. The
visitor sees a distance that matches the line on the map. The routed quantities
stay as they were:

- `sourceDistanceMetres` is the sum of the routed edge lengths;
- `preferenceCost` is the Dijkstra cost.

Both are unchanged for every case. Because cleaning only removes chords, the
distance can only shrink. Here it shrank by up to 1.299 m.

**Not changed.**

- **Uncentred source walks** (`no-clearance-route`, `doorway-policy`,
  `validated-source`, door and opening parts). Centring could not certify a
  lane for them, so there is no certified support to check a chord against.
- **Accessible routes.** Centring is disabled for the step-free profile, so it
  keeps the saved, confirmed edge geometry.
- **The original-centering fallback** (`centered-route.ts`). It is used only
  when the main resolution refuses.
- **Display rounding of corners.**

## B. Instructions from meaningful events

Code: `app/indoor-project/navigation-steps.ts` (`NAVIGATION_STEP_RULES` and
`classifyWalkingTurns`). A walking event becomes a step only if it is one of
these:

- **a real turn**;
- **a floor change**, unchanged;
- **entering another building**: a `building-change` step, "Continue into
  building 08", with `buildingName`;
- **entering an ordinary room that is not the start or the end**: "Continue
  through 04-259", or "Turn left into 04-259" when a turn starts there. This
  happens only on transit routes;
- **entering a curved corridor**, unchanged;
- **departure and arrival**, with unchanged messages.

The old generic "Head straight" step at a building change is gone. "Head
straight" now appears only after a floor change, or when the native level
changes without a vertical edge. These are the old cases, kept to hold the
walking distance.

**Turn classification (smoothed heading).**

1. A leg shorter than **2 m** never sets the walking heading; it only adds
   distance. The one exception is that the first leg of at least 0.5 m sets a
   provisional heading, so leaving a room through a short doorway branch still
   gives the turn into the corridor.
2. A heading change is measured between consecutive heading legs. The short
   legs between them (thresholds, hooks, jogs) add up to one net change.
3. Two consecutive bends merge into their net change when two conditions hold:
   the straight walk between them is shorter than **4 m**, and at least one of
   them is slight (under 60°). So two 45° bends of a chamfered corner become one
   "Turn", and a left/right jog cancels. Two real turns close together stay two
   turns. Bends never merge across a door, building or curve barrier.
4. A net change under **30°** is never a step. Above that:

   | Net change | Step          |
   | ---------- | ------------- |
   | 30–60°     | "Bear"        |
   | 60–150°    | "Turn"        |
   | over 150°  | "Turn around" |

**No junction exception.** The ambiguous-junction exception was not implemented,
on purpose. The walking graph has no corridor junction nodes: walk edges run
door to door, and hallway joins are guide vertices. A bend's alternatives
therefore cannot be known, and the 30° rule applies everywhere.

**Invariants (unit-tested).**

- The step distances still sum to the route distance.
- Every walked point is in exactly one step, in order.
- The arrival step is unchanged.
- Floor-change steps are unchanged.

## Bindings

The writers were run as in `d1aa50f`, and repeated until they reached a fixed
point:

```sh
node --import tsx scripts/indoor/prepared-display-engine-binding.ts .
node --import tsx scripts/indoor/published-route-runtime-binding.ts .
node --import tsx scripts/indoor/published-visitor-plan-runtime-binding.ts .
```

| Binding                                                        | Before      | After           |
| -------------------------------------------------------------- | ----------- | --------------- |
| Published route runtime (`published-route-runtime-binding.ts`) | `49f1e88b…` | **`6d62e8ae…`** |
| Prepared display engine                                        | `4a0a354a…` | unchanged       |
| Published visitor plan runtime                                 | `4705ec62…` | unchanged       |

The full route runtime value is
`6d62e8aef73ff4769778b4cfb6b49e6d47e1238f0226374b31f5045323bf1399`. The
admitted receipts (`published-route-cell-receipts.ts`,
`published-project-receipts.ts`) were not touched, and the directions carrier
must be hydrated and admitted again.

### What re-admission will see

- **Every routed case changes.** In the explicit policy matrix, the step
  count, `stepsSha256`, `summarySha256` and `valueSha256` change for every
  routed case. The worker and the normal calculator still have to agree with
  each other.
- **[../final-proof/POLICY-EXPECTATIONS.json](../final-proof/POLICY-EXPECTATIONS.json)
  needs new distances.** It uses a tolerance of 0.01 m, and 51 of the 78
  routed cases now report a shorter distance (by up to 0.513 m). Edges,
  required-edge use and refusals are unchanged.
- **The browser journeys need new expected distances.** They use a 1 m
  tolerance, and 04-255 → 08-272 changes by 1.299 m (186.350 → 185.051). The
  new values are `journeys.*.after.reportedDistanceM` here.

## Verification

All of these ran on Node 24.19.0 and passed:

- `npx tsc -p tsconfig.indoor-project.json`;
- every unit group of `.github/workflows/indoor-checks.yml`. Two new files were
  added to the groups: `tests/unit/navigation-steps.test.ts` and
  `tests/unit/route-line-cleanup.test.ts`;
- `npm run build:pages` and `npm run test:pages`, with Chromium from
  `/opt/pw-browsers`.

Two existing expectations were changed on purpose:

- `shared-corridor-route-parity.test.ts`: the fixture's stored hook is now
  dropped from the route line, but still drawn by the overlay.
- `shared-corridor-routing.test.ts`: the compact vestibule's 0.55 m dip is
  dropped. With the real floor hole, the trunk is kept exactly, because no
  chord over the hole passes the exact support. This is an integration check
  that the support predicate governs the cleaning.

One assertion in `native-circulation.test.ts` was changed: the building step is
now `building-change`.

## Reproduce

Both runs need about 1.7 GB RSS, and the first route takes about 340 s to
warm up. Run the "before" side from `909d8c2` with this script copied in, and
the "after" side from this branch:

```sh
flock /home/user/unbc-work/heavy2.lock node --max-old-space-size=9216 --expose-gc --import tsx \
  scripts/indoor/measure-route-output.ts /home/user/unbc-work/final/visitor/viewer/indoor.json \
  6abc227a4529df7e33611567273349e8b227f179cb4940eed1b30aa2e06d4559 \
  docs/continuation/unbc-20261102/policy/POLICY-CASES.json OUT.json \
  --journeys docs/continuation/unbc-20261102/final-candidate/browser/JOURNEYS.json
python3 -I docs/continuation/unbc-20261102/route-instructions/summarize.py \
  <(gzip -dc raw-before.json.gz) <(gzip -dc raw-after.json.gz) ROUTE-OUTPUT.json
```

`measure-route-output.ts` uses the same unhydrated calculator, options and
naming as `run-explicit-policy-matrix.ts --stage normal`. It records the
composed paths, the steps and the line metrics. The raw runs are
`raw-before.json.gz` (sha256 of the JSON `1c63cbd8…`) and `raw-after.json.gz`
(`0f42b03b…`).
