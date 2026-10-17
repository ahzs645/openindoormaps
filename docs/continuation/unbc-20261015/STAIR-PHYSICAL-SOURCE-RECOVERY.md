# UNBC original stair physical-source recovery — 15 October 2026

All 28 held stair assemblies were investigated again through their 38 original native runs. The investigation fixes a second source-reader problem: the older diagnostic extractor still discarded complete original geometry records larger than 65,535 bytes, including records recovered by the new converter. Its split-frame branch then passed recovered large records back through the same limited page scanner. A missing captured body therefore did not establish absent source geometry.

The new `native-source-stair-physical-inventory.ts` reads the actual original RVT, verifies its model hash and embedded schema, inflates all 3,666 pages and consumes complete source frames directly. All four requested records exist for every run: original run semantics, placed geometry carrier, owned `StairsTriserSymbol` semantics and original physical definition geometry. No cached display mesh or paired IFC is used for source authority.

## What was recovered

- Complete original typed inventory: **605 treads across 38 runs / 28 assemblies**.
- Original physical generator histories bind **605 treads across all 38 runs** to their actual physical faces, using persisted index operands rather than nearest-height or mesh matching.
- The supported source census retains **7,537 physical-definition Face records**. Run 1298203 retains all 126 original cylindrical faces and 62 sampled walking coedges; the 31 physical walking roles are now bound, while curved body/trim admission remains unsupported.
- Two other runs, 2349454 and 1693335, each retain one physical face with unsupported semantics. Their tread histories are recovered; those physical faces are not deleted.
- **144 physical tread planes differ from their typed sketch heights**, and **276 physical tread faces retain nonidentical original UV coedge endpoints**. These source differences are recorded verbatim, without snapping, coordinate replacement, gap filling or discarded residuals.

The 1696006/1696012 Library candidate now has all 23 physical tread roles identified from original source history, including its turning platform. Its native physical definition contains 286 Face records / 580 existing source-derived display triangles before Float32 packing. Its six sketch/physical height discrepancies and twelve physical-top coedge discrepancies remain explicit. The raw original definition is 137,396 bytes; the old diagnostic scanner missed it.

## Per-assembly source coverage

“Bound” below means original source-history correspondence, not body, clearance or route approval.

| Stair assembly | Native run(s)    | Original typed treads | Physical tread roles bound | Remaining source interpretation                                                                                 |
| -------------- | ---------------- | --------------------: | -------------------------: | --------------------------------------------------------------------------------------------------------------- |
| 1293690        | 1293981, 1294068 |                    30 |                         30 | Original UV endpoint discrepancies retained                                                                     |
| 1295966        | 1296000, 1296189 |                    22 |                         22 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1298202        | 1298203          |                    31 |                         31 | All original curved faces/coedge samples retained; curved body/trim admission held                              |
| 1305141        | 1305306, 1305425 |                    18 |                         18 | Body/terminal/headroom gates remain separate                                                                    |
| 1496322        | 1496323, 1496326 |                    16 |                         16 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1498360        | 1498361, 1498364 |                    16 |                         16 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1498457        | 1498458, 1498461 |                    18 |                         18 | Physical/sketch heights differ                                                                                  |
| 1500191        | 1500192, 1500195 |                    16 |                         16 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1500288        | 1500289, 1500292 |                    18 |                         18 | Physical/sketch heights differ                                                                                  |
| 1514126        | 1514127, 1514130 |                    18 |                         18 | Physical/sketch heights differ                                                                                  |
| 1638837        | 1638854          |                    23 |                         23 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1689936        | 1689940          |                    12 |                         12 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1693246        | 1693335          |                    24 |                         24 | Unsupported physical face retained; Original UV endpoint discrepancies retained                                 |
| 1696006        | 1696012          |                    23 |                         23 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1779403        | 1779406          |                    26 |                         26 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1779495        | 1779498          |                    25 |                         25 | Physical/sketch heights differ                                                                                  |
| 1779620        | 1779623          |                    29 |                         29 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1903824        | 1903837          |                    23 |                         23 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1972504        | 1972518          |                    26 |                         26 | Body/terminal/headroom gates remain separate                                                                    |
| 1982431        | 1984014          |                    25 |                         25 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 1988738        | 1988746          |                    25 |                         25 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 2156084        | 2156103          |                    25 |                         25 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 2160665        | 2160668          |                    25 |                         25 | Physical/sketch heights differ                                                                                  |
| 2161350        | 2161353          |                    25 |                         25 | Physical/sketch heights differ                                                                                  |
| 2349441        | 2349454          |                    15 |                         15 | Unsupported physical face retained; Physical/sketch heights differ; Original UV endpoint discrepancies retained |
| 2354630        | 2354663          |                    21 |                         21 | Physical/sketch heights differ; Original UV endpoint discrepancies retained                                     |
| 2439748        | 2439788          |                    14 |                         14 | Original UV endpoint discrepancies retained                                                                     |
| 2474568        | 2474569, 2474572 |                    16 |                         16 | Original UV endpoint discrepancies retained                                                                     |

