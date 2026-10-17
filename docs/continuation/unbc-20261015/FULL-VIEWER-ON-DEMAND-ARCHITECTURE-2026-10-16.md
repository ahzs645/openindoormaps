# Full viewer with on-demand delivery — bounded assessment, 2026-10-16

**The small verified-display seam exists, but the complete full-interface change is a controller/data-contract refactor, not a small loader switch.** Keep the existing public `ProjectNavigation`, map controls, prepared renderer and combined-floor semantics. Do not replace them with the compact viewer or a new sidebar. The current full viewer still needs its complete ZIP/dataset before its lazy display layers mount; that limitation remains until the controller is separated.

This is a read-only assessment completed within five minutes. No runtime, format, published receipt, canonical asset or frozen source was changed.

## What already works without the full dataset

`ProgressiveVisitorClient.open()` reads the tiny manifest and, in parallel, only the shell/search asset and default overview. Its source comment explicitly excludes detail chunks and the routing root from startup. `selectScope()` retrieves a selected verified display/context in a worker and uses a bounded decoded-floor cache (default two entries/128 MiB retained estimate). These are usable delivery components, not a proposal to invent another loader.

`decodePublishedProgressiveFloor(manifest, scope, read)` already accepts **no IndoorDataset argument**. The exact authorization chain is:

1. A compiled `PUBLISHED_PROJECT_RECEIPTS` entry matches the current preparation-engine hash, exact progressive revision, full dataset hash and package hash.
2. The manifest passes complete format/content-addressed inventory/revision validation; the selected scope must exactly equal its manifest entry.
3. Original chunk stored/expanded SHA256, lengths, pooled graph SHA256, declared logical hash/length and pool census are checked.
4. The restored shared graph passes `validatePreparedDisplayPayload(value, descriptor.binding)`.

This authorizes the **checked display asset**, not room ownership, walking support or navigation. It does not require fetching the full ZIP first. `registerVerifiedPreparedDisplay` only associates checked prepared render graphs and their native-face/overview display references. The ordinary stored progressive decoder also takes a manifest/scope rather than a full dataset and retains its complete payload checks.

Existing manifest scopes include grouped original levels. The saved baseline publication, for example, has a main-floor scope `[1450417,311,1487816]` and a combined Floor 1 scope `[1450417,311,1487816,1425915]`. `preparedDisplayScopes` publishes each campus-floor level set and each supported physical-display plane. A caller can preserve these combined scopes; it need not make every original Revit level a separate map.

Scope coverage is exact, however: current assets are `building:"all"` with one published preparation-option set. Arbitrary building filters, arbitrary multi-floor combinations, or geometry-setting variants are not automatically covered. `publishedScopeFor` currently falls back to ordinary preparation for an unmatched option. A display-only startup must instead request an exactly covered variant or load the real complete project before such a fallback. It must never prepare or validate a fabricated summary dataset.

## Where the complete download remains coupled

| Existing component | Actual data dependency | Smallest safe seam |
| --- | --- | --- |
| `IndoorProjectPage` hosted startup | Downloads hosted ZIP, calls `readPublishedProject`/ordinary importer, obtains complete `IndoorProject.dataset` and rooms; lazy layers mount afterward | Branch into a verified-publication visitor controller before hosted ZIP download. Keep authoring/import controller for explicit source/editor/native requests. |
| `ProjectNavigation` | Whole `IndoorDataset` prop; global records, visitor names/categories/descriptions, floor names, arrival nodes, room rings/camera fallback, window settings, route edges/transit reviews | Introduce an explicit display/search read model and navigation-result/camera callbacks while retaining the same component/JSX. Do not pass the shell as physical IndoorDataset authority. |
| `ProjectPlaceSearch` and place/floor metadata helpers | Destination identities, name/building/floor, access/walkable/circulation/stair state, arrival availability; contextual visitor tags/metadata | Narrow the read-only summary contract. Existing shell supplies most scalar fields but omits properties/curated category/department/description/tag data and full camera geometry. |
| `PreparedProjectMapLayers` | Verified `PreparedFloor`, native display registration, `visitorContext`, alignment/source, display records, ramps/connectors/labels and limited graph hints | Use a typed display-only model plus exact prepared payload/context. Compact `DetailedLayers` already proves render inputs can come from those assets, but its IndoorDataset-shaped display object must not escape into physical preparation. |
| Search/selection camera | Full viewer fallback reads `data.nodes`, record `ringsFeet`, native-envelope state; prepared selection areas supply exact visible geometry | Use global shell geographic arrival for initial focus, load/select the owning exact scope, then fit its checked selection geometry. Existing `onLocate` callback is the right integration point. |
| Public route preview | `ProjectNavigation` computes navigation steps from data+route and transit-room disclosure from source edges/records/through policy | Pass actual worker-produced steps, arrivals, route summary and transit disclosure. Preserve the full public preview component; do not infer policy from shell access labels. |
| Native model/editor | `IndoorProject`, source rooms, optional `project.scene`, original model/source bodies | Load an explicitly bound real source/native package on demand. The visitor ZIP is not necessarily a native source package, and the progressive manifest currently has no authoring-download URL contract. |

