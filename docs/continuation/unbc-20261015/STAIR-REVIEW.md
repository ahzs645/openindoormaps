# UNBC stair routing review — 15 October 2026

Follow-up: [source fixes and fresh navigation tests](STAIR-NAVIGATION-FOLLOWUP.md) now document seven mathematical width proposals, complete original frame recovery, nine actual calculator cases and all 112 held-link admission checks. All 28 held stair links remain disabled.

**The 28 held inter-floor stair links remain disabled.** This review recovered the original native model, audited every held link, corrected three compiler mechanisms, and ran original-source qualification probes. Three flights now have complete width/body proposals; none has passed the remaining complete foreign-material clearance gate. This is not a completed rollout of inter-floor stair directions.

The unchanged canonical calculator independently routed **Theatre 09-200 ↔ Agora 07-180 through existing local steps #1644499**: 69.1426 m going up and 68.3771 m returning down. It also calculated the source corridor check 09-201 ↔ 07-180 at 61.4583 m each way. The step-free profile correctly refused that route. These split-level local steps are separate from the 28 held inter-floor connections.

## Completed work

- Inventoried all 28 native IDs, seven buildings, served source levels/room identities, original source runs, platforms, doors, walking attachments, access records, exclusions and relevant owner decisions. There are 82 physical source assemblies; the other 54 do not acquire inferred stops.
- Recovered `ConvertResult` from the original RVT embedded in the canonical ZIP, using automatic version detection and no override. The model reports Revit 2027; its filename date is not the format version. Saved a model-bound native cache, checksums and the recovery script.
- Fixed source authority selection per original run. A stair with an accepted native BRep run and a sibling original-profile run no longer loses the sibling inventory. Present authored/BRep authority is not replaced when its binding fails. Each prepared tread consumes exactly one independently recovered original match; duplicate prepared treads cannot replace a missing original.
- Added a bounded landing-path proposal: a real original turning platform can supply a dogleg between runs. Every proposed two-foot strip is checked exactly, all original tread visits remain, and holes/caps/body/material/access guards remain active. Unsupported within-run seams do not receive detours.
- Fixed the foreign-material preparer to use the existing semantic non-model category classifier, require original ownership and compatible bounds for walking finishes, and retain unknown material as unclassified. No real wall, railing or neighboring stair body was exempted. Source-owned receipt platforms additionally require an exact independently recovered original landing and a consistent original owner.
- Traced the priority remaining material blockers back through original RVT frames and all 3,666 compressed pages (zero failed inflations). Flat imported geometry and omitted decoder categories were not assumed nonphysical.

## Qualification results and limits

**1514126 (08-S302 ↔ 08-S402):** source-owned landing #1514132 supplies the real return turn; standard original lower/upper cap candidates land on slabs #1505065/#1503517. The constructor now produces an 8.7238 m, 22-point, 18-tread proposal. Exact width and body replays pass. Its new terminal points still require regenerated lateral approaches before routing. Neighboring stair container bounds and unresolved original material prevent complete clearance approval.

The two neighboring parent records #2046769/#1506328 are not safely removable just because the renderer suppresses their boxes. Original assembly summaries omit some children, and the current decoded cache does not prove the complete nested geometry-reference graph. The real child bodies remain in the census. Original headers establish that #2046946/#2047019 are metadata, but that evidence has not been added as a new compiler authority.

**Imported instance #2228308 remains unresolved.** Its original header declares positive custom category #2228285. The normal header scanner declines that category; this is different from an original category-null record. Its flat bounds, level and import class suggest a CAD reference, but do not prove that it contains no physical material. No unchecked import decoder or category exemption was added.

**1298202 (04-S203 ↔ 04-S303)** and **1779403** also pass current width/body proposal checks. Clearance still needs original physical material classification and geometry: actual curtain-wall/top-rail material is retained alongside unresolved assembly records. The proposal lengths are 9.8159 m and 9.3201 m, respectively. They are not approved route distances.

**1696006:** original owner-tagged mesh contains a real turning platform, while the prepared sketch represents that turn as a roughly 0.011 ft wide strip. A one-riser height offset also exists. Recover original typed walking-surface roles/body before replacing this source representation; a polygon fill or tolerance change would conceal the problem.

**Library #2439748/#1903824:** original riser and terminal continuity remains required. A diagnostic turn inside the original wide source tread removes the substantive corner gap in #1903824, but tiny exact seams remain. Original typed continuity evidence is required; they were not rounded away.

The other 25 held links stop at an earlier source-height, terminal-support or full-width path gate. Later gates are not certified merely because they have not yet run. A failed bounded path proposal does not prove the physical staircase is unusable.

## All held links

Walking attachments below are existing old-node adjacency, including coincident aliases. They do not certify a continuous doorway approach to the new original cap. All endpoint access records are unknown; every stair stays excluded from step-free routing.

