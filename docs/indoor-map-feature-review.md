# Indoor Map Feature Review

This note captures which ideas are worth carrying forward from the downloaded
reference projects while building the UNBC IFC import path.

## Clean OpenIndoorMaps Fork

Reference path:

```text
/Users/ahmadjalil/Downloads/openindoormaps-main
```

Useful ports:

- Basemap styles from `app/config.ts`: the current app should render on a real
  basemap so a georeferenced IFC can be inspected in campus context.
- Optional 3D building extrusion from `app/layers/tile-3d-layer.ts`: keep this
  guarded behind source detection because it only works when the active style
  exposes an `openmaptiles` vector source with a `building` source layer.
- Logo control from `app/controls/oim-logo.ts`: use a React component rather
  than injecting raw HTML into a MapLibre control.

Do not port directly:

- `app/mock/building.json`: demo-only data, not a durable import contract.
- The old custom layer classes for indoor map and POIs: the current React layer
  components handle style reloads and location-specific data better.
- Remix app shell/theme code: the current Vite shell already replaced it.

## Indoor Map Reference Projects

Reference path:

```text
/Users/ahmadjalil/Downloads/Indoor Map
```

Ideas worth borrowing:

- From `indrz-master`: model route segments with explicit floor and connector
  metadata. The useful concept is a 3D route graph with stairs/elevators/ramps
  connecting per-floor networks; the old Django/PostGIS code should not be
  copied into the client app.
- From `indrz-master`: carry accessibility metadata into route edges. Generated
  `indoorRoutes` should be able to mark stairs/escalators as inaccessible and
  elevators/ramps as accessible so the existing accessible-route toggle can
  affect pathfinding.
- From `indoor/xml2json.py`: use an intermediate geometry classification step
  before final GeoJSON output. IFC elements should be classified into floor
  outlines, barriers, connectors, goals/POIs, and vertical circulation before
  writing `indoorMap`, `indoorRoutes`, and `pois`.
- From `indoor3D-master`: support a floor overview mode later, including
  "current floor" and "all floors" display modes for debugging imports.
- From `indrz-master`: enrich search data beyond exact names. University maps
  should index room number, department, aliases, floor labels, public/private
  access, and accessibility notes.

Avoid:

- Legacy framework/runtime code from the reference projects.
- Local pixel/model coordinate schemas as final app data. OpenIndoorMaps
  location data should remain EPSG:4326 GeoJSON unless a separate local-coordinate
  rendering mode is intentionally added.
- Treating wall/slab geometry as room data. Room-level POIs and routes need
  `IfcSpace` records, authored rooms, or a later segmentation/manual repair step.

## IFC Import Implications

The UNBC IFC has building storeys, doors, stairs, ramps, walls, and slabs, but
the checked file does not include `IfcSpace` records. A first import can produce
multi-floor shell/context layers and vertical connector metadata. Room-level
navigation requires a better IFC export with rooms/spaces enabled or a follow-up
floorplan segmentation workflow.

Current converter:

```sh
python3 -m venv .venv-ifc
.venv-ifc/bin/python -m pip install -r scripts/ifc/requirements.txt
.venv-ifc/bin/python scripts/ifc/convert-ifc-to-location.py \
  "/Users/ahmadjalil/Downloads/bimmer/UNBC Model - 2026-06-30 - FINAL (Fixed Library).ifc" \
  --out app/data/unbc
```

The generated UNBC location is registered at `/unbc`. It uses a manual campus
anchor because the IFC's `IfcSite` latitude/longitude does not point to UNBC.
The model is therefore good enough for loading and inspecting floor shells, but
final campus alignment still needs manual `originIfcXY` and rotation calibration.

Recommended route feature properties for generated IFC routes:

```json
{
  "level_id": 1,
  "network_type": "corridor",
  "access_type": "public",
  "cost": 12.4,
  "is_accessible": true,
  "vertical_connection_id": null,
  "from_level_id": null,
  "to_level_id": null
}
```

Vertical connectors should use `network_type` values such as `"stairs"`,
`"elevator"`, `"ramp"`, or `"escalator"` and should set `from_level_id` and
`to_level_id` explicitly.
