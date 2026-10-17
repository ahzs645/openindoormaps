# Complete UNBC progressive visitor export

The complete candidate contains all seven supported display scopes. It loads the overview and search first, exact floor detail on demand, and the existing routing authority on the first directions request. The original whole-ZIP importer remains available separately.

This is a local, verified candidate; no deployment or publication was performed.

## Actual download sizes

Sizes below are decimal MB, measured from the final stored representations. They are map data only; application code, fonts and external basemap traffic are additional.

| Request | Gzip | Brotli |
| --- | ---: | ---: |
| First view: manifest, search shell, Main overview | 2.32 MB | 1.96 MB |
| First directions: complete exact routing projection | 24.03 MB | 14.10 MB |
| All map assets and manifest | 88.55 MB | 68.81 MB |

The complete gzip offline ZIP is **88.62 MB** (88,624,604 bytes). Hosting both compressed representations and the manifest requires **157.19 MB**; that is server storage, not one visitor's download. Raw identity representations are omitted by default. Their expanded logical payload would add approximately 656 MB of hosting storage without helping the current browser loader.

The first view meets the earlier 1–3 MB target. Exact routing is approximately 14 MB with Brotli and 24 MB with the gzip fallback. Those are measurements, replacing the earlier routing estimate. Brotli transfer sizes require an appropriately configured host; the browser safely uses gzip where suitable automatic Brotli HTTP decoding is unavailable.

| Scope | Overview gzip / Brotli | Additional details gzip / Brotli |
| --- | ---: | ---: |
| Floor 1 · Main floor | 2.08 / 1.73 MB | 15.71 / 13.45 MB |
| Floor 3 | 1.32 / 0.99 MB | 7.19 / 6.09 MB |
| Basement | 0.02 / 0.01 MB | 0.31 / 0.20 MB |
| Floor 1, combined physical levels | 2.14 / 1.78 MB | 16.08 / 13.83 MB |
| Floor 1 · Floor 1.5 | 0.06 / 0.05 MB | 1.10 / 0.91 MB |
| Floor 2 | 1.88 / 1.46 MB | 10.08 / 8.65 MB |
| Floor 4 | 1.14 / 0.86 MB | 5.75 / 4.99 MB |

Additional details include exact prepared chunks and the scoped presentation context. They exclude the already downloaded overview and shared routing asset. Shared content-addressed assets are downloaded once, so adding these rows does not give the complete-map total.

## Final artifacts

- [Final manifest](/workspace/scratch/unbc-progressive-delivery-20261015/visitor-corrected-final/manifest.json), revision `ce04f9a8f556d5383968d68b25b52a3ba1bd72d8877d09f1275756aefa5057c3`.
- [Complete offline map ZIP](/workspace/scratch/unbc-progressive-delivery-20261015/visitor-corrected-final/complete-map.offline.zip), SHA-256 `21fb0089d602f1b7e13ffa20d21204dd1b3bf9f7b3f22116de468b54dad58deb`.
- [Measured export/projection report](/workspace/scratch/unbc-progressive-delivery-20261015/visitor-corrected-final/projection-report.json).
- [Independent inventory, preservation and ZIP acceptance report](/workspace/scratch/unbc-progressive-delivery-20261015/corrected-final-acceptance-report.json).
- [Exact display-projection receipts](/workspace/scratch/unbc-progressive-delivery-20261015/visitor-corrected-final.projection-proof/receipt.json).
- [Exporter and hosting instructions](/workspace/openindoormaps/docs/progressive-visitor-delivery.md).

The final manifest has seven available scopes and no unavailable scopes. The earlier two-scope corrected preview remains separately identified and has no complete offline ZIP.

## Source, geometry and routing checks

The source was normally imported, exported through the existing campus-viewer path and independently imported again. A source-bound independent visitor checkpoint was retained. All seven exact prepared display scopes were then freshly prepared and replayed under preparation engine `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`. Existing master-bound cached scopes were not renamed as visitor scopes.

The input independent visitor ZIP is [the retained checkpoint](/workspace/scratch/unbc-progressive-delivery-20261015/visitor-final.independent-6cb0ff0f40efd478.campus-viewer.zip), SHA-256 `6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22`. Its source receipt retains the original canonical authoring archive SHA-256 `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520`. The independently validated visitor dataset is bound by SHA-256 `f4761c369fd010e48b95e18a467b3adae76723220523b4cf54821f10bc2cafd8`.

The final candidate also corrects an overview projection failure: geographic exclusion clipping previously dropped five valid Main-floor backing objects. The separate, versioned display projection uses the retained exact post-cut physical carriers and exact native-foot exclusions. It changes only each overview's `floor` field and explicitly records its algorithm, source revision and input/output hashes. It preserves source holes, ramp and stair cuts, all prepared descriptors and chunks, contexts, search and routing. The preparation engine binding stays unchanged. Its auxiliary algorithm digest is `1d32794e0505902b71938dcf9f1dd92bf9b3aa42228fc7898b323ca3b21a7e83`, covering 182 source modules.

Independent review checked all 16 Main physical backings against direct unpruned exact exclusion subtraction, all 34 saved supported white-pixel probes, preservation of the real hole, and seven negative/legacy controls. These passed. [Review report](/workspace/scratch/unbc-overview-speck-investigation-20261015/independent-projection-review/REPORT.md).

Final acceptance verified:

- All 114 assets and 228 compressed representations round-trip to their bound exact logical bytes.
- All 107 assets outside the overviews remain byte/hash identical to the sealed original seven-scope export.
- All seven prepared descriptors, pooled chunks and presentation contexts, plus routing and search roots, remain unchanged.
- The complete offline ZIP contains exactly 116 expected entries. Every archived stored asset was independently stream-hashed against the final manifest; its manifest and inventory match the standalone files byte for byte.
- The corrected two-scope preview used for the actual browser routing calculations has the same prepared, presentation-context and routing roots as this complete candidate.

The routing asset is the existing `routeWorkerDataset` projection, logical SHA-256 `a7f91256cb2bbd8c6951d7fdab154d7f104c5e0c4bd0100b7e2abb1202cd3ddd`. [Canonical-to-visitor projection proof](/workspace/scratch/unbc-progressive-delivery-20261015/canonical-visitor-routing-projection-proof.json) accounts for the ordinary visitor projection and proves exact complete JSON equality. Display receipts do not approve new walking connections. The canonical source's 28 held stair links remain held; the separate staircase review documents their status.

## Implementation checks

The delivery contract/export tests cover exact pooled replay, compressed-only and legacy identity representations, hash/length corruption, engine/source/scope rejection, complete offline inventory, original ramp context preservation and auxiliary projection lineage/preservation. Twelve focused delivery tests pass. The helper's six focused tests and seven independent negative/legacy controls pass. The bounded cache, stale requests, browser rendering, actual navigation and application-shell offline checks are documented separately in [the visitor client report](/workspace/openindoormaps/docs/continuation/unbc-20261015/PROGRESSIVE-VISITOR-CLIENT.md) and [offline shell report](/workspace/openindoormaps/docs/continuation/unbc-20261015/OFFLINE-APP-SHELL.md).
