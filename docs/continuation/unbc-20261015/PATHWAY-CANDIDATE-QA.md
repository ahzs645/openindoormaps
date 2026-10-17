# UNBC candidate navigation QA

The candidate harness is ready. A fully regenerated candidate has not yet completed its fresh import, all-pairs comparison and actual worker tests. The earlier published baseline remains the comparison source; prepared public caches are never accepted as validation of a changed candidate.

## Inputs and execution

Use the original visitor for reachability and the canonical authoring master separately for preserved source bytes. Their raw routing projections differ because authoring and visitor wrappers differ; the harness checks the meaningful physical authority parity explicitly.

1. Build review scope from the **actual exported master and visitor**:

   ```sh
   node --max-old-space-size=8192 --expose-gc --import tsx scripts/indoor/build-pathway-candidate-scope.ts \
     --baseline ORIGINAL-VISITOR.zip --candidate NEW-VISITOR.zip \
     --source-baseline ORIGINAL-CANONICAL-MASTER.zip --source-candidate NEW-MASTER.zip \
     --regeneration-report regeneration.json --stationary-evidence stationary-alias-evidence.json \
     --source-rebuild-receipt source-rebuild-input-receipt.json \
     --drawing-floor-rebind-algorithm-binding drawing-floor-rebind-algorithm-binding.json \
     --boundary-review-bundle-algorithm-binding native-boundary-review-bundle-algorithm-binding.json \
     --stepped-stair-source-algorithm-binding exact-regeneration-source-freeze.json \
     --out NEW-EMPTY-SCOPE-DIRECTORY
   ```

   Supply mapping-discard, floor-rebind and boundary-review options only when that explicit operation occurred. For the older singular member review, use `--boundary-member-review-algorithm-binding` instead of the bundle flag. The regeneration report points to the freshly replayed source receipts. The floor scope independently reconstructs only drawing rows' two named-floor binding fields and dependent descriptor/enclosure checksum references. A checked boundary bundle retains each enumerated historical applied recipe verbatim with status `proposed`, then appends its exact reviewed replacement with status `applied`. Original full native wall evidence and independently registered drawing bodies/registration stay exact. A separately declared current-source-cap variant binds the complete original recipe, actual current section/cap and original source body without treating different coordinates as equal; complete current column evidence and each proposal's context-bound digest are checked separately. QA decomposes the ordered operations, binds original source rooms, current model/cache, external review, fresh replay and the complete exact helper/dependency graph, and reconstructs every final annotation operand. It separately hashes every preserved source archive entry, including packed review companions. All original walking profiles are compared separately; current physical geometry and routes still require fresh original validation.

   Supply the stepped-stair option only for an actual `sourceSteppedStairV2Review`. That scope binds the exact external review, byte-identical portable copy and saved finalizer receipt, and checks the complete frozen source/worker dependency graph. It reissues private source capabilities from the actual original RVT, raw original room bytes and original graph bytes, not a saved diagnostic or self-hashed inventory. It reconstructs the exact finalizer input, checks every recorded field digest, reruns the original finalizer and requires its complete preservation receipt and resulting dataset to match. Current master and visitor worker projections replay both directions. Original terminal XYZ, room ownership, access and direction stay exact; all other held stairs remain disabled. Shared physical indices are included in graph deltas and exact master/visitor parity. Actual public routes must use the intended stair; accessible routes must exclude it and may use a separately qualified lift.

   A post-compilation worker projection amendment has a separate optional `--stepped-stair-postcompile-projection-review` input. It can authorize only the exact reviewed transformation retaining complete v2-bound terminal cells and the official freshly computed engine literal. It preserves the historical compiler closure and checks every other frozen file unchanged. It cannot waive a physical-cell digest or modify the source-finalized dataset. After adoption, the worker projection hash, engine-bound caches, admission records and actual bounded-worker tests must all be fresh. The scratch writer refuses to create this review until the exact patch and official engine literal are actually installed.

