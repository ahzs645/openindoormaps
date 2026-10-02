"""Compare real engine paths with captured vendor paths and source aisle areas.

Run after verify-harrods-routing.ts:
python3 scripts/compare-harrods-reference-routes.py /tmp/harrods-routes.json
Optional --before=... and --out=... save a reproducible comparison report.
Requires the decoded source capture, just like the importer.
"""
import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

from shapely.affinity import affine_transform
from shapely.geometry import LineString, shape
from shapely.ops import unary_union

from port_vendors_common import REFERENCE_ROOT

ROOT = Path(__file__).resolve().parents[1]
mx, my = 111320 * math.cos(math.radians(51.5)), 111320
project = lambda g: affine_transform(g, [mx, 0, 0, my, .164 * mx, -51.499 * my])
read = lambda p: json.loads(Path(p).read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine_routes")
    parser.add_argument("--before")
    parser.add_argument("--out")
    args = parser.parse_args()
    tiles = read(Path(REFERENCE_ROOT) / "v9.pointr.express/harrods-tiles/tiles-z18.geojson")
    parts = defaultdict(list)
    for f in tiles["features"]:
        p = f["properties"]
        if p["_layer"] in ("walkway", "circulation"):
            parts[p["lvl"]].append(project(shape(f["geometry"]).buffer(0)))
    # Fixed 10 cm classification tolerance accounts for quantized aisle
    # boundaries; obstacle validation is separate and much stricter.
    aisles = {level: unary_union(gs).buffer(.1) for level, gs in parts.items()}
    references = read(ROOT / "tests/fixtures/harrods-reference-routes.json")

    def metrics(lines, source):
        samples = [g.interpolate(i / 4).distance(source[level])
                   for level, g in lines
                   for i in range(int(g.length * 4) + 1)]
        assert samples and all(math.isfinite(d) for d in samples), "Missing source floor"
        return {
            "horizontal_distance_m": round(sum(g.length for _, g in lines), 2),
            "outside_source_aisles_m": round(sum(g.difference(aisles[l]).length
                                                 for l, g in lines), 2),
            "median_source_deviation_m": round(statistics.median(samples), 2),
            "p95_source_deviation_m": round(sorted(samples)[int(.95 * len(samples))], 2),
            "within_2m_percent": round(100 * sum(d <= 2 for d in samples) / len(samples), 1),
        }

    def engine_lines(cases, name):
        case = next(c for c in cases if c["name"] == name and not c["accessible"])
        result = []
        for f in case["lines"]:
            level = f["properties"].get("level_id")
            if level not in aisles:
                continue
            # Remove the viewer's artificial longitude floor separation.
            coords = [[c[0] - level * 2e-7, c[1]] for c in f["geometry"]["coordinates"]]
            result.append((level, project(LineString(coords))))
        return result

    current = read(args.engine_routes)
    before = read(args.before) if args.before else None
    outputs = []
    for ref in references:
        lines = [(a["level"], project(LineString([a["coordinate"], b["coordinate"]])))
                 for a, b in zip(ref["nodes"], ref["nodes"][1:]) if a["level"] == b["level"]]
        source = {l: unary_union([g for level, g in lines if level == l]) for l in aisles}
        baseline = metrics(lines, source)
        after = metrics(engine_lines(current, ref["name"]), source)
        # These compare to external route evidence, not the generated graph.
        assert abs(after["horizontal_distance_m"] / baseline["horizontal_distance_m"] - 1) < .12
        assert after["median_source_deviation_m"] < 1
        assert after["outside_source_aisles_m"] < baseline["outside_source_aisles_m"] + 6
        output = {"name": ref["name"], "source_reported_distance_m": ref["source_distance_m"],
                  "source": baseline, "current": after}
        if before:
            output["before"] = metrics(engine_lines(before, ref["name"]), source)
        outputs.append(output)
        print(f"PASS: {ref['name']}: {after['horizontal_distance_m']} m walking, "
              f"{after['within_2m_percent']}% within 2 m of source, "
              f"{after['outside_source_aisles_m']} m outside source aisles.")
    if args.out:
        Path(args.out).write_text(json.dumps({
            "sample_spacing_m": .25, "aisle_classification_tolerance_m": .1,
            "limitation": "Three captured routes; the complete vendor graph is not available.",
            "routes": outputs}, indent=2) + "\n")


if __name__ == "__main__":
    main()
