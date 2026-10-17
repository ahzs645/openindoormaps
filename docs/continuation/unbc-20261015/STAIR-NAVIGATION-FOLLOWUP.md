# UNBC stair source and navigation follow-up — 15 October 2026

**The 28 held inter-floor stair links remain disabled.** The completed owner-reviewed drawing-reference rerun removed the former import-semantic unknowns without changing any of the seven canonical width receipts. The independently recovered original turning path for stair **1696006 now passes exact width against canonical floor support and exact material clearance**, but not independent complete body/terminal qualification. All 28 were recalculated with zero probe errors; no new stair route is approved. The source candidate, actual obstacle findings and remaining gates are recorded below.

The separate [delivery implementation](DELIVERY-OPTIMIZATION.md) now includes metadata deduplication, progressive export and a new `/projects/visitor` loader with lazy floor/routing workers, verified persistent caching and explicit offline download. Legacy whole-ZIP import remains supported. Fresh all-scope export and browser measurements are being completed; the earlier 82 MB estimate is not a final measured package size.

## Implemented source work

- Added a strict schema-directed original stair FIFO reader. All **38 original stair-run frames** close exactly, containing **605 typed tread records and 643 declared source faces**. Original source frame/field spans, tokens and hashes remain available; unsupported or damaged inputs fail instead of producing partial inventories.
- Recovered an independently validated source-role candidate for run **1696012**, including all 23 typed walking faces and the real **31.9053 ft² turning platform** at its original height. This candidate is separate from the canonical annotations; its typed walking geometry does not establish a complete generated physical body.
- Added bounded paths within a single original concave turning tread. Every original tread remains visited at its own height. Extra constant-height segments must fit entirely within that same original tread. An unrelated landing cannot repair a missing within-run seam.
- Hardened the receipt constructor against prepared-only geometry. Every proposed landing must match independently recovered original geometry and a consistent source ownership chain. Every support face must match an independently recovered face on its actual original run. Missing, moved or fabricated surfaces cannot bridge a physical gap.
- Replayed authentic Library riser controls. For **2439748**, all 13 internal riser projections and internal walking strips pass; the upper terminal remains unresolved. For **1903824**, the original turning tread plus 20 independently valid riser projections cover the internal strips, while terminal/body qualification remains unresolved. These are source diagnostics, not runtime routes.
- Preserved original semantic headers and complete identity-instance container graphs in a new model-bound conversion-cache payload. A foreign parent stair box can be replaced only by a checked complete child census; physical children remain obstructions. Conflicting, absent, stale, cyclic or incomplete evidence retains the conservative blocker. Positive custom categories are not classified as metadata.
- Corrected source authority selection and tread multiset matching from the preceding review remain in place. Original model, room, access, GIS and canonical navigation data are preserved.

## Owner-confirmed drawing references and completed all-stair rerun

The owner confirmed that imported DWG floor plans are **drawing references only**. This decision is bound to all **27 exact original floorplan ImportInstance identities**, their original MasterImportSymbol names, independent source frame/fact hashes and the preserved RVT SHA. The exact source name `UNBC Floor Plan` is included without inventing a `.DWG` format. It is not a blanket category exemption, and physical native walls, rails, finishes and instantiated unknown definitions remain subject to clearance.

The compiler independently checks those original facts before using `reviewedDrawingReferences`. Both compiler and visitor bind material clearance receipts to the complete annotation; revoking or changing the review invalidates an old receipt. The mutable authoring policy snapshot also includes the complete review, preventing unchanged route arrays from reusing stale admission after a review edit. One real source-only import has no bounds record: this is accepted only because it has no material row to remove; duplicate/conflicting bounds and mismatched source identities still refuse. Five source-consumer tests and 24 visitor/source-stair/policy tests passed; the two counts overlap other suites and must not be added into a unique total. Scoped source TypeScript and lint passed.

The completed rerun is `pipeline/reviewed-drawing-reference-all28/report.json`, SHA-256 `5d1e5ac8cf78bc399539360804f3f49d2c6346b5cc41014be96207eb1fb96381`. It independently recomputed unreviewed and reviewed material against the same source cache, rather than copying older material outcomes. All 28 receipt counts and all seven canonical receipt bytes match the frozen baseline. It reports seven width proposals, zero canonical material-clear proposals, zero body/route approvals and zero probe errors.

