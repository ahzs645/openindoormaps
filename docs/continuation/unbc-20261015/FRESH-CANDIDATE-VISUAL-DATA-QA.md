# Fresh candidate circulation paint and coverage reporting

The four previously authorized landing/corridor recolours bind the old dataset, engine, final progressive revision, exact prepared payload and scope. A new conversion does **not** automatically inherit them. Current source classification may independently produce green, but changing the publication hash alone cannot justify a new paint record.

The release checker [audit-candidate-visual-data.ts](/workspace/openindoormaps/scripts/indoor/audit-candidate-visual-data.ts) reads the actual selected prepared floor, routing/source records and small overview. It checks 04-122, 07-163, 04-124, 08-S101 and four native ramp approaches/landings in detailed fills, both cached overview collections and the small progressive overview. It also requires an exact feature multiset match for original prepared stair/ramp overview surfaces. These are **map-data checks, not browser screenshots** or proof of WebGL occlusion, smooth zoom, mobile memory or usable routes.

For a paint rebind, the helper requires the same original model/alignment, named levels/elevations, relevant source place geometry/classification/access, and a unique exact rational native face with the same room associations. Face IDs may change. Ring rotation/reversal/order may change; any positive coordinate difference, new tiny hole, ownership change or ambiguous match refuses. Paint changes only feature colour/circulation; all geometry objects, exact topology, heights, restrictions and other fields must remain identical. A refusal needs current source evidence; the checker never paints a newly enlarged face merely because it is nearby.

## Release order

1. Finish the current source compiler, verify its successful completion and unchanged frozen sources, then apply the exact reviewed consumer adoption. Generate and verify the official preparation engine before the strict current-policy postcompile replay. Use the completion-gated [R2 adoption runbook](/workspace/scratch/unbc-pathway-repair-20261015/stair-clearance/r2-consumer-adoption-executor/RUNBOOK.md) and [postcompile runbook](/workspace/scratch/unbc-pathway-repair-20261015/stair-clearance/r2-consumer-adoption-executor/R2-POSTCOMPILE-RUNBOOK.md). Preserve the source model/GIS and permissions.
2. Run the full current master/visitor QA and fresh original routing-cache generation using the [R2 candidate commands](/workspace/scratch/unbc-pathway-repair-20261015/navigation-qa/R2-CANDIDATE-QA-RUNBOOK.md). No old published routing cache is reused. Use the exact Main-floor scope `1450417,311,1487816` for the resident-floor worker test; preparing every floor is unnecessary for that test.
3. Export the final progressive visitor data using its current official exporter, with mandatory gzip, optional Brotli and checked routing parts. Run the strict original floor/overview projection against that same tested visitor package. This creates the final progressive revision; do this before binding paint or publication receipts. Keep actual source stair/ramp connector surfaces.
4. Run the visual checker on the **final projected directory**, first with the existing built-in review. It writes the exact source/geometry rebind evidence and a proposed display-only review if eligible. A stale-review green regression returns a nonzero exit status; the reports still exist. If it already passes through current source classification, record that result without inventing another classification.
5. If the rebind is eligible, rerun the checker with its exact proposed review. Repeat for the existing combined Floor1 scope `1450417,311,1487816,1425915`, using the same historical Main-floor evidence. Both runs recompute applicability; an arbitrary review JSON cannot replace the checked proposal.
6. If a runtime review is needed, install only the checked Main review plus the checked combined scope binding. First require both proposals to have identical decisions/model dataset/engine/revision; if their decisions differ, stop and investigate the actual face scope instead of merging blindly. Keep the complete evidence/report files with the publication. Recheck both scopes using the final compiled registry before publication.

The production paint registry and both paint decorators are outside the official preparation closure. The earlier 194-module scratch-clone cycle test (`1ae982…`) is historical planning evidence. The current R2 plan instead binds all 195 original official modules and the exact proposed 196-module consumer engine `2de300d66bdb0722fc407d1b04842274dd4a0267c5f4a2b306555d925da42f8a`. Its independent review is [r2-prospective-consumer-plan-independent-review.json](/workspace/scratch/unbc-pathway-repair-20261015/navigation-qa/r2-prospective-consumer-plan-independent-review.json), raw SHA256 `b4f89f3ed8dae1550b9be144896df8ae8035142634af20e7e819ad0fe73b365a`. It recomputes the current publisher-pin cycle controls without changing the running compiler. Neither prospective value is an adopted release receipt. Verify the actual installed official closure after adoption and any subsequent runtime change.

The normal visitor interface already gates the stair inspector/Review connection controls behind authoring review mode; the route profile menu uses Walking/Step-free. The paint checker changes no UI source, review flag or navigation classification. Actual desktop/mobile interaction proof remains a separate gate.

## Commands after final progressive export

