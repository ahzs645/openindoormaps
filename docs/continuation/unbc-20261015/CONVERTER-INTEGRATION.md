# Reviter converter integration and UNBC retest

The selected geometry fixes from `codex/rvt-semantic-integration`, plus the independently found framing correction, are now applied to the local Reviter working tree after isolated subagent testing. Fresh original-RVT conversion and all-28 checks increase standard-constructor exact-width proposals from seven to ten, but none of those ten passes the current conservative material clearance. The full upstream branch is not merged, and no held stair link is enabled.

## Reviewable change

- Upstream commit: `0f225128b49a792bcd4047c6937c9d6bda18a919`.
- Current base: `1650863957c27b9342497b44acba3a21684a73a0`.
- Isolated snapshot of the existing stair/source work: `507a49c`.
- Converter-only candidate commit: `695c41fe2342372577a850773191248dfa58914a`.
- Required page-boundary follow-up: `5639207f4095d21910b2cc75f2e257d2e6d1b3c2`, directly on that converter commit. Recommend these selected changes together, rather than the full upstream branch.
- Worktree: `/workspace/scratch/unbc-semantic-integration-20261015/reviter-candidate`.
- Patch: `/workspace/scratch/unbc-semantic-integration-20261015/converter-only.patch`, SHA-256 `58e88a21de84d1f40ba80056e49ffe517f7a19aa0a8d89798c3d8ffed7e24343`.
- Final local branch: `codex/unbc-converter-validated-20261015`, pointing at `5639207` with `695c41` as its parent. The combined converter/framing patch is `/workspace/scratch/unbc-semantic-integration-20261015/converter-with-framing.patch`, SHA-256 `01b9b263f1e9061dd72025d276d587986819ce6871ba6baef90bb361b3611652`.

The root agent applied that selected patch to `/workspace/reviter` after backing up all affected original files. All **18 resulting files exactly match the tested candidate**, all **1,212 unrelated tracked/untracked file hashes remain unchanged**, the reverse patch check passes, and shared HEAD remains `1650863`. The shared-tree **56 tests pass with zero skips**, full TypeScript, scoped lint, the `/reviter/` Pages build and build-output checks all pass. Optional source/body/math helpers remain separate and unwired. No remote merge, push or canonical replacement was performed. Receipt: `/workspace/scratch/unbc-semantic-integration-20261015/SHARED-CONVERTER-INTEGRATION.json`; backup: `shared-integration-backup/BACKUP.json` beside it.

The patch recovers checksum-verified complete geometry records above the ordinary scanner's 65,535-byte limit, suppresses a shared-symbol fallback after an independently admitted actual body, and selects the supported normal-3D saved cut representation. Original sources retain priority and bounded supplemental work cannot evict them. Provisional or rejected bodies retain their fallback. Unsupported conditions and aliases retain conservative geometry.

The full upstream diff contains 259 files and approximately 91,000 added lines. This candidate excludes unrelated semantic exports, authored rooms, phase/design-option metadata, UI, WASM and the handoff-document deletion. The current drawing/material collectors and stair qualification work are preserved. It is a local candidate, with no push, canonical replacement or publication.

The independent review found a further generic streaming bug: the wide GElement collector reads the repeated owner through byte 30, while the stream previously advanced after only 22 bytes. A header split at that boundary could be permanently lost. Follow-up `5639207` adds an explicit minimum-header lookahead contract and covers both ID widths, translated classes, every relevant header split, one-byte chunks, partition reset and foreign-owner rejection. The old implementation fails five of the 13 new tests; the corrected implementation passes all 56 focused tests, full TypeScript and scoped lint. The root agent independently reran all 13 new cases successfully.