The isolated original typed path for **1696006 / run 1696012** now has zero projected collisions and zero unknowns: drawing instances **402857 and 407273** are correctly excluded. Its exact material replay passes. A separate complete replay **passes exact width against canonical walking-support floors when its 20 authenticated original riser projections are included**. The raw material-only harness omitted those options; its false width result cannot establish a floor-support failure. The preserved correction is `pipeline/1696006-complete-width-replay-correction.json`. No independently checked IFC floor was silently substituted or relabelled as canonical authority. The approximately **1.69e-14 ft²** lower terminal residual remains retained. Passing width and material checks does not approve its body, access, served floors or route.

A portable source-only annotation candidate is saved at `reviewed-drawing-application-20261015/UNBC.drawing-reference-source-candidate.rooms.json`, SHA-256 `50d8296a66235d08294eb2128cd854b30bf977309ec4efe4c91b4c420980be8d`. Every original room-object byte except its final object delimiter is preserved, with only the checked review field appended. No original geometry or access changed. It is **not a regenerated master**: circulation was not rebuilt, prepared cache bindings were not relabelled and the canonical package remains unchanged. The accompanying source-candidate receipt records these limits.

## Actual navigation tests

The unchanged canonical dataset ran through `createWorkerRouteCalculator`, with actual physical validation and a single immutable calculator session. No route preview or validation bypass supplied these results.

| Actual input | Result |
| --- | --- |
| Public review: 05-136 → 05-173 | 64.8101 m |
| Public review: 05-136 → 05-342 | 43.8852 m; Library east lift up to Campus Floor 3 |
| Public review: 05-342 → 05-136 | 45.0829 m; the same lift down to Campus Floor 1 |
| Public review: Theatre 09-200 → Agora 07-180 | 69.1426 m; existing local steps #1644499, “Take the steps up” |
| Public review: Agora 07-180 → Theatre 09-200 | 68.3771 m; the same local steps, “Take the steps down” |
| Step-free: the four requested same-floor/lift/local-step checks | All correctly refused under current unconfirmed access/step-free evidence |

**9/9 actual route/profile cases passed.** Lift and step transition points match their original source polylines in the appropriate orientation. The existing Theatre–Agora connection is split-level local steps, separate from the 28 held ordinary stair links. Public-review routes retain warnings for unknown access. Different centered walking paths by direction explain the unequal reverse distances; this does not claim whole-route smoothing is finished.

**112/112 held-link direction/profile checks passed:** all 28 held stairs are absent from admitted public and step-free graphs in both directions. A fresh `enabled: true` clone of each held edge still receives its own missing-source-proof veto. Those are admission/refusal tests, not successful routes through held stairs.

The focused runtime/source-stair/centering suite passed **65/65 unit tests**, including actual synthetic calculator cases for disabled qualified steps, staff access, both one-way orientations, altered/missing stair proof, step-free exclusion and edit invalidation. The synthetic fixture approves no UNBC stair.

The first actual route took **613.68 seconds** cold; later public calculations took about 15–21 seconds. Lazy network delivery will not itself eliminate this CPU validation cost.

The scratch audit initially repeated a native walking-guard calculation in its held-policy loop. That loop was stopped with its incomplete-count assertion preserved, then all 112 cases were independently completed using the exact 1,285 native cell IDs and six walking blockers from the same validated production graph. Every actual route result was already saved. No production function, source dataset or validation rule was patched.

## Why held stairs are not enabled

**1514126** has no drawing unknown after the owner review. The preceding conservative source census retained neighboring stair parent boxes **2046769 and 1506328**: their deeper descendants include source-instantiated definitions **2046789 and 1506348** with null categories and no independent bounds. The definition-preservation guard correctly prevented a blanket metadata omission. The later original-instance-envelope proof below resolves these two parent overlaps while retaining their physical material; it does not resolve the stair's separate walking-path failure. Its legacy canonical path also truncates original upper-run heights, so a material-only result cannot certify that path as complete original walking geometry.

