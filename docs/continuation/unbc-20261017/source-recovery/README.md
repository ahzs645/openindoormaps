# UNBC source recovery and complete held-stair review · October 17

The original RVT and accepted authoring master have now been recovered from Drive
and verified by their recorded SHA-256 hashes. The previous statement that they
were missing described the former workspace state. They are available locally
again; the live version-13 116.53 MB development snapshot predates this recovery
and still omits these native authoring files.

## What is recovered

| Input | Bytes | Verification |
|---|---:|---|
| Original RVT | 70,336,512 | Exact model SHA `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178` |
| October 14 accepted authoring master | 289,031,229 | Exact archive SHA `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520` |
| Canonical rooms inside master | 82,049,198 | Exact recorded `f329b643c18c86fa611b0843da0b8c5924b9e211336005eeaf5020c76bffac50` |
| GIS references | 602 | Exact recorded hash |
| Review companion evidence | 890 files / 202,414,730 expanded bytes | Container, every file size and SHA checked; master retains packed evidence |
| Paired IFC | 83,798,926 | Exact recorded `adb85a6fb3f831e185f23ebc58f7416e3054c4c118f490275aa7e6cd31b599a0` |
| Autodesk SVF | 12,850,240 | Newly measured `d74cb3cd45d79bb46c4b044b3426cd33c60fd079146127ef1c024a6c69fad372` |
| Fresh base conversion cache | 405,405,300 | Reconverted original RVT; new SHA `a36d46455ae741b01c99646fb60653c26c8d3de52d931bacfff0ac479cdc13d9` |

Stable source links and every full hash are in
[recovery-inventory.json](recovery-inventory.json). The Drive connector's 256 MiB
file limit refused the 289 MB master. Its provider's standard download succeeded;
the resulting complete ZIP matches the original hash. No permissions changed.

The recovered master is the accepted historical authoring master that the failed
rebuild read. There is no evidence that the failed rebuild produced a successful
newer master: its receipt explicitly says no complete candidate and no outputs.
Do not ask for a nonexistent successful export or replace the accepted master.

The failed run's source indoor JSON can be reconstructed exactly by deleting the
single derived `nativeExploreMapping` field from that master, as prescribed by
the retained original input receipt. Its **176,425,121 bytes** match the recorded
SHA `4f814aca91b3550186953f101824ce9f6528b1994a391760cbfed26e3312931d`.
A reconstructed working ZIP is available locally. Its **109 other entries** are
byte-identical; the two changed entries are indoor JSON and its manifest binding.
All 111 entries and all manifest-bound hashes passed complete readback.
The reconstructed ZIP wrapper is **not** byte-identical to the lost input ZIP;
[working-input-reconstruction.json](working-input-reconstruction.json) records
its distinct digest. It is not a new accepted master or a successful regeneration.

## All held stairs and ramps reviewed

[ALL-STAIRS.md](ALL-STAIRS.md) lists all 28 original held links and their recorded
next repair group. The reproducible fresh review scanned all **3,666 original
RVT pages**, reread **38 runs**, **605 typed treads** and **7,537 source faces**,
and found **zero missing requested records and zero comparison mismatches**
against the retained original frame/height/coedge inventory.

The repair groups below describe recorded first blockers, not new full clearance
results. Each still requires current physical and policy replay:

| Recorded repair group | Links |
|---|---:|
| Multiple runs and connecting landing contract | 10 |
| Axis/rotated station handling | 5 |
| Original typed-riser handling | 6 |
| Reversed vertical-side face handling | 2 |
| Curved source geometry | 1 |
| Station proposals ready for full terminal/clearance checks | 3 |
| Priority source-proof/current landing-cell policy integration | 1 |

All four saved ramp edges pass source-model/certificate binding and exact saved
profile recalculation. The ramp audit uses saved triangles and support; it is
not a fresh original-RVT ramp reconstruction or a complete navigation test.
One ramp retains unknown accessibility. Seven user-excluded source stair IDs
have no corresponding saved stair edge; exclusion preferences were not changed.

No source point, owner, hole, obstacle, access rule or graph edge was changed.
**All 28 full stair links remain disabled.** A complete source record does not
prove a closed solid, doorway approach, landing support, body clearance, access
or a successful public/step-free route. Newly recovered IFC/SVF bytes are source
references, not automatic approval. No new desktop/mobile rendering inspection
was possible because the associated browser-control tool is unavailable.

## What is still missing and what actually needs it

- The exact former **1,271,906,669-byte transfer archive**, SHA
  `24119b663b78afc8250ceeefd13f5a0854a3c94a29f0d566d97961bd5f375253`,
  has not been found. It is no longer necessary merely to obtain the original
  RVT, canonical rooms, GIS or the 890 historical companions: those are restored.
- The historical **407,909,023-byte enriched cache**, SHA `5bf0e31bf51bcf72fc05ccd7ba3c344027f39098c6c422a8d89ee7f7243d5339`,
  remains absent. The newly generated base cache is separate. Reissue the two
  original-instance and 16 planar-definition source enrichments from actual
  source before relying on equivalent enriched material coverage. Do not rename
  or relabel the new base cache to the historical digest.
- The nine physical-floor checkpoint pairs and remaining failed-run source
  review/configuration sidecars are not recovered. Checkpoints are derived and
  can be regenerated; exact resume needs matching inputs, compiler, engine and
  Node bindings. Old receipt/log labels cannot restore validation authority.
  Recover exact review proposals where possible or reconstruct and revalidate
  them against current source; do not treat a successful logged receipt as the
  missing input itself.

The two previously admitted arrivals `rm-694-0bed6b73a3bd` and
`rm-694-504b25e5319a` must survive any future regeneration. Keep the preservation
failure intact. Restoring a historical working input does not fix that failure.

We can restart native source investigation with the recovered baseline. Exact
reproduction of the final failed-run state still requires the missing artifacts
or fresh evidence-bound regeneration. These are different goals.

## Reproduce efficiently

```sh
node --import tsx scripts/indoor/review-unbc-source-recovery.ts \
  /path/to/UNBC.original.rvt /path/to/current-visitor-indoor.json /path/to/review.json
```

The fresh source census is bounded to the 38 original requests while retaining
all source pages. For subsequent repairs, pick the exact row in ALL-STAIRS,
test its changed consumer and related source/physical/policy context, then replay
that connector up/down. Do not rerun the complete campus merely to change a
reader or audit report. Batch stable repairs before final map/navigation/UI
acceptance. No campus regeneration was run for this recovery review.

Six physical-inventory tests passed including the actual original-RVT case.
The first native TypeScript test runner could not resolve extensionless imports
in two other files; their ten tests then passed with the repository-compatible
TSX loader, including the actual Library shell refusal. Those are **16 unique
passing targeted checks**, not a fresh full suite or 28 successful routes. Raw
initial and corrected logs are retained. Typecheck and audit-script lint must
pass; no app runtime/render code changed.