Fresh scans of all 3,666 original RVT pages under both implementations produce the same **184 ordered supplemental frames** (109 whole and 75 crossing), including exact bytes, hashes and source locations. Their ordered sequence SHA-256 is `5d20c661afb64918caba10dce0364d88c6893aa15d852064aad944b90d3a4351`. This establishes unchanged admitted inputs for this model; it is not a second full conversion after the framing fix. The sealed conversion/cache and all-28 results below remain attributed to `695c41`. Evidence: `/workspace/scratch/unbc-semantic-branch-20261015/independent-review/FRAMING-FOLLOWUP-REVIEW.md` and `framing-followup-review-receipt.json`.

The later **actual final-`5639207` conversion** also reproduces the complete `b7f1cb9…` scene, all 22 checked source-property hashes, all 362 original contour/tread records, the same fresh 82 source / 79 display flight output, all 61 strict floor outputs and the original 27 drawing-review acceptances. All 14 qualification module hashes and original annotation contexts remain exact, so the existing all-28 result is linked by unchanged inputs rather than relabelled as a new run. Both memory-bounded attempts are retained: the second writes every requested checkpoint, then its final whole-old-cache preservation read triggers the 2 GiB watchdog. Independent streaming checks after that controlled exit verify all durable outputs and original input hashes; no normal process exit or new full cache is claimed. Report: `/workspace/scratch/unbc-semantic-integration-20261015/final-framing-563-bounded-fields/REPORT.md`; equivalence receipt SHA-256 `90e484621706ffe8108a21860347caa779de787f5a871039c852ab13e41ef7b3`.

## Fresh conversion

The original RVT SHA-256 is `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178` (70,336,512 bytes). The candidate used `revitVersion: 2027` and ordinary production budgets, read all 3,666 pages and reused no conversion cache. Source and implementation hashes were checked before and after.

| Fresh measurement | Result |
| --- | --- |
| Complete large frames found | 109 |
| Newly replayed definitions | 108 |
| Existing primary owner preserved | 1 |
| Checksum/buffer/definition budget skips | 0 |
| Scene triangles / mesh batches | 898,491 / 31 |
| Element bounds | 40,611 |
| Fresh source stair flights | 82 |
| Fresh strict routing floor records | 61 |
| Conversion wall time | 184.16 s |

The fresh scene hash is `b7f1cb9d4f7026995c8ee81736d1dadb24703a2539c238aca757287eaa8b111e`, exactly matching the branch's saved UNBC geometry checkpoint. All 27 existing owner-reviewed drawing decisions pass the production source-identity check against the fresh extraction; no inventory or annotation was relabelled.

New cache: `/workspace/scratch/unbc-semantic-integration-20261015/UNBC.semantic-geometry.native-cache.json`, 405,981,332 bytes, SHA-256 `0a7d3b35420e51776899dc911e67c70085d06fed0a97ad754fba64d9564d9afa`.

Receipt: `/workspace/scratch/unbc-semantic-integration-20261015/fresh-conversion-receipt.json`, SHA-256 `3f2aa31e3a93f35175cf5f8975b00767edccff1c05e350ccf64a722f243c27a5`. The root agent independently verified the original RVT, new cache and patch hashes, the clean candidate worktree and the exact reverse patch check.

## Tests and limits

The integration verification records **145 unique passing test titles**, including the converter, record-layout, source guards and Pages build checks. The paired-source run passed 28 cases with the actual source fixtures enabled and zero skips. The independent review separately passed 91 unique cases: 13 new record-admission/layout tests plus 78 existing layout, stair-width/landing, slab-hole and circulation tests. These suite counts overlap and are not a combined unique total. Strict TypeScript, focused ESLint and the Pages build passed. The durable result is `integration-verification.json` alongside the candidate.

Independent review: `/workspace/scratch/unbc-semantic-branch-20261015/independent-review/INDEPENDENT-REVIEW.md`. Integration logs and selected/excluded hunk manifests are under `/workspace/scratch/unbc-semantic-integration-20261015/`.