Other proposals still encounter genuine or conservatively retained foreign material and unresolved records. Complete original physical body evidence is also a separate requirement; a passing width replay does not supply it.

Five checked original `StairsTriserSymbol` roots replay completely but contain generator/history information without the physical `GNode` coordinates needed for a complete native body certificate. Some independent GElement geometry exists. This is the native-only decoder limitation; the subsequent IFC source recovery below supplies additional physical bodies rather than proving that no recoverable geometry exists.

Independent review rejected an automatic ordinary-stair qualification prototype. It could accept an incomplete native mesh, a prepared landing absent from the original model, or a fabricated support lip. Three negative regressions demonstrated the problem. **The prototype and its pipeline integration were removed from production**; its code and failing evidence are preserved only in the scratch `qualification/rejected-prototype` folder. No passing-test count includes those intentionally rejected prototype tests.

The applicable [indoor-enclosure review skill](/workspace/openindoormaps/.agents/skills/indoor-enclosure-review/SKILL.md) states: “Keep real stair apertures, landings, treads, terminal risers, ramps and neighbouring rooms separate. Visible source-model stairs/elevator shafts do not verify routes or wheelchair access.” Source-body correspondence and import/material evidence still prevent route certification; user authorization to fix and test the stairs is already established.

## Additional paired source recovery

The connected **UNBC BIM** folder contains the original paired IFC, SHA-256 `adb85a6fb3f831e185f23ebc58f7416e3054c4c118f490275aa7e6cd31b599a0`, 83,798,926 bytes. This exact IFC/RVT hash pair is already recorded in the sibling Reviter independent-IFC verification documents. Its ContentGUID and save count corroborate the RVT; its VersionGUID differs and is not claimed to match the original RVT revision GUID. Exact persisted native UniqueIds, IFC GlobalIds, placements and original physical geometry are checked separately.

The IFC census recovered 384 products across the held assemblies and descendants, 347 physical-body candidates and 5,191 declared representation items. All 38 base native runs have one body occurrence with matching six bounds within the measured binary64 residuals. Ten additional IFC flight occurrences are retained separately; they do not create new served floors. The original solid reconstruction supports 46 of 48 occurrences; two curved occurrences require separate source-curve support.

The separately preserved Autodesk SVF export provides a second identity and physical-body comparison. Full source assets and exact original native UniqueIds are retained. Neither a published 3D view nor a closed mesh alone proves complete hidden-source coverage. Whole-product and independent item evaluation can differ in their original binary64 arithmetic; rounded matches are not substituted for exact coverage.

Six priority base IFC products now also have frozen **v3 additive-source operand extractions**: runs **1514127, 1514130, 1696012, 1903837, 2439788** and landing **1514132**. Each primary body concatenates every untouched independently evaluated original Body operand. A separate whole-product kernel control retains its actual floating-point differences. The independent verifier checks actual IFC bytes, complete raw representation graphs, all original operand IDs, exact item/body hashes and every original cut/projection relationship; all six checks pass. This does not turn the extracted body into an admitted native stair route. Unsupported cuts, mapped/Boolean bodies and cross-source walking correspondence still need their own supported handling.

The new Reviter `paired-source-stair-body.ts` seam verifies a **separately reviewed, frozen extraction** against actual IFC bytes and independently decoded RVT identity, ownership and document facts. Its expected extraction digest must come from that independent producer manifest/receipt; freshly hashing the candidate itself is not an authority. The TypeScript consumer verifies source binding, graph/operand completeness, exact closed positive item topology and unchanged primary item coverage. It **does not independently re-evaluate numerical STEP geometry**. Its certificates explicitly keep numerical re-evaluation, native walking correspondence and route approval false. The seam is not integrated into ordinary-stair qualification or visitor routing.

Independent review strengthened immutable Buffer snapshots, alternate cut-record formatting detection, exact source-entity/operand/root bindings, source occurrence identities, document GUID checks and conflicting ownership checks. These are source extraction validation fixes, separate from the nine unchanged canonical navigation cases above.

All **18 source-enabled validator tests passed with zero skips**, including the six actual priority body extractions and source/ownership/omitted-operand/cut/snapshot regressions. Scoped TypeScript, lint and the Reviter Pages build passed. Independent review closed without further actionable findings; its source/test hashes and trust boundary are saved in `additional-source/paired-source-body-independent-review.md` and `.json`.

