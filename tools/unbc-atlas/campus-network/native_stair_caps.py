"""Planar native stair and slab diagnostics. These functions never grant route access."""

import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union


# Apply model-height tolerance only when finding candidate planes or tied tread
# elevations. Distances and contact with the slab retain the original coordinates.
HEIGHT_TOLERANCE_FT = 1e-5
SLAB_SEARCH_FT = 3.0


def square(point):
    x, y = point[:2]
    return box(x - 1, y - 1, x + 1, y + 1)


def unit(vector):
    length = math.hypot(*vector)
    return [v / length for v in vector]


def delta(a, b):
    return [a[0] - b[0], a[1] - b[1]]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def terminal_end(tread, neighbor):
    """Find the opposite finite riser edge of a terminal tread, with its normal."""
    ring = tread["ringFeet"]
    face = Polygon(ring)
    adjacent = Polygon(neighbor["ringFeet"])
    if not face.is_valid or not adjacent.is_valid:
        raise ValueError("Invalid native tread polygon")
    edges = [LineString([a, b]) for a, b in zip(ring, ring[1:] + ring[:1]) if a != b]
    shared = [e for e in edges if e.intersection(adjacent.boundary).length > e.length * 0.98]
    if len(shared) != 1:
        raise ValueError("A unique transverse native shared tread edge is required")
    side = shared[0]
    a, b = side.coords
    direction = unit(delta(b, a))
    normal = [-direction[1], direction[0]]
    inside = delta(face.centroid.coords[0], side.interpolate(0.5, normalized=True).coords[0])
    if dot(inside, normal) < 0:
        normal = [-normal[0], -normal[1]]
    opposite = [
        e for e in edges if e != side and e.length > 2
        and abs(dot(unit(delta(e.coords[1], e.coords[0])), direction)) > 0.999
    ]
    if len(opposite) != 1:
        raise ValueError("Native terminal tread has ambiguous outer transverse edge")
    edge = opposite[0]
    return edge, normal, edge.interpolate(0.5, normalized=True).coords[0]


def source_digest(value):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def flight_binding(flight, links, nodes, floors, levels, cap_floor_ids):
    """Bind the original flight, logical identity, served planes and cited cap polygons."""
    terminal_nodes = [nodes.get(link[side]) for link in links for side in ("from", "to")]
    cited_levels = sorted(set(flight.get("levelIds", [])) | {
        n["levelId"] for n in terminal_nodes if n is not None
    })
    return source_digest([
        flight, links, terminal_nodes, [levels.get(k) for k in cited_levels],
        [floors.get(k) for k in sorted(set(cap_floor_ids))],
    ])


def _floor_shapes(floors):
    planes = defaultdict(list)
    for floor in floors.values():
        rings = floor.get("partsFeet")
        if rings is None:
            rings = [floor.get("ringsFeet", [])]
        polygons = [Polygon(part[0], part[1:]) for part in rings if part and len(part[0]) >= 3]
        if not polygons:
            continue
        valid = all(p.is_valid for p in polygons)
        # An invalid source may be a location candidate. Its bounding envelope
        # must never provide a positive coverage or intersection measurement.
        shape = unary_union(polygons if valid else [p.envelope for p in polygons])
        planes[floor["elevationFeet"]].append((floor["nativeElementId"], shape, valid))
    return planes


def _measure_slabs(planes, elevation, edge, original):
    results = []
    midpoint = edge.interpolate(0.5, normalized=True)
    for z, floors in planes.items():
        if abs(z - elevation) >= HEIGHT_TOLERANCE_FT:
            continue
        for floor_id, shape, valid in floors:
            distance = edge.distance(shape)
            if distance > SLAB_SEARCH_FT:
                continue
            row = {"floorElementId": floor_id, "validSlabPolygon": valid}
            if valid:
                row.update(
                    fullEdgeDistanceFt=distance,
                    edgeContactLengthFt=edge.intersection(shape).length,
                    midpointGapFt=midpoint.distance(shape),
                    midpointToSlabBoundaryFt=midpoint.distance(shape.boundary),
                )
                if original is not None:
                    body = square(original)
                    row.update(originalSquareOutsideSqFt=body.difference(shape).area,
                               originalSquareMarginFt=body.distance(shape.boundary))
            else:
                row["envelopeDistanceFt"] = distance
            results.append(row)
    return sorted(results, key=lambda r: (
        r.get("fullEdgeDistanceFt", r.get("envelopeDistanceFt")), r["floorElementId"]
    ))


