# Floor 2 (level 694) review — 2026-10-09 (transcribed by coordinator from the review agent's final report)

All 48 inventory entries (47 multi-place groups + mixed region 694:967, 08-216/217/223) have a disposition bound to room keys and exact native faces. Production `deriveNativeAreas(694, connected, maxGapFeet 0)` on `source-candidate-dataset.json` (cb58e81e…) reproduces all 47 groups with identical region ids/room keys; material geometry d5b3fa0d… equals the inventory display dataset 43ea…. Checked proposals would isolate 101 named places (selection only); none of the 165 already-separate rooms on level 694 lose or change area. Nothing applied.

| Disposition | Count | Status |
|---|---|---|
| numerical-seam | 16 | all fully resolved by checked contacts |
| drawing-backed-patch-candidate | 25 | 15 have no other fix; 10 partly fixed by contacts first |
| missing-native-enclosure | 3 | 694:1060 resolved by a continuation; 694:1 (06 kitchen) partly, door questions open; 694:272 unresolved |
| wrong-room-ownership/metadata | 2 | 694:100, 694:829 unresolved |
| intentional-opening | 2 | 694:842, 694:1153: some rooms isolated, rest intentionally shared |

Owner policy (user-decisions/2026-10-09-gap-review.json) applied: `evidence/drawing-backed-patch-candidates.json` has 140 records (137 candidates: 100 micro-gap exact-contact, 22 assumed walls on display-only rows + exact contact, 15 seals for missing native walls). Main blocker: sub-micro seams against facade rows without original material (#1498817, #1498818, #1499286 B10; #1522479, #1521701 B9; #496562 B4; #401864 B3) need the generic family or recovered material sections.

## Checked proposals (`proposals/`, status proposed, hashes in INDEX.json)
1. 146 contact repairs (b03/b04/b05/b06/b08/b09/b10 = 44/14/34/11/17/3/23): 104 full-cap, 36 original-free-cap, 6 finite-cap-overlap, from 2,764 candidates; each re-derived by production `deriveNativeSelectionContactRepairAttempts` and passed `createNativeSelectionContactPhysicalGuard`; gaps <1e-7 ft; masks ≤1.3e-13 sq ft; merged 498-entry collection passes the production validator. Production SHAs at check: contact-repairs 7a8eb4f1…, contact-guards ed737132…, native-area-review 32441434….
2. `floor2-boundary-patch-03-1011-1012.json`: flip proposed patch `manual-gap:694:639078-401864:…` to applied; isolates 03-1012 (121.64 sq ft); 233 other applied patches reproduced unchanged; 03-1011 still joined via seam on display-only row #401864.
3. `floor2-boundary-continuations.json`: #734444→#645855 0.804 ft (03-1039 74.92 / 03-1040 171.0 sq ft); #1883236→#1134166 0.0489 ft (05-248 122.88); #1522440→#1521894 0.2625 ft (09-322 163.07). Derived wall faces — needs Reviter regeneration.
4. Verified: 10-2082 provisional box `user-assumed-solid-return:694:10-2082` applied; faces match DWG segments 277–279; 10-2082 separate at 110.352 sq ft (assumption, revisit).

## Owner questions
1. 06-274 Cooler / 06-280 Dry Goods: DWG draws door leaves the native model lacks — provisional selection-only partitions until fixed?
2. 06-212 "Storage" labelled in the open area behind 06-213 lecture seating — label error, or a room missing from both RVT and DWG?
3. Building 4 south-east facade strip (x −112..−101, y 185..347): ~1.1 ft unlabelled floor strip joining 04-242B/C/D, no wall/DWG line — outside ledge/lip to exclude (like pin 50), or a missing inner glazing line?
4. 03-1058 / 03-1059: two office numbers in one room with no partition in native or DWG — merge or retire labels?

## Limits
Necessity of each of the 146 contacts not individually checked. Seam location/DWG continuity screened with float diagnostics only (never authority). A third contact round (`scripts/check-contacts-v2.ts`) was cancelled behind the heavy lock; see `evidence/v2/STATUS.txt`. Separate selection is not a raised-room, 3D or route certificate.
