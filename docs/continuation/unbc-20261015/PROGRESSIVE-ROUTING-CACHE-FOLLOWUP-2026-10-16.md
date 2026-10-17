# Progressive directions cache follow-up — 2026-10-16

The progressive directions worker now consumes the existing checked published-route-cell cache path after it downloads the **actual routing dataset**. This closes one preparation seam; it does not remove the full interface's startup ZIP download or establish a new UNBC routing time. No compiled project receipt or route-cache receipt was changed. The current UNBC publication still needs a freshly generated, independently checked cache for the final candidate and current engine before it can use this path.

## Change and authority

`app/indoor-project/progressive-route-preparation.ts` first calls the existing `publishedRouteCellReceipt` against the complete worker projection, original source identities and current preparation engine. If no exact compiled receipt applies, it invokes the unchanged complete `createVerifiedProgressiveRouteCalculator` validation. It makes no cache request for an ineligible dataset.

For an exact receipt, the helper reads the content-addressed IndexedDB carrier or requests the compiled receipt's URL. It passes any present bytes to the existing `decodePublishedRouteCells` and `createPublishedRouteCalculator`; carrier/logical checksums, whole dataset/source/engine, original topology, face inventory, policy and graph guards remain authoritative. A corrupt, empty or oversized present carrier refuses. Its failure is not converted into a permission to skip validation. An absent optional cache, unavailable network/storage or offline cache miss retains complete ordinary validation. HTTP-decoded logical bytes remain acceptable to the existing decoder, but only exact compressed carriers are stored under the compressed hash.

`progressive-route.worker.ts` supplies freshly parsed `client.loadRouting()` data and delivery options only. Its message API cannot supply a publication policy; the helper's optional policy is publisher/unit-test injection. The data remains private to the worker and immutable during the asynchronous preparation. This is not an API for accepting a mutable editor object. Existing atomic clearing of the old calculator/data/revision before a replacement load remains intact.

No source geometry, physical clearance, accessibility flags, room ownership, route profile or cache format changed. The helper adds no eager routing download during map browsing. Full-interface overview-first delivery remains the larger controller/read-model work described in [the architecture assessment](FULL-VIEWER-ON-DEMAND-ARCHITECTURE-2026-10-16.md).

## Verification

- **18/18 targeted tests passed:** nine new transport/integration controls plus the existing published-cache and progressive-validation tests. The positive fixture is a small genuinely validated synthetic dataset, **not UNBC source approval**. Its public and accessible calculations match complete normal validation; the original dataset bytes remain unchanged.
- Controls cover exact compressed/logical carriers, offline/storage/network misses, wrong engine/source/whole dataset, present corrupt/empty/oversized bytes, rehashed bad topology/invented face inventory and duplicate-record refusal after a matching receipt's cache miss. The worker integration test checks actual source AST for real downloaded `nextData`, exactly two helper arguments and no supplied remote policy.
- Scoped strict TypeScript passed for the helper, actual worker and new tests. The production Vite build passed in **23.42 seconds** with its existing large-chunk/plugin timing warnings. No hosted browser, mobile, real UNBC latency or deployment proof is implied.
- Full **946-file** compiler freeze comparison before and after: **zero changes**. All three edited source/test files are outside that freeze and the official **193-module** preparation closure. Official engine identity remains `5c3c7e4c0e8160b77a4265d812e2b17411a107e851145a9f143cf87a9134fd1d` with the same complete module inventory.
- The single Vite build's binding plugin is write-capable. After the build, the generated engine source was compared **byte for byte** using `Buffer.equals` to the independently retained frozen before-image: **277 bytes equal**, SHA256 `222893b32e4c61beaa54d4d0d45727f9ced69da1ee547534a9ace570e326ba19`. That before-image hash also equals the original 946-file manifest. No further Vite build or binding writer was run for this follow-up.

Reproduction commands (repository root):

```sh
node --import tsx --test tests/unit/progressive-route-preparation.test.ts tests/unit/published-route-cells.test.ts tests/unit/progressive-route-validation.test.ts
node --max-old-space-size=2048 node_modules/typescript/bin/tsc --project /workspace/scratch/unbc-pathway-repair-20261015/progressive-route-cache-qa/tsconfig.scoped.json --pretty false
```

The source snapshots, complete test/build logs, scoped TS configuration, frozen before/after inventories and actual generated-engine before/after bytes are indexed in [progressive-route-cache-evidence/evidence-index.json](progressive-route-cache-evidence/evidence-index.json). This follow-up does not authorize reusing an old engine's cache, repinning unverified assets or claiming the full viewer now starts without its complete ZIP.