## Source boundaries and navigation status

The reader checks actual source frame lengths, echoes and Adler checksums, original run/stair/symbol ownership, one original identity-transform physical definition occurrence, declared face/edge census, and complete generator-history indices. A private opaque context stores immutable original frame snapshots. A copied report, self-hashed incoming geometry or a caller-authored frame inventory cannot create that source context. Every physical top retains its original plane, both UV endpoints for each directed coedge, exact rational plane evaluations and the original typed origin.

This is a source recovery and correspondence diagnostic. **It does not certify a complete closed physical body, actual terminal contacts, own-body clearance, foreign material/headroom, served-floor access, circulation attachments or navigation. All 28 held links remain disabled.** No source coordinate, restriction, graph edge, canonical master or published visitor asset changed.

A material pass in the older narrow band ending 0.1 ft above the walking surface does not establish human headroom. Full clearance must check the person’s complete vertical envelope, including upper flights and landings in the stair’s own assembly; blanket omission of the whole owned stair cannot prove overhead clearance.

## Validation and evidence

The current source-enabled focused suite passes 19 tests with zero skips, including the five priority runs, the actual curved run and the stepped/solid checks described below. It includes source-history duplication/omission/index/prototype controls and opaque-context/immutable-buffer boundaries. Strict scoped TypeScript and ESLint pass. The source helper and tests were independently reviewed by the navigation QA agent; no admission issue was found. The final source orientation handling respects the original plane flag with exact rational normal signs.

- [Current portable compact source evidence](stair-physical-source-evidence/all38-source-inventory-summary.v2.json). The earlier planar-only summary is preserved separately.
- Full exact source report: `/workspace/scratch/unbc-pathway-repair-20261015/stair-bodies/all38-physical-history-inventory.v2.json`.
- Source-only reproduction script and explicit requests: `probe-all38-physical-inventory.mts` and `all38-source-requests.json` in the same scratch folder.
- Focused source tests/logs: `source-enabled-tests.log`, `typecheck.log`, `lint.log` in that folder.
- Original RVT SHA-256: `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`.
- Original embedded source schema SHA-256: `d961c44726fe7fc32bce4425639481a5d5e91acecec7b7fd897610fc369f046f`.

## Next admission work

1. Bound the retained cylindrical body/curved trim source for 1298203 and interpret the two exact retained physical-face semantics in 2349454/1693335.
2. Establish a complete physical-body/closure and source-operation interpretation before treating recovered physical tread planes as route authority. Preserve typed sketch data separately rather than moving body planes to sketch heights.
3. Check actual original lower/upper terminal risers, landing surfaces and named supporting floor openings in the same physical coordinate authority.
4. Complete full-height own-body and foreign-material clearance, then rebuild original cap/door/cell approaches in circulation.
5. Only after every admission gate passes, run actual public routes both ways through each newly qualified stair, alongside disabled/access/one-way/step-free refusal tests and browser floor-change verification.

## Follow-up: actual body topology, uncertainty and stepped movement — 16 October

The new source-only helpers remain **unwired** from production admission. They add four distinct checks rather than treating a physical source census as route approval:

1. `native-source-stair-solid-proof.ts` visits every original half-edge, vertex fan and shell, then separately checks exact numerical face/edge closure and positive finite prism bodies. All 38 runs have closed abstract source topology. **Run 1293981 passes the complete exact native run-body certificate** (11 original prisms / 66 faces / 132 edges); its assembly's other run and all navigation gates remain separate. A copied certificate cannot reproduce the opaque source authority.
2. For Library run 1696012, all 47 source shells / 286 faces / 576 edges are closed two-manifold source topology. The exact geometric gate retains 212 UV coedge disagreements and 834 twin-face endpoint disagreements. These are distinct numerical embeddings of shared source topology, **not evidence of real physical airgaps**.
3. `native-source-stair-support-envelopes.ts` retains every original endpoint embedding grouped by original half-edge vertex incidence. Original cap inner support excludes every positive edge-sweep uncertainty strip; each shell's outer hull and full height band are obstruction-only operands. All47 Library caps/shells and337 vertices with competing embeddings are retained. The conservative flat-plan test crosses positive uncertainty at 20 of 23 internal joins (approximately 2.95e-32 to 1.94e-13 ft²). No strip is forgiven, filled or relabelled an actual gap.
4. `native-source-stair-stepped-stations.ts` independently verifies complete exact two-foot lateral support at actual physical tread stations. The actual turning-platform proposal has **24 supported stations covering all 23 physical treads**, 22 explicit vertical transfers and 46 proposed internal rise-then-go points. Every vertical transfer uses the next original physical plane height. The source run has 24 original ordered risers. Between-step uncertainty remains recorded as a proposed stepped transfer; riser correspondence, full body/terminal clearance and route approval all remain false. Missing/duplicated/skipped source indices cannot be hidden by a matching count.

