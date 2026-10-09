# Point-contact selection rule — 2026-10-09 (transcribed by coordinator)

Implemented in `app/indoor-project/native-selection-point-contacts.ts` (`splitNativeSelectionPointContacts`, version `native-selection-point-contact-split-v1`), wired into the strict branch of `deriveNativeAreas` with the version in `nativeAreaGeometrySha256`. Exact rational boundary walk; area must be preserved exactly or the part stays whole (never over-splits); positive-width seams, walls, holes, doors, portals, routing and access untouched. Reviter has no selection-region builder, so no compiler copy. 5 new tests; 121/121 related; scoped typecheck passes.

Result: mostly a no-op. The F34 report's "zero-width vertex contact" counts were mostly each ring's own closing vertex; the exact overlay already separates corner touches, two-point hole touches and T-touches (29 genuine shared-vertex touches campus-wide, most non-disconnecting; F34 dispositions corrected).

Measured on 16 saved production derives: 0 lost named singletons, 0 area mismatches. Baseline effects: 400176 isolates 03-2026 (133→134); 402367 isolates 03-3046A and splits 03-3021/3026 and 03-3073/3073A (138→139); 694 and 1425915 split unlabelled pieces only; no change with checked proposals applied. No intentional shared space split. 9 of 811 F34 contacts (all #400176) become unnecessary; 11 #402367 contacts are redundant even without the rule (`point-contact-rule/pinch-contacts.json`).

Risks: changes the selection geometry key, so prepared displays and native-area decisions bound to the old key go stale (acceptable: the next combined rebuild re-prepares anyway); region ids shift on affected levels (bind by room key). Heavy confirmation `point-contact-rule/verify-derive.ts` still to run after the 04-128 regeneration.