def _measure_side(flight, side, row, levels, planes):
    runs = flight.get("runs") or []
    if not runs:
        return "Native run elevation record unavailable"
    height = "topElevationFeet" if side else "bottomElevationFeet"
    elevations = [r.get(height) for r in runs]
    if not all(isinstance(v, (float, int)) and math.isfinite(v) for v in elevations):
        return "Native run has incomplete endpoint elevations"
    end_z = (max if side else min)(elevations)
    row["runReferenceFeet"] = end_z
    row["levelCandidates"] = [
        levels[k] for k in flight.get("levelIds", []) if k in levels
        and abs(levels[k]["elevationFeet"] - end_z) < HEIGHT_TOLERANCE_FT
    ]
    matches = [r for r in runs if abs(r[height] - end_z) < HEIGHT_TOLERANCE_FT]
    if len(matches) != 1:
        return "Multiple runs share a terminal elevation"
    run_id = matches[0]["runElementId"]
    row["terminalRunId"] = run_id
    treads = sorted(
        [t for t in flight.get("treads", []) if t.get("runElementId") == run_id],
        key=lambda t: t["elevationFeet"], reverse=bool(side),
    )
    if len(treads) < 2 or abs(treads[0]["elevationFeet"] - treads[1]["elevationFeet"]) < HEIGHT_TOLERANCE_FT:
        return "Terminal tread elevation or neighbor ambiguous"
    try:
        edge, normal, midpoint = terminal_end(treads[0], treads[1])
    except ValueError as exc:
        return str(exc)
    original = row["originalNodeFeet"]
    row.update(terminalEdgeFeet=list(edge.coords), outwardUnit=normal, midpointFeet=midpoint,
               terminalTreadElevationFt=treads[0]["elevationFeet"], treadWidthFt=edge.length,
               candidateSlabs=_measure_slabs(planes, end_z, edge, original))
    if original and abs(original[2] - end_z) >= HEIGHT_TOLERANCE_FT:
        row["nodeElevationConflict"] = True
    named = row.get("namedCapFloorId")
    if named is not None and all(c["floorElementId"] != named for c in row["candidateSlabs"]):
        row["namedCapOutsideThreeFootSearch"] = True
    return "Unique terminal tread edge"


