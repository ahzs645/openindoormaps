# Floor 3 (#400176, #1487353) and Floor 4 (#402367) review — 2026-10-09 (transcribed by coordinator from the review agent's final report)

Nothing applied. All proposals "proposed", checked with unchanged production modules against display dataset 43ea3aa5…. With all proposals applied in memory, 0 named singletons lost; singletons 133→213 (#400176), 8→24 (#1487353), 138→231 (#402367). DWG evidence from the registered boundary reference in the review ZIP's floors/rooms.json (residual <2.5e-12 ft); DWG ids are (sectionId, wallSegments index).

| Disposition | Floor 3 | Floor 4 | Total |
|---|---|---|---|
| numerical-seam | 22 | 21 | 43 |
| drawing-backed patch candidate | 3 | 9 | 12 |
| mixed | 6 | 5 | 11 |
| intentional-opening | 2 | 2 | 4 |
Place level (315 instances): numerical-seam 146, drawing-backed 45, intentional 20, wrong-ownership 4, logical-front 1; 184 isolated after checked proposals.

## Findings
- Root cause is numerical: no contact repairs existed on these levels; most groups join only through zero-width vertex contacts or 1e-30–1e-12 ft seams. The production region builder treats a point touch as connected. A generic rule "an exact point contact does not connect selection faces" would resolve most of the remainder.
- 04-325/326/327/328: historical washroom/corner patches present as tagged walls, rooms still merged by micro seams; checked contacts isolate 04-325, 04-326, 04-327, 04-328A.
- Pins 47/48 (04-437/438): boxed-surround walls and door 1116997 aperture correction present; new leak 0.082 ft between divider #1016714/#1083793 and stepped facade #2362199/#2362312/#2362201 (DWG segment 29 crosses it); selection-only line `f34-logical-gap:402367:2362195-1016714` isolates both; drawing-backed seal is the long-term fix.
- Pin 50 Floor 3 counterpart: already fixed (`reviewed-off-limits:pin50-curved-glazed-rail:400176:20261006` and #402367 mask applied; no region overlaps).
- 10-3068 provisional box `user-assumed-solid-return:400176:10-3068` works (110.37 sq ft); still provisional.
- 03-3025/3032 and B10 group 330 isolated except 10-3005/3006 and 10-3012/3013/3016 (residual seams).
- Floor 4 B10: 11/14 isolated; 10-4034, 10-4064, 10-4086 still join the corridor.
- Floor 4 B5: 05-482/483/494/495/496 isolated; 05-458 joins 05-476/481 via a second joint.
- Door-threshold closures: none needed.

## Checked proposals
1. 811 nativeSelectionContactRepairs (424 #400176, 81 #1487353, 306 #402367): 801 original-free-cap, 10 finite-cap-overlap.
2. 8 nativeBoundaryPatches continuations (#402367): 04-417/418 59.2 mm; 08-407/408 and 08-409/412 facade joints 391.8/400.6 mm; 10-4036/4038 305.9 mm; 08-403/404 washrooms 205.5 mm; three 81.9 mm library joints. Physical supplemental walls; the drawing-backed family may carry them instead.
3. 7 reviewedAreaPartitions (selection only): `f34-open-entrance:400176:03-2001`; gap lines 06-356/358, 04-437/438, 08-406, 03-3034/3043, 05-494/483; 03-S303 lobby line. One corridor-only line marked do-not-apply. Partition hashes bound to geometry without the continuations — rebind if continuations go first.
Contact/guard file SHAs at check time are in every proposal; confirm Reviter validation parity before applying.

Drawing-backed candidates (proposals/drawing-backed-candidates-*.json): 04-303/304 (DWG pier ~1.0 ft taller than native), 03-2058/59/60 glazing joints, 06-340/342/344/346/302/362 glazed fronts, 08-408/409, 08-412/414, 08-416/417, 05-402/403, 05-484/487, 03-3021/3026, 03-3030 (pin 43, user: modelling accident).

## Owner questions
1. Lab suites 04-333/04-334 and 04-335/04-336/04-337 have doorless 2–3 ft openings in model and DWG — keep connected or selection-only boundaries?
2. 08-318/08-319: one prep room with two numbers?
3. 08-342 and 08-441 "Office" open to coffee/wait/print areas — stay shared?
4. 05-425 "Office" inside the 05-423 archives open area — stay shared?
5. 05-430 Archives Storage open to corridor 05-451 — is there a real door?
6. 03-3046 has a 3.7–4 ft opening to lobby 03-3045 — keep open?
7. 03-3087A Lounge open front like 03-2095 — keep open?
8. 03-2038/2039/2041/2052 reception suite open to hallway 03-2034 — keep shared?
9. 03-2007A, 03-2078A (Floor 4: 03-3007B, 03-3073B) "Copy" labels with suite-sized outlines and label points in the corridor — re-anchor labels or open copy zones?
10. DWG X marks on native floor between 10-3040 and 10-3056, beside 10-4054/4058, and north-east of 05-455 — shafts needing non-traversable footprints?
Intentional shared spaces recorded: 03-2095 (pin 31), 06-370/372/376, 10-3038/3042 waiting areas, 10-4548 Coffee, 05-476/481.

## Limits
Float/erosion diagnostics only located problems; physical-gate search ≤ ~1.5 ft; no browser/3D/height/routing verification; large intermediates gzipped (SHAs in evidence/uncompressed-sha256.txt).
