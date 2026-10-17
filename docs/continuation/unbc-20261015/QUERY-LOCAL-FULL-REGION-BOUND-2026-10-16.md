# Bounded full native-region feasibility attempt — 2026-10-16

The follow-up did **not** produce a complete native walking region or a baseline-versus-query-local validation comparison. The original [floor-only feasibility result](QUERY-LOCAL-SUPPORT-FEASIBILITY-2026-10-16.md) therefore remains the only measured predicate result. No optimization was adopted.

One scratch process attempted the actual saved landing pair `213b2ed1f5d008901a4e99f5f29c3a91600186e077f972a9d7e7d45b72377491`, using the exact whole-model and whole-dataset V8 snapshots already supplied to the native landing worker. It preserved every source/material/ownership/policy/uncertainty field; no geometry or guard projection was used to fit the budget. The intended comparison would construct the complete original `nativeWalkingRegion`, then compare unchanged full-width `supportedWalkingPath` with a copy that only selects the strictly relevant temporary operand before footprint support. Actual native holes and a same-plane door threshold were planned controls. None of those region/path/control stages ran.

The native model **successfully deserialized** in 7.96 seconds, with 592,879,616 bytes RSS after garbage collection. The process then reached its explicit 640 MiB V8 old-space cap while deserializing the complete landing dataset alongside that retained model. It aborted before the complete-dataset and region stages.

| Bounded attempt | Observed |
| --- | ---: |
| Total user/system CPU | 19.01 s |
| Wall time | 17.49 s |
| Peak observed RSS | 941,518,848 bytes, about 898 MiB |
| External RSS stop guard | 950 MiB |
| External CPU stop guard | 170 s |

The two worker inputs are approximately 240 MiB and 83 MiB serialized. Their exact bytes, source closure, bundle and WASM hashes are recorded in the [bounded report](/workspace/scratch/unbc-pathway-repair-20261015/query-local-region-qa/bounded-full-region-report.json). The actual [run log](/workspace/scratch/unbc-pathway-repair-20261015/query-local-region-qa/probe.log), [resource receipt](/workspace/scratch/unbc-pathway-repair-20261015/query-local-region-qa/bounded-run.json), [source closure](/workspace/scratch/unbc-pathway-repair-20261015/query-local-region-qa/source-closure.json) and unexecuted-region [probe](/workspace/scratch/unbc-pathway-repair-20261015/query-local-region-qa/probe.mts) remain separate scratch evidence.

The immediate interface limit is that `nativeWalkingRegion` requires the complete `ConvertResult` and complete prepared `IndoorDataset`, while these offline worker inputs are whole-object V8 snapshots. No complete region checkpoint or safe partial reader was available. This run failed under its chosen heap controls; it does not prove that every possible implementation would exceed 1 GiB. No higher-cap retry, field removal, guard reduction, second model load or broader search followed.

This concerns the **offline native landing worker**. Its native-model-plus-data snapshot is separate from the published route-only worker's dataset and memory/latency budget. It provides no visitor-loading or directions performance estimate. All 288 loaded source hashes and all 946 frozen production files were rechecked unchanged.