def scan_native_caps(data, evidence=None, *, dataset_sha256=None, runtime_sha256=None, stair_ids=None):
    """Screen all native flights in a parsed dataset, optionally attaching matching source reviews.

    The optional evidence object is read from native-cap-evidence.json. Evidence
    must match the source identity and an individual flight/cap/endpoint digest.
    Same-elevation nearby slab polygons are always planar candidates only.
    """
    source = data.get("source", {})
    model = source.get("modelSha256")
    stairs = data.get("stairDisplay") or {}
    support = data.get("walkingSupport") or {}
    stairs_bound = bool(model and stairs.get("sourceModelSha256") == model)
    floors_bound = bool(model and support.get("sourceModelSha256") == model)
    evidence_bound = bool(evidence and evidence.get("format") == "native-stair-cap-reviews/1"
                          and evidence.get("sourceModelSha256") == model
                          and evidence.get("sourceSha256") == source_digest(source)
                          and stairs_bound and floors_bound)
    reviews = evidence.get("flights", {}) if evidence_bound else {}
    levels = {l["id"]: l for l in data.get("nativeLevels", [])}
    floors = {f["nativeElementId"]: f for f in support.get("floors", [])} if floors_bound else {}
    nodes = {n["id"]: n for n in data.get("nodes", [])}
    rooms = {r["key"]: r for r in data.get("records", [])}
    links = defaultdict(list)
    for edge in data.get("edges", []):
        kind = edge.get("kind")
        if kind == "stairs":
            links[edge.get("nativeElementId")].append(edge)
        elif kind == "local-steps":
            native = edge.get("nativeSourceStair") or {}
            stair_id = native.get("nativeStairId", edge.get("nativeStairId"))
            if stair_id is not None and native.get("sourceModelSha256", model) == model:
                links[stair_id].append(edge)
    planes = _floor_shapes(floors)
    selected = None if stair_ids is None else set(stair_ids)
    flights = [f for f in stairs.get("sourceFlights", [])
               if selected is None or f["stairElementId"] in selected]
    if selected is not None and selected != {f["stairElementId"] for f in flights}:
        raise ValueError("Requested native stair ID absent from the export")
    rows = []
    for flight in flights:
        stair = flight["stairElementId"]
        owners = links[stair]
        link = owners[0] if len(owners) == 1 else {}
        proof = reviews.get(str(stair), {})
        if proof:
            binding = flight_binding(flight, owners, nodes, floors, levels, proof["floorIds"])
            if binding != proof.get("bindingSha256"):
                proof = {}
        terminals = [nodes.get(link.get(position), {}) for position in ("from", "to")]
        heights = [levels.get(n.get("levelId"), {}).get("elevationFeet") for n in terminals]
        if all(isinstance(z, (int, float)) and math.isfinite(z) for z in heights) and abs(heights[0]-heights[1]) >= HEIGHT_TOLERANCE_FT:
            if heights[0] > heights[1]:
                terminals.reverse()
        else:
            terminals = [{}, {}]
        for side in range(2):
            endpoint = "upper" if side else "lower"
            history = proof.get("ends", {}).get(endpoint, {})
            node = terminals[side]
            row = {
                "stairElementId": stair, "endpoint": endpoint, "building": flight.get("buildings", []),
                "geometrySource": flight.get("sourceGeometry"), "runCount": len(flight.get("runs") or []),
                "namedRouteEdge": link.get("id"), "routeEdgeKind": link.get("kind"), "currentEnabled": link.get("enabled"), "currentAccess": link.get("accessible"),
                "sourceAudit": proof.get("sourceAudit"), "namedCapFloorId": history.get("floor"),
                "namedCapFace": history.get("face"), "namedCapPassed": history.get("passed"),
                "namedCapBoundaryContact": history.get("boundaryContact"),
                "reviewRequestFloorId": history.get("requestFloor"), "reviewRequestFace": history.get("requestFace"),
                "servedLevelId": node.get("levelId"), "roomNumber": rooms.get(node.get("roomKey"), {}).get("number"),
                "originalNodeFeet": node.get("pointFeet"), "candidateSlabs": [], "terminalEdgeFeet": None, "levelCandidates": [],
            }
            row["geometryStatus"] = (_measure_side(flight, side, row, levels, planes)
                                     if stairs_bound else "Source flight model binding unavailable")
            rows.append(row)
    return {
        "format": "native-stair-cap-screen/1", "datasetSha256": dataset_sha256,
        "sourceModelSha256": model, "runtimeSha256": runtime_sha256, "modelUnits": "feet",
        "sourceFlightsModelBound": stairs_bound, "slabModelBound": floors_bound,
        "historicalSourceMatches": evidence_bound, "searchDistanceFt": SLAB_SEARCH_FT,
        "flights": len(flights), "ends": len(rows),
        "uniqueTerminalTreadEdges": sum(r["terminalEdgeFeet"] is not None for r in rows),
        "endsWithOriginalGraphTerminals": sum(r["originalNodeFeet"] is not None for r in rows),
        "endsWithNamedCapReview": sum(r["namedCapPassed"] is not None for r in rows),
        "endsWithProjectedSlabCandidate": sum(bool(r["candidateSlabs"]) for r in rows),
        "sourceCapOutcomes": dict(Counter(str(r["namedCapPassed"]) for r in rows)),
        "geometryOutcomes": dict(Counter(r["geometryStatus"] for r in rows)), "rows": rows,
    }


def write_native_caps(report, output_dir):
    """Write native-stair-caps.json and native-stair-caps.csv. Return both paths."""
    root = Path(output_dir)
    root.mkdir(parents=True, exist_ok=True)
    machine = root / "native-stair-caps.json"
    table = root / "native-stair-caps.csv"
    machine.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    fields = ["stairElementId", "endpoint", "geometryStatus", "servedLevelId", "roomNumber",
              "terminalRunId", "namedCapFloorId", "namedCapFace", "namedCapPassed",
              "namedCapBoundaryContact", "currentEnabled", "currentAccess",
              "projectedSlabCount", "projectedFloorIds"]
    with table.open("w", newline="", encoding="utf8") as stream:
        writer = csv.DictWriter(stream, fields, extrasaction="ignore")
        writer.writeheader()
        for row in report["rows"]:
            floors = row["candidateSlabs"]
            writer.writerow({**row, "projectedSlabCount": len(floors),
                             "projectedFloorIds": " ".join(str(f["floorElementId"]) for f in floors)})
    return machine, table