For **1696006 / run 1696012**, the actual original IFC upper floor **405772**, with all six original openings subtracted, strictly covers the previously missing upper terminal span. Both two-foot-wide terminal approach strips are strictly inside their respective original floor top polygons, with zero missing area. Original run-side correspondence still has tiny binary64 residuals, and whole-body binding/material/circulation gates remain separate. This is a physical-source advance, not an enabled route.

Its earlier material-only census against the original 23-tread turning path found **zero positive projected collisions**, with **402857 and 407273** then unclassified. The completed owner-reviewed rerun above removes these two drawing references and passes the material replay. The lower terminal also retains approximately **1.69e-14 ft²** of raw source-side residual; it was not filled. See `pipeline/1696006-material-only-report.json` and `pipeline/PAIRED-BODY-GATE-FINAL.md` for the precise remaining gates.

The all-run review also detected a real **0.000209 ft** original UV endpoint discontinuity on run **1988746**, distinct from numerical roundoff. Its diagnostic authored-role candidate is quarantined. Closed output triangles or matching heights cannot substitute for original edge continuity.

The earlier import-only recovery for **2228308**, master **2228283** and slave **2368545** retained unknown semantics because an empty stored geometry inventory did not establish its evaluated physical contribution. That historical blocker is now resolved by the owner-confirmed drawing role and independent original identity binding described above. No physical-empty geometry certificate was invented. See the subsequent `additional-source/dwg-reference-review-20261015/SOURCE-DRAWING-REFERENCE-REVIEW.md` and checked source/decision receipts; the earlier import-semantics report remains preserved as history.

## Independent walking/body correspondence checkpoint

The new, independently reviewed `paired-source-stair-walking.ts` prerequisite binds the separately frozen native authored-role inventory and independently reviewed original IFC extractions before comparing the demanded original tread patches. It preserves all native/source coordinates, checks the full prepared tread multiset, and uses exact rational coverage without a height tolerance, snap, buffer or discarded residual. Terminal floors, riser/landing continuity, own-body clearance and route approval remain explicitly false. This diagnostic seam is not wired into automatic stair qualification.

Ten tests passed with zero skips, along with strict scoped TypeScript, ESLint and diff checks. The actual original **1696006** inventory matches all 23 treads, but 12 heights lack an exactly equal upward source plane and the remaining 11 retain positive rational uncovered patches. Its independent native width and material checks pass; these cross-source body discrepancies remain unresolved.

A new **1514126** proposal now preserves all 18 original treads from runs 1514127/1514130, correcting the old truncated upper-run inventory without modifying the baseline. All three supplied original IFC bodies validate. One demanded tread patch passes strict physical correspondence; nine heights differ and eight patches retain positive uncovered area. Its original inter-run join also lacks a supported exact dogleg on the current native landing; the direct fallback misses 3.3169378644 ft². These are concrete unsupported gates, not an approved path.

The checked wrapper diagnosis identified missing source-instantiated descendant bounds rather than a corrupt ownership table. Complete raw source/ownership hashes and the acyclic direct seven-child graphs match. No category/null exemption was restored. The subsequent foreign-obstacle envelope proof is described below.

Evidence: `additional-source/walking-admission-20261015/WALKING-CORRESPONDENCE-REVIEW.md`, `FINAL-RECEIPT.json` (SHA-256 `5f1a0fe3eeb9b104ab7d46a4035d636c4bc90dc657694cbfbd6352d1c529f174`), `pipeline/original-typed-1514126-final/report.json` and `pipeline/1696006-complete-width-replay-correction.json`.

## Original foreign-instance envelopes

A separate conservative proof now retains the complete original boxes of carriers **1506347 and 2046788**, covering their definitions **1506348 and 2046789**. Both original carrier/definition frames are decoded again, their four persisted extent copies must agree exactly, and each carrier must be a complete identity-only instance with matching model, source, ownership and physical bounds. Every other physical child remains in the material census. The carrier's whole box is mandatory even when its rendered mesh is sparse. Unsupported frames, cycles, altered bounds and excluded carriers retain the parent blocker.