| Native stair | Buildings | Existing served identities | Walk branch at both old endpoints | Current first unresolved gate |
| --- | --- | --- | --- | --- |
| #1293690 | 04 | 04-S102 ↔ 04-S202 | Yes | No complete original two-foot path / slab-cap proposal |
| #1295966 | 04 | 04-S302 ↔ 04-S402 | Yes | No complete original two-foot path / slab-cap proposal |
| #1298202 | 04 | 04-S203 ↔ 04-S303 | No | Complete foreign-material clearance (width/body proposal passes) |
| #1305141 | 05 | 05-S103 ↔ 05-S203 | Yes | Original terminal heights / distinct native levels |
| #1496322 | 10 | 10-S301 ↔ 10-S401 | Yes | No complete original two-foot path / slab-cap proposal |
| #1498360 | 10 | 10-S301 ↔ 10-S401 | Yes | No complete original two-foot path / slab-cap proposal |
| #1498457 | 10 | 10-S302 ↔ 10-S402 | Yes | No complete original two-foot path / slab-cap proposal |
| #1500191 | 10 | 10-S201 ↔ 10-S301 | Yes | No complete original two-foot path / slab-cap proposal |
| #1500288 | 10 | 10-S302 ↔ 10-S402 | Yes | No complete original two-foot path / slab-cap proposal |
| #1514126 | 08 | 08-S302 ↔ 08-S402 | Yes | Complete foreign-material clearance (width/body proposal passes) |
| #1638837 | 05 | 05-S204 ↔ 05-S304 | Yes | No complete original two-foot path / slab-cap proposal |
| #1689936 | 03 | 03-S101 ↔ 03-S201 | No | Missing original supported terminal candidate |
| #1693246 | 03 | 03-S001 ↔ 03-S101 | No | Missing original supported terminal candidate |
| #1696006 | 03 | 03-S201 ↔ 03-S301 | Yes | No complete original two-foot path / slab-cap proposal |
| #1779403 | 06 | 06-S204 ↔ 06-S204 | No | Complete foreign-material clearance (width/body proposal passes) |
| #1779495 | 06 | 06-S205 ↔ 06-S205 | No | Original terminal heights / distinct native levels |
| #1779620 | 06 | 06-S206 ↔ 06-S306 | No | No complete original two-foot path / slab-cap proposal |
| #1903824 | 05 | 05-S201 ↔ 05-S301 | Yes | No complete original two-foot path / slab-cap proposal |
| #1972504 | 09 | 09-S202 ↔ 09-S302 | Yes | No complete original two-foot path / slab-cap proposal |
| #1982431 | 08 | 08-S101 ↔ 08-S201 | Yes | No complete original two-foot path / slab-cap proposal |
| #1988738 | 08 | 08-S201 ↔ 08-S301 | No | No complete original two-foot path / slab-cap proposal |
| #2156084 | 04 | 04-S101 ↔ 04-S201 | Yes | No complete original two-foot path / slab-cap proposal |
| #2160665 | 04 | 04-S201 ↔ 04-S301 | Yes | No complete original two-foot path / slab-cap proposal |
| #2161350 | 04 | 04-S301 ↔ 04-S401 | Yes | No complete original two-foot path / slab-cap proposal |
| #2349441 | 03 | 03-S103 ↔ 03-S203 | No | No complete original two-foot path / slab-cap proposal |
| #2354630 | 03 | 03-S104 ↔ 03-S204 | No | No complete original two-foot path / slab-cap proposal |
| #2439748 | 05 | 05-S101 ↔ 05-S201 | Yes | No complete original two-foot path / slab-cap proposal |
| #2474568 | 10 | 10-S101 ↔ 10-S201 | Yes | No complete original two-foot path / slab-cap proposal |

Nineteen pairs have existing branches at both old endpoints; nine lack one or both. Building 10 duplicate old endpoint groups are #1496322/#1498360 and #1498457/#1500288. The stored lengths for #1689936 and #2349441 are shorter than their own straight endpoint distances and cannot be reused. The existing 08-S101 up-flight-only restriction remains intact; no lower-storey stop was inferred.

## Actual calculator checks

| Input | Actual result | Time |
| --- | --- | --- |
| Public review: Theatre 09-200 → Agora 07-180 | 69.1425807491 m through #1644499 local steps; “Take the steps up” | 513.30 s cold |
| Public review: Agora 07-180 → Theatre 09-200 | 68.3771321310 m; “Take the steps down” | 10.85 s warm |
| Step-free: Theatre 09-200 → Agora 07-180 | Blocked; no confirmed step-free route | 0.32 s |
| Public review: 09-201 → 07-180 | 61.4582666984 m through #1644499 local steps | 423.05 s cold |
| Public review: 07-180 → 09-201 | 61.4582666984 m through #1644499 local steps | 8.98 s warm |
| Step-free: 09-201 → 07-180 | Blocked; stairs and unconfirmed connections excluded | 0.09 s |

