# Chosen UNBC candidate — November 1, 2026

One candidate now carries every verified change, so the visitor package,
directions cache, receipts and browser checks can all be built from it:

| Part                                                                                 | Identity                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Authoring master with the 06-388 reviewed link                                       | `6e7971f8917dafa639afa2e1523a5b1ad48aac55ef5d9db9827162335c47f903` |
| Shared-guide catalog (straightened compiler, `shapedApproaches` and `slideJoins` on) | `3430c8713d00b3dcf072f6ef2677ff7e4ee3bf958d35db6459cd629d6c405c40` |
| Exported candidate (master + guides)                                                 | `1a127847520e43a05662ee7006f07ff3152bca34eb8444d8fb41b41e90593f03` |

## Compiler change

`app/indoor-project/corridor-terminal-approach.ts` and changes in
`corridor-centerline.ts` and `prepare-corridor-routing.ts` straighten shared
trunks and door branches inside the production compiler. Every candidate is
checked with the existing exact support (`supported(path, terminalId)` and the
split/refitted trunk pieces); an edge the new network refuses falls back to the
unchanged network's checked route. No support, access or ownership check was
changed.

Full campus compile on the corrected master
([COMPILE-COMPARISON.json](COMPILE-COMPARISON.json)), against the current
compiler on the same master:

| Measure (2,701 matched guides)                  | Current |   Straightened |
| ----------------------------------------------- | ------: | -------------: |
| Accepted guides                                 |   2,701 | 2,728 (0 lost) |
| Zigzag reversals (turn > 120° with a leg ≤ 2 m) |     712 |            227 |
| Core bends over 5°                              |   3,846 |          2,265 |
| Approaches with an elbow                        |     829 |            331 |
| Core dead ends (all accepted guides)            |     883 |            546 |
| Core dead ends at an arrival point              |     274 |            202 |

## Acceptance

Normal import plus serialized production-worker replay of
[../../unbc-20261031/ROUTE-CASES-CAMPUS-0388.json](../../unbc-20261031/ROUTE-CASES-CAMPUS-0388.json):
**PASS**, zero failures, 16 available and 17 expected refusals; availability
is identical to the current compiler for all 33 requests
([acceptance/](acceptance/)). Every available route is the same or shorter, for
example 04-204 → 08-267 120.961 m (was 123.924 m), 08-216 → 08-260 12.519 m
(was 13.617 m) and 06-388 → 06-364 34.356 m (was 34.502 m).

The acceptance ran from the compiler branch (`db746fc`); `main` carries the
same compiler code merged with the native SHA-256 delivery check, whose
engine bindings were regenerated together.
