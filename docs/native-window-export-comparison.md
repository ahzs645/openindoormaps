# Comparing native and simplified window exports

Use one reviewed master. Window detail is an optional **display comparison**, not a change to public access or a rebuild of routing barriers.

In OpenIndoorMaps, open **Review project → Window detail**, choose **Current simplified windows** or **Preserve native windows**, then **Export campus viewer**. The selector also previews that choice. In the visitor view, **Map preferences → Preview window detail** switches the loaded author's window evidence without changing saved room reviews. Export filenames include `windows-native` or `windows-simplified` so the comparison files remain distinct.

The authoring master retains the optional `windowDisplay` inventory in `viewer/indoor.json`. The native visitor export retains measured member footprints, host/native IDs, material evidence, base/top elevations, reviewed source-wall bindings and conservative display openings. The simplified visitor export removes this additional inventory and uses the existing wall presentation. An older ZIP without native window evidence offers the current export; it cannot recover missing geometry just by changing a dropdown.

In Reviter, **Floors → Building directory → Indoor window detail** controls the prepared project's initial display mode. **Prepare OpenIndoorMaps project** records available native evidence in either case. Ordinary archive-only project exports remain unchanged. The CLI also supports `--windows native` or `--windows simplified` when preparing an indoor project.

## Evidence and scope

The extractor reads exact-model persisted curtain host/member relationships and native oriented-box footprints. It preserves decoded material transparency/color and distinguishes glazing, frames, opaque spandrel and unknown panels. Unknown panel material is not silently promoted to transparent glazing. Members without measured oriented geometry retain their existing fallback rather than inventing a precise window.

An opaque wall display opening requires complete panel/mullion membership, a straight assembly aligned with and contained inside the exact exported wall face, supported full wall width, no conflicting wall/column footprint, no door member and matching wall geometry. Incomplete, skewed or ambiguous assemblies keep their existing opaque host fallback. A display opening does not permit walking through glass.

In the explicit native comparison, a complete assembly with a current reviewed facade cut replaces its approximate curtain-host envelope before display wall faces are merged. This prevents the broad host margins from surviving as gray boxes beside precise panes. Only matching generic member copies are omitted from this display input; the ordinary facade, sill/head bands and original routing wall collection remain intact. Stale, unresolved, nonrectangular or conflicting evidence retains its fallback. The simplified option keeps the existing presentation.

Rooms use their existing low wall height. Window vertical proportions are normalized to that same height; **3D relative heights** also retains the native floor offset. Full native base/top heights remain in export metadata; this is not a lossless export of every original BRep detail or a replacement for Source model. Source RVT/GLB/GIS remain unchanged.

Wall/window boolean operations run in the floor worker in local coordinates. Native panes/frames use local precision meshes in 3D, and only members intersecting the four-foot plan cut draw in 2D. The two-dimensional wall openings use the plan cut separately from the three-dimensional sill/head bands. Detail fades out with the existing close-up zoom threshold and respects the existing unmapped-structure preference. Source-model mode continues to use the original GLB.

Both viewer variants retain identical source room geometry, barriers, doors, graph, alignment, access and step-free evidence. A future shared physical window/barrier reconstruction must be a separately reviewed regeneration; comparing display detail must not relax floor-hole, outdoor or staff protections.

## Validation

Tests cover model/level binding, duplicates, stale source walls, sill/head preservation, opaque material evidence, incomplete host membership, older ZIP behavior, original assets and both ZIP round trips. Browser checks compare the same office in 2D, ordinary 3D and relative-height 3D on desktop/mobile, switch options repeatedly and import the actual UI-generated viewer exports. A deterministic empty basemap isolates these checks from remote tile availability; native map geometry is unchanged.
