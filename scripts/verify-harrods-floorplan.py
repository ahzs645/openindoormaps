"""Verify visible wall/aisle geometry against raw source tiles, not a screenshot."""
import json
import math
import os
from pathlib import Path
from collections import defaultdict, Counter
from shapely.affinity import affine_transform
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get("OIM_REFERENCE_DIR", str(
    Path.home() / "Downloads/Indoor Map/indoor map references")))
read = lambda p: json.loads(p.read_text())
mx, my = 111320 * math.cos(math.radians(51.5)), 111320
project = lambda g: affine_transform(g, [mx, 0, 0, my, .164 * mx, -51.499 * my])
layers = {"wall", "walkway", "circulation"}
original, exported = defaultdict(list), defaultdict(list)
for f in read(SOURCE / "v9.pointr.express/harrods-tiles/tiles-z18.geojson")["features"]:
    p = f["properties"]
    if p["_layer"] in layers:
        g = shape(f["geometry"]).buffer(0)
        if not g.is_empty:
            original[p["_layer"], p["fid"], int(p["lvl"])].append(project(g))
counts = Counter()
for f in read(ROOT / "app/data/harrods/indoor-map.geojson")["features"]:
    p = f["properties"]
    if p["feature_type"] in ("unit", "corridor"):
        assert p["extrusion_height"] == 0, "Roof-like department/corridor hides the interior"
    layer = p.get("source_layer")
    if layer in layers:
        assert p["extrusion_height"] == (.75 if layer == "wall" else 0)
        assert p["feature_type"] == ("wall" if layer == "wall" else "corridor")
        exported[layer, p["source_fid"], p["level_id"]].append(project(shape(f["geometry"])))
        counts[layer] += 1
assert original.keys() == exported.keys(), "Interior layer missing or fabricated"
for key in original:
    a, b = unary_union(original[key]), unary_union(exported[key])
    assert a.hausdorff_distance(b) < .0001, ("Moved interior geometry", key)
    assert a.symmetric_difference(b).area < max(.001, a.length * .0001), ("Changed interior geometry/holes", key)
print(f"PASS: {dict(counts)} visible source polygons, exact interior boundaries/holes, low walls and flat departments.")