Replace `/absolute/final-progressive`, `/absolute/fresh-qa` and the new output directories with the actual final paths. Run scopes sequentially. The checker decompresses only routing records and the selected prepared floor/overview, not all decoded floors, and creates each output directory exclusively.

```sh
node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/audit-candidate-visual-data.ts \
  --baseline-directory /workspace/scratch/unbc-progressive-delivery-20261015/visitor-corrected-final \
  --baseline-review /workspace/scratch/unbc-navigation-fast-20261015/circulation-paint-review.json \
  --baseline-scope 1450417,311,1487816 \
  --candidate-directory /absolute/final-progressive \
  --candidate-qa /absolute/fresh-qa/candidate-regression-report.json \
  --scope 1450417,311,1487816 --out /absolute/visual-main-current
```

If eligible, the checked-rebind run uses a new output directory and adds:

```sh
  --candidate-review /absolute/visual-main-current/proposed-circulation-paint-review.json
```

For the combined view, change only `--scope` to `1450417,311,1487816,1425915` and use new output/proposal paths. Keep `--baseline-scope 1450417,311,1487816`. The source QA report must have passed, bind the exact candidate ZIP and routing logical hash, and include the freshly prepared selected Main-floor dataset binding. The visual checker validates transport lengths/checksums and original pooled display decoding, but is not a replacement for that original source/display validation.

## Saved coverage count reconciliation

The companion [summarize-pathway-audit-counts.py](/workspace/openindoormaps/scripts/indoor/summarize-pathway-audit-counts.py) reads **already calculated** endpoint inventories, per-origin counts and bitsets. It checks every stored row/population, zero diagonals/padding, valid arrivals, every-origin original oracle count and reported denominators. It does not rerun any graph or route. Stable keys join the baseline/candidate, with added/removed destinations and lost/recovered arrivals separate. Common-identity pair losses and all-original-identity losses remain visible. Actual calculator cases/results are independently counted from their hash-bound artifacts and remain separate from graph pairs.

```sh
python scripts/indoor/summarize-pathway-audit-counts.py \
  --baseline /workspace/scratch/unbc-pathway-audit-20261015 \
  --candidate /absolute/fresh-qa \
  --out /absolute/fresh-qa/reconciled-counts.json
```

The saved original **visitor** baseline (routing projection `a7f91256cb2bbd8c6951d7fdab154d7f104c5e0c4bd0100b7e2abb1202cd3ddd`) has 1,855 eligible destinations, including the optional circulation/pass-through choices; 1,622 belong to the default visitor subset. There are 1,740 valid arrivals and 115 missing arrivals. Each profile has 3,439,170 directed nonself pairs. Walking reaches 2,332,104; step-free reaches 8. Walking has another **40 declared arrivals with no path to any other eligible destination**, additional to the115 missing arrivals. All40 also have zero incoming walking reachability. Step-free isolation is a different count:1,735 valid arrivals have zero outgoing step-free paths. These unavailable pairs include legitimate restrictions and unverified accessibility; they are not all software failures. Canonical authoring source preservation is checked independently; its raw projection is not assumed identical to the visitor projection.

The baseline's 192 actual worker connector cases are additional evidence, not 6.88million independently calculated paths. Same-place selections are excluded from the pair denominators and must not be represented as newly browser-tested UI cases. The fresh report must publish its own counts, endpoint changes, physical failures and actual calculator outcomes; historical115/40/28/7 blocker counts stay explicitly historical until freshly revalidated.

## Tooling verification before the fresh candidate

The actual historical Main and combined Floor1 prepared assets were decoded sequentially under a2GiB V8 old-generation cap. In both scopes all8 anchors passed in all4 collections (32sample checks per scope); the four reviewed exact native face footprints and relevant source records matched between scopes. No fresh paint pin or source geometry was installed. The old small overview predates connector publication, so this historical run checks native fill/overview anchors; complete stair/ramp connector multiset parity is reserved for the final connector-bearing candidate overview.

Eleven focused TypeScript test groups passed, including sub-IEEE rational changes/tiny positive holes, modified access/ownership/levels/alignment, ambiguous native faces, arbitrary historical recolours, paint-only immutability, four overview collections, missing/altered connector surfaces and added overhead stairs. Scoped strict TypeScript passed. Four Python saved-count groups passed, covering endpoint reorder, denominator/row/self/padding corruption, missing arrivals, failed actual cases and intended connector refusal. The real saved baseline's row populations/diagonals/oracle counts and192 historical actual connector results were reconciled without graph calculation. The complete946-file compiler freeze was independently rehashed unchanged.

Evidence is sealed separately at `/workspace/scratch/unbc-pathway-repair-20261015/navigation-qa/candidate-visual-data/final-tooling-receipt.json`. Fresh candidate visual-data results, actual routes, resident-floor worker memory and browser behavior remain outstanding.