2. Run original validation, coverage and actual calculations:

   ```sh
   node --max-old-space-size=8192 --expose-gc --import tsx scripts/indoor/audit-pathway-candidate.ts \
     --baseline ORIGINAL-VISITOR.zip --candidate NEW-VISITOR.zip \
     --source-baseline ORIGINAL-CANONICAL-MASTER.zip --source-candidate NEW-MASTER.zip \
     --baseline-audit /workspace/scratch/unbc-pathway-audit-20261015 \
     --review-scope NEW-EMPTY-SCOPE-DIRECTORY/review-scope.json \
     --cases /workspace/scratch/unbc-pathway-repair-20261015/navigation-qa/user-selected-route-cases.json \
     --prepare-selected-scope 1450417,311,1487816 \
     --out NEW-EMPTY-AUDIT-DIRECTORY
   ```

   Refresh the generated engine binding through the existing tooling only after the production source freeze. The harness refuses a stale engine literal. It runs the original candidate importer and physical guards, then checks both profiles' complete directed all-pairs matrices against the original oracle and baseline. Every route loss is reported. An explicitly reviewed removed arrival is exceptional only when fresh original validators reject all its original moving incident walks and both original matrices prove zero incoming and outgoing pairs. Stationary aliases cannot use that exception.

   The 59 proposed stationary alias certifications require exact unchanged XYZ, owner, level, surface and source-cell authority, plus fresh independent source-helper replay. Near-coincident points, vertical displacement or actual passage cannot gain step-free approval through that scope.

   Enabled qualified connectors are calculated both ways in both profiles. Additional cases cover recovered arrivals and reachability gains, plus 38 user-selected Library, Agora, Tea Lab, corridor, rotunda, ramp and source-door cases. Physical parts, policies and guards are captured only from that fresh original calculation session and written as a new geometry-bound cache.

   The optional selected-scope flag reuses the completed original candidate import. It prepares exactly one existing `preparedDisplayScopes` member using the ordinary `deriveNativeExplore`, `prepareFloor`, codec and source-aware `loadPreparedDisplayAsset` replay. Main Floor 1 combines native levels `[1450417,311,1487816]`; one selected floor is not necessarily one native level. Arbitrary level assemblies, subsets, reordered lists and unavailable scopes refuse. Descriptor, binding and chunks are written under `selected-display-scope/`; their byte hashes and successful replay are bound in the final QA report. Other floors are not prepared. A standalone `prepare-selected-display.ts VISITOR.zip NEW_DIRECTORY LEVEL_ID,...` command is also available, but repeats the original importer.

3. After successful original QA, exercise the actual production worker transport:

   ```sh
   node --expose-gc --import tsx scripts/indoor/audit-candidate-route-transport.ts \
     --candidate NEW-VISITOR.zip \
     --qa-report NEW-EMPTY-AUDIT-DIRECTORY/candidate-regression-report.json \
     --resident-descriptor NEW-EMPTY-AUDIT-DIRECTORY/selected-display-scope/descriptor.json \
     --resident-binding NEW-EMPTY-AUDIT-DIRECTORY/selected-display-scope/binding.json \
     --resident-chunks NEW-EMPTY-AUDIT-DIRECTORY/selected-display-scope/chunks \
     --out NEW-EMPTY-TRANSPORT-DIRECTORY
   ```

   Do not pass a process heap-size flag or set its equivalent through `NODE_OPTIONS`; Node can otherwise override worker resource limits. The harness measures the actual worker heap limit, requires at most 960 MiB, uses the real `RouteWorkerClient` and unmodified production calculator worker, checks one fetch of the fresh candidate cache, and compares every result with the original QA. An optional independently bound selected-floor descriptor/chunk set measures simultaneous 2D floor residency. This is Node worker transport/memory evidence, not browser/WebGL or mobile QA. OOM, worker failure or timeout aborts the remaining cases and marks them untested.

