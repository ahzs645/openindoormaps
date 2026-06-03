# DWG Import Swarm

This repository now includes a CAD import scaffold at `scripts/dwg-import/` that converts `DWG` or `DXF` floor plans into the `building.json`-style bundle the app consumes:

- `indoor_map`: polygons, detail lines, and point features
- `pois`: room-number labels and searchable locations
- `indoor_routes`: line-based routing graph

## Why a swarm

DWG conversion is not one step. The pipeline is split into specialized agents so each stage can be tuned per building:

1. `conversion-agent`: turns `DWG` into `DXF`
2. `parse-agent`: reads the `DXF` into a normalized entity graph
3. `layout-context-agent`: reads paperspace viewports so modelspace room anchors can be scoped to the right sheet
4. `wall-recovery-agent`: polygonizes wall linework per layout window and matches room anchors back onto recovered polygons
5. `semantic-extraction-agent`: assigns canonical building/floor metadata, classifies layers, builds polygons/labels/routes
6. `quality-agent`: reports missing labels, routes, floors, and georeferencing gaps
7. `export-agent`: writes GeoJSON artifacts plus a bundle compatible with this app

The important practical point is that floor plans are not semantically consistent across buildings. One campus may store room outlines as closed polylines on `A-ROOM`, another may use stair blocks on `A-ANNO`, and another may only expose route centerlines on a custom nav layer. The swarm isolates those heuristics into config instead of burying them in one script.

## Run it

```bash
npm run dwg:import -- \
  --input "Reference Maps/UNBC floor plan Basic.DWG" \
  --config scripts/dwg-import/config.example.json \
  --outdir generated/dwg-import/unbc
```

If you want the generated bundle to replace the app demo data directly:

```bash
npm run dwg:import -- \
  --input building.dxf \
  --config building.config.json \
  --bundle-target app/mock/building.json
```

## Config strategy

The importer expects building-specific configuration for:

- layer classification: room, corridor, stairs, elevator, door, window, routing, ignore
- floor detection rules: regexes over layer names, block names, or label text
- layout context: whether to read paperspace viewports and require layout extraction to succeed
- building code metadata: mapping from room-number prefixes to canonical `building_id` / display names
- wall recovery: which layers should be polygonized into room boundaries, plus tuning for layout margin, arc flattening, and anchor snap tolerance
- room label detection: regexes for room numbers
- georeferencing: either identity for already-georeferenced DXF or 2-3 control points to transform CAD coordinates into map coordinates
- DWG conversion command: optional custom command for ODA File Converter or another local converter

The sample config at `scripts/dwg-import/config.example.json` is a template. It is not a universal mapping.

## Current limits

- Cross-floor routing is still limited by the app’s current route graph. The importer preserves floor assignments, stairs, and elevators, but the runtime router is still fundamentally 2D.
- Layout metadata should be treated as provenance and fallback, not the primary source of truth. For UNBC, canonical `building_code` and `floor` now come from `room_number` first and only fall back to layout data when the label itself is ambiguous.
- Wall recovery is linework-based. It works best when the source exposes wall boundaries on a dedicated layer such as `1_Wall_Exist`; rooms that are not closed by the available linework remain as unmatched POIs in `report.json`.
- Doors and windows are now renderable as detail features, but their exact shape depends on how the CAD file encodes them. Insert blocks will usually become point features unless the source exposes line or polygon geometry.
- Room-label assignment is containment-based. If text sits outside the room polygon, it is reported in `report.json` and not silently guessed.
- If the DWG is not georeferenced and you do not provide control points, the output will still be in local CAD coordinates, which is not usable for the map.

## Useful external references

- [ODA File Converter](https://www.opendesign.com/GUESTFILES/ODA_FILE_CONVERTER): practical DWG/DXF conversion tool with CLI support.
- [LibreDWG manual](https://www.gnu.org/software/libredwg/manual/LibreDWG.pdf): `dwgread` can export `DXF`, `JSON`, `GeoJSON`, and `SVG`.
- [GDAL ODA driver docs](https://gdal.org/drivers/vector/oda.html): useful if you want a geospatial conversion chain around ODA-backed CAD access.
- [GDAL DXF driver docs](https://gdal.org/drivers/vector/dxf.html): helpful once the source is already in DXF.
- [OpenStreetMap Simple Indoor Tagging](https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging): good semantic baseline for rooms, corridors, doors, and levels.
- [OpenStreetMap `level` key](https://wiki.openstreetmap.org/wiki/Key:level): reference for multi-floor semantics.
- [OGC IndoorGML overview](https://www.ogc.org/standards/indoorgml/): useful if you later want a formal indoor topology model instead of app-specific GeoJSON.
- [osmAG-from-cad](https://github.com/jiajiezhang7/osmAG-from-cad): an open-source example of extracting structured indoor maps from CAD drawings.
