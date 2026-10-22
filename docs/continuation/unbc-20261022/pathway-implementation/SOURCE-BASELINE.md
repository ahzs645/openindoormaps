# Source baseline for shared pathways and native presentation

The current Run-1 compile result was recovered from [the existing Drive archive](https://drive.google.com/file/d/15OrcynRH85dWnupwqHq-gMEYaPEF73ei/view) into task scratch. Its source bytes, package-member descriptors and workload inventory were checked afresh. [SOURCE-BASELINE.json](SOURCE-BASELINE.json) records the full hashes, exact elevations, all target cells and every circulation cell outside the current target set. This is source verification, not route or release acceptance.

Development starts from OpenIndoorMaps `662f400aa347dc79133d11923bfd90a7d24ea5c0` and Reviter `80177ed21becc91c02df48bb27cd1d24f5fbf297`. Current OpenIndoorMaps main already contains the inspected Run-1 changes and the stepped-stair worker projection fix. The native producer remains OpenIndoorMaps `b78a3147335f420834557b1c0321637c6b84b499` paired with Reviter `cb140e46d06d8fa728b059ab6068d58fb55e9ea9`; the latter differs from development Reviter only in documentation. Development changes create a new compiler epoch and cannot inherit old navigation or display receipts.

| Recovered artifact        |       Bytes | SHA-256                                                            |
| ------------------------- | ----------: | ------------------------------------------------------------------ |
| Compile-result archive    | 667,190,127 | `2dadeb7a41cfec54d573cdc29c8eecad284b9a74a20d1bac98eaae7a9bf3862a` |
| `UNBC.campus-viewer.zip`  |  55,206,326 | `8ad33533e28c387da03567e7979ced4268c7bc1cc3c8727b3762ea908d44546e` |
| `UNBC.master.reviter.zip` | 247,209,909 | `d4d36d188dd635cae7d4225abdb1a3707eed6427180e072f64fc59f4ea006dfc` |
| `compiled-dataset.json`   | 243,679,296 | `efd7efad5e8bc332e2a5eb68348d55241eb8c74bf386256f65b14bb40de07798` |
| `regeneration.json`       |     393,960 | `0854394e20a233f104353061d2cf631e0154fab2efb6bf94561439d858c77b2b` |

Files are under `/workspace/scratch/task-source/compile-result/output/`; they are not committed. The archive was downloaded using its normal shared Drive download after the connected Drive fetch reported its 256 MiB size cap. Its exact byte count and calculated full hash match the current handoff and package provenance. Master/viewer hashes agree with the recovered producer's `regeneration.json`; each manifest-declared raw member was independently hashed, including the original RVT, GLB scene, room/GIS files and authoring review bundle.

The viewer's complete `viewer/indoor.json` has 296,568,130 bytes and SHA-256 `951b2539d8e1df676bf376cfce5b6f71ed156e4d2be8b4928ff99f9190584e37`, matching the supplied implementation plan. Fresh enumeration reproduces 1,188 physical cells, 109 initial target cells, 2,884 eligible original walking edges and 2,016 original eligible terminal nodes. All 1,188 physical cells reference an encoded exact face. There are 170 circulation-identity cells; the remaining 61 include 59 with no original enabled walking edge assigned to that fragment and two whose original edges fail the endpoint-owner predicate. Those 61 have individual review entries in the JSON; absence from the target set is not an approved exclusion.

The 12 source native levels remain distinct. Current cells occupy eight elevations. Floor 1.5, Floor 2.5, Floor 4.5 and Floor 5 have no current cells and retain `REQUIRES_SOURCE_REVIEW` status. Their original source floor/stair IDs are preserved in the inventory. Neither labels nor source references alone admit a new walking surface.

No prepared shared-guide payload is installed in this visitor. Encoded exact faces are available, but the archive does not contain the lost independent supported-face sidecar or raw library attachment diagnostics. Current qualification must recompute native floor/envelope/material support through `nativeCirculationExactCellParts`; the historical cache result is not a new pass. The recovered master preserves original source assets, while the separate native-cache JSON has not been downloaded.

The October 22 handoff also records missing final acceptance inputs: the 09d baseline visitor/oracle, stationary-alias evidence and four algorithm-binding files. Recovery does not satisfy those gates. Fresh complete-cell compilation, actual source-edge and worker replay, normal package import/export, display/cache bindings, desktop/mobile/offline checks and final release acceptance must record their own outcomes. No canonical master, graph connection, access decision or held transition was changed, and no map was published by this recovery.
