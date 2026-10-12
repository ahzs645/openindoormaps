# B8 Floor 1.25 ↔ B7/B9 connectivity — 2026-10-10 (transcribed by coordinator from the routing agent's report)

All measurements on published geometry (compiled 2fad94 / 73f7c95e), not a fresh recompile. No new production code beyond earlier checkpoints (reviter 3795b42/f9a8855, OIM d233604); scripts/data under work/routing-followup/.

## B8 Floor 1.25 enclosed
Earlier only 3/13 recovered because the floating union merged sub-ulp gaps the exact overlay keeps (~1,557 joints on 1487816: ~1,369 exact/IEEE-coincident cracks, ~99 DWG-continuous, ~86 owner questions). Fix: generic exact-union joint census → drawing-backed rows (exact-contact + DWG-continuous seals, co-owner retries) + material-section supplement + F step. Result: 18/18 census rows on 1487816 enclosed at both cuts (10,199 sq ft supplement), incl. 08-102/105/140/155/156/159.

## B8 connections applied
Door #2018182 both sides attach; q4 link landing:ramp:1622190:upper ↔ rm-1487816-1a09473066a2; ramp #1622190 upper landing attached; revised lower approach 54.04 ft via reviewed-ramp-approach (owners [landing:ramp:1622190:lower, 07-180], to door:311:1951047:1, accessible yes kept). Staff-zone contract not implemented: face 293 (B7 main halls ~58–61k sq ft) still rejected by the staff-majority rule (07-702/704/706). Apply: 2,532 rows, 1 door link, 3 exclusions, 1 approach, reversible.

## Round-2 rows
18 rows added (env-3 1, env-4 2, f1-1 2, f1-2 4, f1-4 6, f34-10 3 + 3 exclusion proposals). env-1 refused by validator (crosses atrium slab hole); env-2 kept open. Totals: 239 DWG-continuous, 87 assumed wall, 5 assumed column, 2,192 exact-contact, 9 owner-authorized.

## 97 omitted envelope rows
No hypothesis 22/97 (B9 lobby 0/13); + split-level-step rule 34/97 (lobby 12/13); + drop-edge rule 36/97 (311: Agora pin-9 0.997, ramp #1643796 upper landing 0.988). Drop-edge rule (measurement-only, needs owner approval): the part of a lower walking slab not covered by this level's floor is a barrier. Safety checks zero (pin 50, pin 99, terraces). Residue on 311: 79 joints (31 owner questions); generator refused 32 specs (22 no positive contact, 4 polygon-clipping SweepLine crashes, 4 unsupported floor, 2 foreign material); none blocks the Agora.

## Routes (bounded data)
- 07-180 → 08-107: AVAILABLE (component 37 → 468 nodes; 2,459 with face 293).
- 04-122 → 08-107: unavailable — face 293 no circulation (staff-majority); 07-163 split at B4/B7 slab seam (slab 423406/400238, x≈1.1, y 306.8–320.7; nearest nodes 15.63 ft apart > 12 ft attach limit).
- B7 07-180 → B9 09-232 and 08-107 → 09-232: unavailable as installed; available with (a) split-level-step rule (lobby ankle cut leaks under B7 floor), (b) drop-edge rule (Agora opens ~11.3 ft into lobby airspace over the step along ramp #1643796, x 108–144, y 449.5–461.4; step walls top 0.656 ft, sills 0.164 ft, lobby door heads 3.72 ft, all below the 4 ft cut), (c) reviewed landing attachment ramp:1643796:upper ↔ door:311:1951047:0 (6.7 ft). Then a 635-node component joins B8, B7 and the B9 lobby.

## Owner decisions needed
1. Split-level-step and drop-edge rules (split-level slab edge as an envelope boundary).
2. Agora landing attachment ramp:1643796:upper ↔ door:311:1951047:0.
3. Staff-zone contract for face 293.
4. B4/B7 seam link above the 12 ft limit.
5. env-1 (validator refuses the atrium seals).
6. 31 remaining Floor 1 owner questions.