Each original definition has 42 faces, including **12 unresolved null-loop faces**. Those faces remain covered by the source box; this proof establishes foreign-obstacle coverage only. It does not establish a complete finite body, tread, landing, terminal approach, headroom or navigable stair. The legacy strict child API still refuses the missing independent definition bounds. The new source-only cache preserves all original geometry and ownership bytes.

The actual original-typed **1514126** replay removes the two parent-box overlaps. It still fails: segment 11 crosses six real rail/finish records **1514129, 1514134–1514137 and 1514145** on the unsupported inter-run path. These physical obstacles remain effective. Its older truncated canonical proposal now passes material, but that proposal is not complete original walking geometry. Negative controls **1298202 → curtain wall 2360983** and **1779403 → finish 1779477** remain blocked. All 28 held links remain disabled. Twenty-eight focused source/material tests passed; scoped TypeScript and lint passed.

Evidence is under `additional-source/wrapper-instance-bounds-20261015/`: `material-replay-receipt.json`, `source-extraction-receipt.json` and `cache-enrichment-receipt.json`. The separate source cache SHA-256 is `a90132d3e2801d1e7e95f94615f86e17f3bf0e8d1193263f69d8ebac2d4dc389`; its material-source geometry SHA-256 is `2fdb3336cbba4dd5f28476bc1b81b8c99f102c9ac507957b5c5e6f7824967ea3`. The canonical master and visitor remain unchanged.

## Fresh converter integration and all-28 retest

The user requested subagent testing of Reviter `codex/rvt-semantic-integration`, pinned at `0f225128b49a792bcd4047c6937c9d6bda18a919`. Its oversized-record recovery, admitted-body fallback suppression and narrow default-3D representation selection are combined with the current source/stair fixes in isolated commit `695c41fe2342372577a850773191248dfa58914a`. The required independently tested page-boundary correction is separate commit `5639207f4095d21910b2cc75f2e257d2e6d1b3c2`. Unrelated semantic, UI and WASM changes are excluded. The main checkouts and canonical source are preserved.

Fresh conversion reads the original RVT, recovers 108 additional complete geometry definitions and retains all 362 original floor/tread contour records exactly. A separate fresh A/B control uses the same current stair/source compiler with only the converter patch absent. Exact standard-constructor width passes increase **7 → 10**: new passes are **1496322, 1498360, 1500191 and 2474568**. The formerly truncated **1514126** proposal correctly refuses when all original treads and its actual landing are included. The remaining 23 outcomes are unchanged. All 28 links remain disabled: ten proposals have conservative material plan/height-band overlaps and 18 refuse earlier constructor/terminal gates. A projected overlap is not a complete exact 3D collision proof.

The separate original-typed **1696006** control passes complete width and material against the fresh source and 61 strict native floor records while retaining all 23 treads and 20 authenticated riser projections. Its independent original body, terminal, headroom and circulation gates remain unresolved. Definition component **1514133** now has a strict original-source prism proof; this does not cover the placed wrapper's extra physical faces. Separate mathematical section code is tested but remains unwired. No display mesh, copied walking receipt or visibility flag is used to approve a body.

The generic framing correction passes 56 focused cases; the original code fails five of its 13 new boundary tests. Fresh full-model scans admit the same 184 ordered original frames under both implementations. Source-definition tests pass 22/22 with zero skips, and the separate section helper passes eight tests. These suites are not a combined navigation-success count. The branch's saved 96-IFC-flight comparison and canonical nine-route/112-policy checks remain distinct from successful navigation through any newly compiled held link.

Full hashes, fresh A/B occurrence counts, scope limits and receipts are in [CONVERTER-INTEGRATION.md](CONVERTER-INTEGRATION.md). All-28 report: `/workspace/scratch/unbc-semantic-integration-20261015/fresh-stair-audit/fresh-all28-report.json`. Typed control: `/workspace/scratch/unbc-material-height-sections-20261015/fresh-typed-1696006-control.json`.

## Concrete remaining work

