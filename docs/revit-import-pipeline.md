# Revit Import Pipeline

This repo does not load `.rvt` files directly in the browser. OpenIndoorMaps
renders a normalized indoor-map contract:

1. `indoorMap`: room/corridor polygons in EPSG:4326
2. `indoorRoutes`: walkable LineStrings in EPSG:4326
3. `pois`: named points inside polygons in EPSG:4326

The Revit pipeline should convert RVT data into those three GeoJSON
FeatureCollections, then register the result as a normal `LocationConfig` under
`app/data`.

## Current RVT Test File

Tested locally with:

```sh
npm run revit:inspect -- "/Users/ahmadjalil/Downloads/ahsz_3d model_17.04_finished.rvt" --out tmp/revit-import/ahsz
```

Observed facts:

- The file is 48,304,128 bytes.
- `file` identifies it as a Compound Document File V2 document.
- `7z` can list the RVT compound container.
- The container has 56 file entries and 3 folders.
- `ProjectInformation` extracts to XML and reports Autodesk Revit 2025.
- `RevitPreview4.0` contains a 128x128 PNG preview.
- `@phi-ag/rvt` can parse `BasicFileInfo` from the native RVT:
  - file version: `14`
  - Revit version: `2025`
  - build: `20240516_1515(x64)`
  - locale: `RUS`
  - app: `Autodesk Revit`
  - document id: `d2752a46-362b-4c30-bb38-e0b6a1a864cb`
  - worksharing: not enabled
- `binwalk` finds gzip-compressed internal streams. `Global/ElemTable`
  decompresses to a stream whose header indicates about 40,880 element-table
  records, but those records do not expose category names, room boundaries, or
  geometry without a deeper RVT reverse-engineering parser.
- This environment does not have Revit, IfcConvert, IfcOpenShell, Blender, or
  another geometry-capable RVT converter installed.

That means the local smoke test can verify RVT identity, project metadata, and
preview extraction. Full geometry import needs one external conversion step.

## AHSZ Import Task List

The app tracks the AHSZ import at `/imports/revit/ahsz` so the RVT work can move
forward without losing the current blocker.

- Done: RVT metadata preflight through `@phi-ag/rvt`, `7z`, and stream
  diagnostics.
- Done: native 128x128 Revit preview extraction.
- Blocked: direct native RVT geometry decode. The current local parser cannot
  map proprietary Revit records into categories, rooms, levels, or meshes.
- Current: export the RVT to IFC with rooms/spaces/building storeys enabled.
- Next: convert the IFC to a web-ready GLB model.
- Next: convert IFC spaces/storeys/doors into `indoorMap`, `pois`, and
  `indoorRoutes`.
- Next: render the real GLB in the app once the model artifact exists.

Current artifact slots:

- `ahsz.ifc`: blocked until Revit desktop, Autodesk Design Automation, or an
  RVT-capable converter is available.
- `public/revit/ahsz.glb`: missing until the IFC export exists.
- `app/data/ahsz/*.geojson`: missing until IFC spaces and storeys are available.

## Tooling Findings

Native RVT is still the hard boundary. These are the practical options found
while testing and researching:

- `@phi-ag/rvt`: open-source JavaScript parser for RVT/RFA container metadata
  and thumbnails. Useful for browser or Node preflight, but it does not extract
  floor-plan geometry.
- `7z` and `binwalk`: useful for RVT container and compressed-stream inspection.
  They do not understand Revit object semantics by themselves.
- Autodesk `revit-ifc`: open-source Revit IFC exporter. It runs with Revit and
  is useful when exporting RVT to IFC through desktop Revit or Revit Automation.
- Autodesk Platform Services Model Derivative or Design Automation for Revit:
  viable cloud conversion route from RVT to IFC. Design Automation is more
  flexible when custom IFC export settings or view-specific export matters.
- IfcOpenShell: strong open-source parser and geometry engine after the file has
  been exported to IFC. It does not open native RVT.
- ODA BimRv SDK, FME, HOOPS Exchange, and similar commercial SDKs: can read
  native RVT geometry/properties, but they are not open-source local fixtures.

## Stage 1: RVT Preflight

Run the preflight extractor before attempting geometry conversion:

