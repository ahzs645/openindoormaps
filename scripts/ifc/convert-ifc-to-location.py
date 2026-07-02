#!/usr/bin/env python3
"""Convert a BIM IFC file into the OpenIndoorMaps location contract.

This is a first-pass semantic converter. It prefers IfcSpace footprints when
available, but can also emit floor shell polygons from slabs so an IFC can be
loaded and inspected in the app before room data exists.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.util.placement
    from shapely.geometry import MultiPoint, Point, Polygon, mapping
    from shapely.ops import unary_union
except ImportError as exc:
    raise SystemExit(
        "Missing converter dependencies. Install them in a venv with:\n"
        "  python3 -m venv .venv-ifc\n"
        "  .venv-ifc/bin/python -m pip install ifcopenshell shapely\n"
        "Then run this script with .venv-ifc/bin/python."
    ) from exc


IFC_PATH_DEFAULT = (
    "/Users/ahmadjalil/Downloads/bimmer/"
    "UNBC Model - 2026-06-30 - FINAL (Fixed Library).ifc"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("ifc", nargs="?", default=IFC_PATH_DEFAULT)
    parser.add_argument("--out", default="app/data/unbc")
    parser.add_argument("--slug", default="unbc")
    parser.add_argument("--name", default="UNBC IFC Import")
    parser.add_argument("--anchor-lat", type=float, default=53.885731)
    parser.add_argument("--anchor-lon", type=float, default=-122.808231)
    parser.add_argument(
        "--include-wall-shells",
        action="store_true",
        help="Include wall geometry when slab/ramp floor shells are insufficient. Slower on large Revit IFC files.",
    )
    parser.add_argument("--max-wall-axes", type=int, default=3_000)
    parser.add_argument(
        "--pillar-like-wall-max-length",
        type=float,
        default=1.0,
        help="Wall axis segments at or below this length in meters are tagged as pillar-like and hidden by default.",
    )
    parser.add_argument("--max-pois-per-floor", type=int, default=80)
    return parser.parse_args()


def safe_name(value: Any, fallback: str) -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def feature_collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def local_to_lonlat(
    x: float,
    y: float,
    origin_x: float,
    origin_y: float,
    anchor_lat: float,
    anchor_lon: float,
) -> list[float]:
    lat_rad = math.radians(anchor_lat)
    meters_per_degree_lat = 111_320
    meters_per_degree_lon = 111_320 * math.cos(lat_rad)
    return [
        anchor_lon + (x - origin_x) / meters_per_degree_lon,
        anchor_lat + (y - origin_y) / meters_per_degree_lat,
    ]


def geometry_points(settings: ifcopenshell.geom.settings, element: Any) -> list[tuple[float, float, float]]:
    try:
        shape = ifcopenshell.geom.create_shape(settings, element)
    except Exception:
        return []

    verts = shape.geometry.verts
    return [
        (float(verts[index]), float(verts[index + 1]), float(verts[index + 2]))
        for index in range(0, len(verts), 3)
    ]


def polygon_from_points(points: list[tuple[float, float, float]]) -> Polygon | None:
    if len(points) < 3:
        return None
    hull = MultiPoint([(x, y) for x, y, _ in points]).convex_hull
    if hull.is_empty:
        return None
    if hull.geom_type == "Polygon":
        return hull
    return None


def placement_point(element: Any) -> Point | None:
    placement = getattr(element, "ObjectPlacement", None)
    if placement is None:
        return None
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(placement)
    except Exception:
        return None
    return Point(float(matrix[0][3]) * 0.001, float(matrix[1][3]) * 0.001)


def transform_axis_point(matrix: Any, coordinates: tuple[float, ...]) -> tuple[float, float]:
    x = float(coordinates[0])
    y = float(coordinates[1]) if len(coordinates) > 1 else 0
    world_x = matrix[0][0] * x + matrix[0][1] * y + matrix[0][3]
    world_y = matrix[1][0] * x + matrix[1][1] * y + matrix[1][3]
    return (float(world_x) * 0.001, float(world_y) * 0.001)


def wall_axis_lines(element: Any) -> list[list[tuple[float, float]]]:
    representation = getattr(element, "Representation", None)
    placement = getattr(element, "ObjectPlacement", None)
    if representation is None or placement is None:
        return []

    try:
        matrix = ifcopenshell.util.placement.get_local_placement(placement)
    except Exception:
        return []

    lines: list[list[tuple[float, float]]] = []
    for shape_representation in representation.Representations:
        if getattr(shape_representation, "RepresentationIdentifier", None) != "Axis":
            continue
        for item in shape_representation.Items:
            if not item.is_a("IfcPolyline"):
                continue
            coordinates = [
                transform_axis_point(matrix, point.Coordinates)
                for point in item.Points
            ]
            if len(coordinates) >= 2:
                lines.append(coordinates)
    return lines


def line_length(coordinates: list[tuple[float, float]]) -> float:
    return sum(
        math.hypot(next_point[0] - point[0], next_point[1] - point[1])
        for point, next_point in zip(coordinates, coordinates[1:])
    )


def storey_level_id(name: str, index: int) -> float | int:
    parts = name.replace("_", " ").split()
    for part in reversed(parts):
        try:
            value = float(part)
            return int(value) if value.is_integer() else value
        except ValueError:
            continue
    return index


def build_storeys(model: Any) -> list[dict[str, Any]]:
    storeys = []
    for index, storey in enumerate(
        sorted(
            model.by_type("IfcBuildingStorey"),
            key=lambda item: (
                float(getattr(item, "Elevation", 0) or 0),
                safe_name(getattr(item, "Name", None), ""),
            ),
        )
    ):
        name = safe_name(getattr(storey, "Name", None), f"Floor {index}")
        storeys.append(
            {
                "entity": storey,
                "express_id": storey.id(),
                "global_id": getattr(storey, "GlobalId", None),
                "index": index,
                "level_id": storey_level_id(name, index),
                "name": name,
                "elevation": float(getattr(storey, "Elevation", 0) or 0),
            }
        )
    return storeys


def build_containment(model: Any) -> dict[int, int]:
    contained: dict[int, int] = {}
    for rel in model.by_type("IfcRelContainedInSpatialStructure"):
        storey = rel.RelatingStructure
        if not storey or not storey.is_a("IfcBuildingStorey"):
            continue
        for element in rel.RelatedElements:
            contained[element.id()] = storey.id()
    return contained


def product_storey_id(product: Any, containment: dict[int, int]) -> int | None:
    return containment.get(product.id())


def all_xy_bounds(points_by_floor: dict[int, list[tuple[float, float, float]]]) -> tuple[float, float]:
    all_points = [point for points in points_by_floor.values() for point in points]
    if not all_points:
        return (0, 0)
    return (
        sum(point[0] for point in all_points) / len(all_points),
        sum(point[1] for point in all_points) / len(all_points),
    )


def transform_polygon(
    polygon: Polygon,
    origin_x: float,
    origin_y: float,
    anchor_lat: float,
    anchor_lon: float,
) -> list[list[list[float]]]:
    ring = [
        local_to_lonlat(x, y, origin_x, origin_y, anchor_lat, anchor_lon)
        for x, y in polygon.exterior.coords
    ]
    return [ring]


def transform_point(
    point: Point,
    origin_x: float,
    origin_y: float,
    anchor_lat: float,
    anchor_lon: float,
) -> list[float]:
    return local_to_lonlat(point.x, point.y, origin_x, origin_y, anchor_lat, anchor_lon)


def transform_line(
    coordinates: list[tuple[float, float]],
    origin_x: float,
    origin_y: float,
    anchor_lat: float,
    anchor_lon: float,
) -> list[list[float]]:
    return [
        local_to_lonlat(x, y, origin_x, origin_y, anchor_lat, anchor_lon)
        for x, y in coordinates
    ]


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    model = ifcopenshell.open(args.ifc)
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    storeys = build_storeys(model)
    storey_by_id = {storey["express_id"]: storey for storey in storeys}
    containment = build_containment(model)

    floor_points: dict[int, list[tuple[float, float, float]]] = defaultdict(list)
    floor_polygons: dict[int, list[Polygon]] = defaultdict(list)

    shell_types = ["IfcSlab", "IfcRamp"]
    if args.include_wall_shells:
        shell_types.extend(["IfcWall", "IfcWallStandardCase"])
    for ifc_type in shell_types:
        for product in model.by_type(ifc_type):
            storey_id = product_storey_id(product, containment)
            if storey_id is None:
                continue
            points = geometry_points(settings, product)
            if not points:
                continue
            floor_points[storey_id].extend(points)
            if ifc_type in {"IfcSlab", "IfcRamp"}:
                polygon = polygon_from_points(points)
                if polygon and polygon.area > 1:
                    floor_polygons[storey_id].append(polygon)

    origin_x, origin_y = all_xy_bounds(floor_points)

    indoor_features: list[dict[str, Any]] = []
    poi_features: list[dict[str, Any]] = []
    route_features: list[dict[str, Any]] = []
    floor_centers: dict[int, list[float]] = {}
    connector_points_by_floor: dict[int, list[dict[str, Any]]] = defaultdict(list)
    wall_axis_count = 0

    for storey in storeys:
        storey_id = storey["express_id"]
        polygons = floor_polygons.get(storey_id, [])
        if polygons:
            floor_polygon = unary_union(polygons).convex_hull
        else:
            floor_polygon = polygon_from_points(floor_points.get(storey_id, []))

        if not floor_polygon or floor_polygon.is_empty:
            continue

        center = floor_polygon.representative_point()
        floor_centers[storey_id] = transform_point(
            center, origin_x, origin_y, args.anchor_lat, args.anchor_lon
        )
        indoor_features.append(
            {
                "type": "Feature",
                "id": storey_id,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": transform_polygon(
                        floor_polygon,
                        origin_x,
                        origin_y,
                        args.anchor_lat,
                        args.anchor_lon,
                    ),
                },
                "properties": {
                    "id": storey_id,
                    "name": storey["name"],
                    "feature_type": "floor_outline",
                    "level_id": storey["level_id"],
                    "show": "true",
                    "source": "ifc-floor-shell",
                    "ifc_global_id": storey["global_id"],
                    "ifc_express_id": storey_id,
                    "elevation": storey["elevation"],
                },
            }
        )
        poi_features.append(
            {
                "type": "Feature",
                "id": storey_id,
                "geometry": {"type": "Point", "coordinates": floor_centers[storey_id]},
                "properties": {
                    "id": storey_id,
                    "name": f"{storey['name']} overview",
                    "type": "floor",
                    "floor": storey["level_id"],
                    "building_id": args.slug,
                    "metadata": {
                        "ifc_class": "IfcBuildingStorey",
                        "ifc_global_id": storey["global_id"],
                        "ifc_express_id": storey_id,
                    },
                },
            }
        )

    for ifc_type in ["IfcWallStandardCase", "IfcWall", "IfcCurtainWall"]:
        for product in model.by_type(ifc_type):
            if wall_axis_count >= args.max_wall_axes:
                break
            storey_id = product_storey_id(product, containment)
            storey = storey_by_id.get(storey_id)
            if not storey:
                continue
            for line in wall_axis_lines(product):
                if wall_axis_count >= args.max_wall_axes:
                    break
                wall_axis_count += 1
                length_m = line_length(line)
                indoor_features.append(
                    {
                        "type": "Feature",
                        "id": 200_000 + wall_axis_count,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": transform_line(
                                line,
                                origin_x,
                                origin_y,
                                args.anchor_lat,
                                args.anchor_lon,
                            ),
                        },
                        "properties": {
                            "id": 200_000 + wall_axis_count,
                            "name": safe_name(getattr(product, "Name", None), "Wall"),
                            "feature_type": "wall",
                            "level_id": storey["level_id"],
                            "show": "true",
                            "source": "ifc-wall-axis",
                            "length_m": round(length_m, 3),
                            "is_pillar_like": length_m <= args.pillar_like_wall_max_length,
                            "ifc_class": product.is_a(),
                            "ifc_global_id": getattr(product, "GlobalId", None),
                            "ifc_express_id": product.id(),
                        },
                    }
                )

    connector_types = [
        ("IfcRamp", "ramp", True),
        ("IfcRampFlight", "ramp", True),
        ("IfcStair", "stairs", False),
        ("IfcStairFlight", "stairs", False),
    ]
    poi_id = 100_000
    for ifc_type, connector_type, is_accessible in connector_types:
        for product in model.by_type(ifc_type):
            storey_id = product_storey_id(product, containment)
            storey = storey_by_id.get(storey_id)
            if not storey:
                continue
            points = geometry_points(settings, product)
            polygon = polygon_from_points(points)
            point = polygon.representative_point() if polygon else placement_point(product)
            if point is None:
                continue
            coordinates = transform_point(
                point, origin_x, origin_y, args.anchor_lat, args.anchor_lon
            )
            poi_id += 1
            poi = {
                "type": "Feature",
                "id": poi_id,
                "geometry": {"type": "Point", "coordinates": coordinates},
                "properties": {
                    "id": poi_id,
                    "name": safe_name(getattr(product, "Name", None), connector_type.title()),
                    "type": connector_type,
                    "floor": storey["level_id"],
                    "building_id": args.slug,
                    "metadata": {
                        "ifc_class": product.is_a(),
                        "ifc_global_id": getattr(product, "GlobalId", None),
                        "ifc_express_id": product.id(),
                        "is_accessible": is_accessible,
                    },
                },
            }
            connector_points_by_floor[storey_id].append(
                {
                    "point": point,
                    "coordinates": coordinates,
                    "feature": poi,
                    "connector_type": connector_type,
                    "is_accessible": is_accessible,
                }
            )

    for storey_id, connectors in connector_points_by_floor.items():
        center = floor_centers.get(storey_id)
        storey = storey_by_id.get(storey_id)
        if not center or not storey:
            continue
        for connector in connectors[: args.max_pois_per_floor]:
            poi_features.append(connector["feature"])
            route_features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [center, connector["coordinates"]],
                    },
                    "properties": {
                        "level_id": storey["level_id"],
                        "network_type": connector["connector_type"],
                        "access_type": "public",
                        "is_accessible": connector["is_accessible"],
                        "vertical_connection_id": connector["feature"]["properties"][
                            "metadata"
                        ]["ifc_global_id"],
                        "from_level_id": None,
                        "to_level_id": None,
                    },
                }
            )

    ordered_storeys = [storey for storey in storeys if storey["express_id"] in floor_centers]
    for current, next_storey in zip(ordered_storeys, ordered_storeys[1:]):
        current_connectors = connector_points_by_floor.get(current["express_id"], [])
        next_connectors = connector_points_by_floor.get(next_storey["express_id"], [])
        best_pair = None
        best_distance = float("inf")
        for a in current_connectors:
            for b in next_connectors:
                if a["connector_type"] != b["connector_type"]:
                    continue
                distance = a["point"].distance(b["point"])
                if distance < best_distance:
                    best_distance = distance
                    best_pair = (a, b)
        if best_pair and best_distance <= 8:
            a, b = best_pair
            route_features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [a["coordinates"], b["coordinates"]],
                    },
                    "properties": {
                        "level_id": current["level_id"],
                        "network_type": a["connector_type"],
                        "access_type": "public",
                        "cost": max(0.02, best_distance / 1000),
                        "is_accessible": a["is_accessible"] and b["is_accessible"],
                        "vertical_connection_id": f"{a['connector_type']}-{current['level_id']}-{next_storey['level_id']}",
                        "from_level_id": current["level_id"],
                        "to_level_id": next_storey["level_id"],
                    },
                }
            )

    write_json(out_dir / "indoor-map.geojson", feature_collection(indoor_features))
    write_json(out_dir / "indoor-routes.geojson", feature_collection(route_features))
    write_json(out_dir / "pois.geojson", feature_collection(poi_features))
    write_json(
        out_dir / "manifest.json",
        {
            "source_ifc": str(Path(args.ifc).expanduser()),
            "schema": model.schema,
            "anchor": {
                "longitude": args.anchor_lon,
                "latitude": args.anchor_lat,
                "source": "manual UNBC campus anchor; IFC IfcSite coordinates were not trusted",
            },
            "counts": {
                "IfcBuildingStorey": len(model.by_type("IfcBuildingStorey")),
                "IfcSpace": len(model.by_type("IfcSpace")),
                "IfcDoor": len(model.by_type("IfcDoor")),
                "IfcStair": len(model.by_type("IfcStair")),
                "IfcStairFlight": len(model.by_type("IfcStairFlight")),
                "IfcRamp": len(model.by_type("IfcRamp")),
                "IfcRampFlight": len(model.by_type("IfcRampFlight")),
                "indoorMapFeatures": len(indoor_features),
                "indoorRouteFeatures": len(route_features),
                "poiFeatures": len(poi_features),
                "wallAxisFeatures": wall_axis_count,
            },
            "limitations": [
                "No IfcSpace entities were present, so room polygons and room POIs were not generated.",
                "Floor polygons are convex shell approximations from slabs and ramps.",
                "Routes are a connector skeleton for inspection, not final room-to-room navigation.",
            ],
        },
    )


if __name__ == "__main__":
    main()