The shell already preserves original keys, original arrival-node IDs/geographic positions, floor/native-level lists, source/alignment and access/walkability summary. Curated display names are folded into shell names by the exporter. It does **not** provide all original public metadata or room geometry required by the current monolithic prop type. Filling missing geometry with empty arrays would disguise the boundary instead of establishing it.

## Directions cache is a separate missing connection

**Follow-up:** the narrow progressive-worker connection below was subsequently implemented and tested without changing publication pins or the frozen engine. See [the cache follow-up](PROGRESSIVE-ROUTING-CACHE-FOLLOWUP-2026-10-16.md). The following paragraphs describe the source state at the time of this assessment; fresh actual UNBC cache eligibility and performance remain unverified.

`ProgressiveRouteClient` already starts a real worker only on directions request, so full exact routing data can remain absent during browsing. Its worker currently calls `client.loadRouting()` and then `createVerifiedProgressiveRouteCalculator`, which runs the complete ordinary `validateIndoorDataset`. **It does not consume the existing published-route-cell cache path.** Moving the full interface onto this client alone therefore defers, rather than removes, the cold validation cost.

`published-route-calculation.worker.ts` already demonstrates the stronger route-cache seam: `publishedRouteCellReceipt(data)` matches the exact real routing projection/source/current engine; `decodePublishedRouteCells` verifies the cache's checked bytes/topology/policies/guards; `createPublishedRouteCalculator` keeps original traversal/path construction. The progressive worker needs that same checked cache loader after it receives the **actual** routing dataset, with ordinary verification on a genuine cache miss. A fresh cache must be captured from the new successful normal validation/calculator session. A manifest revision or display receipt alone cannot authorize routing or relabel a historical cache.

Current source inspection also shows the old compiled publication/cache receipts use engine `681e71a5…`, while the current preparation binding is `5c3c7e4c…`. Those old receipts must miss under the current engine. Fresh assets/receipts must be generated and checked for the final new candidate; changing only a receipt hash would not establish authority. Local saved historical manifests also have their own exact revisions; none is presumed to be the live hosted revision in this assessment.

## Freeze scope and effort

Exact membership was checked in `regeneration-source-v3-r1-before.json` (946 entries):

| Files | In current compiler freeze? |
| --- | --- |
| Full/compact page controllers; `ProjectNavigation`; `ProjectPlaceSearch`; map provider/controls; `map-layers.tsx` | No |
| Published-project loader/layers/floor decoder/receipts; progressive delivery/client/route worker; published route-cell loader | No |
| `floor-display-worker-bridge.ts`; progressive exporter; visitor route-state helper | No |
| `prepared-display-assets.ts`; `prepared-display-registry.ts`; `prepared-display-engine-binding.ts` | **Yes** |

An eventual implementation can keep much of the controller/JSX work outside the current freeze, but changed prepared asset contracts or preparation-option semantics require a new frozen build/publication. Type-only edits also alter source hashes and cannot be smuggled into a frozen file.

This is a medium refactor: roughly **6–10 integration files plus focused tests**, depending on how much of the full page's public controller is extracted. A planning allowance is **2–4 engineer-days** for the explicit read-model boundary, existing-interface reuse, route-cache worker integration, scope/selection/preview parity and verification; fresh artifact generation/validation time is additional. That is an estimate, not a measured delivery time or a claim that the current rebuild includes it.

The appropriate release gate is functional evidence: initial full interface fetches only shell/overview, routes/native ZIP are absent until requested, supported combined floors and search/selection retain their behavior, route preview consumes genuine worker results, stale/replaced manifests reject, and unsupported display options cannot reach a physical validator with summaries. Desktop/mobile browser memory/interaction proof remains required when the implementation is available. Until that work is completed, describe the present behavior as **lazy floor display after full-project download**, not full overview-first/on-demand loading.

## Inspected source anchors

- `app/pages/indoor-project-page.tsx`: hosted package load, `displayData`, route hook and public navigation/layer wiring.
- `app/indoor-project/project-navigation.tsx`, `place-search.tsx`, `route-review-summary.ts`: public interface data/camera/preview dependencies.
- `app/indoor-project/published-project.ts`, `published-project-layers.tsx`, `published-project-scope.ts`: complete-project admission and current lazy-display wrapper.
- `app/indoor-project/published-floor-decoder.ts`, `prepared-display-assets.ts`, `floor-display-worker-bridge.ts`: exact display admission/registration boundary.
- `app/indoor-project/progressive-delivery.ts`, `progressive-visitor-client.ts`, `progressive-route.worker.ts`, `progressive-route-validation.ts`: small startup contract and delayed full routing verification.
- `app/indoor-project/published-route-cells.ts`, `published-route-calculation.worker.ts`: existing exact routing-cache path to reuse.
- `app/indoor-project/prepared-display-preparation.ts`, `scripts/indoor/export-progressive-viewer.ts`: combined-scope inventory, shell and context export.
