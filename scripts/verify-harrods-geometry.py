"""Independent obstacle checks for the entire graph and optional actual routes.

python3 scripts/verify-harrods-geometry.py [engine-routes.json]
Original source polygon material is retained in navigation-constraints.geojson.
The verifier unions each layer before applying its documented cm tolerance.
"""
import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path

from shapely.affinity import affine_transform
from shapely.geometry import shape, LineString
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
mx, my = 111320 * math.cos(math.radians(51.5)), 111320
project = lambda g: affine_transform(g, [mx, 0, 0, my, .164 * mx, -51.499 * my])
read = lambda file: json.loads(file.read_text())
groups = defaultdict(list)
stored_source = defaultdict(list)
TOLERANCES = {"wall": .04, "virtualobstacle": .06, "void": .06}
for f in read(ROOT / "app/data/harrods/navigation-constraints.geojson")["features"]:
    p = f["properties"]
    assert p["geometry_tolerance_m"] == TOLERANCES[p["source_layer"]], (
        "Source tolerance changed; do not loosen the obstacle test to pass routes."
    )
    groups[p["level_id"], p["geometry_tolerance_m"]].append(project(shape(f["geometry"])))
    stored_source[p["source_layer"], p["level_id"], p["building_id"]].append(
        project(shape(f["geometry"])))

# Where the capture is available, independently compare exported blockers
# against its raw tile parts, before any tolerance is applied.
capture_root = Path(os.environ.get("OIM_REFERENCE_DIR", str(
    Path.home() / "Downloads/Indoor Map/indoor map references")))
tiles = capture_root / "v9.pointr.express/harrods-tiles/tiles-z18.geojson"
if tiles.exists():
    original = defaultdict(list)
    for f in read(tiles)["features"]:
        p = f["properties"]
        if p["_layer"] not in TOLERANCES:
            continue
        building = "harrods-car-park" if p.get("bid", "").startswith("a5dfde10") else "harrods"
        original[p["_layer"], int(p["lvl"]), building].append(
            project(shape(f["geometry"]).buffer(0)))
    assert original.keys() == stored_source.keys(), "Missing source obstacle layers/floors"
    for key, parts in original.items():
        delta = unary_union(parts).symmetric_difference(
            unary_union(stored_source[key])).area
        assert delta < .05, f"Source obstacle material was changed: {key}, {delta} m²"
    print("PASS: exported obstacle material matches the original source tiles.")
blocked = defaultdict(list)
for (level, tolerance), parts in groups.items():
    blocked[level].append(unary_union(parts).buffer(-tolerance, join_style="mitre"))
blocked = {level: prep(unary_union(parts)) for level, parts in blocked.items()}


def check(features):
    count = 0
    for f in features:
        level = f["properties"].get("level_id")
        if f["geometry"]["type"] != "LineString" or level is None:
            continue
        coords = [[c[0] - level * 2e-7, c[1]] for c in f["geometry"]["coordinates"]]
        for a, b in zip(coords, coords[1:]):
            line = project(LineString([a, b]))
            # Outdoor paths get the same check at the store/park boundaries.
            assert not blocked.get(level, prep(LineString())).intersects(line), (
                f"Walking segment enters obstacle core on floor {level}: {a} -> {b}"
            )
            count += 1
    return count


count = check(read(ROOT / "app/data/harrods/indoor-routes.geojson")["features"])
print(f"PASS: {count} graph walking segments avoid source obstacle cores.")
if len(sys.argv) > 1:
    outputs = read(Path(sys.argv[1]))
    for result in outputs:
        n = check(result["lines"])
        print(f"PASS: {result['name']} accessible={result['accessible']}: {n} clear walking segments")
