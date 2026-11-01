# 06-388 island repair — November 1, 2026

Connected door 1780077 (06-366 Lounge ↔ 06-364 Corridor) had no walking
approach on its 06-364 portal, which cut 06-388 Vestibule and 15 other rooms
off the campus walking network.

1. `scripts/indoor/add-reviewed-circulation-link.ts` added one owner-reviewed
   circulation link `door:1487353:1780077:0 → door:1487353:1779222:0`
   (6.462 ft, inside native cell 994) to the run-1 master (`d4d36d18…`). The
   compiler's own `reviewedCirculationLinkSupport` replay passed and the two
   existing reviewed links still applied. The exported corrected master is
   247,210,604 bytes, SHA-256
   `6e7971f8917dafa639afa2e1523a5b1ad48aac55ef5d9db9827162335c47f903`
   (export 4,357 s) — [EXPORT-RESULT.json](EXPORT-RESULT.json).
2. The full campus guide compile on the corrected master accepted the same
   2,701 guides with byte-identical geometry; only the source geometry key
   changed (catalog `8c5a7c0f…`) — [GUIDES-SUMMARY.json](GUIDES-SUMMARY.json).
3. Normal import plus serialized production-worker replay of
   [../../ROUTE-CASES-CAMPUS-0388.json](../../ROUTE-CASES-CAMPUS-0388.json)
   (the 28 campus cases plus five 06-388 cases) **passed** with zero failures:
   16 available, 17 expected refusals (1,806 s, child peak RSS 5.65 GB).

| Journey                                             | Result                              |
| --------------------------------------------------- | ----------------------------------- |
| 06-388 → 06-364, hallway                            | 34.502 m, through the reviewed link |
| 06-364 → 06-388, hallway                            | 34.502 m, through the reviewed link |
| 06-366 → 06-364, inside arrival                     | 21.322 m, through the reviewed link |
| 06-370 → 06-364, inside arrival, other-room transit | 35.255 m, through the reviewed link |
| 06-388 → 06-364, strict step-free                   | expected refusal                    |

The other 28 cases are unchanged (for example 04-204 → 08-267 is still
123.924 m). Access stays unknown and the link's accessibility is unconfirmed.
The corrected master and catalog are local artifacts identified by hash here;
they are not yet in a published visitor package.
