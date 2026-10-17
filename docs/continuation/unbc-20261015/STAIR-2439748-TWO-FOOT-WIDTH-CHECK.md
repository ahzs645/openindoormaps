# Same-witness two-foot width check: stair 2439748

This addendum preserves the earlier [bounded vector review](STAIR-2439748-BOUNDED-VECTOR-REVIEW.md). It tests only whether the portable primitive's wider 2.35836-foot strip caused the transfer-corridor refusal at the **same already-selected upper witness**. No new candidate, waypoint, RVT scan, graph node, floor fill or production format was introduced.

The existing QA vector helper constructs a rational dyadic lower enclosure of the source advance's norm at 96-bit precision. The replay independently checks `lower² ≤ scaledNorm² < upper²`, exact perpendicularity to the actual transfer, and full-width squared at least `4 ft²`. At this witness the exact full-width squared is `4 + approximately 7.75145 × 10⁻³⁰ ft²`; the physical width is never reduced below two feet. The profile remains collinear with and no wider than the previous conservative strip.

The selected point stays approximately `[138.37214871294748, 173.78858202199407]` feet. All original four source-frame hashes match the freshly checked opaque run. The finite original end-riser crossing, full named-floor/tread sections, actual tread-depth and rise bounds, complete 145-cell material localization and retained 10 height-active cells continue to pass their individual checks. The source body/cap/intent corridor still refuses a **strictly positive 0.04372040185 ft²** residual, compared with **0.05013158460 ft²** under the wider profile. The 0.00641118275 ft² reduction does not remove the fixed-witness failure.

The earlier wider direct-approach refusal is preserved. No new-width direct approach or further alternative was searched because the transfer already fails. This result does not establish that every possible staircase path is impossible. It also does not establish global floor absence: the independent other-floor review retains floor 490040's unsupported outer-reference mode and floor 502039's unknown original world bounds. Its usable 427511 cap did not repair the earlier checked section/profile; no multi-floor support union was admitted.

The unchanged portable station contract remains restricted to x/y lateral axes. Full own/foreign six-foot headroom, complete current flat-approach policy, source qualification and calculator routes remain unproven. Stair 2439748 stays held.

Exact script and output:

- `/workspace/scratch/unbc-pathway-repair-20261015/stair-clearance/rotated2439748-original-source/check-same-witness-two-foot-normal.mts`
- `/workspace/scratch/unbc-pathway-repair-20261015/stair-clearance/rotated2439748-original-source/same-witness-two-foot-normal-corridor-replay.json`, SHA `e5339fb1eecf70a05fce42720329fc36c180411a6961da15c561659d7a6e0f48`

The replay checks all 946 active R1 source hashes before and after execution and uses approximately 210 MB RSS. The earlier reports and final receipt remain byte-for-byte intact. Scoped TypeScript passes. Independent QA review of the exact norm bracket, width, input hashes and positive residual was requested separately; its completion must be bound by a distinct receipt before claiming that review passed.
