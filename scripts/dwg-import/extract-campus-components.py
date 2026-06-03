#!/usr/bin/env python3

import json
import sys
from pathlib import Path

try:
    import ezdxf
    from shapely.geometry import LineString
    from shapely.ops import polygonize, unary_union
except ImportError as exc:  # pragma: no cover - runtime dependency
    print(
        json.dumps(
            {
                "error": (
                    "Missing Python dependency for campus extraction. "
                    "Install with: python3 -m pip install --user ezdxf shapely"
                )
            }
        ),
        file=sys.stderr,
    )
    raise SystemExit(2) from exc


def entity_segments(entity):
    entity_type = entity.dxftype()
    if entity_type == "LINE":
        start = entity.dxf.start
        end = entity.dxf.end
        return [[(float(start.x), float(start.y)), (float(end.x), float(end.y))]]

    if entity_type == "LWPOLYLINE":
        points = [(float(x), float(y)) for x, y, *_ in entity.get_points("xy")]
        if entity.closed and points and points[0] != points[-1]:
            points.append(points[0])
        return [[left, right] for left, right in zip(points, points[1:])]

    if entity_type == "POLYLINE":
        points = [
            (float(vertex.dxf.location.x), float(vertex.dxf.location.y))
            for vertex in entity.vertices
        ]
        if entity.is_closed and points and points[0] != points[-1]:
            points.append(points[0])
        return [[left, right] for left, right in zip(points, points[1:])]

    return []


def main():
    if len(sys.argv) != 4:
        print(
            "Usage: extract-campus-components.py <path/to/file.dxf> <layer> <min-area>",
            file=sys.stderr,
        )
        raise SystemExit(1)

    dxf_path = Path(sys.argv[1]).resolve()
    layer_name = sys.argv[2]
    min_area = float(sys.argv[3])

    document = ezdxf.readfile(dxf_path)
    modelspace = document.modelspace()

    segments = []
    for entity in modelspace:
        if getattr(entity.dxf, "layer", "") != layer_name:
            continue

        for segment in entity_segments(entity):
            segments.append(LineString(segment))

    polygons = [
        polygon
        for polygon in polygonize(unary_union(segments))
        if polygon.area > min_area
    ]
    polygons.sort(key=lambda polygon: (-polygon.centroid.y, polygon.centroid.x))

    components = []
    for index, polygon in enumerate(polygons, start=1):
        components.append(
            {
                "index": index,
                "area": float(polygon.area),
                "bounds": [float(value) for value in polygon.bounds],
                "centroid": [
                    float(polygon.centroid.x),
                    float(polygon.centroid.y),
                ],
                "points": [
                    [float(x), float(y)]
                    for x, y in list(polygon.exterior.coords)[:-1]
                ],
            }
        )

    print(json.dumps({"components": components}, indent=2))


if __name__ == "__main__":
    main()