4. Render actual calculated paths as standalone data figures:

   ```sh
   node --max-old-space-size=2048 --expose-gc --import tsx scripts/indoor/render-actual-route-data.ts \
     --visitor NEW-VISITOR.zip --routes NEW-EMPTY-AUDIT-DIRECTORY/actual-route-geometries.json \
     --status candidate --qa-report NEW-EMPTY-AUDIT-DIRECTORY/candidate-regression-report.json \
     --case user:original-library-example:forward:public --out NEW-EMPTY-FIGURE-DIRECTORY
   python3 scripts/indoor/rasterize-actual-route-svg.py \
     --svg NEW-EMPTY-FIGURE-DIRECTORY/actual-route.svg \
     --png NEW-EMPTY-FIGURE-DIRECTORY/actual-route.png
   ```

   The rasterizer uses CairoSVG; `--runtime` may point to a separately installed local dependency directory. The renderer checks actual visitor, indoor payload, route projection and successful QA/route-output hashes. It does not calculate or hand-draw directions. It paints stored numeric native floor parts with every ring/hole, clips saved room identities to those floor parts, and projects only stored displayed ramp triangles. It never invents a ramp hull or paints its underside. Exact residual authority stays in the bound input rather than being rounded into substitute polygons. Separate floor panels show every actual path, with a dashed transition projection explicitly labelled on both served levels and original start/end ownership retained. Zero-movement and unavailable calculations do not produce a fabricated path. Every artifact says **Map-data render of actual calculated route** and **Not a browser screenshot**; baseline inputs additionally carry a prominent baseline label. Renderer and rasterizer receipts bind their inputs and outputs.

## Publication preparation sequence

The running source compiler must finish before refreshing generated bindings or modifying compiled publisher receipts. Freeze the final production source, then run `node --import tsx scripts/indoor/prepared-display-engine-binding.ts /workspace/openindoormaps`. Both candidate QA and progressive export refuse a stale engine literal. On 2026-10-16 the read-only graph contained 181 modules; neither publisher receipt module was part of that graph, so adding reviewed receipt records does not create an engine/cache dependency cycle.

Run the original QA and bounded actual worker tests above before preparing publication admission. Its `fresh-routing-cache/receipt.json` already contains the original physical parts, policies and guards under the fresh route projection and current engine. There is no need to repeat `export-published-routing.ts`; that separate script performs another original import and calculator preparation. Preserve the cache compressed/logical hashes and use its exact reviewed URL, or record and verify an explicitly chosen deployment URL. Never relabel an old cache for the new engine or dataset.

For all-floor progressive publication, the existing command is `node --max-old-space-size=8192 --expose-gc --import tsx scripts/indoor/export-progressive-viewer.ts NEW-VISITOR.zip NEW_DIRECTORY --prepare --checkpoints --priority-scope=1450417,311,1487816`. It imports the actual candidate, derives each supported scope, replays every codec result and verifies every written gzip/Brotli representation. `--checkpoints` emits first-scope previews while continuing the remaining scopes. `--no-offline` omits the complete offline archive. These flags prioritize the main floor; they do not limit the export to one floor. The exporter currently cannot ingest the external selected-scope QA directory, so it will regenerate that scope. `prepare-display-assets.ts` also prepares the complete scope inventory and is unnecessary for the one-floor worker-memory test.

Only after those results pass, generate the project admission record from the exact independent visitor: package hash/bytes, every ZIP-entry hash/bytes, original indoor entry hash, source identity, current validator engine, successful original QA report hash/timing and final progressive manifest revision. `published-project-receipts.ts` admits only the matching visitor without embedded prepared assets; attaching prepared assets changes the ZIP and invalidates that admission. Add the fresh checked routing receipt to `published-route-cell-receipts.ts`. The full map's hosted package transport must assemble that same independent visitor, and its progressive manifest must name it. Build the full interface with the current official Vite binding hook, assert the engine remains unchanged, and test the exact new package/cache/progressive revision through the existing admission and selected-floor decoders before deployment. Scope-preview revisions are separate from the completed final revision. No publication trust root has been changed by the QA tooling.

## Completed independent checks