The existing `validNativeSourceStairBody` calls `validateNativeSourceStairWidth`, which asks for continuous flat projected support and rejects zero-horizontal vertical segments. That contract does not yet express a physical stepped trajectory. A new supported variant must preserve original tread/riser indices and actual physical heights, keep ordinary floor and step-free rules strict, consume both original terminal bodies, and check the full person envelope. The unwired station proposal does not change that production contract.

The original schema has no separate GVertex coordinate field in this physical definition. GEdge stores adjacent-face references and paired UV endpoint records. The two placed-run GPoints are separate graphical carrier primitives rather than physical-body vertex references. All 576 original physical edge tags bind to 1,248 persisted EdgeHist entries and 157 CurveHist entries; no full physical-edge history tuple is shared across different shells. The full original history and run-parameter census is retained for explicit source-operation interpretation. The pinned upstream display mesher's tolerance-based loop deduplication does not establish navigation sewing authority.

### Internal upper-floor source transfer

The independently source-bound native floor 405772 check consumes 129 faces / 381 edges / 141 loops and preserves all six holes and every positive cap/side uncertainty operand. Across the two-foot lateral approach:

- Physical final tread 284 top: 33.710629921259844ft.
- Physical final riser 283 top: 33.95669291338583ft.
- Original upper floor top: 34.120734908136484ft.
- Guaranteed inner floor support begins at x = -1.0331061180773986 and continues to the internal requested source transfer point x = -0.9831061180773955.
- The final tread/riser/floor projection supplies the complete two-foot strip with **no retained projected support gap**. The old straight diagonal intersects 0.1000000000000063 ft² of native slab material; it is not a valid physical footline.

An explicit stepped trajectory must lift from original physical support before crossing the riser and then meet supported floor at the actual source height. This internal source transfer point is distinct from the actual canonical graph endpoint. The floor support result is positive; it does not approve the entire body's clearance or establish an original terminal attachment.

### Follow-up verification

All **19 focused tests pass with zero skips**, including fresh source-RVT extraction, the actual 1293981 positive body certificate, Library's 47-shell negative exact-closure control, full physical station support, positive uncertainty retention, concave support/notch preservation, hole-crossing lateral-width checks, source omission/duplicate/curve controls, immutable source snapshots and unforgeable handles. Strict scoped TypeScript and ESLint pass. Independent navigation QA found no authority escalation in the checked source body/census/certificate and bounded support-envelope boundaries; this is separate from complete mathematical and production functional QA.

Raw exact reports and reproducible probes remain in `/workspace/scratch/unbc-pathway-repair-20261015/stair-bodies`:

- `all38-solid-source-gates.json` and `1696006-solid-source-gate.json`.
- `1696006-source-support-envelopes.json` and `1696006-source-support-path-audit.json`.
- `1696006-upper-native-terminal-audit.json`.
- `1696006-original-stepped-stations.json` and `1696006-original-generator-history-census.json`.
- `source-proof-tests-final.log`, `source-proof-types-final.log`, `source-proof-lint-final.log`.

Exact rational operands use an explicit numerator/denominator carrier. Inspection-only numeric points do not replace those operands. No original model bytes, canonical archive, production qualification, enabled stair edge or published map changed in this source-only follow-up.

The expanded curve-retaining census is a metadata recovery correction. All 605 physical tread identities now bind, but the 126 original cylindrical faces and all 62 sampled curved walking edges remain explicit unsupported operands. No curve was replaced by an endpoint chord. The preserved planar-only v1 report records the earlier 574-role result; v2 is the current source census.

The latest source-bound stepped prototype also verifies every native named start/end riser, the original finite shared boundary line controls, and normal tread intent oriented by the original riser direction. The actual 24-station proposal passes its complete support/intent checks, while the full six-foot own-run/upper-slab v3 audit is positive. See [the guarded contract and remaining prerequisites](STAIR-STEPPED-BODY-CONTRACT-PROPOSAL.md) and [compact follow-up proof](stair-physical-source-evidence/source-body-stepped-followup-summary.json). Lower-floor source completeness and the full fresh foreign-material census remain required before admission.

