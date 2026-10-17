# Query-local exact floor-support filtering — 2026-10-16

A scratch prototype can omit strictly distant whole components and holes **from a single support-query operand** while preserving the exact answer. It reuses the existing rational `nativeRationalIntersectionOperand` before the unchanged `nativeRationalFootprintSupported`; no new geometry arithmetic, policy or source-material representation was introduced. **Nothing is integrated into production.**

The current support predicate already exact-clips frozen operands with at least 128 vertices to cached 16 ft tiles. That path filters distant outer components but retains every hole in each retained component. Strict query-local component/hole filtering exists in the intersection broadphase and is not currently applied at the footprint-support call site.

For valid polygon operands, the existing bounds selector retains exactly the same material inside every query shell's bounds. Therefore `A \ B` equals `A \ filteredB`. The selector only omits a complete outer component or hole when its exact rational bounds are **strictly disjoint from every actual A shell**. Touching bounds remain. Unknown/empty subject bounds retain the original operand. Every retained ring is the original ring reference; no clipping, vertex rounding, new free-floor export or source-hole edit is performed by this selector.

## Bounded checks

Fourteen synthetic controls pass: distant component/hole elimination, an enclosing hole, a crossing hole, exact hole-boundary touch, exact outer-component touch, a multipart query whose second shell needs distant support, and a positive unsupported sliver, each in both winding directions. The prototype preserves the old boolean and the complete exact rational difference-output bytes. Source operands remain unchanged. A separate empty/unknown-subject check preserves the original operand object.

One actual saved landing-candidate first segment was tested against its **same-plane original walking-support floor operand**, native floor **1779842**, elevation **29.855643044619423 ft**, width **2 ft**. The saved candidate pair key is `213b2ed1f5d008901a4e99f5f29c3a91600186e077f972a9d7e7d45b72377491`. The complete selected checkpoint row is retained and its original candidate checksum replayed.

| Query-local operand | Components | Rings | Vertices |
| --- | ---: | ---: | ---: |
| Original exact same-plane floor union | 1 | 6 | 124 |
| Strictly relevant transient operand | 1 | 1 | 90 |

All five holes omitted from this temporary query operand have strictly distant bounds. All remain in the saved support/source. Both predicates return **true**, both exact `A \ B` outputs are byte-identical empty arrays, and input/support bytes are unchanged.

Observed individual predicate times, including filtering for each prototype call:

| Calls | Existing predicate | Selector plus unchanged predicate |
| --- | ---: | ---: |
| First | 22.06 ms | 12.81 ms |
| Repeat 1 | 22.10 ms | 6.25 ms |
| Repeat 2 | 48.18 ms | 7.09 ms |

The complete receipt includes user/system CPU times and RSS at every call. Observed RSS was approximately **524–530 MiB**, including deserialization of the 83 MB saved landing dataset. These few measurements are diagnostic and subject to GC/JIT/noise; they are not an end-to-end speedup estimate.

## Limits and decision

The actual operand has **124 vertices**, below the current 128-vertex tile threshold. This example therefore does not compare pruning against the expensive existing large-operand tile path. It also does **not** reconstruct the full source walking region, subtract walls/masks, establish ordinary-room ownership, check headroom or calculate a route. Those exact full-region operands are not stored in the landing snapshot; rebuilding them would exceed this bounded investigation. No additional source reconstruction or second actual case was attempted.

This is a plausible exact optimization to evaluate later against the real large region operands, with first-call and repeated-tile cache costs measured separately. It does not establish that the recorded landing-stage bottleneck will improve, and makes no visitor-loading or valid-route latency claim. The existing 946-file compiler freeze and all earlier directions artifacts remain unchanged.

## Evidence

The [complete report](query-local-support-evidence/query-local-support-report.json), [selected original candidate](query-local-support-evidence/selected-original-candidate.json), [scratch prototype](query-local-support-evidence/probe.mts), [run output](query-local-support-evidence/probe.log) and [hash/preservation manifest](query-local-support-evidence/evidence-manifest.json) are archived. The live checkpoint file may continue growing; the selected complete original row is immutable evidence, not the whole evolving log.

The source snapshot is `/workspace/scratch/unbc-pathway-repair-20261015/checkpoints/inputs/landing-dataset-a2c81e7c1b01e5d9f3c529c943326132123c709571588f1af3e33d15fa3c68cf.bin`. Reproduction script: `/workspace/scratch/unbc-pathway-repair-20261015/query-local-support-qa/probe.mts` with the existing Node/tsx environment and a 1536 MiB heap cap. The investigation stopped after one actual case within the requested five-minute scope.

## Bounded full-region follow-up

A later [full-region attempt](QUERY-LOCAL-FULL-REGION-BOUND-2026-10-16.md) successfully deserialized the complete native model, then reached its chosen heap cap while adding the complete landing dataset. It stopped before constructing any region or validating paths. The floor-only measurements above remain unchanged; full-region parity and a large-operand speedup remain unmeasured. This offline landing-worker input limit is separate from the published route-only worker's loading and memory budget.