- The render-only exact boundary-chain hook passed 25 focused safety/differential/original-guard tests and scoped TypeScript checks. The actual complete canonical old mapping passed its original exported validator: 6,348 regions, 325.1 seconds; 423 existing numeric identities and 5,925 positive proofs, zero overlay fallbacks. Sampled peak RSS was 1.87 GB under a 2 GiB heap cap. Other unchanged validator work still accounts for most of the elapsed time. This does not measure complete viewer loading.
- The fresh operation-local static bounds index passed 51 original constructor/negative regressions in independent QA. The entrance agent separately confirmed byte-identical original/indexed constructor outputs for all 3,200 rows and 24 cut elevations in both canonical and floor-refreshed contexts.
- The narrow drawing-floor source review passed five independent positive/tamper groups and an actual comparison of 100 changed drawing bindings with all 53 original walking profiles. This review does not approve newly regenerated material or routes. The row-binding floor changes and original-to-current walking-profile changes are distinct inventories.
- The private worker cache-first optimization remains withheld in scratch. Candidate tests use the frozen production worker. The 28 held stair links have not received new runtime approval from any source-only diagnostic or attachment helper.
- The source-import private checkpoint independently passed read-only stream hashing: 1,200,036,974 payload bytes, all 750 current algorithm/dependency bindings, current input and running Node binary/options. It was not deserialized and grants no visitor or route approval. All 22 selected-scope and existing display checks pass, including combined-floor semantics and arbitrary-scope refusals. One existing worker fixture was updated to include its required overview drawing and complete reply-memory fields; production files were untouched.
- Boundary-member source review has 17 independently passing helper/scope checks. The actual failed historical target is absent from its original material census; its newly recovered cut has no material near the saved contact. An exact Fraction arrangement independently checks both actual first-contact intervals and the proposed serialized full-cap strip: lower first owner 1212091, upper first owners 1186412/1186418. All material behind either first surface is already occupied by original material, including the tiny frame/panel face discrepancy. This supports the existing continuation schema rather than an invented target union. The full original in-memory prepass then passed current contacts but refused another historical evidence binding, `confirmed-enclosure:311:07-208:south-column-contact`, before producing room promotions. No enclosure-area impact, compiled candidate or successful candidate route can yet be claimed.
- The complete historical audit found 28 stale column bindings: older four-corner evidence differs from the true rounded/notched native profiles. The atomic 29-entry bundle (those columns plus the changed native member) passed all 886 original current-contact and historical guards in a 194-second diagnostic replay. Independent source-delta reconstruction matched its exact before/after room hashes and portable evidence append; this diagnostic did not rerun the original archive readers. The independent batch/singular source-scope and archive-preservation suites pass 25 groups. Exact current-section/cap witnesses use binary64 dyadic halfplanes, retaining forward notches, disconnected same-owner material and single-ULP contacts. A separately declared existing-walking-support review records raw slab refusal, binds distinct original slabs/current envelope and the unchanged slab-join policy, and retains every positive native hole. They reject changed original recipes/rooms/columns/permissions, moved caps/registrations, duplicate/omitted/extra changes, stale proposal hashes and missing/waived physical inventories.
- Nine additional stair source-scope regression groups pass. Receipt integrity and identity preflights explicitly grant no source authority; the full positive path requires fresh private actual-RVT capability reissuance and exact original finalizer replay. Two scratch projection controls also pass the actual strict portable verifier with synthetic geometry: preserving only the two bound cells fixes their digest loss, unbound drawings still strip, and a physical-cell mutation still refuses. The production projection remains frozen and unchanged while source generation runs. Twelve routing-audit regressions pass: public routes must use the intended connector, accessible routes forbid stepped/unsupported connectors while allowing a qualified alternate lift, and complete shared v2 indices participate in exact physical parity. Original blocked-arrival evidence code remains byte-for-byte unchanged. Room-area impact, fresh exported candidate routes and actual UNBC worker-memory checks remain pending.

Exact source hashes and logs are in `/workspace/scratch/unbc-pathway-repair-20261015/navigation-qa/production-mapping-positive-proof-receipt.json`, `provisional-static-index-independent-review.json`, and `drawing-floor-source-review-independent-qa.json`. Candidate results, browser screenshots and successful route claims must be added only after the respective tests actually run.
