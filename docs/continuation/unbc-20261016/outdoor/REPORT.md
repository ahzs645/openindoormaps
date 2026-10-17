# Outdoor stair context retention — isolated proposal

The current package has **82 native source-flight displays and no context labels**. Historical, model-bound user review identifies **1842431 and 1460777 as outdoor**, plus **1801478 and 1779473 as tiered seating**. The other five excluded assemblies remain unclassified. Viewer exclusions are preferences; they are not classification or access evidence.

The isolated helper and eight focused tests are complete. Its actual selected-flight test restores only those four labels while preserving the geometry of all nine inspected flights exactly. **No production fix, new route, source-geometry certificate, authoring edit, prepared dataset edit or publication is included.**

## Seven excluded assemblies

| Native stair | Historic review | Display building hint | Display geometry | Polygons / distinct heights | Native run: bottom→top ft | Saved turning landing | Room-bound flight / route edge |
|---|---|---|---|---|---|---|---|
| 1842431 | outdoor | 07 | native-cache | 13 / 13 | 1842441: 0.000000→9.678478 | none retained | 0 / 0 |
| 1460777 | outdoor | 07 | native-cache | 557 / 34 | 1460781: 0.000000→14.435696 | none retained | 0 / 0 |
| 1821194 | Unclassified | 05 | native-cache | 217 / 31 | 1821222: 0.000000→14.271654 | none retained | 0 / 0 |
| 1523099 | Unclassified | 09 | native-brep | 18 / 18 | 1523100: -3.280840→10.892388; 1523104: 10.728346→14.271654 | 1523106 | 0 / 0 |
| 1844188 | Unclassified | 04 | native-brep | 7 / 7 | 1844215: 9.842520→14.271654 | none retained | 0 / 0 |
| 1728649 | Unclassified | 04 | native-brep | 5 / 5 | 1728666: 9.842520→14.271654 | none retained | 0 / 0 |
| 1727059 | Unclassified | 06 | native-brep | 5 / 5 | 1727073: 9.842520→14.271654 | none retained | 0 / 0 |

These polygon counts are not stair counts: for example, 1460777 has 557 polygons at 34 distinct heights. Building/level fields are display hints from the existing compiled inventory, not newly established source ownership or outdoor boundaries. Full exact values, run flags, bounds, native level IDs and the one retained landing are in `seven-assembly-inventory.json`; selected original rings are in `targeted-viewer-evidence.json`.

Every listed run has saved begin/end-riser flags. Its bottom/top values are *elevation metadata*, derived by `nativeStairRunEndpoints` from cached bounds, tread heights and thickness. They do not supply source-certified finite XY terminal lines, landing standing squares, a public approach or headroom. Only 1523099 retains an explicit native turning landing (1523106 at 10.89238845144357 ft); a missing landing in this display inventory is not proof there is no physical landing.

All seven have **zero saved room-bound display flights and zero graph edges**. All nine inspected assemblies, including the two seating assemblies, have zero matching graph edges. The complete 76 vertical edges were retained during extraction; all 28 `stairs` edges are still held. None of these seven belongs to the saved all38 original-source request inventory. We located no per-assembly complete source terminal/body/foreign-clearance/current-cell-policy qualification for them. Therefore the concrete routing blockers are missing *qualification evidence and graph/landing association*, not demonstrated collisions. Their physical feasibility remains unverified. New exact source/floor/approach/clearance work would be necessary before admitting routes.

The optional nearby-room/issue extraction hit its 1536MiB address-space cap and produced no output. It was stopped without a larger retry. No room-neighborhood, current-cell or per-issue conclusion is claimed from that attempt.

## Exact retention defect

`openindoormaps/scripts/indoor/prepare-unbc-stair-contacts.ts` assigns the four historical labels only to a prepared dataset. It explicitly asserts that `project.rooms` is unchanged. Its model SHA matches this package.

`reviter/lib/reviter/indoor-stair-display.ts` constructs new source-flight objects at line190 and returns a new inventory at its end. It never reads a persistent context review. `indoor-pipeline.ts` calls it at lines509 and1322, so either rebuild drops labels that lived only in the previous derived dataset. This is a metadata-retention defect; recovering labels does not certify the assemblies.

## Concrete isolated repair

`reviewed-stair-contexts.mjs` is a small dependency-free proposal. Its authored review is `reviewed-stair-contexts.authoring-proposal.json`, containing only the two outdoor and two seating records, source model SHA, historical script SHA/date, originating dataset SHA, and exact expected run IDs:

- Outdoor 1842431→1842441 and1460777→1460781.
- Tiered seating 1801478→1801503 and1779473→1779476.

It refuses a different model; missing, duplicated or conflicting assemblies; missing, changed, duplicated or reassigned run/tread ownership; malformed review provenance; unsupported contexts; and sparse arrays. It creates no geometry, node, edge, landing, access rule or clearance receipt. Unreviewed assemblies retain their existing object references. Historical classification is an explicit authoring assertion, not a new native-byte certification.

The safe adoption point **after the active build and source freeze** is:

1. Add a typed, validated `reviewedStairContexts` authoring field to the room-directory schema and preserve it through master-package authoring round trips. Seed it from the checked migration proposal only; never infer contexts from exclusions or an arbitrary old viewer. Model/stair/run mismatches refuse rather than silently reassign.
2. Pass that authored review as an explicit argument to `prepareIndoorStairDisplay`, and apply this helper to the completed result **inside that function**. Both pipeline calls must receive `data.reviewedStairContexts`, including the early inventory used during opening recovery. This central placement prevents either reconstruction from dropping the review.
3. Retain the existing conservative route-qualification behavior for outdoor/seating contexts. Add focused compiler/authoring round-trip tests under the new source revision, then perform the final regeneration, strict package/source checks, route regressions and matching preparation/cache rebuild together. Keep geometry and permissions unchanged and recheck all held links.

**Context affects stair qualification.** Even if edge bytes happen to remain identical, adoption changes source authoring/dataset/engine identity and must regenerate/rebind preparation and cache artifacts. No unchanged routing-fingerprint claim is made. The isolated helper is tested; that production integration and its final acceptance batch are not done here.

## Validation and input identity

- Eight tiny positive/negative groups passed (`retention-tests-final.log`).
- Actual subset parity passed for nine selected published flights, including four changed-run-owner negatives (`actual-retention-parity.json`). Every selected geometry operand is deep-equal; original selected flights and context-stripped result have JSON SHA522b56d8ef673164e513a45d08fb9b6c09b4aec2b113a30ab5ded6645215f7ca.
- ZIP member streamed and verified against its manifest:229156273 bytes, SHA f4761c369fd010e48b95e18a467b3adae76723220523b4cf54821f10bc2cafd8. Successful extraction used256MiB Node old-space, maxRSS244432KiB. No project/campus importer or native cache/RVT scan was invoked.
- Original model:8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178. Source rooms:f329b643c18c86fa611b0843da0b8c5924b9e211336005eeaf5020c76bffac50.
- No files under either repository were written by this task. Every code/report/output is in this isolated outdoor directory. Parent owns the independent package-download release.
