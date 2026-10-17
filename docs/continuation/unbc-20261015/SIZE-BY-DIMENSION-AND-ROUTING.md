# UNBC size by 2D, 3D and navigation — 15 October 2026

Separating the display modes is worthwhile. Measured draft assets for all seven existing exported scopes require **21.73 MB for a simplified 2D display** or **24.49 MB for a simplified visitor 3D display**, with their common data included once in either number. If both modes are available, shared data is reused and the drawing total is **34.93 MB**, not the sum of the two standalone totals.

With the unchanged navigation asset and retained exact native picking/validation data, the measured draft totals are **45.00 MB for 2D**, **47.76 MB for visitor 3D**, or **58.20 MB for both modes**, before the small draft manifest. The current published package remains **68.81 MB Brotli / 88.55 MB gzip**.

These are actual compressed files generated and measured in an isolated candidate, not a deployed exporter/loader. Room vertex reduction has not been applied. The sizes describe a proposed layer/metadata split with original source coordinates and heights retained. A mode-specific loader, visual parity, exact picking and navigation integration still need implementation and tests before publication.

## Separated components

All sizes are decimal MB. Compression uses gzip level 6 and Brotli quality 5, matching the current export's settings. Identical whole assets are counted once across overlapping scopes.

| Component | Brotli MB | gzip MB | Contents |
| --- | ---: | ---: | --- |
| Shared map base | 11.29 | 13.76 | All current overviews, room footprints and height properties, shell/search identities, labels, portals and connector markers |
| Simplified 2D drawing | 10.44 | 10.82 | Original native fill/wall polygons, room-relevant outlines and the current optional pillar-removal drawing overlays |
| Simplified visitor 3D add-on | 13.20 | 14.77 | Original floor/area/wall extrusion and ramp inputs; room footprints and heights are reused from shared data |
| Exact native picking / validation | 9.18 | 11.52 | Original native regions, exact topology and warning records |
| Navigation | 14.10 | 24.03 | The actual unchanged current routing asset, including physical geometry/access/validation evidence; not just route lines |
| Optional detailed 2D add-on | 3.58 | 3.78 | All architectural outlines, partitions and original stair surface collection |
| Optional detailed 3D add-on | 2.12 | 2.33 | Window members, original stair surfaces, lower-floor geometry and door footprints |

Simplified 3D here means a visitor room/block view. It uses source heights and wall/floor geometry, keeps real floor openings, represents stairs with connector symbols, and keeps individual window/tread/lower-member geometry in the optional detail pack. It is distinct from the source-model GLB. This is a measured data projection, not a verified new 3D rendering implementation.

The exact picking/validation pack is shown separately rather than silently omitted. The current native viewer requires verified carriers; deferring or independently fetching them requires a new validated loader contract. A render-only size must not be advertised as the complete current viewer.

## Simplified 2D versus simplified 3D

| All exported scopes | Brotli MB | gzip MB |
| --- | ---: | ---: |
| Simplified 2D display, shared included | 21.73 | 24.58 |
| Simplified visitor 3D display, shared included | 24.49 | 28.53 |
| Both displays, shared counted once | 34.93 | 39.35 |
| 2D + navigation + exact picking/validation | 45.00 | 60.12 |
| 3D + navigation + exact picking/validation | 47.76 | 64.07 |
| Both + navigation + exact picking/validation | 58.20 | 74.89 |
| Both + both detail packs + navigation + exact picking/validation | 63.90 | 81.00 |

The draft split manifest is **35,257 bytes raw**, or **9,023 bytes Brotli / 9,443 bytes gzip**. Including its Brotli representation makes the combined simplified map with navigation and exact support **58.21 MB**. The current production manifest is 164,969 raw bytes and is already included in the current 68.81/88.55 MB totals.

Adding visitor 3D after the complete 2D drawing assets have loaded costs the **13.20 MB 3D add-on**, not another 24.49 MB. The larger standalone 3D number includes shared data that the 2D session already has.

## Per-floor transfer instead of loading every floor

These per-scope render totals include the shell, that scope's current overview, its common room data and the requested drawing mode. They exclude navigation, exact support, optional details and the draft manifest.

| Existing exported view | 2D render MB, Brotli | 3D render MB, Brotli |
| --- | ---: | ---: |
| Floor 1 — Main | 6.39 | 6.65 |
| Floor 3 | 2.78 | 3.28 |
| Basement | 0.17 | 0.17 |
| Floor 1 — combined | 6.52 | 6.77 |
| Floor 1.5 auxiliary view | 0.23 | 0.26 |
| Floor 2 | 3.60 | 4.79 |
| Floor 4 | 2.43 | 2.94 |

