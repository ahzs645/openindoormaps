"""Compare same-input candidate geometry without asserting route acceptance.

Usage: python3 scripts/indoor/compare-corridor-candidates.py BASE_DIR NEW_DIR OUT.json
"""
import json
import math
import sys
from collections import Counter
from pathlib import Path


def read_candidate(directory):
    directory = Path(directory)
    prepared = json.loads((directory / "prepared-routing.json").read_text())
    report = json.loads((directory / "report.json").read_text())
    guides = {guide["edgeId"]: guide for guide in prepared["guides"]}
    if len(guides) != len(prepared["guides"]):
        raise ValueError("Duplicate source guide IDs")
    return prepared, report, guides


def core_metrics(guide):
    points = guide["pointsFeet"]
    first, last = guide.get("hallwayJoins", [0, len(points) - 1])
    points = points[first:last + 1]
    turns = 0
    for a, b, c in zip(points, points[1:], points[2:]):
        u = (b[0] - a[0], b[1] - a[1])
        v = (c[0] - b[0], c[1] - b[1])
        # Collinear mandatory terminal joins are not visual jitter. This is a
        # descriptive five-degree bend count, never a geometry predicate.
        angle = abs(math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]))
        turns += angle > math.radians(5)
    length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:]))
    return {"coreVertices": len(points), "coreBendsOverFiveDegrees": turns, "coreLengthFeet": length}


def main():
    baseline_dir, candidate_dir, destination = sys.argv[1:]
    baseline, before, old = read_candidate(baseline_dir)
    candidate, after, new = read_candidate(candidate_dir)
    for field in ("sourceModelSha256", "sourceGeometryKey"):
        if baseline[field] != candidate[field]:
            raise ValueError(f"Candidates do not share {field}")
    before_cells = {cell["cellId"]: cell for cell in before["cells"]}
    after_cells = {cell["cellId"]: cell for cell in after["cells"]}
    if before_cells.keys() != after_cells.keys():
        raise ValueError("Candidate cell scopes differ")
    common = sorted(old.keys() & new.keys())
    lost = sorted(old.keys() - new.keys())
    gained = sorted(new.keys() - old.keys())
    refusals = {
        item["edgeId"]: item["reason"]
        for cell in after_cells.values()
        for item in cell["refusedEdges"]
    }
    metrics = {}
    for label, guides in (("baseline", old), ("candidate", new)):
        totals = Counter()
        for edge_id in common:
            totals.update(core_metrics(guides[edge_id]))
        metrics[label] = dict(totals)
    cells = []
    for cell_id, cell in before_cells.items():
        current = after_cells[cell_id]
        if cell["eligibleEdges"] != current["eligibleEdges"]:
            raise ValueError(f"Cell requirements differ: {cell_id}")
        cells.append({
            "cellId": cell_id,
            "eligibleEdges": cell["eligibleEdges"],
            "baselineCompiledEdges": cell["compiledEdges"],
            "candidateCompiledEdges": current["compiledEdges"],
            "refusalReasons": dict(Counter(item["reason"] for item in current["refusedEdges"])),
        })
    result = {
        "status": "same-input-candidate-comparison-only",
        "navigationAcceptance": False,
        "sourceModelSha256": candidate["sourceModelSha256"],
        "sourceGeometryKey": candidate["sourceGeometryKey"],
        "baselineResolver": baseline["resolverVersion"],
        "candidateResolver": candidate["resolverVersion"],
        "candidateParameters": after.get("parameters", after.get("binding", {}).get("parameters")),
        "cells": cells,
        "eligibleEdges": sum(cell["eligibleEdges"] for cell in cells),
        "baselineAcceptedGuides": len(old),
        "candidateAcceptedGuides": len(new),
        "gainedGuideIds": gained,
        "lostGuides": [{"edgeId": edge_id, "reason": refusals.get(edge_id, "UNACCOUNTED")} for edge_id in lost],
        "matchedGuides": len(common),
        "matchedGuideShape": metrics,
    }
    if any(item["reason"] == "UNACCOUNTED" for item in result["lostGuides"]):
        raise ValueError("Previously accepted guide lost without an outcome")
    Path(destination).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({key: result[key] for key in ("eligibleEdges", "baselineAcceptedGuides", "candidateAcceptedGuides", "matchedGuideShape")}))


if __name__ == "__main__":
    main()
