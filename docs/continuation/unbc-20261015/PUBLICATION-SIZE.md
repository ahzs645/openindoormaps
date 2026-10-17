# UNBC publication size estimate

Budget **about 110 MB for the complete visitor map**, with a **100–130 MB planning range** (95–124 MiB). This is an estimate from measured packages; the final visitor export with freshly verified caches for all seven scopes has not been built.

| Measured component | MB | MiB |
| --- | ---: | ---: |
| Canonical authoring master | 289.03 | 275.64 |
| Existing visitor ZIP, without prepared display caches | 59.57 | 56.81 |
| All seven previous display scope caches, including their index | 51.84 | 49.44 |
| Visitor plus those cache sizes, approximate total | **111.41** | **106.25** |

MB means 1,000,000 bytes; MiB means 1,048,576 bytes. The visitor omits RVT, GLB, full authoring annotations and review companions. It retains the physical geometry, routing, access rules and necessary stair evidence. Stair geometry is already included, so connection and access decisions should add little directly. Geometry repairs, changed scope variants and regenerated caches can change the final size.

The fresh Main Floor 1 and Floor 3 caches have the same logical payload hashes and compressed byte counts as their previous versions: **15.16 MB** and **6.20 MB**, respectively. This supports using the previous seven-scope cache total for planning. Five current-engine scopes remain unprepared, and visitor-bound caches require independent generation and verification; master caches cannot be copied or relabelled as visitor caches. Ordinary/native-height views share these payloads, so their sizes should not be counted twice.

## Download, website storage and memory

The current importer reads the **complete ZIP**. Selected floor workers inflate prepared display chunks lazily, but per-floor network streaming is not implemented. If a visitor ZIP is hosted using this package path, budget the complete approximately 100–130 MB map download plus app assets and basemap traffic. The individual floor cache sizes above are not current first-page download sizes.

The entire current website build occupies **68.13 MB** before HTTP compression and includes other venue demos and authoring workers. Adding the estimated visitor ZIP would make the full deployment approximately **168–198 MB**. Browser code splitting means this whole build is not downloaded on the first page. The small built-in IFC UNBC demo is separate from this reviewed Revit-derived campus map.

Download size is also separate from browser RAM. The prior authoring-map browser proof recorded a **1.70 GB main JavaScript heap peak**, excluding worker/GPU memory. That run imported an authoring master; final visitor-only memory remains unmeasured.

## Evidence

The read-only measurements, full ZIP entry inventory, scope payload hashes, assumptions and loader references are recorded in `/workspace/scratch/unbc-stair-review-20261015/size-estimate.json`.

| Measured archive | SHA-256 |
| --- | --- |
| `/workspace/scratch/unbc-review-20261014/UNBC.master.reviter.zip` | `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520` |
| `/workspace/scratch/unbc-review-20261014/UNBC.campus-viewer.zip` | `6b6b619f91dadb069c52971bc015c82d8096f5137dfa7e0c4886302c04faca49` |
| `/workspace/scratch/unbc-routing-fix/UNBC.verified-route-display.reviter.zip` — partial authoring candidate, two prepared scopes | `266367b3ff271e37c6d6ca69c0f891ed7159d0142f6dd1c9cf99b56c3f845590` |

The visitor projection and independent cache export are implemented in `app/indoor-project/package.ts` (`exportCampusViewer`). Whole-file import is in `app/pages/indoor-project-page.tsx` (`load`); ZIP expansion is in `app/indoor-project/package.ts` (`readIndoorProject`).
