# R2 late admission preflight

A bounded check found no low-slab fixture collision with the 403 active reviewed display thresholds. It used the exact R1 prelanding dataset `a2c81e7c…`, actual native model `3915523d…`, and the reviewed **v2** closure descriptor `5d7a775e…`. All 38 original low-slab candidate occurrences and 44 complete strict polygon parts on eight eligible compiler planes were read successfully. There were zero positive threshold intersections, including the original threshold area. Peak RSS was approximately 908 MiB; CPU time was 16.5 seconds.

Every final strict fixture capable of naming one of these native levels must come from this candidate set: the compiler iterates `nativeCirculationElevations`, requires the same native level within 0.05 ft, and takes a complete strict `nativeFloorPolygons` part from `nativeLowSlabRecords`. Its overhead-floor and region-overlap checks only remove candidates. The probe omitted both filters, preserved holes, retained touching bounding boxes, and used the existing full-threshold intersection veto. Current intervening pipeline stages do not change the elevations, walkability or original support floors that select those planes.

This proves conservative fixture clearance for those exact operands. It does not create the final fixture inventory or approve a new source, cell, graph or route. The final same-source fixture-inventory and closure replay remains mandatory; changed model/plane/closure/producer operands require a new preflight.

Other completed checks passed: all 55 derived frame returns, all 3,200 provisional corner rows with the original initialized checksum-verified GEOS engine, both wall-position repairs, and the prepared floor-hole identities. A compact projection from the independently reconstructed source `3eae1ddd…` also passed actual source floor-hole binding, all 52 saved selection-threshold bindings and exact exclusion descriptor parity. The contact-repair batch reached its 90-second wall limit before returning; no conclusion is reported for that batch.

The preflight exposed an unvalidated new authoring-history field. Both normal readers now validate `nativeDoorBoundaryClosureReviewHistory` as bounded plain JSON with exact wrapper keys, model agreement, recomputed review SHA, unique entries and empty partition transitions. Ordinary source import validates it before expensive geometry checks. Both Reviter source-only package creation and reading also bind history to the actual archive model hash, including version 1 packages without an indoor dataset. Master import/export preserves valid history; visitor export omits it and visitor import rejects it. These metadata checks issue no geometry or route permission. Fourteen new/existing metadata tests and strict scoped typecheck pass, and both metadata readers preserve the actual 29,576-byte checked current source-history payload exactly.

Evidence is under `/workspace/scratch/unbc-pathway-repair-20261015/physical/door-boundary-closure-diagnosis/`:

- `sealed-late-preflight.json` binds exact fixture outcomes, executed immutable source closures, corrected guard receipts and remaining gates.
- `fresh-fixture-candidate-preflight.json` records the complete eight-plane candidate inventory and resource use.
- `history-current-source-check.json` binds both readers to the actual checked current source metadata.
- `history-hook-final.json` records owned source before/after hashes and backups.
- `history-hook-tests.log` and `history-hook-typecheck.log` record validation.

Earlier floor-binding and overlay-engine errors were standalone adapter refusals. Their logs remain historical; the corrected completed checks are named explicitly above. No failed check, geometry evidence or checkpoint hash was bypassed or relabelled.

To repeat the bounded fixture check, use the preserved executable and manifest together:

```sh
timeout 150s node --max-old-space-size=1280 --expose-gc /workspace/scratch/unbc-pathway-repair-20261015/physical/door-boundary-closure-diagnosis/bundle-fresh-fixture-candidate-preflight/entry.mjs /workspace/scratch/unbc-pathway-repair-20261015/physical/door-boundary-closure-diagnosis/bundle-fresh-fixture-candidate-preflight/closure.json
```

The source and initialized provisional/contact guard runner is `bundle-late-guard-preflight-v3/entry.mjs`. Pass `source`, `provisional` or `selection` followed by its adjacent `closure.json`, with `timeout 90s`, `--max-old-space-size=1280` and `--expose-gc`. Its original checked WASM is preserved beside the executable. The historical version 2 standalone adapters are not substitutes for these corrected invocations.
