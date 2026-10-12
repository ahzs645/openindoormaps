# Drawing-backed patch family, envelope supplement F, q4/q5 — 2026-10-09 (transcribed by coordinator from the routing agent's report)

Status: implemented in both repos (committed by the coordinator as checkpoints); not yet run through a full rebuild.

## Code
- reviter: `native-indoor-envelope-supplement.ts` (patch F installed; authored parts byte-identical, `supplements[]` records, `authoredGeometrySha256`, refuses double supplement, `validateNativeIndoorEnvelopeSupplements`, `nativeIndoorEnvelopeAuthored`, compiler step `supplementNativeIndoorEnvelopes` whose barrier uses active correction rows, frame returns, wall-position repairs, junction repairs, own-level doors, door-boundary closures and other storeys' doors spanning the cut; reviewed exclusions subtracted).
- reviter `indoor-pipeline.ts`: F runs right after `verifyNativeProvisionalCornerSeals`; merged envelope re-verified; door vertical extent from native `elementBounds`; drawing-backed rows checked byte-for-byte against the registered DWG (`verifyDrawingBackedDrawingEvidence`); separate "drawing-backed-assumptions" counts; deferred landing door links resolved after `prepareReviewedIndoorRamps`.
- reviter `reviewed-landing-door-links.ts` (new), `room-directory.ts` (`landing:<rampRecipeId>:upper|lower` door links), `indoor-native-prepass.ts`, `project-package.ts` (parity vs authored envelope part), mirrored `native-provisional-corner-seals.ts`.
- OIM: `native-provisional-corner-seals.ts` (exact off-slab overlay; `verifyDrawingBackedDrawingEvidence`), `native-indoor-envelopes.ts` (`nativeIndoorEnvelopeAuthored`), `package.ts`.
- Tests: reviter 113/113 across 16 files; OIM 46/46. Typecheck clean except two pre-existing errors from bc2adc6.

## Rows
203 drawing-backed rows (dwg-continuous-seal 39, dwg-assumed-wall 87, dwg-assumed-column 5, exact-contact-closure 72; 16 enclosure-context-only). By decision: q3 95, q2 67, standingPolicy 31, q1b 4, q1a 2, q1c 2, q1d 1, q5 1. By level: 694 122, 1450417 53, 1487816 14, 400176 7, 402367 5, 2295121 2. All DWG-citing rows pass the registered-DWG check. q4 link `{doorId 1630256, levelId 1487816, rooms [landing:ramp:1622190:upper, rm-1487816-1a09473066a2]}`. Application script `routing-followup/scripts/apply-drawing-backed-rows.ts` (rooms.json 93fa4546… → b2c1cdd3…, reversible). 44 envelope candidates held (20 no DWG, 12 DWG on another level only, 10 DWG not continuous at re-measured points, 1 junction pseudo-owner, 1 472.7 mm > limit, 1 terrace).

## Results (exact overlay on shared extracts)
- 97 envelope rows: F alone 0; with 203 rows 5 (08-126, 08-141, 08-143, 09-354, 08-333). The earlier floating estimate of 27 does not hold under exact overlay.
- Safety: pin 50 lips 0 overlap, pin 99 not admitted, terraces 0 sq ft.
- B9 Floor 0.5 lobby: 0 sq ft. Blockers: (1) wall #1521392 has no row in prepared `nativeMaterialSections`; (2) at the lobby cut heights it is one free-space component with campus Floor 1 (via B7 Agora split level/ramp), which still leaks through 272 joints ≤0.003 mm plus 2.48 mm #1578277/#863143 (150.91,366.80), 1.40 mm #770939/#770796 (86.60,−32.29), 0.5 mm at (106.77,134.29).
- Floor 2 (694): still open at +4; remaining closures lack DWG backing.
- q5: 08-106 isolated (169.68 sq ft) with the seam row; ~3,800 sq ft shared face without it.
- q4: both door sides lie in the exact face containing the landing and 08-S101; unit-tested; real-model route-blocker crossing not yet run.

## Remaining
Material-section census gap; campus Floor 1 micro joints; F judges only +0.1/+4 cuts; full pipeline not run; F adds ~24 sq ft generic supplement even without rows; long correction-id lists; package validation checks supplement structure but does not re-derive it; 32+ owner decisions.