```sh
npm run revit:inspect -- "/path/to/model.rvt" --out tmp/revit-import/model-name
```

This step requires `7z`/p7zip on `PATH`.

The extractor writes:

- `manifest.json`: file hash, RVT container entries, project metadata, and
  import-readiness status
- `manifest.json.nativeRvt`: `@phi-ag/rvt` BasicFileInfo and thumbnail
  metadata
- `manifest.json.streamDiagnostics`: raw stream checks including
  `Global/ElemTable` record count and `Partitions/75` gzip chunk count
- `project-information.xml`: the embedded Revit project information stream
- `preview.png`: the embedded Revit preview image when present

Use this step as the first test fixture. It is stable, small, and does not
require Revit at runtime.

## Stage 2: Geometry Export

For real map data, export the RVT outside this repo using one of these routes:

1. Revit desktop export to IFC.
2. Autodesk Design Automation for Revit export to IFC in CI or a backend job.
3. Revit desktop export of rooms/areas to schedules plus CAD/IFC geometry when
   IFC space boundaries are not reliable enough.

Recommended export target:

- IFC 4 or IFC 2x3
- Include rooms/spaces and building storeys
- Preserve room names/numbers
- Preserve doors/openings if route generation will use adjacency
- Keep project coordinates/geolocation when available

Do not commit the original `.rvt` file unless the repo is explicitly set up for
large/proprietary binary fixtures. Prefer committing derived metadata fixtures
and generated GeoJSON.

## Stage 3: Convert To OpenIndoorMaps GeoJSON

The converter should produce the same shape described in
`docs/qgis-data-preparation-guide.md`.

### `indoorMap`

Source candidates:

- `IfcSpace` or Revit Rooms/Areas for units and corridors
- `IfcBuildingStorey` for floor mapping
- Room name, number, department, or category for labels and grouping

Mapping:

- Geometry: floor-plan footprint polygon, reprojected to EPSG:4326
- `id`: stable numeric ID derived from IFC GlobalId or source element ID
- `feature_type`: `corridor` for circulation spaces, otherwise `unit`
- `level_id`: normalized floor number, with ground floor as `0`
- `show`: `"true"`
- `name`: room/space name or number

### `pois`

Generate one POI per navigable room/space:

- Geometry: representative point inside the polygon
- `id`: same stable numeric ID family as the source room/space
- `name`: room number/name
- `type`: source category, or `"room"` when unknown
- `floor`: matching `level_id`
- `building_id`: location slug
- `metadata`: source IDs and Revit/IFC attributes useful for debugging

### `indoorRoutes`

The routing graph must be explicit LineStrings with shared junction coordinates.
There are two practical options:

1. Author routes in Revit/QGIS and export them as lines.
2. Generate routes from space adjacency:
   - corridor centerlines from corridor polygons
   - connector lines from room POIs to the corridor graph through doors
   - exact shared vertices at junctions

The app's pathfinder only connects LineStrings when coordinates match exactly,
so route generation must snap junction coordinates before writing GeoJSON.

## Stage 4: App Integration

Once the three GeoJSON FeatureCollections exist, add a normal location module:

```text
app/data/<slug>/
  indoor-map.geojson
  indoor-routes.geojson
  pois.geojson
  location-data.ts
  index.ts
```

Then register it in `app/data/locations.ts`:

```ts
import ahsz from "./ahsz";

const locations: Record<string, LocationConfig> = {
  "bebetei-vitan": bebeteiVitan,
  ahsz,
};
```

The current renderer and discovery UI should not need Revit-specific changes as
long as the generated GeoJSON follows the existing contract.

## Verification Checklist

- Run `npm run revit:inspect -- "/path/to/model.rvt" --out tmp/revit-import/<slug>`.
- Confirm `manifest.json` reports the expected Revit product version.
- Validate all generated GeoJSON is EPSG:4326.
- Confirm every polygon has a unique numeric feature `id`.
- Confirm every POI is inside its polygon.
- Confirm every route junction shares exact coordinates.
- Run `npm run typecheck`.
- Run `npm run build`.
- Open the new location route and verify floor filtering, hover, search, click
  detail, and point-to-point routing.
