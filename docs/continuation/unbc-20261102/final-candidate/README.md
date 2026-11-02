# Final candidate — November 2, 2026

This candidate replaces `1a127847…`. It is the corrected master with the guide
catalog from the compiler that rejects crossed door approaches
([../approach-topology/](../approach-topology/README.md)).

| Part                                  | Identity                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Master (06-388 reviewed link)         | `6e7971f8…`; reproduces entry for entry from `d4d36d18…` ([../preservation/](../preservation/README.md))                         |
| Guide catalog                         | [PREPARED-ROUTING.json](PREPARED-ROUTING.json), `1c3011ffbda15b1f38dd0ecaee52bbbd39f3133622c3d76cff16fb87c2f4487c`, 2,728 guides |
| Exported candidate (master + catalog) | `32c395e1af62235543e69effb91645a76111a6f37cfcf6c5bfd7e7bcd0db85dd`                                                               |
| Source revision                       | `e7113f8` (engine `4a0a354a…`)                                                                                                   |

## Acceptance

`verify-shared-corridor-candidate.ts` with
[../../unbc-20261031/ROUTE-CASES-CAMPUS-0388.json](../../unbc-20261031/ROUTE-CASES-CAMPUS-0388.json)
(33 cases, normal import plus serialized production-worker replay): **PASS**,
0 failures, 2,054 s, peak RSS 5.4 GB ([acceptance/](acceptance/)). All 33
outcomes (16 routes, 17 expected refusals) and distances are identical to the
previous candidate `1a127847…`. `releaseAcceptance` is still `false`.

## Visitor package and publication gates

| Step                                                     | Result                                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progressive export (`--visitor --prepare --checkpoints`) | exit 0, 5,069 s, peak RSS 5.4 GB; 7 / 7 scopes, revision `fa6d2935…`, engine `4a0a354a…` (213 modules); visitor JSON `6abc227a4529df7e33611567273349e8b227f179cb4940eed1b30aa2e06d4559`                 |
| Hydrated directions cache                                | passed, 1,091 s; normal physical validation repeated; carrier `3d27eaa5…` (8,205,761 bytes, 1,188 cells), receipt admitted in `published-route-cell-receipts.ts` (replacing the superseded `dec83a46…`) |
| `check-published-directions-cache.ts` on the built root  | `currentCompiledReceiptMatches` and `exactCarrierInventoryAndPolicyDecodePassed` true                                                                                                                   |
| Gate 4, `admit-published-project.ts` (new generator)     | full normal imports of candidate and visitor under the unchanged engine, every scope read back; 2,493 s, peak 5.1 GB; progressive-floors receipt admitted in `published-project-receipts.ts`            |
| Gate 5, plan export and independent admission            | 7 / 7 scopes exact (all layer coordinates, holes and owner properties); 12,612,078 bytes in `public/data/unbc-plans/`; `check-published-visitor-plans.ts` passed with no fallback                       |

All files are in [visitor/](visitor/). The hydration route cases carry explicit
options where given ([visitor/EXTRA-CASES.json](visitor/EXTRA-CASES.json)); they
are normal-calculator results (`actualRouteParityCases: 0`). Worker parity is
the matrix below.

## Explicit-policy matrix (normal calculator and admitted production worker)

[policy/POLICY-MATRIX.json.gz](policy/POLICY-MATRIX.json.gz), cases from
[../policy/POLICY-CASES.json](../policy/POLICY-CASES.json): **160 / 160 cases
agree** on availability, edge ids and distance. "Inside arrival" is what the
visitor sends.

| 08-264 ↔ 10-2006 (Floor 2, Buildings 08–10)                     | Walking result                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Inside arrival, no transit through other rooms (visitor default) | 83.948 m both ways, through door 1499373                                               |
| Inside arrival, transit allowed                                  | 83.948 m                                                                               |
| Hallway arrival, no transit                                      | refused (`hallways`)                                                                   |
| Hallway arrival, transit allowed                                 | 73.050 m (ends at the hallway side of the door)                                        |
| 08-267 ↔ 10-2066, all four walking settings                     | 34.019 m                                                                               |
| Every step-free setting                                          | refused: links on the witness path are "step-free unconfirmed", not evidence of a step |

| 16 former 06-388 island rooms ↔ 06-364 Corridor (both directions) | Routes                                             |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| Inside arrival, no transit (visitor default)                       | 16 / 32: 06-366, 368, 370, 388, 390, 392, 397, 398 |
| Inside arrival, transit allowed                                    | 32 / 32                                            |
| Hallway arrival, no transit                                        | 16 / 32 (same rooms)                               |
| Inside arrival, step-free                                          | 0 / 32                                             |

Every routed island journey uses the reviewed link 1780077 → 1779222. The
eight walking refusals (06-372 to 06-386) carry the `hallways` constraint:
they are reachable only through another room.

## Browser proof (asserted)

[../visitor/proof-chosen-candidate-asserted.mjs](../visitor/proof-chosen-candidate-asserted.mjs)
with [browser/JOURNEYS.json](browser/JOURNEYS.json): **desktop and mobile both
pass all 8 journeys**, with no page errors and manifest revision `fa6d2935…`
verified. 08-264 → 10-2006 shows 84 m, 06-366 → 06-364 21 m, 06-376 → 06-364
the expected "No hallway-only route" refusal (47 m with transit), 06-388 →
06-364 step-free the expected refusal, 04-204 → 08-267 121 m, 04-255 → 08-272
186 m and 06-388 → 06-364 34 m.

## Timings with checked 2D plans ([SPLIT.json](SPLIT.json))

Same collector as [../plans/](../plans/README.md), 2 cold runs each, on a
shared host (load average 3.5–6.2). Seconds after "Get directions" for
04-204 → 08-267:

| Measure                              | Desktop    | Mobile     | Before plans (this candidate's predecessor) |
| ------------------------------------ | ---------- | ---------- | ------------------------------------------- |
| First route paint (121 m)            | 13.5–14.2  | 14.4–18.3  | 11.9–14.3                                   |
| First route with floor ready         | 18.7–21.1  | 19.4–25.2  | 55.8–64.6                                   |
| Later route (186 m) with floor ready | 5.1–5.3    | 5.8–6.6    | 17.4–18.9                                   |
| Floor ready after page load          | 12.3–14.8  | 12.4–18.0  | 5.9–10.2                                    |
| Peak renderer RSS                    | 2.8–2.9 GB | 3.0–3.5 GB | 3.2 GB                                      |

No page errors. The route worker stays resident in 2D. Opening the page is
slower because the default floor's plan loads at startup; see
[../lazy-plan/](../lazy-plan/) for the follow-up.

## Rebuild

```sh
node --import tsx scripts/indoor/verify-shared-corridor-candidate.ts \
  MASTER-6e7971f8.zip PREPARED-ROUTING.json \
  docs/continuation/unbc-20261031/ROUTE-CASES-CAMPUS-0388.json OUT
```

The candidate archive (247 MB) is not committed.