Main and combined Floor 1 overlap; these are not seven independent complete storeys. This measurement retains all existing scopes. Further decomposition by native level could reduce repeated geometry without dropping a view, but that is not claimed by these numbers.

A Main-floor switch from 2D to visitor 3D would request about **3.52 MB of additional 3D assets** in this draft. The existing current overview/search first view remains about **1.96 MB Brotli** before floor details. Navigation remains a separate **14.10 MB** once directions are requested. Exact support must be fetched and validated wherever the eventual loader requires it; a timer or mode toggle is not a bypass of source checks.

## What is in the current published package

The current package cannot be divided into exclusive 2D and 3D byte slices without a new representation: its prepared displays share subtrees and are compressed in joint chunks.

| Current stored category | Brotli MB | gzip MB |
| --- | ---: | ---: |
| Shell/search metadata | 0.06 | 0.07 |
| Overviews | 6.88 | 8.64 |
| Joint prepared 2D/3D chunks | 41.37 | 48.12 |
| Presentation contexts, including 3D walls | 6.23 | 7.52 |
| Navigation | 14.10 | 24.03 |
| Manifest, raw | 0.16 | 0.16 |
| **Current total** | **68.81** | **88.55** |

Turning off 3D in the current UI does not itself remove the 3D-related subtrees from those joint downloaded chunks. Draft per-role compression differs from joint subtree pooling; draft category sizes must not be subtracted individually from current chunk sizes.

## Optional source-model 3D

The canonical master contains `model/scene.glb`:

| Existing source scene | Measured size |
| --- | ---: |
| Raw GLB | 52.22 MB |
| gzip level 6 | 9.61 MB |
| Brotli quality 5 | 6.90 MB |
| Existing ZIP deflate member | 8.54 MB |

This scene is **not included** in the 68.81 MB visitor map. It can be a separate inspection download. A compact GLB mesh is a different representation and content population from a functional searchable floor map with room identities, picking, height controls and navigation; its small compressed size does not replace those services. No new model conversion, decimation or mesh quantization was performed.

The original RVT is 70.34 MB and the authoring master ZIP is 289.03 MB, including review companions, room recipes, the model and multiple prepared representations. Neither is the visitor download size.

## Verification and remaining work

- Rehashed all **228 current stored representations** before measuring them.
- Verified each source prepared chunk's expanded bytes and pooled checksum while extracting the dimension-specific candidates.
- Kept polygon coordinates unchanged; no angle snapping, room replacement, rounding, hole deletion, access changes or route edits. Geometry hashes were checked for 91 collection occurrences comprising 294,658 feature occurrences; those counts include repeated views/collections, not unique physical objects.
- Independently compared all seven draft scopes against the earlier saved prepared extraction: 2D fills/walls, room coordinates and key/base/height/level properties, 3D area coordinates, complete extrusion walls, portals and connector markers match.
- Copied the existing shell, overview and navigation files unchanged into the isolated draft. All **102 encoded draft/reused representations** decompress to their declared logical checksum and byte length.
- Verified the original GLB against the master manifest and both compressed round trips.
- Existing room-display precision findings from the [room overlay audit](/workspace/openindoormaps/docs/continuation/unbc-20261015/ROOM-OVERLAY-AND-SIZE-AUDIT.md) remain open. This size split does not fix them or admit any held stairs.

The recommended implementation is to keep the overview and selected-floor 2D drawing as the normal load, fetch the current floor's 3D add-on when requested, and fetch navigation on first directions use. Preserve exact support checks and keep architectural inspection layers optional. Build that loader/exporter against the immutable source binding, resolve the display precision findings, and run desktop/mobile, exact-picking, native-height/3D and canonical navigation checks before publishing. These byte measurements are not a decoded-memory, GPU or cold-routing performance benchmark.

## Files

- [Measured sizes and definitions](/workspace/scratch/unbc-dimensional-size-20261015/size-breakdown.json)
- [Size comparison CSV](/workspace/scratch/unbc-dimensional-size-20261015/size-breakdown.csv)
- [Draft split manifest](/workspace/scratch/unbc-dimensional-size-20261015/split-manifest.json) — explicitly unsupported by the current production loader
- [Independent geometry/byte checks](/workspace/scratch/unbc-dimensional-size-20261015/independent-verification.json)
- [Original source GLB measurement](/workspace/scratch/unbc-dimensional-size-20261015/source-model-size.json)
- [Size comparison chart](/workspace/scratch/unbc-dimensional-size-20261015/size-by-mode.png)
- [Final checksummed receipt](/workspace/scratch/unbc-dimensional-size-20261015/receipt.json)

Draft files are in `/workspace/scratch/unbc-dimensional-size-20261015/assets/`. The production map, canonical master and source/navigation geometry remain unchanged. App code, fonts, basemap, HTTP headers and future application integration overhead are additional.
