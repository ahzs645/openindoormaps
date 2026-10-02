"""Compare connector footprints with raw source tiles and validate exported links.

python3 scripts/verify-harrods-connectors.py [candidate-directory]
This validates the import, not the operating direction of unobserved escalators.
"""
import json
import math
import os
import sys
from collections import defaultdict, Counter
from pathlib import Path
from shapely.affinity import affine_transform
from shapely.geometry import shape, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "app/data/harrods"
SOURCE = Path(os.environ.get("OIM_REFERENCE_DIR", str(
    Path.home() / "Downloads/Indoor Map/indoor map references")))
read = lambda p: json.loads(p.read_text())
mx, my = 111320 * math.cos(math.radians(51.5)), 111320
project = lambda g: affine_transform(g, [mx, 0, 0, my, .164 * mx, -51.499 * my])
colors = {"stairs": "#c7ccd1", "escalator": "#c9bfb6", "elevator": "#c9bfb6"}
raw, imported, landings, lanes = (defaultdict(list) for _ in range(4))
for f in read(SOURCE / "v9.pointr.express/harrods-tiles/tiles-z18.geojson")["features"]:
    p = f["properties"]
    if p["_layer"] in colors:
        raw[p["_layer"], p["fid"], int(p["lvl"])].append(project(shape(f["geometry"]).buffer(0)))
for f in read(DATA / "indoor-map.geojson")["features"]:
    p = f["properties"]
    assert not (p.get("feature_type") == "vertical_detail" and
                p.get("building_id") in ("harrods", "harrods-car-park")), "Invented connector decoration"
    if p.get("connector_style") != "pointr":
        continue
    kind, level, shaft = p["connection_type"], p["level_id"], p["vertical_connection_id"]
    assert p["fill"] == colors[kind] and p["fill-opacity"] == 1 and p["display_label"] == ""
    imported[kind, p["source_fid"], level].append(project(shape(f["geometry"])))
    landings[shaft, level].append(project(shape(f["geometry"])))
    if kind == "escalator":
        lanes[shaft, level].append(p["source_fid"])
assert raw.keys() == imported.keys(), "Missing or invented connector footprints"
for key in raw:
    a, b = unary_union(raw[key]), unary_union(imported[key])
    assert a.hausdorff_distance(b) < .0001, ("Source footprint moved", key)
    assert a.symmetric_difference(b).area < .001, ("Source footprint reshaped", key)
assert all(len(set(ids)) == 1 for ids in lanes.values()), "Parallel lanes merged"

count, known = Counter(), 0
for f in read(DATA / "indoor-routes.geojson")["features"]:
    p = f["properties"]
    if not p.get("shaft_id"):
        continue
    kind, a, b = p["network_type"], p["from_level_id"], p["to_level_id"]
    count[kind] += 1
    assert p["is_accessible"] == (kind == "elevator")
    if kind == "elevator":
        assert p["ride_time_seconds"] == 120
        assert p["cost"] == (60 if a == b else 0)
    else:
        assert b == a + 1 and p["cost"] == (45 if kind == "escalator" else 60)
        assert p["vertical_connection_id"] == (f"{p['shaft_id']}-flight-{a}-{b}"
                                               if kind == "escalator" else p["shaft_id"])
        for coordinate, level in zip(f["geometry"]["coordinates"], (a, b)):
            point = project(Point(coordinate[0] - level * 2e-7, coordinate[1]))
            assert unary_union(landings[p["shaft_id"], level]).buffer(.1).covers(point), "Landing outside footprint"
    if kind == "escalator":
        assert p["source_direction_constraint"] == "unidirectional"
        if p["direction_source"] == "captured-route":
            known += 1
            assert (a, b, p["direction"]) == (-1, 0, "forward")
        else:
            assert not p.get("direction"), "Invented escalator flow"
assert known == 1
print(f"PASS: {dict(Counter(k[0] for k in raw))} original footprints, exact style, separate parallel lanes.")
print(f"PASS: {dict(count)} connector edges; adjacent flights, landing containment, source travel times and accessibility.")
print("Direction evidence: one escalator flight confirmed; other orientations remain unknown.")