The independent fresh-cache comparison passes all 12 controls: both retain **40,611 element records**, and **all 362 original floor/tread contour records match exactly**, along with native identities, stair assemblies, host/level relations and drawing facts. Whole element records are not byte-identical: admitted render-provenance fields change. All eight slab witnesses retain exact original loops and bounds, including their hole rings. Evidence: `/workspace/scratch/unbc-semantic-branch-20261015/independent-review/fresh-source-contour-parity.json`.

The saved 96-IFC-flight area and bounding-box gains are reference comparisons, distinct from the 28 held navigation links. The saved comparison has no closed-volume pairs for those flights. Source-loop parity establishes preserved routing floor-hole authority; it does not resolve local differences in the changed rendered slab surfaces or the wall 801614 extra-surface witness.

A later independent bounded audit checked the eight changed slab owners **400238, 427511, 437656, 501699, 1513098, 1521516, 1779842 and 1785600** against their retained original Float64 native definitions and independently tessellated paired IFC. Every new scene triangle matches the declared source/origin/Float32 conversion exactly; all 36 original contours, including 28 holes, remain unchanged. Numeric top-footprint symmetric difference with IFC decreases from **85.2733 to 2.3174 sq ft** across these explicit old/new cache inputs, with maximum boundary discrepancy about **1.6 mm**. All 28 hole cores more than 0.1 ft from their sketch boundaries have zero numeric top overlap; small curved boundary-strip overlaps also occur in the original native faces and IFC. These floating-point/GEOS and finite-probe checks do not certify topology, physical support, body closure or navigation. Five tiny quantized top triangles retain downward winding, and owner 1785600 is not admitted to the 61 walking-floor outputs. The upstream saved campaign's slightly worsened residuals were not reproduced on this audit's explicitly pinned inputs and settings. Report: `/workspace/scratch/unbc-semantic-integration-20261015/slab-hole-audit-695/REPORT.md`; final receipt SHA-256 `c5fce78963f499d811f03afabf222a38e24664624556dc494a43db05d7716f54`.

## Fresh 28-link result

The fresh run uses all 28 newly extracted held source flights and 61 freshly extracted strict native floor records: 66 parts and 114 holes. The old prepared flight/floor geometry is not reused as authority. The original 27 drawing decisions are independently accepted unchanged. Original foreign-instance envelope facts are replayed against the fresh source and remain obstacle-only evidence.

Exact-width proposals increase **7 → 10**. Four new passes are **1496322, 1498360, 1500191 and 2474568**. The older **1514126** proposal now correctly refuses because its fresh complete upper-run inventory and actual landing expose the unsupported inter-run path. This correct refusal replaces a formerly truncated proposal; it is not a lost verified route.

A separate fresh A/B control now confirms that these changes are attributable to the converter commit. Control `507a49c` uses the exact same current stair/source code, RVT, ordinary budgets and annotation/identity context, with only the converter fixes absent. It also produces seven width passes; the candidate produces ten. All other 23 outcomes are unchanged, all six shared passing receipt bytes match, all 61 strict floor outputs are byte-identical and all 362 original contour records match. The control scene has 901,903 triangles / 32 batches; the candidate has 898,491 / 31, reflecting both recovered geometry and removed duplicate fallbacks. Timings are not a controlled performance benchmark. Evidence: `/workspace/scratch/unbc-semantic-integration-20261015/control-507a49c/AB-COMPARISON.md` and `AB-COMPARISON.json`.

The corrected occurrence comparison retains all **79 display occurrences across 48 distinct stair identities**: 28 occurrences across 17 identities change and 51 are unchanged, with none added or lost. Of 82 extracted source-flight records, 31 change geometry. These populations are distinct; a dictionary keyed only by stair ID would incorrectly collapse repeated display occurrences. The v2 A/B report preserves the original comparison as history.

