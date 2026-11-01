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


ZIGZAG_TURN_DEGREES = 120
ZIGZAG_LEG_FEET = 2 / 0.3048  # two metres


def turn_degrees(a, b, c):
    u = (b[0] - a[0], b[1] - a[1])
    v = (c[0] - b[0], c[1] - b[1])
    return math.degrees(abs(math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])))


def distinct(points):
    result = []
    for point in points:
        if not result or (point[0], point[1]) != (result[-1][0], result[-1][1]):
            result.append(point)
    return result


def core_metrics(guide):
    points = guide["pointsFeet"]
    first, last = guide.get("hallwayJoins", [0, len(points) - 1])
    points = points[first:last + 1]
    turns = 0
    for a, b, c in zip(points, points[1:], points[2:]):
        # Collinear mandatory terminal joins are not visual jitter. This is a
        # descriptive five-degree bend count, never a geometry predicate.
        turns += turn_degrees(a, b, c) > 5
    length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:]))
    return {"coreVertices": len(points), "coreBendsOverFiveDegrees": turns, "coreLengthFeet": length}


def shape_metrics(guide):
    """Descriptive drawing diagnostics over the complete emitted guide.

    A zigzag reversal is a vertex turning by more than 120 degrees where at
    least one adjacent leg is at most two metres. Approach elbows count
    terminal approaches with an intermediate vertex. Neither is a physical
    predicate or route acceptance."""
    points = guide["pointsFeet"]
    first, last = guide.get("hallwayJoins", [0, len(points) - 1])
    path = [(i, p) for i, p in enumerate(points) if i == 0 or (p[0], p[1]) != (points[i - 1][0], points[i - 1][1])]
    bends = reversals = core_reversals = 0
    for (_, a), (index, b), (_, c) in zip(path, path[1:], path[2:]):
        angle = turn_degrees(a, b, c)
        bends += angle > 5
        short = min(math.hypot(b[0] - a[0], b[1] - a[1]), math.hypot(c[0] - b[0], c[1] - b[1]))
        zigzag = angle > ZIGZAG_TURN_DEGREES and short <= ZIGZAG_LEG_FEET
        reversals += zigzag
        core_reversals += zigzag and first < index < last
    elbows = len(distinct(points[:first + 1])) > 2
    elbows += len(distinct(points[last:])) > 2
    return {
        "guideBendsOverFiveDegrees": bends,
        "zigzagReversals": reversals,
        "approachOrJoinZigzagReversals": reversals - core_reversals,
        "coreZigzagReversals": core_reversals,
        "approachElbows": elbows,
    }


def terminal_ids(edge_id):
    # Edge ids are CELL:walk:FROM|TO for compiled walking edges.
    body = edge_id.split(":walk:", 1)[-1]
    return body.split("|", 1) if "|" in body else [None, None]


def stub_ends(guides):
    """Dead ends of the union of drawn shared cores (hallway joins inclusive).

    A dead end is where a shared trunk stops at a single terminal join. Those
    whose terminal is an arrival point (rather than a doorway portal) are the
    stubs that end at a space's own arrival point."""
    degree = Counter()
    segments = set()
    owners = {}
    for guide in guides:
        points = guide["pointsFeet"]
        first, last = guide.get("hallwayJoins", [0, len(points) - 1])
        core = [(round(p[0], 6), round(p[1], 6)) for p in points[first:last + 1]]
        start, end = terminal_ids(guide["edgeId"])
        owners.setdefault(core[0], set()).add(start)
        owners.setdefault(core[-1], set()).add(end)
        for a, b in zip(core, core[1:]):
            if a != b:
                segments.add((min(a, b), max(a, b)))
    for a, b in segments:
        degree[a] += 1
        degree[b] += 1
    ends = [point for point, count in degree.items() if count == 1]
    arrival = [point for point in ends if any((owner or "").startswith("arrival:") for owner in owners.get(point, ()))]
    return {"coreDeadEnds": len(ends), "arrivalStubEnds": len(arrival)}


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
            totals.update(shape_metrics(guides[edge_id]))
        metrics[label] = dict(totals)
    cell_of = {
        guide_id: cell_id
        for label in (before_cells, after_cells)
        for cell_id, cell in label.items()
        for guide_id in cell["guideIds"]
    }
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
            "shape": {
                label: {
                    **dict(sum(
                        (Counter({**core_metrics(guides[g]), **shape_metrics(guides[g])})
                         for g in common if cell_of.get(g) == cell_id),
                        Counter(),
                    )),
                    **stub_ends([guides[g] for g in guides if cell_of.get(g) == cell_id]),
                    "acceptedGuides": sum(cell_of.get(g) == cell_id for g in guides),
                }
                for label, guides in (("baseline", old), ("candidate", new))
            },
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
        "acceptedNetworkStubEnds": {
            label: dict(sum((Counter(cell["shape"][label]) for cell in cells), Counter()))
            for label in ("baseline", "candidate")
        },
        "shapeDefinitions": {
            "coreBendsOverFiveDegrees": "turns over 5 degrees between hallway joins, matched guides",
            "guideBendsOverFiveDegrees": "turns over 5 degrees on the complete guide, matched guides",
            "zigzagReversals": f"turn over {ZIGZAG_TURN_DEGREES} degrees with an adjacent leg of at most 2 m, complete guide",
            "approachOrJoinZigzagReversals": "zigzag reversals on a terminal approach or at a hallway join",
            "coreZigzagReversals": "zigzag reversals strictly inside the shared core",
            "approachElbows": "terminal approaches with an intermediate vertex",
            "coreDeadEnds": "degree-one vertices of the union of drawn shared cores per cell, all accepted guides",
            "arrivalStubEnds": "core dead ends whose terminal is an arrival point",
        },
    }
    if any(item["reason"] == "UNACCOUNTED" for item in result["lostGuides"]):
        raise ValueError("Previously accepted guide lost without an outcome")
    Path(destination).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({key: result[key] for key in ("eligibleEdges", "baselineAcceptedGuides", "candidateAcceptedGuides", "matchedGuideShape", "acceptedNetworkStubEnds")}))


if __name__ == "__main__":
    main()