1. Complete the portable paired-source body binding against the recovered IFC, including exact native identities, every original Body item/occurrence/placement and source-curve correspondence. Preserve unsupported or mismatching cases as unresolved. Another copy of the already preserved RVT or IFC is not the missing work.
2. Preserve the completed owner-reviewed import roles. Resolve the remaining source-instantiated physical child-body census and retained curtain-wall/finish/rail obstacles; do not restore the rejected blanket null-category omission.
3. Bind every used tread, landing and support face to that independent original geometry. A prepared flight cannot be its own body authority. Apply only supported source annotations to a separate candidate.
4. Rebuild affected circulation and actual cap/door approaches. Old cell keys and display caches cannot be relabelled after source geometry changes.
5. Run new public routes both ways through each qualified staircase, source-path/instruction equality checks, disabled/access/one-way/step-free vetoes, and desktop/mobile floor-change captures. Rebuild the final visitor scopes before exporting or publishing.

## Evidence and preservation

New evidence lives in `/workspace/scratch/unbc-stair-completion-20261015/`:

- `navigation/NAVIGATION-EVIDENCE.md`, `canonical-route-cases.json`, `held-policy-recovery.json` and `verification.json`: actual calculator results and complete admission checks.
- `inventory/source-inventory-completion.json`, `strict-reader-all-runs.json` and the original source-role candidate: schema/frame recovery and original turning-platform evidence.
- `pipeline/physical-probe-final-surface-authority/report.json`: native-only baseline for all 28, seven source width proposals, zero qualifications and zero probe errors; current per-proposal evidence is saved alongside it.
- `material/symbol-body-census.json`: complete checked symbol roots and omitted physical body pointers.
- `material/SOURCE-MATERIAL-REVIEW.md` and `source-material-final-receipt.json`: historical source classification, converter checks and the evaluated-geometry export requirements. Current drawing roles and conservative wrapper behavior are documented by the later rerun above.
- `pipeline/reviewed-drawing-reference-all28/`: completed 28-stair paired material recomputation, exact input/code/baseline hashes, original typed 1696006 result and zero source changes.
- `additional-source/dwg-reference-review-20261015/` and `reviewed-drawing-application-20261015/`: all 27 original source identities, source cache, owner decision, checked annotation and portable source-only room candidate.
- `material/recovered-native-cache-with-material-source.receipt.json`: independently regenerated model-bound cache; the old cache is preserved.
- `qualification/rejected-prototype/`: excluded automatic-qualification experiment and its negative regressions.
- `additional-source/`: original IFC receipt/census, independent Autodesk source capture, native/IFC primitive and terminal correspondence, and complete import-root replay. Source recovery is separate from route qualification.
- `additional-source/PAIRED-IFC-RECOVERY.md`, `ifc-source-final-receipt.json`, `ifc-body-candidate-v3-manifest.json` and `ifc-body-candidate-v3-verification.json`: exact paired source identity, six frozen original additive bodies, and independent byte/representation/operation verification. The IFC itself remains an authoring input, not an additional 83.8 MB visitor download.
- `additional-source/correspondence/CORRESPONDENCE-HANDOFF.json` and `README.md`: frozen all-run role/primitive review, source-edge quarantine and strict terminal-floor coverage.
- `pipeline/paired-source-body-final-receipt.json` and `PAIRED-BODY-GATE-FINAL.md`: six body-source certificates, final production/test/log hashes, all 18 source-enabled tests and explicit no-route-approval status.

Canonical archive SHA-256 remains `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520`. Original RVT SHA-256 remains `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`. The historical route-worker projection fingerprint is `2d82460f6ebd13bf822e36202c123f5bad93712ed0fd4e4684962dcf8e338866`. The current projection is `afed8e6de98d6c59641163e9d6cb75883a90c9c2e5069ccbddc177cf634483ad`: its only change is omitting four optional empty display-only ramp body arrays so the unchanged complete dataset validator accepts the projection. Original physical ramp top triangles, certificates, access and source data remain byte-identical. The final production-helper full-validation run records both identities; historical measurements are not relabelled.

OpenIndoorMaps scoped and full TypeScript and Pages build passed; Reviter Pages build passed again after the paired-source work (`final-reviter-build-paired-source.log`). The finite-cap test fixture received a tuple-type annotation, with all seven affected tests passing. No canonical promotion, repository push, pull request or publication was performed.