The visitor example uses the same source graph edges in reverse, with raw length 71.7536 m in both directions. The centered walking paths differ by direction; their reported distances differ by 0.7654 m. Source stair points are retained unchanged in the correct orientation. A short backtrack remains at the native-cell boundary with the preserved ramp approach `walk:ramp:1622190:lower`; whole-route smoothing is not complete. Its original approach and access semantics need a separate supported refinement.

The production worker calculator ran without validation bypasses. Its source fingerprint is identical before/after: `2d82460f6ebd13bf822e36202c123f5bad93712ed0fd4e4684962dcf8e338866`. The original source stair polyline is retained. The result confirms a calculation on the unchanged canonical archive, not a fresh clearance certification under the changed compiler. Screenshot transport replays these saved calculator objects and reuses earlier completed import audits for the identical source; it does not represent another cold calculation.

## Required before enabling the held flights

1. Complete source-bound material classification for the three width/body proposals. A neighboring stair container may be replaced only by a proven complete original child and geometry-reference census, keeping every physical obstruction. Resolve the original imported-instance semantics or retain it as unknown.
2. Recover original typed walking faces, riser continuity and terminal contacts for the remaining cases. Keep exact holes, true platforms, source ownership, original heights and each served-floor restriction.
3. Build a separate candidate with only fully qualified source-cap connections. Recompute affected circulation/landing approaches; old cells or source keys cannot simply be relabelled. Preserve source room/door/lift/ramp ownership, access and unrelated arrivals.
4. Run actual public routes in both directions through each newly qualified staircase, veto tests for disabled doors/stairs and restricted areas, and step-free exclusion. Capture real departure/arrival instructions on desktop/mobile and compare all affected source/floor scopes.
5. Rebuild all required visitor display-cache variants, verify master/viewer preservation and cache bindings, and measure the final visitor export. No canonical promotion or publication was performed.

## Screenshots

The real product UI displays the saved, fully validated calculator results in `/workspace/scratch/unbc-stair-review-20261015/browser-proof/`:

- `theatre-to-agora-local-stair.png`: full 69.1 m route with access warnings.
- `local-stair-up-instruction.png`: actual “Take the steps up” instruction.
- `local-stair-down-instruction.png`: reverse “Take the steps down” instruction.
- `mobile-local-stair-up.png`: 390×844 mobile capture.
- `local-stair-step-free-blocked.png`: correct step-free refusal.

Forward and reverse full route objects exactly match the independent production calculator outputs; equality receipts and `replay-provenance.json` disclose the visual replay and reused identical-source import audits. These screenshots show local steps, not a newly enabled held inter-floor staircase.

## Validation

- 32 Reviter stair tests passed, covering source authority, landing paths, owned platform/finish guards and source-width regressions.
- 29 OpenIndoorMaps runtime stair/body/riser/terminal tests passed.
- Scoped strict TypeScript passed.
- OpenIndoorMaps production build passed in 48.10 seconds.
- Both repository diff whitespace checks passed.

## Evidence and preservation

- Read-only complete inventory: `/workspace/scratch/unbc-stair-review-20261015/stair-inventory.json`.
- Original-source physical gate report: `/workspace/scratch/unbc-stair-review-20261015/pipeline/physical-probe-final-multiset/report.json` (all 28). The corrected owned-platform material follow-up is `/workspace/scratch/unbc-stair-review-20261015/pipeline/physical-probe-owned-landings-1514126-1298202-1779403/report.json`.
- Original frame/header and container review: `/workspace/scratch/unbc-stair-review-20261015/foreign-stair-material-review.md` and `foreign-child-original-headers.json`.
- Interactive plan/native-height maps of all 28 original flights: `/workspace/scratch/unbc-stair-review-20261015/source-stair-review.html`. These are review maps with no route drawn, not product route screenshots.
- Actual visitor calculator output: `/workspace/scratch/unbc-stair-review-20261015/actual-visitor-local-stair-routes.json`; reproducible runner: `verify-visitor-local-stair.mts`. The earlier corridor check is `actual-existing-local-stair-routes.json`.
- Recovered cache: `/workspace/scratch/unbc-stair-review-20261015/recovered-native-cache.json`, SHA-256 `c8472c2f136492cf30a215671c1bd830312d7a32888f2d9ed296c14bc481d3d5` (authoring evidence, not visitor payload).
- Original source model SHA-256: `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`.
- Original canonical ZIP SHA-256: `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520`.

Original RVT/GLB/GIS, rooms, source annotations, access and canonical graph were not changed. Compiler edits and review artifacts remain local. No newly qualified master, published map or enabled held-stair route is claimed.

The publication estimate is documented in [PUBLICATION-SIZE.md](PUBLICATION-SIZE.md): about **110 MB**, with a **100–130 MB** visitor-map range. The final all-scope visitor export is not yet built.