### Lower trimmed floor and explicit logical attachment

Original floor402395 retains107 faces and515 edges. Its loop-free reference faces210/211 do not supply physical floor support. The actual upward trimmed face249 has seven complete loops, including six holes,103 original cap edges and three analytic-cylinder boundaries. A new unwired local support helper retains every cap sample and endpoint discrepancy, excludes every boundary sweep and all three complete cylinder enclosures, and checks full-width support. The original lower two-foot station is supported; a demand inside the real stair opening is refused. The helper does not certify the rest of the slab solid.

The actual physical top is24.27821522309713ft, while the original run nominal served-level height is24.278215223097114ft. This discrepancy is retained exactly. The proposed version2 attachment records a requested logical XYZ separately from the physical support point at identical XY; it asserts no exact3D contact and adds no walking segment through the slab. Original Floor associated-level400176 agrees with parent StairsElement base-level400176/offset0; the actual run's `m_stairsId` and symbol's `m_hostId` establish the explicit original ownership chain. The parent's reciprocal run/landing list is preserved empty. Full original graph demand binding, foreign clearance and runtime integration remain separate prerequisites.

The fresh original-RVT requested-station/level constructor and negative controls pass. Additional controls refuse an entire hole edge leaving a concave shell, even when its contact vertices pass the older topology index. The complete terminal-attachment flag remains false: a caller-supplied station/node label cannot establish an original graph terminal.

### Canonical graph demands and remaining foreign bodies

The actual canonical held1696006 nodes are `[2.327728994970098,-320.89781591346036,24.278215223097114]` and `[1.578773765958708,-320.9697773842104,34.120734908136484]`. The earlier internal source stations have different XY. The new opaque graph-demand helper binds exact node/edge/level/room/access identity from the full canonical dataset checksum31b3bc2d226fe006c404cfb4914ddac723e984c2d2f42cc91d6bdc095b1f2a27; it grants no body or route approval.

Source-floor approach candidates now connect those actual node coordinates to the internal stations. All lower L segments and the upper alternate through x=.5 have full exact two-foot floor support, with no positive/zero-area boundary uncertainty contacts. Full six-foot checks remain independent. The first upper approach encountered finite foreign material1074348 and remains refused.

All69 previously unbounded original ElementHeader1540 records were recovered and their full static/FIFO bytes consumed. All69 explicitly have `m_pBBox=null`, so that source provides no missing finite extent. Their deletion/appearance/regeneration parent lists do not establish physical containment. Complete original4318 symbol roots/FIFOs for307725/1071727 both retain `m_empty=0`, despite empty saved graphics. Complete original2031 root/FIFO replay for all68 placed curtain panels/mullions exposes actual `CurtainCellFamRef` / `MullionFamRef` host/grid/edge references. Their generator/host geometry is being investigated; no empty graphics or dormant reference became material absence.

## Fresh diagnosis of the two planar side exceptions

A single original-RVT scan on 2026-10-16 recovered both complete source cases: stair 1693246 / run 1693335 / definition 1693336 Face 148, and stair 2349441 / run 2349454 / definition 2349455 Face 76. Both are source slot 634 **vertical Planes with faceFlags 6**, cutType 0, nonnull complete reciprocal loops, zero regions and no foreground/background filling. Their components have six faces and twelve edges. The first complete definition has 296 faces / 594 edges; the second has 188 faces / 378 edges. Original frame hashes, raw flag/surface operands and component identities are retained in `stair-physical-source-evidence/two-planar-side-flag-exceptions.json`.

These two exceptions are a narrower stair side-consumer flag-mode gap. They are not missing bodies, curved treads, or unsupported positive walking caps. A future conservative side-envelope consumer must explicitly handle the original flags 6 side mode while preserving every face, loop, UV/twin discrepancy and original cap role. Current production source helpers were frozen for the first v2 integration and were not relaxed by this diagnostic. The curved stair 1298202 remains separate. No additional stair was enabled.


An isolated, nonproduction replay then allowed **only flags 6 vertical side planes**, retaining all original source flags and coordinates. It did not produce an exact prism body: stair 1693246 exposed 16 raw UV coedge and 919 twin-endpoint discrepancies; stair 2349441 exposed 8 and 614 respectively. The original strict reader's earlier zero discrepancy counts were early exits behind the unsupported face-mode check. These are competing numerical embeddings of declared closed source topology; they do not independently establish physical air gaps. The same bounded-uncertainty stepped proof family and complete floor/body/headroom/access checks remain necessary. Exact witnesses and source/candidate hashes are in `stair-physical-source-evidence/two-planar-side-isolated-prism-diagnostic.json`. No source certificate or route approval was issued by this isolated replay.