All ten standard-constructor width proposals retain conservative physical-material plan/height-band overlaps, with zero unclassified source IDs. The current census projects the entire object's geometry and uses its height bounds to select bands; that is not a complete exact 3D collision proof. **Zero standard-constructor material-clear or fully qualified stair routes** result. A separate fresh **1696006** control, with its unchanged 23 authored treads and 20 authenticated original riser projections, passes both complete width and the current material replay against all 61 fresh strict floor records. Its original walking-body, terminal, headroom and circulation gates remain unresolved. This supplemental control does not replace the sealed standard-constructor audit or enable a route.

## Separate source-body and material prerequisites

Two additional, unwired commits preserve the distinction between source evidence and route approval:

- `3ee2a187751c8476afe8b301e54401d0cd9d5fea` certifies only supported complete original **definition components**, using a hash-checked RVT, complete bounded frame inventory and unmodified exact plane/UV topology. Definition **1514133** passes; its placed wrapper's extra faces remain unsupported. All **22 actual-source tests pass with zero skips**, plus five independent inventory guards, full/scoped TypeScript and lint. Seventeen of 23 authored heights match original body planes exactly; six differ by one ULP. Those numeric differences do not establish missing steps or physical gaps. Receipt: `/workspace/scratch/unbc-semantic-integration-20261015/source-body-followup/FINAL-RECEIPT.json`.
- `a01552a4627be9c7a81dd0bb6354cf7f5cfc2f20` adds only a mathematical exact extrusion-height-section helper, covering solid cut caps, swept boundaries, translating holes, inclined overhangs, negative direction and real tiny gaps. Its **eight tests**, strict TypeScript and lint pass. It always grants no original-source authority, has no production consumer and removes no material blocker. Receipt: `/workspace/scratch/unbc-material-height-sections-20261015/FINAL-RECEIPT.json`.

A bounded alternative-path study tested 324 source-derived candidates for the four newly passing width proposals. Forty-two passed exact support; none cleared the retained conservative source boxes. This finite search does not prove that no physical path exists. Original source representations, complete placed bodies, terminal correspondence and headroom remain the next geometry work. Visibility flags, partial meshes and definition-only certificates cannot erase extra physical branches.

The optional helpers were also cherry-picked without source changes onto the final converter/framing candidate in a separate clean worktree, `/workspace/scratch/unbc-semantic-integration-20261015/reviter-combined-followup`, final head `c60253e30edae56b670d544332388fa7dbbeef0b`. All **43 combined cases pass with zero skips** (13 framing, 22 actual-source definition, eight section-geometry), plus full TypeScript and scoped lint. Eight sealed implementation/test/fixture files remain byte-identical, with no production consumers or routing admission added. This is a compatibility check of optional prerequisites, separate from the recommended two-commit converter change. Receipt: `/workspace/scratch/unbc-semantic-branch-20261015/independent-review/combined-optional-integration-receipt.json`.

Report: `/workspace/scratch/unbc-semantic-integration-20261015/fresh-stair-audit/fresh-all28-report.json`, SHA-256 `0e2e686b1b1d2606b6b2e0aa1bbadc965b3d3c11e42f99ad98f0af4a645a4f2e`. The separate `FINAL-RECEIPT.json` SHA-256 is `a9c190e31aa42264ed99026779d75f9f28c811ce5c039361815b65ce1832134b`. Its source-only enriched cache is separately hashed; it does not replace the sealed fresh conversion cache, canonical master or visitor. Diagnostic access wording follows existing profile policy: public-review unknown access may remain with disclosure; stairs never become confirmed step-free. No blanket explicit-public-access prerequisite was introduced.

Only links with independently complete original body, landing, terminal, clearance and access evidence may enter a regenerated circulation graph. Any admitted link then requires actual upward/downward calculator tests and screenshots. Existing canonical nine-route/112-held-policy results belong to the unchanged published-source dataset and cannot stand in for navigation through a newly compiled converter candidate.

See [the source-bound stair follow-up](STAIR-NAVIGATION-FOLLOWUP.md) for the owner drawing decision, conservative physical-obstacle proofs and prior stair diagnostics. Current progressive delivery remains separately bound to canonical master `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520` and preparation engine `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`.
