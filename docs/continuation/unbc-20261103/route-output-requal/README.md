# Requalification after the route-output change — November 3, 2026

The route-output change (`docs/continuation/unbc-20261102/route-instructions/`)
cleans the drawn route line and issues instructions only at meaningful
events. It changed the published route runtime (`49f1e88b…` → `6d62e8ae…`);
the display engine (`4a0a354a…`) and plan runtime (`4705ec62…`) are
unchanged. Everything below reruns on the same final candidate and visitor
(`32c395e1…`, `6abc227a…`, revision `fa6d2935…`) at app commit `a828af4`
with Reviter `2e7875d`.

| Gate                                                                  | Result                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directions cache rebuilt                                              | passed, normal physical validation repeated; carrier `57311444…` (8,205,762 bytes) bound to runtime `6d62e8ae…`; receipt replaced in `published-route-cell-receipts.ts` ([HYDRATED-CACHE-PROOF.json](HYDRATED-CACHE-PROOF.json)) |
| Public root, plan and cache checks                                    | 7 / 7 plan scopes with no fallback; directions receipt and carrier match ([PLANS-CHECK.json](PLANS-CHECK.json), [DIRECTIONS-CACHE-CHECK.json](DIRECTIONS-CACHE-CHECK.json))                                                      |
| Strict policy matrix, 160 cases                                       | normal and production worker agree on every recorded field (including step and summary hashes); all expectations met ([POLICY-MATRIX.json.gz](POLICY-MATRIX.json.gz))                                                            |
| 8 browser journeys, desktop and iPhone 13 emulation, 2 cold runs each | all pass, no page errors, one shared identity ([FINAL-PROOF.json](FINAL-PROOF.json), [browser/](browser/))                                                                                                                       |

## Expected distances

The cleaned line is shorter than the composed line, so 51 of 78 routed
cases now report a shorter distance (at most 0.513 m). Outcomes, refusal
reasons, edge ids and required edges are unchanged. The expectations were
rebased by [tools/rebase-expectations.py](tools/rebase-expectations.py), which refuses
any change other than a small shortening and records each old value
([REBASE-REPORT.json](REBASE-REPORT.json),
[POLICY-EXPECTATIONS.json](POLICY-EXPECTATIONS.json)). Before rebasing, the
report failed on exactly those 51 distances and on nothing else.

## Browser results

| Journey                              | Shown            | Steps (before → after) | Request → floor ready, s |
| ------------------------------------ | ---------------- | ---------------------- | ------------------------ |
| 08-264 → 10-2006 (first route, cold) | 83 m             | 15 → 8                 | 14.5–17.3                |
| 06-366 → 06-364                      | 21 m             | 7 → 3                  | 3.7–6.3                  |
| 06-376 → 06-364                      | expected refusal | —                      | 0.0–0.1                  |
| 06-376 → 06-364, transit             | 47 m             | 9 → 4                  | 0.7–1.0                  |
| 06-388 → 06-364, step-free           | expected refusal | —                      | 0.0–0.1                  |
| 04-204 → 08-267                      | 120 m            | 12 → 7                 | 7.0–8.8                  |
| 04-255 → 08-272, transit             | 185 m            | 19 → 10                | 4.3–4.9                  |
| 06-388 → 06-364                      | 34 m             | 6 → 3                  | 4.1–5.8                  |

Mobile is Chromium with iPhone 13 emulation on a shared 4-core host with a
local server, not a physical phone.
