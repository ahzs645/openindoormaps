# Basement / Floor 1 / Floor 1.5 review — 2026-10-09 (transcribed by coordinator from the review agent's final report)

All 62 groups (Basement 1; Floor 1 61 = 59 multi-place + 5 mixed, 3 overlapping; Floor 1.5 none) have a reviewed disposition; 64 checked proposals (24 partition files, 40 contact files with 150 descriptors), all status "proposed". All 65 inventory entries match fresh native extracts by region id and room keys. Nothing applied.

Key finding: 9 applied reviewedAreaPartitions on level 311 are currently ignored by selection because their physical hash went stale; all 9 pass `checkReviewedAreaPartition` again with their original points (b444…/574a… → 896c8c33…).

| Disposition | Groups | Resolved by checked proposals |
|---|---|---|
| numerical-seam | 30 | 27 (unresolved: 311:361, 311:728, 311:45 04-125/07-165) |
| drawing-backed-patch-candidate | 18 | 7 |
| intentional-opening | 7 | — (handoff §7 decisions, 07-102 suite, 10-1046/10-1040, kitchen suite) |
| mixed (311:1 Agora, 311:414 Library) | 2 | partly |
| missing-native-enclosure (provisional) | 2 | 2 |
| logical-front (311:382) | 1 | partly |
| restricted-domain-conflict (311:307 staff corridor) | 1 | — |
| wrong-room-ownership (1487816:464, 10-1513 at head of 10-S103) | 1 | — |

Validation (unchanged production code on `source-candidate-dataset.json` cb58e81e…, 352 contacts), single-room selections before→after, none lost or area-changed: 311 156→244 (partitions only 156→177; includes 04-128 via the pipeline agent's simple-terminal cap, excluded from these files); 1487816 80→106; 1450417 37→41.

## Proposals
- 9 stale partition refreshes: 07-240 Flexiglide shutter; cafeteria shutter pins 111–112; doorless washrooms pins 108/109/110 (07-244, 07-246, 07-223); 07-249/07-252 pickup front; 07-249/07-253 back opening; 07-107/07-109 front; 07-110 return.
- 15 new selection-only partition lines following registered drawing lines and ending on exact native faces: 07-406/07-407; 04-105/04-106; 04-155/04-157; 07-156/07-157 (2 jamb stubs by door #1026108); 03-008 (2); 03-011/03-015 (2); 07-513/07-514 (13 mm slot); 08-165/08-167; 08-127/08-128 (13 mm corner); 10-1586/10-1590 (passes but another leak keeps them joined); 07-250/07-401 and 07-712/07-728 provisional (question 1).
- 150 contact descriptors in 40 files: 28 fully resolve 311:46, 80, 142, 145, 161, 224, 303, 304, 309, 310, 358, 360, 499, 523, 624, 736, 759; 1450417:30, 203; 1487816:27, 35, 44, 116, 132, 138, 289, 492, 495. 12 help partly: 311:1, 12, 84, 170, 307, 382, 414; 1450417:170, 201, 222; 1487816:205, 464.

## Drawing-backed candidates (evidence/drawing-backed-candidates.json)
Exact-contact micro-gaps: 10-B502/10-B504 vs corridors (#2301966/#2302316); 09-242/244/246, 09-280/282, 09-250/252/254/256; 07-238/07-219; 04-114/116/117; 03-010/03-011; 08-147/08-148; B10 10-1016…10-1082; 04-125 (DWG 13FED/13FEE); remaining Agora and Library rooms. Provisional seals: 07-165 (0.0318 mm skewed corner, DWG 38A6D/38A6E), mm seams at 07-234 and 07-117. Still to locate: 04-105/07-172, 10-1586/10-1590, 10-1534 Kitchen, 07-240.

## Owner questions
1. 07-250/07-401 and 07-712/07-728: drawing partitions also stop short; only the wall face is broken at the junction. Closed from each other?
2. 07-113 and 05-123 still connect through >0.05 ft openings even with the 07-113A ~5 mm seal. Doorless openings or missing walls?
3. Logical pickup-front partitions for 07-312 Food Pick Up and 07-317 from 07-301 Lower Dining Hall?
4. Library: are 05-173 and 05-180 closed rooms, or open to 05-140?
5. Is 07-314 Freezer a closed walk-in?
6. Is 10-1513 Storage a separate room at the head of stair 10-S103, or part of the stair?
7. Reclassify 07-750/751/706/704 as staff circulation records (metadata only)?
8. Optional: logical open-front partitions for the 07-102 suite and 10-1046/10-1040?

## Caveats
Other agents changed derivation inputs since (`native-routing-material.ts`, `contract.ts`, `package.ts`): re-run `scripts/validate-proposals.ts` on the final base before applying. Selection separation is not a raised-room, route or 3D certificate. Shared extracts: native levels 2295121, 1425915, 1450417, 1487816, 311 with production baselines; raw DWG decode with handles, per-section registration (median residual ~1e-13 ft), registered labels (README-review-floor1.txt).
