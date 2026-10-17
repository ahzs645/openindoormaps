# Native door boundary closure R2 review

The R1 compiler stopped before native-cell compilation/export because saved selection/display jamb evidence no longer matched recovered original native column profiles. This concerns derived selection/display thresholds; it does not create navigation portals or change physical doors.

The exact captured R1 prelanding stage (`a2c81e7c…`) contains 413 saved recipes: 395 pass, 14 have stale rectangular column proxies, and four refer to formerly unmatched source doors that are now source-connected but have no accepted physical portal. All 14 current column profiles retain their complete original 8–74-vertex geometry, including concave notches.

The mirrored reader now accepts an explicitly declared complete original native column profile only when it is a finite simple single outer ring, has one unique current nonapproximate original column owner, and matches that complete profile exactly. Legacy rectangular evidence retains its deterministic original owner-selection contract. Threshold rectangles, actual portals, measured tangent limits, normal depth, both-end contacts, floor holes, foreign material, fixtures and penetration guards remain unchanged.

Five recipes pass with their exact old thresholds after current-column rebinding. Three more pass after extending one tangent side to its existing 0.15 ft limit; widening both ends correctly fails penetration guards. Six fail even the bounded existing-limit probes. The four source-connected doors still fail actual-portal validation.

The proposed source lifecycle retains every original recipe. Eight originals become `superseded`, ten become `held`, and eight separately identified active records are appended. Only an absent `reviewState` is active. Unknown states refuse; held/superseded records retain complete structural validation and contribute no closure geometry or local partition evidence.

Both production readers replayed all 403 active records successfully on the exact captured R1 stage, preserving all 413 old records except their 18 explicit state fields. The descriptor has 421 total records. This stage replay is separate from a fresh source import, final selection validation, native-cell reconstruction and navigation tests. The three changed footprints and ten inactive recipes invalidate automatic reuse of the old landing checkpoint namespace.

Evidence is under `/workspace/scratch/unbc-pathway-repair-20261015/physical/door-boundary-closure-diagnosis/`:

- `all-current-door-closure-audit.json`: complete original 413-row current-source audit.
- `current-jamb-and-door-physical-replay.json` and `bounded-tangent-limit-proposals.json`: original physical guard outcomes and bounded proposals.
- `r2-active-production-replay-v2.json`: both production mirrors, 403 active records, approximately 566 MB RSS; exact input and executed immutable bundle/source closure hashes are recorded. The v2 proposal improves only new-record notes/evidence, preserving all physical inputs; the earlier replay remains historical.
- `production-r2-owned-final.json`: exact owned source files, before/after hashes and backups.
- `production-closure-regressions.log` and `production-profile-lifecycle-typecheck.log`: 49 passing focused mirror and existing regression tests, plus passing strict scoped typecheck.

The original proposal JSON's `sourceBeforeSha256=9c53723b…` was identified as an older diagnostic source context and must not authorize application. The source amender separately reconstructs the actual working-source → floor review → 29-boundary-review sequence before issuing a current portable review. The actual R1 dataset source binding is `3eae1ddd…`. No full-source hash is silently repinned, and the historical proposal remains distinguishable from a checked current application.
