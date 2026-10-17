# Full OpenIndoorMaps interface restoration — 2026-10-15

The hosted root previously redirected to `/projects/visitor`, a separate progressive visitor page with a reduced sidebar. The original `/projects/indoor` workspace remained in the deployed app. Switching the root to that workspace restores its building/floor picker, physical level detail, room and connector cards, search, map picking, route/navigation controls, display settings and 2D/3D/relative-height controls.

## Entry points

- Default: `/openindoormaps/index.html#/projects/indoor?package=%2Fdata%2Funbc-full%2Fproject.json&manifest=%2Fdata%2Funbc%2Fmanifest.json&preview=%2Fbinary%2F&view=2d`.
- Lightweight visitor: `/openindoormaps/index.html#/projects/visitor?manifest=%2Fdata%2Funbc%2Fmanifest.json`, now with a Full OpenIndoorMaps link.
- Binary preview: `/binary/`, linked from both interfaces.

The full workspace's optional hosted package/manifest/preview query parameters are generic; ordinary local project imports and restoration remain available. The original interface renders the map; this is not another imitation of its controls.

## Hosting build profile

The full package plus every unrelated demo exceeded the host’s 256 MiB expanded archive limit. Build this Site with `SITE_DEMOS=hospital PAGES_BASE_PATH=/openindoormaps/ node node_modules/vite/bin/vite.js build --mode pages`. The optional Vite alias selects a hospital-only demo catalog for both welcome-page and location-hook imports. All application/workspace routes and the hospital reference remain available; unrelated demo data is not shipped. Standard builds without `SITE_DEMOS=hospital` retain the original complete demo catalog. No UNBC map asset or binary-preview data is removed.

## Loading and data identity

The default uses the unchanged verified visitor ZIP `6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22`, 45,290,239 bytes. This is exactly the source package named by the existing progressive manifest. It contains the complete visitor dataset (all campus floor groups), not the original RVT/GLB authoring model. Prepared floor rendering still happens for the selected scope; the package contains no saved prepared-display archive.

Three content-addressed transport parts fit static hosting's file limit. The hosted loader verifies every part and the complete original ZIP before handing it to the normal package worker. That worker retains geometry, metadata, native-mapping, checksum and navigation validation. A browser-saved ZIP is reused only when its actual SHA-256 matches the hosted manifest. Cancellation prevents a superseded startup from replacing an explicit import.

This restores the original interaction at the cost of a larger first download and full package validation. It does not claim the full workspace now supports the progressive format. The lightweight viewer retains selected-scope loading and the zoom/fade fixes. App code, basemap traffic and decoded memory are additional to 45.29 MB.

## Combined floors

The source dataset contains Basement and Floors 1–4. Floor 1 groups native IDs `[1450417, 311, 1487816, 1425915]`; Floor 3 groups `[400176, 1487353]`. The original physical Level detail selector keeps the three main-floor levels together and makes Floor 1.5 (`1425915`) separately selectable in 2D so its opaque slab does not obscure lower rooms. Grouping does not move native elevations, merge navigation levels or admit a stair route.

## Verification

Evidence: `/workspace/scratch/unbc-full-interface-20261015/`.

- `unit-tests.log`: checked transport assembly, saved-package identity, corruption, manifest path/size constraints and cancellation.
- `typecheck.log` and `build.log`: scoped TypeScript check and production Pages build.
- `delivery-proof.json`: package/progressive provenance match, unchanged progressive manifest, transport parts, file-size limit and entry routes.
- `full-import.log` / `full-import-proof.json`: normal import passed, including geometry, materials, routing, native mapping and identities, in 632,996 ms; five floor groups, two Floor 1 physical choices and 1,864 records verified.
- Publication receipt records the actual pushed commit, Site version and terminal deployment result.

The connected Browser/JS tool was unavailable in this session. No fresh desktop/mobile screenshots or new visual interaction pass is claimed. This change reuses the existing full workspace UI. No canonical master, source geometry, access rule, route evidence or binary-preview data is changed. Held stair links are not enabled by this work.
